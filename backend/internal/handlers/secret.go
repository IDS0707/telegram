package handlers

import (
	"telegram-clone-backend/internal/middleware"
	"telegram-clone-backend/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type SecretChatHandler struct {
	DB  *gorm.DB
	Hub *Hub
}

func NewSecretChatHandler(db *gorm.DB, hub *Hub) *SecretChatHandler {
	return &SecretChatHandler{DB: db, Hub: hub}
}

// InitiateSecretChat creates a new secret chat request with ECDH public key exchange
func (h *SecretChatHandler) InitiateSecretChat(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var body struct {
		RecipientID string `json:"recipient_id"`
		PublicKey   string `json:"public_key"` // ECDH public key (base64-encoded)
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	recipientID, err := uuid.Parse(body.RecipientID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid recipient_id"})
	}

	if body.PublicKey == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Public key required"})
	}

	// Validate recipient exists
	var recipient models.User
	if err := h.DB.First(&recipient, "id = ?", recipientID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Recipient not found"})
	}

	// Create a new secret chat
	chat := models.Chat{
		ID:        uuid.New(),
		ChatType:  "secret",
		IsSecret:  true,
		CreatedBy: &userID,
	}
	h.DB.Create(&chat)

	// Add both members
	h.DB.Create(&models.ChatMember{ID: uuid.New(), ChatID: chat.ID, UserID: userID, Role: "admin"})
	h.DB.Create(&models.ChatMember{ID: uuid.New(), ChatID: chat.ID, UserID: recipientID, Role: "member"})

	secretChat := models.SecretChat{
		ID:                 uuid.New(),
		ChatID:             chat.ID,
		InitiatorID:        userID,
		RecipientID:        recipientID,
		InitiatorPublicKey: body.PublicKey,
		Status:             "pending",
	}
	h.DB.Create(&secretChat)
	h.DB.Preload("Initiator").Preload("Recipient").First(&secretChat, "id = ?", secretChat.ID)

	// Notify recipient
	h.Hub.SendToUser(recipientID, WSMessage{
		Type:    "secret_chat_request",
		Payload: secretChat,
	})

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"chat":        chat,
		"secret_chat": secretChat,
	})
}

// AcceptSecretChat provides the recipient's public key and accepts the handshake
func (h *SecretChatHandler) AcceptSecretChat(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	secretChatID, err := uuid.Parse(c.Params("secretChatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid secret chat ID"})
	}

	var body struct {
		PublicKey string `json:"public_key"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	var secretChat models.SecretChat
	if err := h.DB.First(&secretChat, "id = ?", secretChatID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Secret chat not found"})
	}

	if secretChat.RecipientID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not authorized"})
	}

	h.DB.Model(&secretChat).Updates(map[string]interface{}{
		"recipient_public_key": body.PublicKey,
		"status":               "accepted",
	})
	h.DB.Preload("Initiator").Preload("Recipient").First(&secretChat, "id = ?", secretChat.ID)

	// Send accepted signal with both public keys to initiator
	h.Hub.SendToUser(secretChat.InitiatorID, WSMessage{
		Type:    "secret_chat_accepted",
		Payload: secretChat,
	})

	return c.JSON(secretChat)
}

// RejectSecretChat rejects the secret chat request
func (h *SecretChatHandler) RejectSecretChat(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	secretChatID, err := uuid.Parse(c.Params("secretChatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid secret chat ID"})
	}

	var secretChat models.SecretChat
	if err := h.DB.First(&secretChat, "id = ?", secretChatID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Secret chat not found"})
	}

	if secretChat.RecipientID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not authorized"})
	}

	h.DB.Model(&secretChat).Update("status", "rejected")

	h.Hub.SendToUser(secretChat.InitiatorID, WSMessage{
		Type:    "secret_chat_rejected",
		Payload: fiber.Map{"secret_chat_id": secretChat.ID},
	})

	return c.JSON(fiber.Map{"message": "Secret chat rejected"})
}

// GetSecretChat returns the secret chat key exchange info for a chat
func (h *SecretChatHandler) GetSecretChat(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat ID"})
	}

	var secretChat models.SecretChat
	if err := h.DB.Preload("Initiator").Preload("Recipient").
		First(&secretChat, "chat_id = ?", chatID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Secret chat not found"})
	}

	if secretChat.InitiatorID != userID && secretChat.RecipientID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not authorized"})
	}

	return c.JSON(secretChat)
}

// GetMySecretChats returns all secret chats for the current user
func (h *SecretChatHandler) GetMySecretChats(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var secretChats []models.SecretChat
	h.DB.Preload("Initiator").Preload("Recipient").
		Where("(initiator_id = ? OR recipient_id = ?) AND status != 'rejected'", userID, userID).
		Order("created_at DESC").
		Find(&secretChats)

	return c.JSON(secretChats)
}
