package handlers

import (
	"crypto/rand"
	"encoding/hex"

	"telegram-clone-backend/internal/middleware"
	"telegram-clone-backend/internal/models"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

type TwoFAHandler struct {
	DB *gorm.DB
}

func NewTwoFAHandler(db *gorm.DB) *TwoFAHandler {
	return &TwoFAHandler{DB: db}
}

func (h *TwoFAHandler) GetStatus(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var tf models.TwoFactor
	if err := h.DB.Where("user_id = ?", userID).First(&tf).Error; err != nil {
		return c.JSON(fiber.Map{"enabled": false})
	}
	return c.JSON(fiber.Map{"enabled": tf.IsEnabled})
}

func (h *TwoFAHandler) Enable(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var body struct {
		Password string `json:"password"`
	}
	if err := c.BodyParser(&body); err != nil || body.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Password required"})
	}
	if len(body.Password) < 6 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Password must be at least 6 characters"})
	}

	// Generate a random recovery code
	b := make([]byte, 16)
	rand.Read(b)
	recoveryCode := hex.EncodeToString(b)

	var tf models.TwoFactor
	result := h.DB.Where("user_id = ?", userID).First(&tf)
	if result.Error != nil {
		// Create new
		tf = models.TwoFactor{
			UserID:    userID,
			Secret:    body.Password,
			IsEnabled: true,
		}
		h.DB.Create(&tf)
	} else {
		tf.Secret = body.Password
		tf.IsEnabled = true
		h.DB.Save(&tf)
	}
	return c.JSON(fiber.Map{"success": true, "recovery_code": recoveryCode})
}

func (h *TwoFAHandler) Disable(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var body struct {
		Password string `json:"password"`
	}
	if err := c.BodyParser(&body); err != nil || body.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Password required"})
	}
	var tf models.TwoFactor
	if err := h.DB.Where("user_id = ? AND is_enabled = true", userID).First(&tf).Error; err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "2FA is not enabled"})
	}
	if tf.Secret != body.Password {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Incorrect 2FA password"})
	}
	tf.IsEnabled = false
	h.DB.Save(&tf)
	return c.JSON(fiber.Map{"success": true})
}

func (h *TwoFAHandler) Verify(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var body struct {
		Password string `json:"password"`
	}
	if err := c.BodyParser(&body); err != nil || body.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Password required"})
	}
	var tf models.TwoFactor
	if err := h.DB.Where("user_id = ? AND is_enabled = true", userID).First(&tf).Error; err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "2FA is not enabled"})
	}
	if tf.Secret != body.Password {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Incorrect 2FA password"})
	}
	return c.JSON(fiber.Map{"verified": true})
}
