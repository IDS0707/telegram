package handlers

import (
	"fmt"
	"log"
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

	// Story limit: 1 kunda 1ta, 1 haftada 3ta
	var todayCount int64
	var weekCount int64

	// 24 soat ichidagi story larni sanash
	oneDayAgo := now.Add(-24 * time.Hour)
	h.DB.Model(&models.Story{}).Where("user_id = ? AND created_at > ?", userID, oneDayAgo).Count(&todayCount)

	// 7 kun ichidagi story larni sanash
	oneWeekAgo := now.Add(-7 * 24 * time.Hour)
	h.DB.Model(&models.Story{}).Where("user_id = ? AND created_at > ?", userID, oneWeekAgo).Count(&weekCount)

	// Limit tekshiruvi
	if todayCount >= 1 {
		return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
			"error":       "Daily story limit reached. You can post 1 story per day.",
			"retry_after": "24h",
		})
	}

	if weekCount >= 3 {
		return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
			"error":       "Weekly story limit reached. You can post 3 stories per week.",
			"retry_after": "7d",
		})
	}

	file, err := c.FormFile("media")
	if err != nil {
		// Ba'zi klientlar media o'rniga boshqa field nomi bilan yuborishi mumkin.
		if fallback, ferr := c.FormFile("file"); ferr == nil {
			file = fallback
			err = nil
		} else if fallback, ferr := c.FormFile("story"); ferr == nil {
			file = fallback
			err = nil
		}
	}
	if err != nil || file == nil {
		log.Printf("Story upload error - FormFile failed: %v", err)
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Media file is required", "detail": "multipart field 'media' not found"})
	}

	// File size limit: 50MB (video uchun)
	if file.Size > 50*1024*1024 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "File too large (max 50MB)"})
	}

	// MIME type va media type aniqlash
	contentType := strings.ToLower(strings.TrimSpace(file.Header.Get("Content-Type")))
	mediaType := "image"

	// Faqat image va video ruxsat
	if strings.HasPrefix(contentType, "image/") {
		mediaType = "image"
		// Image uchun kichikroq limit: 10MB
		if file.Size > 10*1024*1024 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Image too large (max 10MB)"})
		}
	} else if strings.HasPrefix(contentType, "video/") {
		mediaType = "video"
	} else {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Only image or video files are allowed for stories"})
	}

	// File extension validation
	ext := strings.ToLower(filepath.Ext(file.Filename))

	// Allowed extensions
	allowedImageExts := map[string]bool{
		".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true, ".heic": true,
	}
	allowedVideoExts := map[string]bool{
		".mp4": true, ".mov": true, ".avi": true, ".mkv": true, ".webm": true,
	}

	// Blocked dangerous extensions
	blockedExts := map[string]bool{
		".html": true, ".htm": true, ".svg": true, ".xml": true,
		".js": true, ".jsx": true, ".ts": true, ".tsx": true,
		".php": true, ".exe": true, ".bat": true, ".cmd": true, ".sh": true,
		".apk": true, ".app": true, ".dmg": true, ".deb": true, ".rpm": true,
	}

	if blockedExts[ext] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "File type not allowed for security reasons"})
	}

	// Media type ga mos kengaytma tekshiruvi
	if mediaType == "image" && !allowedImageExts[ext] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid image file extension. Allowed: jpg, png, webp, gif, heic"})
	}
	if mediaType == "video" && !allowedVideoExts[ext] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid video file extension. Allowed: mp4, mov, avi, mkv, webm"})
	}

	// Fayl nomini sanitize qilish va unique qilish
	sanitizedFilename := sanitizeFilename(file.Filename)
	filename := fmt.Sprintf("%s_%d_%s", userID.String(), time.Now().UnixNano(), filepath.Base(sanitizedFilename))

	// Directory yaratish
	dir := filepath.Join(h.UploadDir, "stories")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Server error"})
	}
	savePath := filepath.Join(dir, filename)

	// Faylni saqlash
	if err := c.SaveFile(file, savePath); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save file"})
	}

	// Caption validation (maksimal 200 belgi)
	caption := strings.TrimSpace(c.FormValue("caption", ""))
	if len([]rune(caption)) > 200 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Caption too long (max 200 characters)"})
	}

	// Story yaratish
	story := models.Story{
		ID:        uuid.New(),
		UserID:    userID,
		MediaURL:  "/uploads/stories/" + filename,
		MediaType: mediaType,
		Caption:   caption,
		ExpiresAt: now.Add(24 * time.Hour),
	}

	if err := h.DB.Create(&story).Error; err != nil {
		// Agar xato bo'lsa, faylni o'chirish
		os.Remove(savePath)
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
