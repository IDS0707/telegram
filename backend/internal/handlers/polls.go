package handlers

import (
	"telegram-clone-backend/internal/middleware"
	"telegram-clone-backend/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type PollHandler struct {
	DB  *gorm.DB
	Hub *Hub
}

func NewPollHandler(db *gorm.DB, hub *Hub) *PollHandler {
	return &PollHandler{DB: db, Hub: hub}
}

func (h *PollHandler) CreatePoll(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var body struct {
		Question    string   `json:"question"`
		Options     []string `json:"options"`
		IsAnonymous bool     `json:"is_anonymous"`
		IsMultiple  bool     `json:"is_multiple"`
		ChatID      string   `json:"chat_id"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}
	if body.Question == "" || len(body.Options) < 2 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Question and at least 2 options required"})
	}
	if len(body.Options) > 10 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Maximum 10 options allowed"})
	}

	poll := models.Poll{
		Question:    body.Question,
		IsAnonymous: body.IsAnonymous,
		IsMultiple:  body.IsMultiple,
		CreatedBy:   userID,
	}
	if err := h.DB.Create(&poll).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create poll"})
	}
	for _, optText := range body.Options {
		opt := models.PollOption{PollID: poll.ID, Text: optText}
		h.DB.Create(&opt)
	}

	// If chatID provided, send as a message
	if body.ChatID != "" {
		chatID, err := uuid.Parse(body.ChatID)
		if err == nil {
			var memberCount int64
			h.DB.Model(&models.ChatMember{}).Where("chat_id = ? AND user_id = ?", chatID, userID).Count(&memberCount)
			if memberCount > 0 {
				msg := models.Message{
					ChatID:      chatID,
					SenderID:    userID,
					MessageType: "poll",
					PollID:      &poll.ID,
				}
				h.DB.Create(&msg)
				h.DB.Preload("Sender").Preload("Poll").Preload("Poll.Options").First(&msg, "id = ?", msg.ID)
				h.Hub.BroadcastToChat(chatID, WSMessage{Type: "new_message", Payload: msg})
			}
		}
	}

	h.DB.Preload("Options").First(&poll, "id = ?", poll.ID)
	return c.Status(fiber.StatusCreated).JSON(poll)
}

func (h *PollHandler) GetPoll(c *fiber.Ctx) error {
	pollID, err := uuid.Parse(c.Params("pollId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid poll ID"})
	}
	var poll models.Poll
	if err := h.DB.Preload("Options").First(&poll, "id = ?", pollID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Poll not found"})
	}
	return c.JSON(poll)
}

func (h *PollHandler) Vote(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	pollID, err := uuid.Parse(c.Params("pollId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid poll ID"})
	}
	var poll models.Poll
	if err := h.DB.Preload("Options").First(&poll, "id = ?", pollID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Poll not found"})
	}
	if poll.IsClosed {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Poll is closed"})
	}

	var body struct {
		OptionIDs []string `json:"option_ids"`
	}
	c.BodyParser(&body)
	if len(body.OptionIDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Select at least one option"})
	}
	if !poll.IsMultiple && len(body.OptionIDs) > 1 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "This poll allows only one choice"})
	}

	// Remove previous votes
	h.DB.Where("poll_id = ? AND user_id = ?", pollID, userID).Delete(&models.PollVote{})

	for _, optIDStr := range body.OptionIDs {
		optID, err := uuid.Parse(optIDStr)
		if err != nil {
			continue
		}
		vote := models.PollVote{PollID: pollID, OptionID: optID, UserID: userID}
		h.DB.Create(&vote)
		// Update vote count
		var cnt int64
		h.DB.Model(&models.PollVote{}).Where("option_id = ?", optID).Count(&cnt)
		h.DB.Model(&models.PollOption{}).Where("id = ?", optID).Update("vote_count", cnt)
	}

	h.DB.Preload("Options").First(&poll, "id = ?", pollID)
	return c.JSON(poll)
}

func (h *PollHandler) ClosePoll(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	pollID, err := uuid.Parse(c.Params("pollId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid poll ID"})
	}
	var poll models.Poll
	if err := h.DB.First(&poll, "id = ?", pollID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Poll not found"})
	}
	if poll.CreatedBy != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not authorized"})
	}
	h.DB.Model(&poll).Update("is_closed", true)
	return c.JSON(fiber.Map{"success": true})
}
