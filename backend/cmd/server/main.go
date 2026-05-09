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
	"gorm.io/gorm"
)

func main() {
	cfg := config.Load()

	// Production rejimda kuchli JWT secret talab qilish
	if cfg.Environment == "production" && (len(cfg.JWTSecret) < 32 || strings.Contains(strings.ToLower(cfg.JWTSecret), "change")) {
		log.Fatal("Production rejimda zaif JWT_SECRET. Kuchli secret (>=32 ta belgi) o'rnating!")
	}

	db := database.Connect(cfg)

	// Ensure uuid-ossp extension and run schema migrations
	db.Exec(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)
	// Drop legacy constraint names from init.sql so GORM's per-model migration
	// (which expects its own naming convention) doesn't trip on them.
	db.Exec(`ALTER TABLE IF EXISTS users DROP CONSTRAINT IF EXISTS users_phone_key`)
	db.Exec(`ALTER TABLE IF EXISTS users DROP CONSTRAINT IF EXISTS users_username_key`)

	// Migrate each model independently. A previous batch AutoMigrate call
	// aborted on the first model that complained about a missing constraint,
	// leaving 24+ later tables uncreated. Per-model migration isolates failures
	// so one warning doesn't take down the rest of the schema.
	allModels := []interface{}{
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
		&models.UserSession{},
		&models.SecretChat{},
		&models.GroupCall{},
		&models.GroupCallParticipant{},
		&models.MessageMention{},
		&models.ChatInviteLink{},
	}
	for _, m := range allModels {
		if err := db.AutoMigrate(m); err != nil {
			log.Printf("AutoMigrate %T warning: %v", m, err)
		}
	}
	ensureCriticalSchema(db)

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
	authHandler := handlers.NewAuthHandler(db, cfg.JWTSecret, cfg.JWTIssuer, cfg.JWTTTLHours, cfg.UploadDir)
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
		BodyLimit: cfg.UploadMaxMB * 1024 * 1024,
	})

	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins:     strings.Join(cfg.CORSAllowedOrigins, ","),
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization",
		AllowMethods:     "GET, POST, PUT, PATCH, DELETE, OPTIONS",
		AllowCredentials: false, // Development: * allowOrigins bilan ishlash uchun
	}))
	app.Use(func(c *fiber.Ctx) error {
		c.Set("X-Content-Type-Options", "nosniff")
		c.Set("X-Frame-Options", "DENY")
		c.Set("X-XSS-Protection", "1; mode=block") // Qo'shimcha XSS himoyasi
		c.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		// CSP: allow same-origin scripts/styles/images/fonts/connect so the
		// Expo web SPA can load. Inline styles are needed because RN-web
		// emits style attributes; data: URIs are needed for inline icons.
		c.Set("Content-Security-Policy",
			"default-src 'self'; "+
				"script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://cdn.jsdelivr.net https://cdn.skypack.dev https://unpkg.com; "+
				"script-src-elem 'self' 'unsafe-inline' blob: https://cdn.jsdelivr.net https://cdn.skypack.dev https://unpkg.com; "+
				"worker-src 'self' blob: https://cdn.jsdelivr.net; "+
				"style-src 'self' 'unsafe-inline'; "+
				"img-src 'self' data: blob: http: https:; "+
				"font-src 'self' data: https://cdn.jsdelivr.net; "+
				"media-src 'self' blob: http: https:; "+
				"connect-src 'self' ws: wss: http: https:; "+
				"frame-ancestors 'none'",
		)
		if cfg.Environment == "production" {
			c.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload") // 2 yil
		}
		return c.Next()
	})

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
		Max:        cfg.AuthRateLimitMax,
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
	protected := api.Group("", middleware.AuthRequired(cfg.JWTSecret, cfg.JWTIssuer))

	// Auth (protected)
	protected.Post("/auth/logout", authHandler.Logout)
	protected.Get("/auth/me", authHandler.GetMe)
	protected.Put("/auth/profile", authHandler.UpdateProfile)
	protected.Post("/auth/avatar", authHandler.UpdateAvatar)

	// User profile (public within authenticated users)
	protected.Get("/users/:userId/profile", authHandler.GetUserProfile)

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

	// Web client SPA — registered LAST so /api/v1, /uploads, /ws, /health
	// match first. The Expo web export lives at WEB_DIR (default /app/web,
	// mounted via docker-compose from ../mobile/dist-web). Static handles
	// /assets/*, /_expo/* and the like, then a catch-all serves index.html
	// for any other path so client-side routes inside the SPA work.
	webDir := os.Getenv("WEB_DIR")
	if webDir == "" {
		webDir = "/app/web"
	}
	if _, err := os.Stat(filepath.Join(webDir, "index.html")); err == nil {
		// Explicit asset routes — Static was being shadowed by other middleware
		// in this app, so handle the well-known SPA asset prefixes directly.
		// Fiber sets Content-Type from the file extension automatically.
		serveAsset := func(c *fiber.Ctx) error {
			rel := strings.TrimPrefix(c.Path(), "/")
			full := filepath.Join(webDir, filepath.FromSlash(rel))
			if !strings.HasPrefix(full, webDir) {
				return fiber.ErrForbidden
			}
			return c.SendFile(full)
		}
		app.Get("/_expo/*", serveAsset)
		app.Get("/assets/*", serveAsset)
		app.Get("/favicon.ico", serveAsset)
		app.Get("/metadata.json", serveAsset)

		// Index + SPA history fallback. Skip API/uploads/ws/health, and skip
		// anything that already looks like a static file (.js .css .ttf .png
		// etc.) so failed asset lookups return a real 404 instead of HTML.
		app.Get("/", func(c *fiber.Ctx) error {
			return c.SendFile(filepath.Join(webDir, "index.html"))
		})
		app.Get("/*", func(c *fiber.Ctx) error {
			path := c.Path()
			if filepath.Ext(path) != "" {
				return fiber.ErrNotFound
			}
			if strings.HasPrefix(path, "/api/") || strings.HasPrefix(path, "/uploads/") || path == "/ws" || path == "/health" {
				return fiber.ErrNotFound
			}
			return c.SendFile(filepath.Join(webDir, "index.html"))
		})
		log.Printf("Web SPA mounted from %s at /", webDir)
	} else {
		log.Printf("Web SPA disabled (no index.html at %s)", webDir)
	}

	// Story cleanup job - har 1 soatda eski story larni tozalash
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()

		for range ticker.C {
			cleanupExpiredStories(db, cfg.UploadDir)
		}
	}()

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Server starting on %s", addr)
	log.Fatal(app.Listen(addr))
}

// cleanupExpiredStories eski story larni database va diskdan o'chiradi
func cleanupExpiredStories(db *gorm.DB, uploadDir string) {
	var expiredStories []models.Story

	// Muddati o'tgan story larni topish
	if err := db.Where("expires_at < ?", time.Now()).Find(&expiredStories).Error; err != nil {
		log.Printf("Failed to find expired stories: %v", err)
		return
	}

	if len(expiredStories) == 0 {
		return
	}

	log.Printf("Cleaning up %d expired stories", len(expiredStories))

	// Har bir story ni o'chirish
	for _, story := range expiredStories {
		// Faylni diskdan o'chirish
		if story.MediaURL != "" {
			// /uploads/stories/file.jpg -> ./uploads/stories/file.jpg
			filePath := filepath.Join(".", story.MediaURL)
			if err := os.Remove(filePath); err != nil && !os.IsNotExist(err) {
				log.Printf("Failed to delete story file %s: %v", filePath, err)
			}
		}

		// Database dan o'chirish (CASCADE bilan views ham o'chadi)
		if err := db.Delete(&story).Error; err != nil {
			log.Printf("Failed to delete story %s from DB: %v", story.ID, err)
		}
	}

	log.Printf("Cleanup completed: deleted %d expired stories", len(expiredStories))
}

// ensureCriticalSchema adds backward-compatible columns/tables for older DB snapshots.
func ensureCriticalSchema(db *gorm.DB) {
	stmts := []string{
		`ALTER TABLE chats ADD COLUMN IF NOT EXISTS pinned_message_id uuid`,
		`ALTER TABLE chats ADD COLUMN IF NOT EXISTS description text DEFAULT ''`,
		`ALTER TABLE chats ADD COLUMN IF NOT EXISTS auto_delete_seconds integer DEFAULT 0`,
		`ALTER TABLE chats ADD COLUMN IF NOT EXISTS is_secret boolean DEFAULT false`,
		// Profile fields split from display_name. Defensive ADD COLUMN IF NOT
		// EXISTS so existing deployments pick them up without a manual migration.
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name varchar(64) DEFAULT ''`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name varchar(64) DEFAULT ''`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS delete_at timestamptz`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS auto_delete_seconds integer DEFAULT 0`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_secret boolean DEFAULT false`,
		// Columns added by newer Message model fields. AutoMigrate normally
		// handles these but has been observed to skip silently on existing
		// snapshots, leading to "Failed to send message" 500s on INSERT.
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS entities text`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS forward_from_id uuid`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS forward_from_chat_id uuid`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS poll_id uuid`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS latitude double precision`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS longitude double precision`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS location_title varchar(200)`,
		`CREATE INDEX IF NOT EXISTS idx_messages_delete_at ON messages (delete_at)`,
		// Stories tables. Originally only created via GORM AutoMigrate, which
		// aborts on the unrelated users.uni_users_phone constraint warning,
		// leaving stories/story_views entirely absent and breaking POST /stories.
		`CREATE TABLE IF NOT EXISTS stories (
			id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
			user_id uuid NOT NULL,
			media_url text NOT NULL,
			media_type varchar(20) NOT NULL DEFAULT 'image',
			caption text,
			expires_at timestamptz NOT NULL,
			created_at timestamptz DEFAULT now()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_stories_user_id ON stories (user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON stories (expires_at)`,
		`CREATE TABLE IF NOT EXISTS story_views (
			id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
			story_id uuid NOT NULL,
			viewer_id uuid NOT NULL,
			viewed_at timestamptz DEFAULT now(),
			CONSTRAINT idx_story_viewer UNIQUE (story_id, viewer_id)
		)`,
		`CREATE TABLE IF NOT EXISTS scheduled_messages (
			id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
			chat_id uuid NOT NULL,
			sender_id uuid NOT NULL,
			content text,
			file_url text,
			message_type varchar(20) DEFAULT 'text',
			scheduled_at timestamptz NOT NULL,
			is_sent boolean DEFAULT false,
			sent_at timestamptz,
			created_at timestamptz DEFAULT now()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_scheduled_messages_chat_id ON scheduled_messages (chat_id)`,
		`CREATE INDEX IF NOT EXISTS idx_scheduled_messages_scheduled_at ON scheduled_messages (scheduled_at)`,
	}

	for _, stmt := range stmts {
		if err := db.Exec(stmt).Error; err != nil {
			log.Printf("Schema patch warning: %v", err)
		}
	}
}
