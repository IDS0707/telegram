package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"time"

	"telegram-clone-backend/internal/middleware"
	"telegram-clone-backend/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ChatHandler struct {
	DB *gorm.DB
}

func NewChatHandler(db *gorm.DB) *ChatHandler {
	return &ChatHandler{DB: db}
}

// GetChats returns all chats for the current user with last message
func (h *ChatHandler) GetChats(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	type ChatWithLastMessage struct {
		models.Chat
		LastMessage *models.Message `json:"last_message"`
		UnreadCount int64           `json:"unread_count"`
		OtherUser   *models.User    `json:"other_user,omitempty"`
	}

	// Get chat IDs for user
	var memberEntries []models.ChatMember
	if err := h.DB.Where("user_id = ?", userID).Find(&memberEntries).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to load chats"})
	}

	chatIDs := make([]uuid.UUID, len(memberEntries))
	for i, m := range memberEntries {
		chatIDs[i] = m.ChatID
	}

	if len(chatIDs) == 0 {
		return c.JSON([]ChatWithLastMessage{})
	}

	var chats []models.Chat
	h.DB.Where("id IN ?", chatIDs).
		Preload("Members").
		Preload("Members.User").
		Order("updated_at DESC").
		Find(&chats)

	result := make([]ChatWithLastMessage, 0, len(chats))
	for _, chat := range chats {
		item := ChatWithLastMessage{Chat: chat}

		// Get last message
		var lastMsg models.Message
		if err := h.DB.Where("chat_id = ? AND is_deleted = false", chat.ID).
			Preload("Sender").
			Order("created_at DESC").
			First(&lastMsg).Error; err == nil {
			item.LastMessage = &lastMsg
		}

		// Count unread
		h.DB.Model(&models.Message{}).
			Where("chat_id = ? AND sender_id != ? AND is_read = false AND is_deleted = false", chat.ID, userID).
			Count(&item.UnreadCount)

		// For private chats, get the other user
		if chat.ChatType == "private" {
			for _, m := range chat.Members {
				if m.UserID != userID {
					item.OtherUser = &m.User
					break
				}
			}
		}

		result = append(result, item)
	}

	return c.JSON(result)
}

// CreatePrivateChat creates a new private chat or returns existing
func (h *ChatHandler) CreatePrivateChat(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var body struct {
		UserID string `json:"user_id"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	otherID, err := uuid.Parse(body.UserID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid user_id"})
	}

	if userID == otherID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Cannot chat with yourself"})
	}

	// Check if user exists
	var otherUser models.User
	if err := h.DB.First(&otherUser, "id = ?", otherID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	// Check if private chat already exists between these two users
	var existingChat models.Chat
	err = h.DB.Raw(`
		SELECT c.* FROM chats c
		JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = ?
		JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = ?
		WHERE c.chat_type = 'private'
		LIMIT 1
	`, userID, otherID).Scan(&existingChat).Error

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database error"})
	}

	if existingChat.ID != uuid.Nil {
		h.DB.Preload("Members").Preload("Members.User").First(&existingChat, "id = ?", existingChat.ID)
		return c.JSON(existingChat)
	}

	// Create new chat
	chat := models.Chat{
		ID:        uuid.New(),
		ChatType:  "private",
		CreatedBy: &userID,
	}
	if err := h.DB.Create(&chat).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create chat"})
	}

	// Add members
	if err := h.DB.Create(&models.ChatMember{ID: uuid.New(), ChatID: chat.ID, UserID: userID, Role: "member"}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to add member"})
	}
	if err := h.DB.Create(&models.ChatMember{ID: uuid.New(), ChatID: chat.ID, UserID: otherID, Role: "member"}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to add member"})
	}

	h.DB.Preload("Members").Preload("Members.User").First(&chat, "id = ?", chat.ID)

	return c.Status(fiber.StatusCreated).JSON(chat)
}

// CreateGroupChat creates a new group chat
func (h *ChatHandler) CreateGroupChat(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var body struct {
		Title   string   `json:"title"`
		Members []string `json:"members"` // user IDs
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	if body.Title == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Group title is required"})
	}

	chat := models.Chat{
		ID:        uuid.New(),
		ChatType:  "group",
		Title:     &body.Title,
		CreatedBy: &userID,
	}
	if err := h.DB.Create(&chat).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create group"})
	}

	// Add creator as admin
	h.DB.Create(&models.ChatMember{ID: uuid.New(), ChatID: chat.ID, UserID: userID, Role: "admin"})

	// Add other members (validate existence)
	for _, mIDStr := range body.Members {
		mID, err := uuid.Parse(mIDStr)
		if err != nil || mID == userID {
			continue
		}
		// Verify user exists
		var count int64
		h.DB.Model(&models.User{}).Where("id = ?", mID).Count(&count)
		if count > 0 {
			h.DB.Create(&models.ChatMember{ID: uuid.New(), ChatID: chat.ID, UserID: mID, Role: "member"})
		}
	}

	h.DB.Preload("Members").Preload("Members.User").First(&chat, "id = ?", chat.ID)

	return c.Status(fiber.StatusCreated).JSON(chat)
}

// ClearChatHistory soft-deletes all messages in a chat for the current user
func (h *ChatHandler) ClearChatHistory(c *fiber.Ctx) error {
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
	h.DB.Model(&models.Message{}).Where("chat_id = ?", chatID).Update("is_deleted", true)
	return c.JSON(fiber.Map{"message": "Chat history cleared"})
}

// GetChatByID returns a chat by ID
func (h *ChatHandler) GetChatByID(c *fiber.Ctx) error {
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

	var chat models.Chat
	if err := h.DB.Preload("Members").Preload("Members.User").First(&chat, "id = ?", chatID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Chat not found"})
	}

	// Load pinned message if set
	var pinnedMsg *models.Message
	if chat.PinnedMessageID != nil {
		var pm models.Message
		if h.DB.Preload("Sender").First(&pm, "id = ?", chat.PinnedMessageID).Error == nil {
			pinnedMsg = &pm
		}
	}

	type ChatDetail struct {
		models.Chat
		PinnedMessage *models.Message `json:"pinned_message"`
	}

	return c.JSON(ChatDetail{Chat: chat, PinnedMessage: pinnedMsg})
}

// PromoteMember promotes a chat member to admin
func (h *ChatHandler) PromoteMember(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}
	targetID, err := uuid.Parse(c.Params("userId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid user ID"})
	}

	// Only admins can promote
	var caller models.ChatMember
	if err := h.DB.First(&caller, "chat_id = ? AND user_id = ?", chatID, userID).Error; err != nil || caller.Role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Admin required"})
	}

	result := h.DB.Model(&models.ChatMember{}).
		Where("chat_id = ? AND user_id = ?", chatID, targetID).
		Update("role", "admin")
	if result.RowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Member not found"})
	}

	return c.JSON(fiber.Map{"message": "Member promoted to admin"})
}

// DemoteMember demotes an admin to regular member
func (h *ChatHandler) DemoteMember(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}
	targetID, err := uuid.Parse(c.Params("userId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid user ID"})
	}

	var caller models.ChatMember
	if err := h.DB.First(&caller, "chat_id = ? AND user_id = ?", chatID, userID).Error; err != nil || caller.Role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Admin required"})
	}

	// Cannot demote the chat creator
	var chat models.Chat
	h.DB.First(&chat, "id = ?", chatID)
	if chat.CreatedBy != nil && *chat.CreatedBy == targetID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Cannot demote chat creator"})
	}

	h.DB.Model(&models.ChatMember{}).
		Where("chat_id = ? AND user_id = ?", chatID, targetID).
		Update("role", "member")

	return c.JSON(fiber.Map{"message": "Member demoted"})
}

// KickMember removes a member from a group chat
func (h *ChatHandler) KickMember(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}
	targetID, err := uuid.Parse(c.Params("userId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid user ID"})
	}

	var caller models.ChatMember
	if err := h.DB.First(&caller, "chat_id = ? AND user_id = ?", chatID, userID).Error; err != nil || caller.Role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Admin required"})
	}

	if targetID == userID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Cannot kick yourself"})
	}

	h.DB.Where("chat_id = ? AND user_id = ?", chatID, targetID).Delete(&models.ChatMember{})

	return c.JSON(fiber.Map{"message": "Member removed"})
}

// AddMember adds a new member to a group chat
func (h *ChatHandler) AddMember(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}

	var body struct {
		UserID string `json:"user_id"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	newMemberID, err := uuid.Parse(body.UserID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid user_id"})
	}

	// Requester must be a member
	var memberCount int64
	h.DB.Model(&models.ChatMember{}).Where("chat_id = ? AND user_id = ?", chatID, userID).Count(&memberCount)
	if memberCount == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not a member"})
	}

	// Check chat is group
	var chat models.Chat
	if err := h.DB.First(&chat, "id = ?", chatID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Chat not found"})
	}
	if chat.ChatType != "group" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Can only add members to group chats"})
	}

	// Already a member?
	var existing int64
	h.DB.Model(&models.ChatMember{}).Where("chat_id = ? AND user_id = ?", chatID, newMemberID).Count(&existing)
	if existing > 0 {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "User is already a member"})
	}

	h.DB.Create(&models.ChatMember{ID: uuid.New(), ChatID: chatID, UserID: newMemberID, Role: "member"})

	return c.JSON(fiber.Map{"message": "Member added"})
}

// LeaveChat removes the current user from a group chat
func (h *ChatHandler) LeaveChat(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}

	h.DB.Where("chat_id = ? AND user_id = ?", chatID, userID).Delete(&models.ChatMember{})

	return c.JSON(fiber.Map{"message": "Left chat"})
}

// UpdateGroupInfo updates group title, description and/or avatar URL
func (h *ChatHandler) UpdateGroupInfo(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}

	var caller models.ChatMember
	if err := h.DB.First(&caller, "chat_id = ? AND user_id = ?", chatID, userID).Error; err != nil || caller.Role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Admin required"})
	}

	var body struct {
		Title       *string `json:"title"`
		Description *string `json:"description"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	updates := map[string]interface{}{"updated_at": time.Now()}
	if body.Title != nil {
		updates["title"] = *body.Title
	}
	if body.Description != nil {
		updates["description"] = *body.Description
	}

	h.DB.Model(&models.Chat{}).Where("id = ?", chatID).Updates(updates)

	var chat models.Chat
	h.DB.Preload("Members").Preload("Members.User").First(&chat, "id = ?", chatID)

	return c.JSON(chat)
}

// GenerateInviteLink generates a new invite link for a group chat
func (h *ChatHandler) GenerateInviteLink(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}

	var caller models.ChatMember
	if err := h.DB.First(&caller, "chat_id = ? AND user_id = ?", chatID, userID).Error; err != nil || caller.Role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Admin required"})
	}

	// Revoke old links
	h.DB.Model(&models.ChatInviteLink{}).Where("chat_id = ?", chatID).Update("is_active", false)

	// Generate a secure random code
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate link"})
	}
	code := hex.EncodeToString(b)

	link := models.ChatInviteLink{
		ID:        uuid.New(),
		ChatID:    chatID,
		CreatedBy: userID,
		LinkCode:  code,
		IsActive:  true,
	}
	h.DB.Create(&link)

	return c.JSON(fiber.Map{"invite_link": code, "link_id": link.ID})
}

// JoinByInviteLink joins a chat using an invite link code
func (h *ChatHandler) JoinByInviteLink(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	code := c.Params("code")
	if code == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Code required"})
	}

	var link models.ChatInviteLink
	if err := h.DB.First(&link, "link_code = ? AND is_active = true", code).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Invalid or expired invite link"})
	}

	if link.ExpiresAt != nil && time.Now().After(*link.ExpiresAt) {
		h.DB.Model(&link).Update("is_active", false)
		return c.Status(fiber.StatusGone).JSON(fiber.Map{"error": "Invite link has expired"})
	}

	if link.MaxUses > 0 && link.UseCount >= link.MaxUses {
		return c.Status(fiber.StatusGone).JSON(fiber.Map{"error": "Invite link usage limit reached"})
	}

	// Already a member?
	var existing int64
	h.DB.Model(&models.ChatMember{}).Where("chat_id = ? AND user_id = ?", link.ChatID, userID).Count(&existing)
	if existing > 0 {
		var chat models.Chat
		h.DB.Preload("Members").Preload("Members.User").First(&chat, "id = ?", link.ChatID)
		return c.JSON(chat)
	}

	h.DB.Create(&models.ChatMember{ID: uuid.New(), ChatID: link.ChatID, UserID: userID, Role: "member"})
	h.DB.Model(&link).Update("use_count", link.UseCount+1)

	var chat models.Chat
	h.DB.Preload("Members").Preload("Members.User").First(&chat, "id = ?", link.ChatID)

	return c.Status(fiber.StatusCreated).JSON(chat)
}
