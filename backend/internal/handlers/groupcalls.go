package handlers

import (
	"time"

	"telegram-clone-backend/internal/middleware"
	"telegram-clone-backend/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type GroupCallHandler struct {
	DB  *gorm.DB
	Hub *Hub
}

func NewGroupCallHandler(db *gorm.DB, hub *Hub) *GroupCallHandler {
	return &GroupCallHandler{DB: db, Hub: hub}
}

// StartGroupCall starts a group call in a chat
func (h *GroupCallHandler) StartGroupCall(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}

	// Check membership
	var memberCount int64
	h.DB.Model(&models.ChatMember{}).Where("chat_id = ? AND user_id = ?", chatID, userID).Count(&memberCount)
	if memberCount == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not a member"})
	}

	// End any existing active calls in this chat
	now := time.Now()
	h.DB.Model(&models.GroupCall{}).Where("chat_id = ? AND is_active = true", chatID).
		Updates(map[string]interface{}{"is_active": false, "ended_at": now})

	var body struct {
		Title string `json:"title"`
	}
	c.BodyParser(&body)

	call := models.GroupCall{
		ID:        uuid.New(),
		ChatID:    chatID,
		CreatedBy: userID,
		IsActive:  true,
		Title:     body.Title,
	}
	h.DB.Create(&call)

	// Add creator as first participant
	h.DB.Create(&models.GroupCallParticipant{
		ID:     uuid.New(),
		CallID: call.ID,
		UserID: userID,
	})

	h.DB.Preload("Participants.User").Preload("Creator").First(&call, "id = ?", call.ID)

	// Notify all other chat members
	var members []models.ChatMember
	h.DB.Where("chat_id = ?", chatID).Find(&members)
	for _, m := range members {
		if m.UserID != userID {
			h.Hub.SendToUser(m.UserID, WSMessage{
				Type:    "group_call_started",
				Payload: call,
			})
		}
	}

	return c.Status(fiber.StatusCreated).JSON(call)
}

// JoinGroupCall joins an existing active group call
func (h *GroupCallHandler) JoinGroupCall(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	callID, err := uuid.Parse(c.Params("callId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid call ID"})
	}

	var call models.GroupCall
	if err := h.DB.First(&call, "id = ? AND is_active = true", callID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Call not found or already ended"})
	}

	// Verify user is a chat member
	var memberCount int64
	h.DB.Model(&models.ChatMember{}).Where("chat_id = ? AND user_id = ?", call.ChatID, userID).Count(&memberCount)
	if memberCount == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not a member of this chat"})
	}

	// Already in call — just return current state
	var existing int64
	h.DB.Model(&models.GroupCallParticipant{}).Where("call_id = ? AND user_id = ?", callID, userID).Count(&existing)
	if existing == 0 {
		h.DB.Create(&models.GroupCallParticipant{
			ID:     uuid.New(),
			CallID: callID,
			UserID: userID,
		})
	}

	h.DB.Preload("Participants.User").Preload("Creator").First(&call, "id = ?", call.ID)

	// Notify other participants
	var participants []models.GroupCallParticipant
	h.DB.Where("call_id = ?", callID).Find(&participants)
	for _, p := range participants {
		if p.UserID != userID {
			h.Hub.SendToUser(p.UserID, WSMessage{
				Type:    "group_call_participant_joined",
				Payload: fiber.Map{"call_id": callID, "user_id": userID},
			})
		}
	}

	return c.JSON(call)
}

// LeaveGroupCall removes a participant from a group call
func (h *GroupCallHandler) LeaveGroupCall(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	callID, err := uuid.Parse(c.Params("callId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid call ID"})
	}

	h.DB.Where("call_id = ? AND user_id = ?", callID, userID).Delete(&models.GroupCallParticipant{})

	// End call if no participants remain
	var count int64
	h.DB.Model(&models.GroupCallParticipant{}).Where("call_id = ?", callID).Count(&count)
	if count == 0 {
		now := time.Now()
		h.DB.Model(&models.GroupCall{}).Where("id = ?", callID).Updates(map[string]interface{}{
			"is_active": false,
			"ended_at":  now,
		})
	}

	// Notify remaining participants
	var participants []models.GroupCallParticipant
	h.DB.Where("call_id = ?", callID).Find(&participants)
	for _, p := range participants {
		h.Hub.SendToUser(p.UserID, WSMessage{
			Type:    "group_call_participant_left",
			Payload: fiber.Map{"call_id": callID, "user_id": userID},
		})
	}

	return c.JSON(fiber.Map{"message": "Left call"})
}

// GetActiveGroupCall returns the active group call for a chat (if any)
func (h *GroupCallHandler) GetActiveGroupCall(c *fiber.Ctx) error {
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

	var call models.GroupCall
	if err := h.DB.Preload("Participants.User").Preload("Creator").
		First(&call, "chat_id = ? AND is_active = true", chatID).Error; err != nil {
		return c.JSON(nil)
	}

	return c.JSON(call)
}

// SendGroupCallSignal forwards a WebRTC signaling message to a specific participant
func (h *GroupCallHandler) SendGroupCallSignal(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var body struct {
		CallID     string      `json:"call_id"`
		TargetID   string      `json:"target_id"`
		SignalType string      `json:"signal_type"` // offer, answer, ice-candidate
		Data       interface{} `json:"data"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	targetID, err := uuid.Parse(body.TargetID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid target_id"})
	}

	h.Hub.SendToUser(targetID, WSMessage{
		Type: "group_call_signal",
		Payload: fiber.Map{
			"call_id":      body.CallID,
			"from_user_id": userID,
			"signal_type":  body.SignalType,
			"data":         body.Data,
		},
	})

	return c.JSON(fiber.Map{"message": "Signal sent"})
}

// UpdateParticipantStatus updates mute/video/screen-share state
func (h *GroupCallHandler) UpdateParticipantStatus(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	callID, err := uuid.Parse(c.Params("callId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid call ID"})
	}

	var body struct {
		IsMuted         bool `json:"is_muted"`
		IsVideoEnabled  bool `json:"is_video_enabled"`
		IsScreenSharing bool `json:"is_screen_sharing"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	h.DB.Model(&models.GroupCallParticipant{}).
		Where("call_id = ? AND user_id = ?", callID, userID).
		Updates(map[string]interface{}{
			"is_muted":          body.IsMuted,
			"is_video_enabled":  body.IsVideoEnabled,
			"is_screen_sharing": body.IsScreenSharing,
		})

	// Notify other participants
	var participants []models.GroupCallParticipant
	h.DB.Where("call_id = ?", callID).Find(&participants)
	for _, p := range participants {
		if p.UserID != userID {
			h.Hub.SendToUser(p.UserID, WSMessage{
				Type: "group_call_status_update",
				Payload: fiber.Map{
					"call_id":           callID,
					"user_id":           userID,
					"is_muted":          body.IsMuted,
					"is_video_enabled":  body.IsVideoEnabled,
					"is_screen_sharing": body.IsScreenSharing,
				},
			})
		}
	}

	return c.JSON(fiber.Map{"message": "Status updated"})
}
