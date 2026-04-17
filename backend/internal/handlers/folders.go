package handlers

import (
	"telegram-clone-backend/internal/middleware"
	"telegram-clone-backend/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type FolderHandler struct {
	DB *gorm.DB
}

func NewFolderHandler(db *gorm.DB) *FolderHandler {
	return &FolderHandler{DB: db}
}

func (h *FolderHandler) GetFolders(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var folders []models.ChatFolder
	h.DB.Where("user_id = ?", userID).
		Preload("Items").
		Order("sort_order ASC, created_at ASC").
		Find(&folders)
	return c.JSON(folders)
}

func (h *FolderHandler) CreateFolder(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var body struct {
		Name  string `json:"name"`
		Emoji string `json:"emoji"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}
	if body.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Name required"})
	}
	emoji := body.Emoji
	if emoji == "" {
		emoji = "📁"
	}
	// Count existing to set sort_order
	var cnt int64
	h.DB.Model(&models.ChatFolder{}).Where("user_id = ?", userID).Count(&cnt)

	folder := models.ChatFolder{
		UserID:    userID,
		Name:      body.Name,
		Emoji:     emoji,
		SortOrder: int(cnt),
	}
	if err := h.DB.Create(&folder).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create folder"})
	}
	return c.Status(fiber.StatusCreated).JSON(folder)
}

func (h *FolderHandler) UpdateFolder(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	folderID, err := uuid.Parse(c.Params("folderId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid folder ID"})
	}
	var folder models.ChatFolder
	if err := h.DB.Where("id = ? AND user_id = ?", folderID, userID).First(&folder).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Folder not found"})
	}
	var body struct {
		Name      string `json:"name"`
		Emoji     string `json:"emoji"`
		SortOrder int    `json:"sort_order"`
	}
	c.BodyParser(&body)
	if body.Name != "" {
		folder.Name = body.Name
	}
	if body.Emoji != "" {
		folder.Emoji = body.Emoji
	}
	folder.SortOrder = body.SortOrder
	h.DB.Save(&folder)
	return c.JSON(folder)
}

func (h *FolderHandler) DeleteFolder(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	folderID, err := uuid.Parse(c.Params("folderId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid folder ID"})
	}
	var folder models.ChatFolder
	if err := h.DB.Where("id = ? AND user_id = ?", folderID, userID).First(&folder).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Folder not found"})
	}
	h.DB.Where("folder_id = ?", folderID).Delete(&models.ChatFolderItem{})
	h.DB.Delete(&folder)
	return c.JSON(fiber.Map{"success": true})
}

func (h *FolderHandler) AddChatToFolder(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	folderID, err := uuid.Parse(c.Params("folderId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid folder ID"})
	}
	var body struct {
		ChatID string `json:"chat_id"`
	}
	c.BodyParser(&body)
	chatID, err := uuid.Parse(body.ChatID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}
	// Verify folder ownership
	var cnt int64
	h.DB.Model(&models.ChatFolder{}).Where("id = ? AND user_id = ?", folderID, userID).Count(&cnt)
	if cnt == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Folder not found"})
	}
	// Verify chat membership
	var memberCount int64
	h.DB.Model(&models.ChatMember{}).Where("chat_id = ? AND user_id = ?", chatID, userID).Count(&memberCount)
	if memberCount == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not a member of this chat"})
	}
	// Check duplicate
	var existing int64
	h.DB.Model(&models.ChatFolderItem{}).Where("folder_id = ? AND chat_id = ?", folderID, chatID).Count(&existing)
	if existing > 0 {
		return c.JSON(fiber.Map{"message": "Already in folder"})
	}
	item := models.ChatFolderItem{FolderID: folderID, ChatID: chatID}
	h.DB.Create(&item)
	return c.Status(fiber.StatusCreated).JSON(item)
}

func (h *FolderHandler) RemoveChatFromFolder(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	folderID, err := uuid.Parse(c.Params("folderId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid folder ID"})
	}
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}
	var cnt int64
	h.DB.Model(&models.ChatFolder{}).Where("id = ? AND user_id = ?", folderID, userID).Count(&cnt)
	if cnt == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Folder not found"})
	}
	h.DB.Where("folder_id = ? AND chat_id = ?", folderID, chatID).Delete(&models.ChatFolderItem{})
	return c.JSON(fiber.Map{"success": true})
}
