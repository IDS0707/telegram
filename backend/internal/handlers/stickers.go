package handlers

import (
	"path/filepath"
	"strings"

	"telegram-clone-backend/internal/middleware"
	"telegram-clone-backend/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type StickerHandler struct {
	DB        *gorm.DB
	UploadDir string
}

func NewStickerHandler(db *gorm.DB, uploadDir string) *StickerHandler {
	return &StickerHandler{DB: db, UploadDir: uploadDir}
}

func (h *StickerHandler) GetMyStickerSets(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var userSets []models.UserStickerSet
	h.DB.Where("user_id = ?", userID).
		Preload("Set").
		Preload("Set.Stickers").
		Order("added_at DESC").
		Find(&userSets)
	sets := make([]models.StickerSet, 0, len(userSets))
	for _, us := range userSets {
		sets = append(sets, us.Set)
	}
	return c.JSON(sets)
}

func (h *StickerHandler) GetAllStickerSets(c *fiber.Ctx) error {
	var sets []models.StickerSet
	h.DB.Preload("Stickers").Order("created_at DESC").Limit(50).Find(&sets)
	return c.JSON(sets)
}

func (h *StickerHandler) GetStickerSet(c *fiber.Ctx) error {
	setID, err := uuid.Parse(c.Params("setId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid set ID"})
	}
	var set models.StickerSet
	if err := h.DB.Preload("Stickers").First(&set, "id = ?", setID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Sticker set not found"})
	}
	return c.JSON(set)
}

func (h *StickerHandler) CreateStickerSet(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var body struct {
		Name       string `json:"name"`
		Title      string `json:"title"`
		IsAnimated bool   `json:"is_animated"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}
	if body.Name == "" || body.Title == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Name and title required"})
	}
	set := models.StickerSet{
		Name:       body.Name,
		Title:      body.Title,
		AuthorID:   userID,
		IsAnimated: body.IsAnimated,
	}
	if err := h.DB.Create(&set).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create sticker set"})
	}
	// Auto-add to user's sets
	userSet := models.UserStickerSet{UserID: userID, SetID: set.ID}
	h.DB.Create(&userSet)
	return c.Status(fiber.StatusCreated).JSON(set)
}

func (h *StickerHandler) UploadSticker(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	setID, err := uuid.Parse(c.Params("setId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid set ID"})
	}
	var set models.StickerSet
	if err := h.DB.First(&set, "id = ?", setID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Sticker set not found"})
	}
	if set.AuthorID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not the author"})
	}

	file, err := c.FormFile("sticker")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "No sticker file uploaded"})
	}
	ext := strings.ToLower(filepath.Ext(file.Filename))
	allowed := map[string]bool{".png": true, ".webp": true, ".tgs": true, ".gif": true}
	if !allowed[ext] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Only .png, .webp, .tgs, .gif allowed"})
	}
	filename := uuid.New().String() + ext
	savePath := filepath.Join(h.UploadDir, "stickers", filename)
	if err := c.SaveFile(file, savePath); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save sticker"})
	}
	emoji := c.FormValue("emoji", "😀")
	var order int64
	h.DB.Model(&models.Sticker{}).Where("set_id = ?", setID).Count(&order)
	sticker := models.Sticker{
		SetID:     setID,
		Emoji:     emoji,
		FileURL:   "/uploads/stickers/" + filename,
		SortOrder: int(order),
	}
	h.DB.Create(&sticker)
	return c.Status(fiber.StatusCreated).JSON(sticker)
}

func (h *StickerHandler) AddToMyStickers(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	setID, err := uuid.Parse(c.Params("setId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid set ID"})
	}
	var existing int64
	h.DB.Model(&models.UserStickerSet{}).Where("user_id = ? AND set_id = ?", userID, setID).Count(&existing)
	if existing > 0 {
		return c.JSON(fiber.Map{"message": "Already added"})
	}
	userSet := models.UserStickerSet{UserID: userID, SetID: setID}
	h.DB.Create(&userSet)
	return c.JSON(fiber.Map{"success": true})
}

func (h *StickerHandler) RemoveFromMyStickers(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	setID, err := uuid.Parse(c.Params("setId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid set ID"})
	}
	h.DB.Where("user_id = ? AND set_id = ?", userID, setID).Delete(&models.UserStickerSet{})
	return c.JSON(fiber.Map{"success": true})
}
