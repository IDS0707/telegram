package handlers

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"telegram-clone-backend/internal/middleware"
	"telegram-clone-backend/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type FileHandler struct {
	DB        *gorm.DB
	Hub       *Hub
	UploadDir string
}

func NewFileHandler(db *gorm.DB, hub *Hub, uploadDir string) *FileHandler {
	return &FileHandler{DB: db, Hub: hub, UploadDir: uploadDir}
}

// SendFileMessage handles uploading and sending file/media messages
func (h *FileHandler) SendFileMessage(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}

	// Verify membership
	var memberCount int64
	h.DB.Model(&models.ChatMember{}).Where("chat_id = ? AND user_id = ?", chatID, userID).Count(&memberCount)
	if memberCount == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not a member of this chat"})
	}

	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "File is required"})
	}

	// Max 100MB
	if file.Size > 100*1024*1024 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "File too large (max 100MB)"})
	}

	// Determine message type from MIME type
	contentType := file.Header.Get("Content-Type")
	msgType := determineMessageType(contentType, file.Filename)

	// Block dangerous file extensions
	ext := strings.ToLower(filepath.Ext(file.Filename))
	blockedExts := map[string]bool{
		".html": true, ".htm": true, ".svg": true, ".xml": true,
		".js": true, ".php": true, ".exe": true, ".bat": true, ".cmd": true, ".sh": true,
	}
	if blockedExts[ext] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "File type not allowed"})
	}

	// Generate unique filename
	storedName := uuid.New().String() + ext
	subDir := msgType + "s" // images, videos, audios, voices, files
	savePath := filepath.Join(h.UploadDir, subDir, storedName)

	if err := c.SaveFile(file, savePath); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save file"})
	}

	fileURL := fmt.Sprintf("/uploads/%s/%s", subDir, storedName)

	content := c.FormValue("caption", "")
	replyToIDStr := c.FormValue("reply_to_id", "")
	durationStr := c.FormValue("duration", "0")

	var duration int
	fmt.Sscanf(durationStr, "%d", &duration)

	msg := models.Message{
		ID:          uuid.New(),
		ChatID:      chatID,
		SenderID:    userID,
		MessageType: msgType,
		FileURL:     &fileURL,
		FileName:    &file.Filename,
		FileSize:    file.Size,
		MimeType:    &contentType,
		Duration:    duration,
	}

	if content != "" {
		msg.Content = &content
	}

	if replyToIDStr != "" {
		if replyID, err := uuid.Parse(replyToIDStr); err == nil {
			msg.ReplyToID = &replyID
		}
	}

	if err := h.DB.Create(&msg).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save message"})
	}

	// Update chat timestamp
	h.DB.Model(&models.Chat{}).Where("id = ?", chatID).Update("updated_at", time.Now())

	h.DB.Preload("Sender").First(&msg, "id = ?", msg.ID)

	h.Hub.BroadcastToChat(chatID, WSMessage{
		Type:    "new_message",
		Payload: msg,
	})

	return c.Status(fiber.StatusCreated).JSON(msg)
}

// SendVoiceMessage handles voice message upload
func (h *FileHandler) SendVoiceMessage(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}

	// Verify membership
	var memberCount int64
	h.DB.Model(&models.ChatMember{}).Where("chat_id = ? AND user_id = ?", chatID, userID).Count(&memberCount)
	if memberCount == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not a member of this chat"})
	}

	file, err := c.FormFile("voice")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Voice file is required"})
	}

	ext := filepath.Ext(file.Filename)
	if ext == "" {
		ext = ".m4a"
	}
	storedName := uuid.New().String() + ext
	savePath := filepath.Join(h.UploadDir, "voices", storedName)

	if err := c.SaveFile(file, savePath); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save voice"})
	}

	fileURL := "/uploads/voices/" + storedName
	mimeType := file.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = "audio/mpeg"
	}
	fileName := "Voice message"

	var duration int
	fmt.Sscanf(c.FormValue("duration", "0"), "%d", &duration)

	msg := models.Message{
		ID:          uuid.New(),
		ChatID:      chatID,
		SenderID:    userID,
		MessageType: "voice",
		FileURL:     &fileURL,
		FileName:    &fileName,
		FileSize:    file.Size,
		MimeType:    &mimeType,
		Duration:    duration,
	}

	if err := h.DB.Create(&msg).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save voice message"})
	}
	h.DB.Model(&models.Chat{}).Where("id = ?", chatID).Update("updated_at", time.Now())
	h.DB.Preload("Sender").First(&msg, "id = ?", msg.ID)

	h.Hub.BroadcastToChat(chatID, WSMessage{
		Type:    "new_message",
		Payload: msg,
	})

	return c.Status(fiber.StatusCreated).JSON(msg)
}

// SendVideoNote handles round video message upload
func (h *FileHandler) SendVideoNote(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}

	var memberCount int64
	h.DB.Model(&models.ChatMember{}).Where("chat_id = ? AND user_id = ?", chatID, userID).Count(&memberCount)
	if memberCount == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not a member of this chat"})
	}

	file, err := c.FormFile("video")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Video file is required"})
	}

	// Detect extension from uploaded file's content type
	uploadedMime := file.Header.Get("Content-Type")
	ext := ".webm"
	if uploadedMime == "video/mp4" || strings.HasSuffix(strings.ToLower(file.Filename), ".mp4") {
		ext = ".mp4"
		uploadedMime = "video/mp4"
	} else {
		uploadedMime = "video/webm"
	}

	storedName := uuid.New().String() + ext
	savePath := filepath.Join(h.UploadDir, "videonotes", storedName)

	if err := c.SaveFile(file, savePath); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save video note"})
	}

	fileURL := "/uploads/videonotes/" + storedName
	mimeType := uploadedMime
	fileName := "Video message"

	var duration int
	fmt.Sscanf(c.FormValue("duration", "0"), "%d", &duration)

	shape := c.FormValue("shape", "round")
	if shape != "round" && shape != "rect" {
		shape = "round"
	}

	msg := models.Message{
		ID:          uuid.New(),
		ChatID:      chatID,
		SenderID:    userID,
		MessageType: "video_note",
		Content:     &shape,
		FileURL:     &fileURL,
		FileName:    &fileName,
		FileSize:    file.Size,
		MimeType:    &mimeType,
		Duration:    duration,
	}

	if err := h.DB.Create(&msg).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save video note"})
	}
	h.DB.Model(&models.Chat{}).Where("id = ?", chatID).Update("updated_at", time.Now())
	h.DB.Preload("Sender").First(&msg, "id = ?", msg.ID)

	h.Hub.BroadcastToChat(chatID, WSMessage{
		Type:    "new_message",
		Payload: msg,
	})

	return c.Status(fiber.StatusCreated).JSON(msg)
}

func determineMessageType(mimeType, filename string) string {
	lower := strings.ToLower(mimeType)
	ext := strings.ToLower(filepath.Ext(filename))

	switch {
	case strings.HasPrefix(lower, "image/"):
		return "image"
	case strings.HasPrefix(lower, "video/"):
		return "video"
	case strings.HasPrefix(lower, "audio/"):
		return "audio"
	case ext == ".mp3" || ext == ".ogg" || ext == ".wav" || ext == ".aac" || ext == ".m4a":
		return "audio"
	case ext == ".mp4" || ext == ".avi" || ext == ".mkv" || ext == ".mov":
		return "video"
	default:
		return "file"
	}
}
