package handlers

import (
	"strconv"
	"strings"
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
		Preload("Reactions").
		Preload("Reactions.User").
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
		Entities  *string `json:"entities"` // JSON array of text formatting entities
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	if body.Content == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Message content is required"})
	}
	body.Content = strings.TrimSpace(body.Content)
	if body.Content == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Message content cannot be blank"})
	}

	// Matn uzunligini tekshirish (maksimal 4000 belgi)
	if len([]rune(body.Content)) > 4000 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Message too long (max 4000 characters)"})
	}

	msg := models.Message{
		ID:          uuid.New(),
		ChatID:      chatID,
		SenderID:    userID,
		MessageType: "text",
		Content:     &body.Content,
		Entities:    body.Entities,
	}

	if body.ReplyToID != nil {
		replyID, err := uuid.Parse(*body.ReplyToID)
		if err == nil {
			msg.ReplyToID = &replyID
		}
	}

	// Apply chat-level auto-delete if set
	var chat models.Chat
	if h.DB.First(&chat, "id = ?", chatID).Error == nil && chat.AutoDeleteSeconds > 0 {
		msg.AutoDeleteSeconds = chat.AutoDeleteSeconds
		deleteAt := time.Now().Add(time.Duration(chat.AutoDeleteSeconds) * time.Second)
		msg.DeleteAt = &deleteAt
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

	if err := h.DB.Model(&msg).Updates(map[string]interface{}{
		"content":   body.Content,
		"is_edited": true,
	}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to edit message"})
	}

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

	if err := h.DB.Model(&msg).Update("is_deleted", true).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete message"})
	}

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

// ToggleReaction adds or removes an emoji reaction on a message
func (h *MessageHandler) ToggleReaction(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}
	msgID, err := uuid.Parse(c.Params("messageId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid message ID"})
	}

	// Verify membership
	var memberCount int64
	h.DB.Model(&models.ChatMember{}).Where("chat_id = ? AND user_id = ?", chatID, userID).Count(&memberCount)
	if memberCount == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not a member"})
	}

	var body struct {
		Emoji string `json:"emoji"`
	}
	if err := c.BodyParser(&body); err != nil || body.Emoji == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid emoji"})
	}
	// Validate emoji: max 8 runes to prevent DoS via huge strings
	if len([]rune(body.Emoji)) > 8 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid emoji"})
	}

	var existing models.Reaction
	result := h.DB.Where("message_id = ? AND user_id = ?", msgID, userID).First(&existing)
	if result.Error == nil {
		if existing.Emoji == body.Emoji {
			// Same emoji → remove
			h.DB.Delete(&existing)
		} else {
			// Different emoji → update
			h.DB.Model(&existing).Update("emoji", body.Emoji)
		}
	} else {
		// New reaction
		reaction := models.Reaction{
			MessageID: msgID,
			UserID:    userID,
			Emoji:     body.Emoji,
		}
		h.DB.Create(&reaction)
	}

	// Return updated reactions
	var reactions []models.Reaction
	h.DB.Where("message_id = ?", msgID).Preload("User").Find(&reactions)

	// Broadcast to chat
	h.Hub.BroadcastToChat(chatID, WSMessage{
		Type: "reaction_updated",
		Payload: fiber.Map{
			"message_id": msgID,
			"chat_id":    chatID,
			"reactions":  reactions,
		},
	})

	return c.JSON(reactions)
}

// PinMessage pins a message in a chat
func (h *MessageHandler) PinMessage(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}
	msgID, err := uuid.Parse(c.Params("messageId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid message ID"})
	}

	var memberCount int64
	h.DB.Model(&models.ChatMember{}).Where("chat_id = ? AND user_id = ?", chatID, userID).Count(&memberCount)
	if memberCount == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not a member"})
	}

	if err := h.DB.Model(&models.Chat{}).Where("id = ?", chatID).Update("pinned_message_id", msgID).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to pin"})
	}

	var msg models.Message
	h.DB.Preload("Sender").First(&msg, "id = ?", msgID)

	h.Hub.BroadcastToChat(chatID, WSMessage{
		Type:    "message_pinned",
		Payload: fiber.Map{"chat_id": chatID, "message": msg},
	})

	return c.JSON(fiber.Map{"pinned_message": msg})
}

// UnpinMessage unpins the pinned message in a chat
func (h *MessageHandler) UnpinMessage(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}

	var memberCount int64
	h.DB.Model(&models.ChatMember{}).Where("chat_id = ? AND user_id = ?", chatID, userID).Count(&memberCount)
	if memberCount == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not a member"})
	}

	h.DB.Model(&models.Chat{}).Where("id = ?", chatID).Update("pinned_message_id", nil)

	h.Hub.BroadcastToChat(chatID, WSMessage{
		Type:    "message_unpinned",
		Payload: fiber.Map{"chat_id": chatID},
	})

	return c.JSON(fiber.Map{"message": "Unpinned"})
}

// SaveMessage saves a message to the user's Saved Messages
func (h *MessageHandler) SaveMessage(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	msgID, err := uuid.Parse(c.Params("messageId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid message ID"})
	}

	saved := models.SavedMessage{
		ID:        uuid.New(),
		UserID:    userID,
		MessageID: msgID,
	}
	h.DB.Where(models.SavedMessage{UserID: userID, MessageID: msgID}).FirstOrCreate(&saved)

	return c.JSON(fiber.Map{"saved": true})
}

// UnsaveMessage removes a message from Saved Messages
func (h *MessageHandler) UnsaveMessage(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	msgID, err := uuid.Parse(c.Params("messageId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid message ID"})
	}

	h.DB.Where("user_id = ? AND message_id = ?", userID, msgID).Delete(&models.SavedMessage{})

	return c.JSON(fiber.Map{"saved": false})
}

// GetSavedMessages returns all saved messages for the current user
func (h *MessageHandler) GetSavedMessages(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var saved []models.SavedMessage
	h.DB.Where("user_id = ?", userID).
		Preload("Message").
		Preload("Message.Sender").
		Preload("Message.Reactions").
		Order("saved_at DESC").
		Find(&saved)

	return c.JSON(saved)
}

// SearchMessages searches messages in a chat by keyword
func (h *MessageHandler) SearchMessages(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}
	var memberCount int64
	h.DB.Model(&models.ChatMember{}).Where("chat_id = ? AND user_id = ?", chatID, userID).Count(&memberCount)
	if memberCount == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not a member of this chat"})
	}
	q := c.Query("q")
	if q == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Query parameter 'q' required"})
	}
	var messages []models.Message
	h.DB.Where("chat_id = ? AND is_deleted = false AND content ILIKE ?", chatID, "%"+q+"%").
		Preload("Sender").
		Preload("ReplyTo").
		Preload("Reactions").
		Order("created_at DESC").
		Limit(50).
		Find(&messages)
	return c.JSON(messages)
}

// ForwardMessage forwards one or more messages to a target chat
func (h *MessageHandler) ForwardMessage(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var body struct {
		MessageIDs []string `json:"message_ids"`
		ToChatID   string   `json:"to_chat_id"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}
	if len(body.MessageIDs) == 0 || body.ToChatID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "message_ids and to_chat_id required"})
	}
	toChatID, err := uuid.Parse(body.ToChatID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid to_chat_id"})
	}
	// Verify membership in target chat
	var memberCount int64
	h.DB.Model(&models.ChatMember{}).Where("chat_id = ? AND user_id = ?", toChatID, userID).Count(&memberCount)
	if memberCount == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not a member of target chat"})
	}

	var forwarded []models.Message
	for _, idStr := range body.MessageIDs {
		srcID, err := uuid.Parse(idStr)
		if err != nil {
			continue
		}
		var src models.Message
		if err := h.DB.Preload("Sender").First(&src, "id = ? AND is_deleted = false", srcID).Error; err != nil {
			continue
		}
		fwd := models.Message{
			ChatID:            toChatID,
			SenderID:          userID,
			MessageType:       src.MessageType,
			Content:           src.Content,
			FileURL:           src.FileURL,
			FileName:          src.FileName,
			FileSize:          src.FileSize,
			MimeType:          src.MimeType,
			Duration:          src.Duration,
			ForwardFromID:     &src.SenderID,
			ForwardFromChatID: &src.ChatID,
		}
		h.DB.Create(&fwd)
		h.DB.Preload("Sender").Preload("ForwardFrom").First(&fwd, "id = ?", fwd.ID)
		forwarded = append(forwarded, fwd)
	}

	h.DB.Model(&models.Chat{}).Where("id = ?", toChatID).Update("updated_at", time.Now())

	for _, msg := range forwarded {
		h.Hub.BroadcastToChat(toChatID, WSMessage{Type: "new_message", Payload: msg})
	}

	return c.Status(fiber.StatusCreated).JSON(forwarded)
}

// SendLocationMessage sends a location message
func (h *MessageHandler) SendLocationMessage(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}

	var memberCount int64
	h.DB.Model(&models.ChatMember{}).Where("chat_id = ? AND user_id = ?", chatID, userID).Count(&memberCount)
	if memberCount == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not a member of this chat"})
	}

	var body struct {
		Latitude      float64 `json:"latitude"`
		Longitude     float64 `json:"longitude"`
		LocationTitle string  `json:"location_title"`
		ReplyToID     *string `json:"reply_to_id"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	if body.Latitude < -90 || body.Latitude > 90 || body.Longitude < -180 || body.Longitude > 180 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid coordinates"})
	}

	msg := models.Message{
		ID:            uuid.New(),
		ChatID:        chatID,
		SenderID:      userID,
		MessageType:   "location",
		Latitude:      &body.Latitude,
		Longitude:     &body.Longitude,
		LocationTitle: &body.LocationTitle,
	}

	if body.ReplyToID != nil {
		if replyID, err := uuid.Parse(*body.ReplyToID); err == nil {
			msg.ReplyToID = &replyID
		}
	}

	// Apply chat auto-delete timer if set
	var chat models.Chat
	if h.DB.First(&chat, "id = ?", chatID).Error == nil && chat.AutoDeleteSeconds > 0 {
		msg.AutoDeleteSeconds = chat.AutoDeleteSeconds
		deleteAt := time.Now().Add(time.Duration(chat.AutoDeleteSeconds) * time.Second)
		msg.DeleteAt = &deleteAt
	}

	if err := h.DB.Create(&msg).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to send location"})
	}

	h.DB.Model(&models.Chat{}).Where("id = ?", chatID).Update("updated_at", time.Now())
	h.DB.Preload("Sender").Preload("ReplyTo").Preload("ReplyTo.Sender").First(&msg, "id = ?", msg.ID)

	h.Hub.BroadcastToChat(chatID, WSMessage{Type: "new_message", Payload: msg})

	return c.Status(fiber.StatusCreated).JSON(msg)
}

// SearchMessagesAdvanced searches messages with optional filters
func (h *MessageHandler) SearchMessagesAdvanced(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}

	var memberCount int64
	h.DB.Model(&models.ChatMember{}).Where("chat_id = ? AND user_id = ?", chatID, userID).Count(&memberCount)
	if memberCount == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not a member of this chat"})
	}

	q := c.Query("q")
	msgType := c.Query("type")       // text, image, video, voice, file, location, poll
	senderID := c.Query("sender_id") // filter by sender
	dateFrom := c.Query("date_from") // RFC3339 or date string
	dateTo := c.Query("date_to")

	query := h.DB.Model(&models.Message{}).
		Where("chat_id = ? AND is_deleted = false", chatID)

	if q != "" {
		query = query.Where("content ILIKE ?", "%"+q+"%")
	}
	if msgType != "" {
		query = query.Where("message_type = ?", msgType)
	}
	if senderID != "" {
		if sid, err := uuid.Parse(senderID); err == nil {
			query = query.Where("sender_id = ?", sid)
		}
	}
	if dateFrom != "" {
		if t, err := time.Parse(time.RFC3339, dateFrom); err == nil {
			query = query.Where("created_at >= ?", t)
		}
	}
	if dateTo != "" {
		if t, err := time.Parse(time.RFC3339, dateTo); err == nil {
			query = query.Where("created_at <= ?", t)
		}
	}

	var messages []models.Message
	query.Preload("Sender").
		Preload("ReplyTo").
		Preload("Reactions").
		Order("created_at DESC").
		Limit(50).
		Find(&messages)

	return c.JSON(messages)
}

// SendLocation sends a location message
func (h *MessageHandler) SendLocation(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}

	var memberCount int64
	h.DB.Model(&models.ChatMember{}).Where("chat_id = ? AND user_id = ?", chatID, userID).Count(&memberCount)
	if memberCount == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not a member of this chat"})
	}

	var body struct {
		Latitude      float64 `json:"latitude"`
		Longitude     float64 `json:"longitude"`
		LocationTitle string  `json:"location_title"`
		ReplyToID     *string `json:"reply_to_id"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}
	if body.Latitude == 0 && body.Longitude == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Valid coordinates required"})
	}

	title := body.LocationTitle
	if title == "" {
		title = "Joylashuv"
	}

	msg := models.Message{
		ID:            uuid.New(),
		ChatID:        chatID,
		SenderID:      userID,
		MessageType:   "location",
		Latitude:      &body.Latitude,
		Longitude:     &body.Longitude,
		LocationTitle: &title,
	}
	if body.ReplyToID != nil {
		if replyID, err := uuid.Parse(*body.ReplyToID); err == nil {
			msg.ReplyToID = &replyID
		}
	}

	if err := h.DB.Create(&msg).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to send location"})
	}
	h.DB.Model(&models.Chat{}).Where("id = ?", chatID).Update("updated_at", time.Now())
	h.DB.Preload("Sender").First(&msg, "id = ?", msg.ID)

	h.Hub.BroadcastToChat(chatID, WSMessage{
		Type:    "new_message",
		Payload: msg,
	})
	return c.Status(fiber.StatusCreated).JSON(msg)
}

// SetAutoDelete sets or clears the auto-delete timer for a message
func (h *MessageHandler) SetAutoDelete(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}

	// Only admins can set auto-delete for group chats
	var member models.ChatMember
	if err := h.DB.First(&member, "chat_id = ? AND user_id = ?", chatID, userID).Error; err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not a member"})
	}

	var body struct {
		Seconds int `json:"seconds"` // 0 = disabled, 86400 = 1 day, etc.
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	if body.Seconds < 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Seconds must be >= 0"})
	}

	h.DB.Model(&models.Chat{}).Where("id = ?", chatID).Update("auto_delete_seconds", body.Seconds)

	h.Hub.BroadcastToChat(chatID, WSMessage{
		Type: "auto_delete_changed",
		Payload: fiber.Map{
			"chat_id": chatID,
			"seconds": body.Seconds,
		},
	})

	return c.JSON(fiber.Map{"auto_delete_seconds": body.Seconds})
}

// DeleteExpiredMessages is called by background job to purge expired messages
func DeleteExpiredMessages(db *gorm.DB, hub *Hub) {
	var messages []models.Message
	db.Where("delete_at IS NOT NULL AND delete_at <= ? AND is_deleted = false", time.Now()).
		Find(&messages)

	for _, msg := range messages {
		db.Model(&msg).Update("is_deleted", true)
		if hub != nil {
			hub.BroadcastToChat(msg.ChatID, WSMessage{
				Type:    "message_deleted",
				Payload: fiber.Map{"message_id": msg.ID, "chat_id": msg.ChatID},
			})
		}
	}
}
