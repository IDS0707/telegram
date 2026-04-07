package handlers

import (
	"time"

	"telegram-clone-backend/internal/middleware"
	"telegram-clone-backend/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type CallHandler struct {
	DB  *gorm.DB
	Hub *Hub
}

func NewCallHandler(db *gorm.DB, hub *Hub) *CallHandler {
	return &CallHandler{DB: db, Hub: hub}
}

// InitiateCall starts a new call
func (h *CallHandler) InitiateCall(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var body struct {
		CalleeID string `json:"callee_id"`
		CallType string `json:"call_type"` // voice or video
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	calleeID, err := uuid.Parse(body.CalleeID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid callee_id"})
	}

	if body.CallType != "voice" && body.CallType != "video" {
		body.CallType = "voice"
	}

	call := models.Call{
		ID:       uuid.New(),
		CallerID: userID,
		CalleeID: calleeID,
		CallType: body.CallType,
		Status:   "ringing",
	}
	h.DB.Create(&call)
	h.DB.Preload("Caller").Preload("Callee").First(&call, "id = ?", call.ID)

	// Notify callee via WebSocket
	h.Hub.SendToUser(calleeID, WSMessage{
		Type:    "incoming_call",
		Payload: call,
	})

	return c.Status(fiber.StatusCreated).JSON(call)
}

// AnswerCall answers a call
func (h *CallHandler) AnswerCall(c *fiber.Ctx) error {
	callID, err := uuid.Parse(c.Params("callId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid call ID"})
	}

	var call models.Call
	if err := h.DB.First(&call, "id = ?", callID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Call not found"})
	}

	h.DB.Model(&call).Update("status", "answered")

	h.Hub.SendToUser(call.CallerID, WSMessage{
		Type:    "call_answered",
		Payload: fiber.Map{"call_id": call.ID},
	})

	return c.JSON(fiber.Map{"message": "Call answered", "call": call})
}

// DeclineCall declines a call
func (h *CallHandler) DeclineCall(c *fiber.Ctx) error {
	callID, err := uuid.Parse(c.Params("callId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid call ID"})
	}

	var call models.Call
	if err := h.DB.First(&call, "id = ?", callID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Call not found"})
	}

	now := time.Now()
	h.DB.Model(&call).Updates(map[string]interface{}{"status": "declined", "ended_at": now})

	h.Hub.SendToUser(call.CallerID, WSMessage{
		Type:    "call_declined",
		Payload: fiber.Map{"call_id": call.ID},
	})

	return c.JSON(fiber.Map{"message": "Call declined"})
}

// EndCall ends a call
func (h *CallHandler) EndCall(c *fiber.Ctx) error {
	callID, err := uuid.Parse(c.Params("callId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid call ID"})
	}

	var call models.Call
	if err := h.DB.First(&call, "id = ?", callID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Call not found"})
	}

	now := time.Now()
	duration := int(now.Sub(call.StartedAt).Seconds())
	h.DB.Model(&call).Updates(map[string]interface{}{
		"status":   "ended",
		"ended_at": now,
		"duration": duration,
	})

	// Notify both parties
	h.Hub.SendToUser(call.CallerID, WSMessage{
		Type:    "call_ended",
		Payload: fiber.Map{"call_id": call.ID, "duration": duration},
	})
	h.Hub.SendToUser(call.CalleeID, WSMessage{
		Type:    "call_ended",
		Payload: fiber.Map{"call_id": call.ID, "duration": duration},
	})

	return c.JSON(fiber.Map{"message": "Call ended", "duration": duration})
}

// GetCallHistory returns call history for user
func (h *CallHandler) GetCallHistory(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var calls []models.Call
	h.DB.Where("caller_id = ? OR callee_id = ?", userID, userID).
		Preload("Caller").
		Preload("Callee").
		Order("started_at DESC").
		Limit(50).
		Find(&calls)

	return c.JSON(calls)
}

// WebRTC signaling: exchange SDP offers/answers and ICE candidates
func (h *CallHandler) SendSignal(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var body struct {
		TargetID string      `json:"target_id"`
		Type     string      `json:"type"` // offer, answer, ice-candidate
		Data     interface{} `json:"data"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	targetID, err := uuid.Parse(body.TargetID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid target_id"})
	}

	h.Hub.SendToUser(targetID, WSMessage{
		Type: "webrtc_signal",
		Payload: fiber.Map{
			"from": userID,
			"type": body.Type,
			"data": body.Data,
		},
	})

	return c.JSON(fiber.Map{"message": "Signal sent"})
}
