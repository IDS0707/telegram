package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"telegram-clone-backend/internal/config"
	"telegram-clone-backend/internal/database"
	"telegram-clone-backend/internal/handlers"
	"telegram-clone-backend/internal/middleware"
	"telegram-clone-backend/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
)

func main() {
	cfg := config.Load()
	db := database.Connect(cfg)

	// Ensure uuid-ossp extension and run schema migrations
	db.Exec(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)
	if err := db.AutoMigrate(
		&models.User{},
		&models.Contact{},
		&models.BlockedUser{},
		&models.Chat{},
		&models.ChatMember{},
		&models.Message{},
		&models.Reaction{},
		&models.ReadReceipt{},
		&models.Call{},
		&models.Story{},
		&models.StoryView{},
		&models.SavedMessage{},
		// new models
		&models.Channel{},
		&models.ChannelMember{},
		&models.ChannelPost{},
		&models.PostReaction{},
		&models.Poll{},
		&models.PollOption{},
		&models.PollVote{},
		&models.ChatFolder{},
		&models.ChatFolderItem{},
		&models.ScheduledMessage{},
		&models.StickerSet{},
		&models.Sticker{},
		&models.UserStickerSet{},
		&models.TwoFactor{},
		// new v2 models
		&models.UserSession{},
		&models.SecretChat{},
		&models.GroupCall{},
		&models.GroupCallParticipant{},
		&models.MessageMention{},
		&models.ChatInviteLink{},
	); err != nil {
		log.Printf("AutoMigrate warning: %v", err)
	}

	// Ensure upload directories exist
	dirs := []string{"avatars", "images", "videos", "audios", "voices", "files", "videonotes", "stories", "stickers", "channels"}
	for _, d := range dirs {
		os.MkdirAll(filepath.Join(cfg.UploadDir, d), 0755)
	}

	// Initialize WebSocket Hub
	hub := handlers.NewHub(db, cfg.JWTSecret)
	go hub.Run()

	// Background: dispatch scheduled messages every minute
	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			sch := handlers.NewScheduledHandler(db, hub)
			sch.SendScheduledMessages()
			// Also purge auto-delete expired messages
			handlers.DeleteExpiredMessages(db, hub)
		}
	}()

	// Initialize handlers
	authHandler := handlers.NewAuthHandler(db, cfg.JWTSecret, cfg.UploadDir)
	chatHandler := handlers.NewChatHandler(db)
	msgHandler := handlers.NewMessageHandler(db, hub)
	fileHandler := handlers.NewFileHandler(db, hub, cfg.UploadDir)
	contactHandler := handlers.NewContactHandler(db)
	callHandler := handlers.NewCallHandler(db, hub)
	storyHandler := handlers.NewStoryHandler(db, cfg.UploadDir)
	channelHandler := handlers.NewChannelHandler(db, hub, cfg.UploadDir)
	pollHandler := handlers.NewPollHandler(db, hub)
	folderHandler := handlers.NewFolderHandler(db)
	stickerHandler := handlers.NewStickerHandler(db, cfg.UploadDir)
	scheduledHandler := handlers.NewScheduledHandler(db, hub)
	twoFAHandler := handlers.NewTwoFAHandler(db)
	sessionHandler := handlers.NewSessionHandler(db)
	secretChatHandler := handlers.NewSecretChatHandler(db, hub)
	groupCallHandler := handlers.NewGroupCallHandler(db, hub)

	app := fiber.New(fiber.Config{
		BodyLimit: 100 * 1024 * 1024, // 100 MB
	})

	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		AllowMethods: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
	}))

	// Static files (uploads) with security headers
	app.Use("/uploads", func(c *fiber.Ctx) error {
		c.Set("X-Content-Type-Options", "nosniff")
		c.Set("Content-Disposition", "inline")
		c.Set("X-Frame-Options", "DENY")
		// Fix MIME type for audio files so Chrome's <audio> element works
		path := c.Path()
		if strings.HasSuffix(path, ".webm") && strings.Contains(path, "/voices/") {
			c.Set("Content-Type", "audio/webm; codecs=opus")
		} else if strings.HasSuffix(path, ".ogg") {
			c.Set("Content-Type", "audio/ogg")
		}
		return c.Next()
	})
	app.Static("/uploads", cfg.UploadDir)

	// Health check
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	// API routes
	api := app.Group("/api/v1")

	// Auth routes (public) with rate limiting
	auth := api.Group("/auth")
	authLimiter := limiter.New(limiter.Config{
		Max:        10,
		Expiration: 1 * time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP()
		},
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "Too many requests, try again later"})
		},
	})
	auth.Post("/register", authLimiter, authHandler.Register)
	auth.Post("/login", authLimiter, authHandler.Login)

	// Protected routes
	protected := api.Group("", middleware.AuthRequired(cfg.JWTSecret))

	// Auth (protected)
	protected.Post("/auth/logout", authHandler.Logout)
	protected.Get("/auth/me", authHandler.GetMe)
	protected.Put("/auth/profile", authHandler.UpdateProfile)
	protected.Post("/auth/avatar", authHandler.UpdateAvatar)

	// Contacts
	contacts := protected.Group("/contacts")
	contacts.Get("/", contactHandler.GetContacts)
	contacts.Post("/", contactHandler.AddContact)
	contacts.Delete("/:contactId", contactHandler.DeleteContact)
	contacts.Get("/search", contactHandler.SearchUsers)
	contacts.Post("/block/:userId", contactHandler.BlockUser)
	contacts.Delete("/block/:userId", contactHandler.UnblockUser)
	contacts.Get("/block/:userId", contactHandler.IsBlocked)

	// Chats
	chats := protected.Group("/chats")
	chats.Get("/", chatHandler.GetChats)
	chats.Post("/private", chatHandler.CreatePrivateChat)
	chats.Post("/group", chatHandler.CreateGroupChat)
	chats.Get("/:chatId", chatHandler.GetChatByID)
	chats.Delete("/:chatId/messages", chatHandler.ClearChatHistory)

	// Stories
	stories := protected.Group("/stories")
	stories.Get("/", storyHandler.GetStories)
	stories.Get("/mine", storyHandler.GetMyStories)
	stories.Post("/", storyHandler.CreateStory)
	stories.Post("/:storyId/view", storyHandler.ViewStory)
	stories.Delete("/:storyId", storyHandler.DeleteStory)

	// Messages
	messages := protected.Group("/chats/:chatId/messages")
	messages.Get("/", msgHandler.GetMessages)
	messages.Post("/", msgHandler.SendTextMessage)
	messages.Post("/file", fileHandler.SendFileMessage)
	messages.Post("/voice", fileHandler.SendVoiceMessage)
	messages.Post("/video-note", fileHandler.SendVideoNote)
	messages.Post("/location", msgHandler.SendLocation)
	messages.Post("/read", msgHandler.MarkAsRead)
	messages.Post("/:messageId/reactions", msgHandler.ToggleReaction)
	messages.Post("/:messageId/pin", msgHandler.PinMessage)
	messages.Delete("/:messageId/pin", msgHandler.UnpinMessage)
	messages.Post("/:messageId/save", msgHandler.SaveMessage)
	messages.Delete("/:messageId/save", msgHandler.UnsaveMessage)
	messages.Put("/:messageId", msgHandler.EditMessage)
	messages.Delete("/:messageId", msgHandler.DeleteMessage)

	// Saved Messages
	protected.Get("/saved-messages", msgHandler.GetSavedMessages)

	// Calls
	calls := protected.Group("/calls")
	calls.Post("/", callHandler.InitiateCall)
	calls.Get("/history", callHandler.GetCallHistory)
	calls.Post("/:callId/answer", callHandler.AnswerCall)
	calls.Post("/:callId/decline", callHandler.DeclineCall)
	calls.Post("/:callId/end", callHandler.EndCall)
	calls.Post("/signal", callHandler.SendSignal)

	// ─── Channels ────────────────────────────────────────────────────────────
	channels := protected.Group("/channels")
	channels.Get("/", channelHandler.GetChannels)
	channels.Post("/", channelHandler.CreateChannel)
	channels.Get("/:channelId", channelHandler.GetChannel)
	channels.Put("/:channelId", channelHandler.UpdateChannel)
	channels.Delete("/:channelId", channelHandler.DeleteChannel)
	channels.Post("/:channelId/join", channelHandler.JoinChannel)
	channels.Delete("/:channelId/leave", channelHandler.LeaveChannel)
	channels.Get("/:channelId/posts", channelHandler.GetPosts)
	channels.Post("/:channelId/posts", channelHandler.CreatePost)
	channels.Delete("/:channelId/posts/:postId", channelHandler.DeletePost)
	channels.Post("/:channelId/posts/:postId/react", channelHandler.ReactToPost)

	// ─── Polls ───────────────────────────────────────────────────────────────
	polls := protected.Group("/polls")
	polls.Post("/", pollHandler.CreatePoll)
	polls.Get("/:pollId", pollHandler.GetPoll)
	polls.Post("/:pollId/vote", pollHandler.Vote)
	polls.Post("/:pollId/close", pollHandler.ClosePoll)

	// ─── Chat Folders ─────────────────────────────────────────────────────────
	folders := protected.Group("/folders")
	folders.Get("/", folderHandler.GetFolders)
	folders.Post("/", folderHandler.CreateFolder)
	folders.Put("/:folderId", folderHandler.UpdateFolder)
	folders.Delete("/:folderId", folderHandler.DeleteFolder)
	folders.Post("/:folderId/chats", folderHandler.AddChatToFolder)
	folders.Delete("/:folderId/chats/:chatId", folderHandler.RemoveChatFromFolder)

	// ─── Stickers ─────────────────────────────────────────────────────────────
	stickers := protected.Group("/stickers")
	stickers.Get("/", stickerHandler.GetMyStickerSets)
	stickers.Get("/all", stickerHandler.GetAllStickerSets)
	stickers.Post("/sets", stickerHandler.CreateStickerSet)
	stickers.Post("/sets/:setId/add", stickerHandler.AddToMyStickers)
	stickers.Delete("/sets/:setId/remove", stickerHandler.RemoveFromMyStickers)
	stickers.Get("/sets/:setId", stickerHandler.GetStickerSet)
	stickers.Post("/sets/:setId/stickers", stickerHandler.UploadSticker)

	// ─── Scheduled Messages ──────────────────────────────────────────────────
	scheduled := protected.Group("/scheduled")
	scheduled.Get("/:chatId", scheduledHandler.GetScheduled)
	scheduled.Post("/:chatId", scheduledHandler.CreateScheduled)
	scheduled.Delete("/:messageId", scheduledHandler.DeleteScheduled)

	// ─── 2FA ─────────────────────────────────────────────────────────────────
	twoFA := protected.Group("/2fa")
	twoFA.Get("/status", twoFAHandler.GetStatus)
	twoFA.Post("/enable", twoFAHandler.Enable)
	twoFA.Post("/disable", twoFAHandler.Disable)
	twoFA.Post("/verify", twoFAHandler.Verify)

	// ─── Message Search ──────────────────────────────────────────────────────
	protected.Get("/chats/:chatId/search", msgHandler.SearchMessages)
	protected.Get("/chats/:chatId/search/advanced", msgHandler.SearchMessagesAdvanced)

	// ─── Forward Message ─────────────────────────────────────────────────────
	protected.Post("/messages/forward", msgHandler.ForwardMessage)

	// ─── Location Messages ────────────────────────────────────────────────────
	messages.Post("/location", msgHandler.SendLocationMessage)

	// ─── Auto-Delete ─────────────────────────────────────────────────────────
	messages.Post("/auto-delete", msgHandler.SetAutoDelete)

	// ─── Group Admin Actions ─────────────────────────────────────────────────
	chats.Post("/:chatId/members", chatHandler.AddMember)
	chats.Delete("/:chatId/members/:userId", chatHandler.KickMember)
	chats.Put("/:chatId/members/:userId/promote", chatHandler.PromoteMember)
	chats.Put("/:chatId/members/:userId/demote", chatHandler.DemoteMember)
	chats.Post("/:chatId/leave", chatHandler.LeaveChat)
	chats.Put("/:chatId", chatHandler.UpdateGroupInfo)

	// ─── Invite Links ─────────────────────────────────────────────────────────
	chats.Post("/:chatId/invite-link", chatHandler.GenerateInviteLink)
	protected.Post("/join/:code", chatHandler.JoinByInviteLink)

	// ─── Sessions ─────────────────────────────────────────────────────────────
	sessions := protected.Group("/sessions")
	sessions.Get("/", sessionHandler.GetSessions)
	sessions.Delete("/:sessionId", sessionHandler.RevokeSession)
	sessions.Delete("/", sessionHandler.RevokeAllOtherSessions)

	// ─── Secret Chats ─────────────────────────────────────────────────────────
	secret := protected.Group("/secret-chats")
	secret.Get("/", secretChatHandler.GetMySecretChats)
	secret.Post("/", secretChatHandler.InitiateSecretChat)
	secret.Get("/chat/:chatId", secretChatHandler.GetSecretChat)
	secret.Post("/:secretChatId/accept", secretChatHandler.AcceptSecretChat)
	secret.Post("/:secretChatId/reject", secretChatHandler.RejectSecretChat)

	// ─── Group Calls ──────────────────────────────────────────────────────────
	protected.Post("/chats/:chatId/group-call", groupCallHandler.StartGroupCall)
	protected.Get("/chats/:chatId/group-call", groupCallHandler.GetActiveGroupCall)
	protected.Post("/group-calls/:callId/join", groupCallHandler.JoinGroupCall)
	protected.Post("/group-calls/:callId/leave", groupCallHandler.LeaveGroupCall)
	protected.Post("/group-calls/:callId/status", groupCallHandler.UpdateParticipantStatus)
	protected.Post("/group-calls/signal", groupCallHandler.SendGroupCallSignal)

	// WebSocket endpoint
	app.Use("/ws", func(c *fiber.Ctx) error {
		if c.Get("Upgrade") == "websocket" {
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})
	app.Get("/ws", hub.HandleWebSocket())

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Server starting on %s", addr)
	log.Fatal(app.Listen(addr))
}
