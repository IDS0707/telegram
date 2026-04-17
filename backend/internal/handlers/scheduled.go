package handlers

import (
	"time"

	"telegram-clone-backend/internal/middleware"
	"telegram-clone-backend/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ScheduledHandler struct {
	DB  *gorm.DB
	Hub *Hub
}

func NewScheduledHandler(db *gorm.DB, hub *Hub) *ScheduledHandler {
	return &ScheduledHandler{DB: db, Hub: hub}
}

func (h *ScheduledHandler) GetScheduled(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}
	var messages []models.ScheduledMessage
	h.DB.Where("chat_id = ? AND sender_id = ? AND is_sent = false", chatID, userID).
		Preload("Sender").
		Order("scheduled_at ASC").
		Find(&messages)
	return c.JSON(messages)
}

func (h *ScheduledHandler) CreateScheduled(c *fiber.Ctx) error {
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
		Content     *string `json:"content"`
		ScheduledAt string  `json:"scheduled_at"`
		MessageType string  `json:"message_type"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}
	scheduledAt, err := time.Parse(time.RFC3339, body.ScheduledAt)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid scheduled_at format (RFC3339 expected)"})
	}
	if scheduledAt.Before(time.Now()) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Scheduled time must be in the future"})
	}
	msgType := body.MessageType
	if msgType == "" {
		msgType = "text"
	}
	msg := models.ScheduledMessage{
		ChatID:      chatID,
		SenderID:    userID,
		Content:     body.Content,
		MessageType: msgType,
		ScheduledAt: scheduledAt,
	}
	if err := h.DB.Create(&msg).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to schedule message"})
	}
	return c.Status(fiber.StatusCreated).JSON(msg)
}

func (h *ScheduledHandler) DeleteScheduled(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	msgID, err := uuid.Parse(c.Params("messageId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid message ID"})
	}
	var msg models.ScheduledMessage
	if err := h.DB.Where("id = ? AND sender_id = ? AND is_sent = false", msgID, userID).First(&msg).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Scheduled message not found"})
	}
	h.DB.Delete(&msg)
	return c.JSON(fiber.Map{"success": true})
}

// SendScheduledMessages is called by a background goroutine or cron to deliver due messages
func (h *ScheduledHandler) SendScheduledMessages() {
	var messages []models.ScheduledMessage
	h.DB.Where("is_sent = false AND scheduled_at <= ?", time.Now()).
		Preload("Sender").
		Find(&messages)

	for _, sm := range messages {
		msg := models.Message{
			ChatID:      sm.ChatID,
			SenderID:    sm.SenderID,
			MessageType: sm.MessageType,
			Content:     sm.Content,
			FileURL:     sm.FileURL,
		}
		if err := h.DB.Create(&msg).Error; err != nil {
			continue
		}
		h.DB.Preload("Sender").Preload("Reactions").First(&msg, "id = ?", msg.ID)
		h.Hub.BroadcastToChat(sm.ChatID, WSMessage{Type: "new_message", Payload: msg})

		now := time.Now()
		h.DB.Model(&sm).Updates(map[string]interface{}{"is_sent": true, "sent_at": now})
	}
}
