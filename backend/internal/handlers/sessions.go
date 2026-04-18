package handlers

import (
	"time"

	"telegram-clone-backend/internal/middleware"
	"telegram-clone-backend/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type SessionHandler struct {
	DB *gorm.DB
}

func NewSessionHandler(db *gorm.DB) *SessionHandler {
	return &SessionHandler{DB: db}
}

// CreateSession creates a new session record (called on login/register)
func CreateSession(db *gorm.DB, userID uuid.UUID, c *fiber.Ctx) *models.UserSession {
	session := models.UserSession{
		ID:           uuid.New(),
		UserID:       userID,
		DeviceName:   c.Get("X-Device-Name", "Unknown Device"),
		DeviceType:   c.Get("X-Device-Type", "mobile"),
		IPAddress:    c.IP(),
		Platform:     c.Get("X-Platform", "unknown"),
		AppVersion:   c.Get("X-App-Version", "1.0.0"),
		IsActive:     true,
		LastActiveAt: time.Now(),
		ExpiresAt:    time.Now().Add(30 * 24 * time.Hour),
	}
	db.Create(&session)
	return &session
}

// GetSessions returns all active sessions for the current user
func (h *SessionHandler) GetSessions(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var sessions []models.UserSession
	h.DB.Where("user_id = ? AND is_active = true", userID).
		Order("last_active_at DESC").
		Find(&sessions)

	// Mark current session based on session ID header
	currentID := c.Get("X-Session-ID")
	for i := range sessions {
		if sessions[i].ID.String() == currentID {
			sessions[i].IsCurrent = true
		}
	}

	return c.JSON(sessions)
}

// RevokeSession revokes a specific session
func (h *SessionHandler) RevokeSession(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	sessionID, err := uuid.Parse(c.Params("sessionId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid session ID"})
	}

	result := h.DB.Model(&models.UserSession{}).
		Where("id = ? AND user_id = ?", sessionID, userID).
		Update("is_active", false)

	if result.RowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Session not found"})
	}

	return c.JSON(fiber.Map{"message": "Session revoked"})
}

// RevokeAllOtherSessions revokes all sessions except the current one
func (h *SessionHandler) RevokeAllOtherSessions(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	currentID := c.Get("X-Session-ID")

	query := h.DB.Model(&models.UserSession{}).
		Where("user_id = ? AND is_active = true", userID)

	if currentID != "" {
		query = query.Where("id != ?", currentID)
	}

	query.Update("is_active", false)

	return c.JSON(fiber.Map{"message": "All other sessions revoked"})
}
