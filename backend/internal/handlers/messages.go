 package handlers

import (
	"strconv"
	"time"

	"telegram-clone-backend/internal/middleware"
	"telegram-clone-backend/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type MessageHandler struct {
	DB  *gorm.DB
	Hub *Hub
}

func NewMessageHandler(db *gorm.DB, hub *Hub) *MessageHandler {
	return &MessageHandler{DB: db, Hub: hub}
}

// GetMessages returns paginated messages for a chat
func (h *MessageHandler) GetMessages(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}

	// Verify membership
	var memberCount int64
	h.DB.Model(&models.ChatMember{}).Where("chat_id = ? AND user_id = ?", chatID, userID).Count(&memberCount)
	if memberCount == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not a member of this chat"})
	}

	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	if limit > 100 {
		limit = 100
	}
	offset, _ := strconv.Atoi(c.Query("offset", "0"))

	var messages []models.Message
	h.DB.Where("chat_id = ? AND is_deleted = false", chatID).
		Preload("Sender").
		Preload("ReplyTo").
		Preload("ReplyTo.Sender").
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&messages)

	return c.JSON(messages)
}

// SendTextMessage sends a text message
func (h *MessageHandler) SendTextMessage(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}

	// Verify membership
	var memberCount int64
	h.DB.Model(&models.ChatMember{}).Where("chat_id = ? AND user_id = ?", chatID, userID).Count(&memberCount)
	if memberCount == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not a member of this chat"})
	}

	var body struct {
		Content   string  `json:"content"`
		ReplyToID *string `json:"reply_to_id"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	if body.Content == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Message content is required"})
	}

	msg := models.Message{
		ID:          uuid.New(),
		ChatID:      chatID,
		SenderID:    userID,
		MessageType: "text",
		Content:     &body.Content,
	}

	if body.ReplyToID != nil {
		replyID, err := uuid.Parse(*body.ReplyToID)
		if err == nil {
			msg.ReplyToID = &replyID
		}
	}

	if err := h.DB.Create(&msg).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to send message"})
	}

	// Update chat timestamp
	h.DB.Model(&models.Chat{}).Where("id = ?", chatID).Update("updated_at", time.Now())

	// Load sender
	h.DB.Preload("Sender").Preload("ReplyTo").Preload("ReplyTo.Sender").First(&msg, "id = ?", msg.ID)

	// Broadcast to WebSocket
	h.Hub.BroadcastToChat(chatID, WSMessage{
		Type:    "new_message",
		Payload: msg,
	})

	return c.Status(fiber.StatusCreated).JSON(msg)
}

// EditMessage edits a message
func (h *MessageHandler) EditMessage(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	msgID, err := uuid.Parse(c.Params("messageId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid message ID"})
	}

	var body struct {
		Content string `json:"content"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	if body.Content == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Content cannot be empty"})
	}

	var msg models.Message
	if err := h.DB.First(&msg, "id = ? AND sender_id = ?", msgID, userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Message not found"})
	}

	h.DB.Model(&msg).Updates(map[string]interface{}{
		"content":   body.Content,
		"is_edited": true,
	})

	h.DB.Preload("Sender").First(&msg, "id = ?", msg.ID)

	h.Hub.BroadcastToChat(msg.ChatID, WSMessage{
		Type:    "message_edited",
		Payload: msg,
	})

	return c.JSON(msg)
}

// DeleteMessage soft deletes a message
func (h *MessageHandler) DeleteMessage(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	msgID, err := uuid.Parse(c.Params("messageId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid message ID"})
	}

	var msg models.Message
	if err := h.DB.First(&msg, "id = ? AND sender_id = ?", msgID, userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Message not found"})
	}

	h.DB.Model(&msg).Update("is_deleted", true)

	h.Hub.BroadcastToChat(msg.ChatID, WSMessage{
		Type:    "message_deleted",
		Payload: fiber.Map{"message_id": msgID, "chat_id": msg.ChatID},
	})

	return c.JSON(fiber.Map{"message": "Message deleted"})
}

// MarkAsRead marks messages in a chat as read
func (h *MessageHandler) MarkAsRead(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}

	h.DB.Model(&models.Message{}).
		Where("chat_id = ? AND sender_id != ? AND is_read = false", chatID, userID).
		Update("is_read", true)

	h.Hub.BroadcastToChat(chatID, WSMessage{
		Type:    "messages_read",
		Payload: fiber.Map{"chat_id": chatID, "reader_id": userID},
	})

	return c.JSON(fiber.Map{"message": "Messages marked as read"})
}
