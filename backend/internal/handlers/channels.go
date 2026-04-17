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

type ChannelHandler struct {
	DB        *gorm.DB
	Hub       *Hub
	UploadDir string
}

func NewChannelHandler(db *gorm.DB, hub *Hub, uploadDir string) *ChannelHandler {
	return &ChannelHandler{DB: db, Hub: hub, UploadDir: uploadDir}
}

// GetChannels returns channels the current user is subscribed to + public channels
func (h *ChannelHandler) GetChannels(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var channels []models.Channel
	h.DB.Joins("JOIN channel_members ON channel_members.channel_id = channels.id").
		Where("channel_members.user_id = ?", userID).
		Preload("Owner").
		Order("channels.created_at DESC").
		Find(&channels)

	// Attach subscriber count
	type ChannelWithCount struct {
		models.Channel
		SubscriberCount int64 `json:"subscriber_count"`
	}
	result := make([]ChannelWithCount, 0, len(channels))
	for _, ch := range channels {
		var cnt int64
		h.DB.Model(&models.ChannelMember{}).Where("channel_id = ?", ch.ID).Count(&cnt)
		result = append(result, ChannelWithCount{Channel: ch, SubscriberCount: cnt})
	}
	return c.JSON(result)
}

func (h *ChannelHandler) GetChannel(c *fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid channel ID"})
	}
	var channel models.Channel
	if err := h.DB.Preload("Owner").First(&channel, "id = ?", channelID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Channel not found"})
	}
	var cnt int64
	h.DB.Model(&models.ChannelMember{}).Where("channel_id = ?", channelID).Count(&cnt)
	return c.JSON(fiber.Map{"channel": channel, "subscriber_count": cnt})
}

func (h *ChannelHandler) CreateChannel(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var body struct {
		Title       string  `json:"title"`
		Username    *string `json:"username"`
		Description string  `json:"description"`
		IsPublic    bool    `json:"is_public"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}
	if strings.TrimSpace(body.Title) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Title is required"})
	}

	channel := models.Channel{
		Title:       body.Title,
		Username:    body.Username,
		Description: body.Description,
		IsPublic:    body.IsPublic,
		OwnerID:     userID,
	}
	if err := h.DB.Create(&channel).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create channel"})
	}
	// Owner becomes subscriber with role "owner"
	member := models.ChannelMember{ChannelID: channel.ID, UserID: userID, Role: "owner"}
	h.DB.Create(&member)
	return c.Status(fiber.StatusCreated).JSON(channel)
}

func (h *ChannelHandler) UpdateChannel(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid channel ID"})
	}
	var channel models.Channel
	if err := h.DB.First(&channel, "id = ?", channelID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Channel not found"})
	}
	if channel.OwnerID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not the owner"})
	}
	var body struct {
		Title       string  `json:"title"`
		Description string  `json:"description"`
		IsPublic    bool    `json:"is_public"`
		Username    *string `json:"username"`
	}
	c.BodyParser(&body)
	if body.Title != "" {
		channel.Title = body.Title
	}
	channel.Description = body.Description
	channel.IsPublic = body.IsPublic
	channel.Username = body.Username
	h.DB.Save(&channel)
	return c.JSON(channel)
}

func (h *ChannelHandler) DeleteChannel(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid channel ID"})
	}
	var channel models.Channel
	if err := h.DB.First(&channel, "id = ?", channelID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Channel not found"})
	}
	if channel.OwnerID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not the owner"})
	}
	h.DB.Where("channel_id = ?", channelID).Delete(&models.ChannelMember{})
	h.DB.Where("channel_id = ?", channelID).Delete(&models.ChannelPost{})
	h.DB.Delete(&channel)
	return c.JSON(fiber.Map{"success": true})
}

func (h *ChannelHandler) JoinChannel(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid channel ID"})
	}
	var existing int64
	h.DB.Model(&models.ChannelMember{}).Where("channel_id = ? AND user_id = ?", channelID, userID).Count(&existing)
	if existing > 0 {
		return c.JSON(fiber.Map{"message": "Already a member"})
	}
	member := models.ChannelMember{ChannelID: channelID, UserID: userID, Role: "subscriber"}
	h.DB.Create(&member)
	return c.JSON(fiber.Map{"success": true})
}

func (h *ChannelHandler) LeaveChannel(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid channel ID"})
	}
	// Owner can't leave, must delete
	var channel models.Channel
	h.DB.First(&channel, "id = ?", channelID)
	if channel.OwnerID == userID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Owner cannot leave. Delete the channel instead."})
	}
	h.DB.Where("channel_id = ? AND user_id = ?", channelID, userID).Delete(&models.ChannelMember{})
	return c.JSON(fiber.Map{"success": true})
}

func (h *ChannelHandler) GetPosts(c *fiber.Ctx) error {
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid channel ID"})
	}
	var posts []models.ChannelPost
	h.DB.Where("channel_id = ?", channelID).
		Preload("Author").
		Preload("Reactions").
		Order("created_at DESC").
		Limit(50).
		Find(&posts)
	return c.JSON(posts)
}

func (h *ChannelHandler) CreatePost(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid channel ID"})
	}
	// Must be owner or admin
	var member models.ChannelMember
	if err := h.DB.Where("channel_id = ? AND user_id = ? AND role IN ('owner','admin')", channelID, userID).First(&member).Error; err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not authorized to post"})
	}
	var body struct {
		Content   *string `json:"content"`
		MediaURL  *string `json:"media_url"`
		MediaType *string `json:"media_type"`
	}
	c.BodyParser(&body)
	if body.Content == nil && body.MediaURL == nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Post must have content or media"})
	}

	// Handle multipart file upload
	if file, err := c.FormFile("media"); err == nil {
		ext := strings.ToLower(filepath.Ext(file.Filename))
		filename := uuid.New().String() + ext
		savePath := filepath.Join(h.UploadDir, "channels", filename)
		if err := c.SaveFile(file, savePath); err == nil {
			url := "/uploads/channels/" + filename
			body.MediaURL = &url
			ct := file.Header.Get("Content-Type")
			if strings.HasPrefix(ct, "image") {
				t := "image"
				body.MediaType = &t
			} else if strings.HasPrefix(ct, "video") {
				t := "video"
				body.MediaType = &t
			}
		}
	}

	post := models.ChannelPost{
		ChannelID: channelID,
		AuthorID:  userID,
		Content:   body.Content,
		MediaURL:  body.MediaURL,
		MediaType: body.MediaType,
	}
	h.DB.Create(&post)
	h.DB.Preload("Author").First(&post, "id = ?", post.ID)

	// Broadcast to channel subscribers via WebSocket
	h.Hub.BroadcastToChannel(channelID, "channel_post", post)

	return c.Status(fiber.StatusCreated).JSON(post)
}

func (h *ChannelHandler) DeletePost(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	channelID, err := uuid.Parse(c.Params("channelId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid channel ID"})
	}
	postID, err := uuid.Parse(c.Params("postId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid post ID"})
	}
	var post models.ChannelPost
	if err := h.DB.First(&post, "id = ? AND channel_id = ?", postID, channelID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Post not found"})
	}
	var channel models.Channel
	h.DB.First(&channel, "id = ?", channelID)
	if post.AuthorID != userID && channel.OwnerID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not authorized"})
	}
	h.DB.Delete(&post)
	return c.JSON(fiber.Map{"success": true})
}

func (h *ChannelHandler) ReactToPost(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	postID, err := uuid.Parse(c.Params("postId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid post ID"})
	}
	var body struct {
		Emoji string `json:"emoji"`
	}
	c.BodyParser(&body)
	if body.Emoji == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Emoji required"})
	}
	var existing models.PostReaction
	result := h.DB.Where("post_id = ? AND user_id = ?", postID, userID).First(&existing)
	if result.Error == nil {
		if existing.Emoji == body.Emoji {
			h.DB.Delete(&existing)
			return c.JSON(fiber.Map{"action": "removed"})
		}
		existing.Emoji = body.Emoji
		h.DB.Save(&existing)
		return c.JSON(fiber.Map{"action": "updated", "reaction": existing})
	}
	reaction := models.PostReaction{PostID: postID, UserID: userID, Emoji: body.Emoji}
	h.DB.Create(&reaction)
	return c.JSON(fiber.Map{"action": "added", "reaction": reaction})
}
