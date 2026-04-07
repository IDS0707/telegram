package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"telegram-clone-backend/internal/config"
	"telegram-clone-backend/internal/database"
	"telegram-clone-backend/internal/handlers"
	"telegram-clone-backend/internal/middleware"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
)

func main() {
	cfg := config.Load()
	db := database.Connect(cfg)

	// Ensure upload directories exist
	dirs := []string{"avatars", "images", "videos", "audios", "voices", "files"}
	for _, d := range dirs {
		os.MkdirAll(filepath.Join(cfg.UploadDir, d), 0755)
	}

	// Initialize WebSocket Hub
	hub := handlers.NewHub(db, cfg.JWTSecret)
	go hub.Run()

	// Initialize handlers
	authHandler := handlers.NewAuthHandler(db, cfg.JWTSecret)
	chatHandler := handlers.NewChatHandler(db)
	msgHandler := handlers.NewMessageHandler(db, hub)
	fileHandler := handlers.NewFileHandler(db, hub, cfg.UploadDir)
	contactHandler := handlers.NewContactHandler(db)
	callHandler := handlers.NewCallHandler(db, hub)

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

	// Chats
	chats := protected.Group("/chats")
	chats.Get("/", chatHandler.GetChats)
	chats.Post("/private", chatHandler.CreatePrivateChat)
	chats.Post("/group", chatHandler.CreateGroupChat)
	chats.Get("/:chatId", chatHandler.GetChatByID)

	// Messages
	messages := protected.Group("/chats/:chatId/messages")
	messages.Get("/", msgHandler.GetMessages)
	messages.Post("/", msgHandler.SendTextMessage)
	messages.Post("/file", fileHandler.SendFileMessage)
	messages.Post("/voice", fileHandler.SendVoiceMessage)
	messages.Post("/read", msgHandler.MarkAsRead)
	messages.Put("/:messageId", msgHandler.EditMessage)
	messages.Delete("/:messageId", msgHandler.DeleteMessage)

	// Calls
	calls := protected.Group("/calls")
	calls.Post("/", callHandler.InitiateCall)
	calls.Get("/history", callHandler.GetCallHistory)
	calls.Post("/:callId/answer", callHandler.AnswerCall)
	calls.Post("/:callId/decline", callHandler.DeclineCall)
	calls.Post("/:callId/end", callHandler.EndCall)
	calls.Post("/signal", callHandler.SendSignal)

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
