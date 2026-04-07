package handlers

import (
	"telegram-clone-backend/internal/middleware"
	"telegram-clone-backend/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ChatHandler struct {
	DB *gorm.DB
}

func NewChatHandler(db *gorm.DB) *ChatHandler {
	return &ChatHandler{DB: db}
}

// GetChats returns all chats for the current user with last message
func (h *ChatHandler) GetChats(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	type ChatWithLastMessage struct {
		models.Chat
		LastMessage   *models.Message `json:"last_message"`
		UnreadCount   int64           `json:"unread_count"`
		OtherUser     *models.User    `json:"other_user,omitempty"`
	}

	// Get chat IDs for user
	var memberEntries []models.ChatMember
	h.DB.Where("user_id = ?", userID).Find(&memberEntries)

	chatIDs := make([]uuid.UUID, len(memberEntries))
	for i, m := range memberEntries {
		chatIDs[i] = m.ChatID
	}

	if len(chatIDs) == 0 {
		return c.JSON([]ChatWithLastMessage{})
	}

	var chats []models.Chat
	h.DB.Where("id IN ?", chatIDs).
		Preload("Members").
		Preload("Members.User").
		Order("updated_at DESC").
		Find(&chats)

	result := make([]ChatWithLastMessage, 0, len(chats))
	for _, chat := range chats {
		item := ChatWithLastMessage{Chat: chat}

		// Get last message
		var lastMsg models.Message
		if err := h.DB.Where("chat_id = ? AND is_deleted = false", chat.ID).
			Preload("Sender").
			Order("created_at DESC").
			First(&lastMsg).Error; err == nil {
			item.LastMessage = &lastMsg
		}

		// Count unread
		h.DB.Model(&models.Message{}).
			Where("chat_id = ? AND sender_id != ? AND is_read = false AND is_deleted = false", chat.ID, userID).
			Count(&item.UnreadCount)

		// For private chats, get the other user
		if chat.ChatType == "private" {
			for _, m := range chat.Members {
				if m.UserID != userID {
					item.OtherUser = &m.User
					break
				}
			}
		}

		result = append(result, item)
	}

	return c.JSON(result)
}

// CreatePrivateChat creates a new private chat or returns existing
func (h *ChatHandler) CreatePrivateChat(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var body struct {
		UserID string `json:"user_id"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	otherID, err := uuid.Parse(body.UserID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid user_id"})
	}

	if userID == otherID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Cannot chat with yourself"})
	}

	// Check if user exists
	var otherUser models.User
	if err := h.DB.First(&otherUser, "id = ?", otherID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	// Check if private chat already exists between these two users
	var existingChat models.Chat
	err = h.DB.Raw(`
		SELECT c.* FROM chats c
		JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = ?
		JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = ?
		WHERE c.chat_type = 'private'
		LIMIT 1
	`, userID, otherID).Scan(&existingChat).Error

	if err == nil && existingChat.ID != uuid.Nil {
		h.DB.Preload("Members").Preload("Members.User").First(&existingChat, "id = ?", existingChat.ID)
		return c.JSON(existingChat)
	}

	// Create new chat
	chat := models.Chat{
		ID:        uuid.New(),
		ChatType:  "private",
		CreatedBy: &userID,
	}
	h.DB.Create(&chat)

	// Add members
	h.DB.Create(&models.ChatMember{ID: uuid.New(), ChatID: chat.ID, UserID: userID, Role: "member"})
	h.DB.Create(&models.ChatMember{ID: uuid.New(), ChatID: chat.ID, UserID: otherID, Role: "member"})

	h.DB.Preload("Members").Preload("Members.User").First(&chat, "id = ?", chat.ID)

	return c.Status(fiber.StatusCreated).JSON(chat)
}

// CreateGroupChat creates a new group chat
func (h *ChatHandler) CreateGroupChat(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var body struct {
		Title   string   `json:"title"`
		Members []string `json:"members"` // user IDs
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	if body.Title == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Group title is required"})
	}

	chat := models.Chat{
		ID:        uuid.New(),
		ChatType:  "group",
		Title:     &body.Title,
		CreatedBy: &userID,
	}
	h.DB.Create(&chat)

	// Add creator as admin
	h.DB.Create(&models.ChatMember{ID: uuid.New(), ChatID: chat.ID, UserID: userID, Role: "admin"})

	// Add other members
	for _, mIDStr := range body.Members {
		mID, err := uuid.Parse(mIDStr)
		if err != nil || mID == userID {
			continue
		}
		h.DB.Create(&models.ChatMember{ID: uuid.New(), ChatID: chat.ID, UserID: mID, Role: "member"})
	}

	h.DB.Preload("Members").Preload("Members.User").First(&chat, "id = ?", chat.ID)

	return c.Status(fiber.StatusCreated).JSON(chat)
}

// GetChatByID returns a chat by ID
func (h *ChatHandler) GetChatByID(c *fiber.Ctx) error {
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}

	var chat models.Chat
	if err := h.DB.Preload("Members").Preload("Members.User").First(&chat, "id = ?", chatID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Chat not found"})
	}

	return c.JSON(chat)
}
