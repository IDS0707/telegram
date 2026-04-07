package handlers

import (
	"strings"

	"telegram-clone-backend/internal/middleware"
	"telegram-clone-backend/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ContactHandler struct {
	DB *gorm.DB
}

func NewContactHandler(db *gorm.DB) *ContactHandler {
	return &ContactHandler{DB: db}
}

// GetContacts returns user's contacts
func (h *ContactHandler) GetContacts(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var contacts []models.Contact
	h.DB.Where("owner_id = ?", userID).Preload("Contact").Find(&contacts)

	return c.JSON(contacts)
}

// AddContact adds a user to contacts
func (h *ContactHandler) AddContact(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var body struct {
		Phone    *string `json:"phone"`
		UserID   *string `json:"user_id"`
		Nickname *string `json:"nickname"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	var contactUser models.User

	if body.UserID != nil {
		cID, err := uuid.Parse(*body.UserID)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid user_id"})
		}
		if err := h.DB.First(&contactUser, "id = ?", cID).Error; err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
		}
	} else if body.Phone != nil {
		if err := h.DB.First(&contactUser, "phone = ?", *body.Phone).Error; err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found with this phone"})
		}
	} else {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "phone or user_id required"})
	}

	if contactUser.ID == userID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Cannot add yourself"})
	}

	// Check duplicate
	var count int64
	h.DB.Model(&models.Contact{}).Where("owner_id = ? AND contact_id = ?", userID, contactUser.ID).Count(&count)
	if count > 0 {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Contact already exists"})
	}

	contact := models.Contact{
		ID:        uuid.New(),
		OwnerID:   userID,
		ContactID: contactUser.ID,
		Nickname:  body.Nickname,
	}
	h.DB.Create(&contact)

	h.DB.Preload("Contact").First(&contact, "id = ?", contact.ID)

	return c.Status(fiber.StatusCreated).JSON(contact)
}

// DeleteContact removes a contact
func (h *ContactHandler) DeleteContact(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	contactID, err := uuid.Parse(c.Params("contactId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid contact ID"})
	}

	result := h.DB.Where("id = ? AND owner_id = ?", contactID, userID).Delete(&models.Contact{})
	if result.RowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Contact not found"})
	}

	return c.JSON(fiber.Map{"message": "Contact deleted"})
}

// SearchUsers searches for users by phone or username
func (h *ContactHandler) SearchUsers(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	query := c.Query("q", "")
	if len(query) < 2 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Query must be at least 2 characters"})
	}

	type SafeUser struct {
		ID          uuid.UUID `json:"id"`
		DisplayName string    `json:"display_name"`
		Username    *string   `json:"username"`
		AvatarURL   *string   `json:"avatar_url"`
		Bio         string    `json:"bio"`
		IsOnline    bool      `json:"is_online"`
	}

	var users []models.User
	// Escape LIKE metacharacters
	safeQuery := strings.NewReplacer("%", "\\%", "_", "\\_").Replace(query)
	h.DB.Where("(username LIKE ? OR display_name LIKE ?) AND id != ?",
		"%"+safeQuery+"%", "%"+safeQuery+"%", userID).
		Limit(20).
		Find(&users)

	result := make([]SafeUser, len(users))
	for i, u := range users {
		result[i] = SafeUser{
			ID:          u.ID,
			DisplayName: u.DisplayName,
			Username:    u.Username,
			AvatarURL:   u.AvatarURL,
			Bio:         u.Bio,
			IsOnline:    u.IsOnline,
		}
	}

	return c.JSON(result)
}
