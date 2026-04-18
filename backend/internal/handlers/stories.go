package handlers

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"telegram-clone-backend/internal/middleware"
	"telegram-clone-backend/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type StoryHandler struct {
	DB        *gorm.DB
	UploadDir string
}

func NewStoryHandler(db *gorm.DB, uploadDir string) *StoryHandler {
	return &StoryHandler{DB: db, UploadDir: uploadDir}
}

// GetStories returns active stories from contacts and own stories
func (h *StoryHandler) GetStories(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var contacts []models.Contact
	h.DB.Where("owner_id = ?", userID).Find(&contacts)

	userIDs := []interface{}{userID}
	for _, ct := range contacts {
		userIDs = append(userIDs, ct.ContactID)
	}

	var stories []models.Story
	h.DB.Where("user_id IN ? AND expires_at > ?", userIDs, time.Now()).
		Preload("User").
		Order("user_id, created_at ASC").
		Find(&stories)

	return c.JSON(stories)
}

// GetMyStories returns only the current user's active stories
func (h *StoryHandler) GetMyStories(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var stories []models.Story
	h.DB.Where("user_id = ? AND expires_at > ?", userID, time.Now()).
		Preload("User").
		Order("created_at ASC").
		Find(&stories)

	return c.JSON(stories)
}

// CreateStory uploads and creates a new story (expires after 24h)
func (h *StoryHandler) CreateStory(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	now := time.Now()

	file, err := c.FormFile("media")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Media file is required"})
	}

	if file.Size > 50*1024*1024 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "File too large (max 50MB)"})
	}

	contentType := file.Header.Get("Content-Type")
	mediaType := "image"
	if strings.HasPrefix(contentType, "video") {
		mediaType = "video"
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	blockedExts := map[string]bool{
		".html": true, ".htm": true, ".svg": true, ".xml": true,
		".js": true, ".php": true, ".exe": true, ".bat": true, ".cmd": true, ".sh": true,
	}
	if blockedExts[ext] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "File type not allowed"})
	}

	filename := fmt.Sprintf("%s_%d%s", userID.String(), time.Now().UnixNano(), ext)
	dir := filepath.Join(h.UploadDir, "stories")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Server error"})
	}
	savePath := filepath.Join(dir, filename)

	if err := c.SaveFile(file, savePath); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save file"})
	}

	caption := c.FormValue("caption", "")
	story := models.Story{
		ID:        uuid.New(),
		UserID:    userID,
		MediaURL:  "/uploads/stories/" + filename,
		MediaType: mediaType,
		Caption:   caption,
		ExpiresAt: now.Add(24 * time.Hour),
	}

	if err := h.DB.Create(&story).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create story"})
	}

	h.DB.Preload("User").First(&story, "id = ?", story.ID)
	return c.Status(fiber.StatusCreated).JSON(story)
}

// ViewStory marks a story as viewed by the current user
func (h *StoryHandler) ViewStory(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	storyIDStr := c.Params("storyId")

	storyID, err := uuid.Parse(storyIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid story ID"})
	}

	var count int64
	h.DB.Model(&models.Story{}).Where("id = ? AND expires_at > ?", storyID, time.Now()).Count(&count)
	if count == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Story not found or expired"})
	}

	view := models.StoryView{
		ID:       uuid.New(),
		StoryID:  storyID,
		ViewerID: userID,
	}
	h.DB.Where("story_id = ? AND viewer_id = ?", storyID, userID).FirstOrCreate(&view)

	return c.JSON(fiber.Map{"ok": true})
}

// DeleteStory deletes own story
func (h *StoryHandler) DeleteStory(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	storyIDStr := c.Params("storyId")

	storyID, err := uuid.Parse(storyIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid story ID"})
	}

	result := h.DB.Where("id = ? AND user_id = ?", storyID, userID).Delete(&models.Story{})
	if result.RowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Story not found"})
	}

	return c.JSON(fiber.Map{"ok": true})
}
