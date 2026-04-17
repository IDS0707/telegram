package handlers

import (
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"telegram-clone-backend/internal/middleware"
	"telegram-clone-backend/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type AuthHandler struct {
	DB        *gorm.DB
	JWTSecret string
	UploadDir string
}

type RegisterRequest struct {
	Phone           string `json:"phone"`
	Password        string `json:"password"`
	ConfirmPassword string `json:"confirm_password"`
	DisplayName     string `json:"display_name"`
}

type LoginRequest struct {
	Phone    string `json:"phone"`
	Password string `json:"password"`
}

type AuthResponse struct {
	Token string      `json:"token"`
	User  models.User `json:"user"`
}

func NewAuthHandler(db *gorm.DB, jwtSecret, uploadDir string) *AuthHandler {
	return &AuthHandler{DB: db, JWTSecret: jwtSecret, UploadDir: uploadDir}
}

func (h *AuthHandler) Register(c *fiber.Ctx) error {
	var req RegisterRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.Phone == "" || req.Password == "" || req.ConfirmPassword == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Phone, password, and confirm_password are required"})
	}

	// Validate phone format (digits only, 7-15 chars)
	phoneRegex := regexp.MustCompile(`^\+?[0-9]{7,15}$`)
	if !phoneRegex.MatchString(req.Phone) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid phone number format"})
	}

	if len(req.Password) < 6 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Password must be at least 6 characters"})
	}

	if req.Password != req.ConfirmPassword {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Passwords do not match"})
	}

	// Check if phone already exists
	var existing models.User
	result := h.DB.Where("phone = ?", req.Phone).First(&existing)
	if result.Error == nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Phone number already registered"})
	}
	if result.Error != gorm.ErrRecordNotFound {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database error"})
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to hash password"})
	}

	displayName := strings.TrimSpace(req.DisplayName)
	if displayName == "" {
		displayName = "user"
	}
	// Clamp display name to 64 chars
	if len([]rune(displayName)) > 64 {
		displayName = string([]rune(displayName)[:64])
	}

	user := models.User{
		ID:           uuid.New(),
		Phone:        req.Phone,
		PasswordHash: string(hashedPassword),
		DisplayName:  displayName,
		IsOnline:     false,
		LastSeen:     time.Now(),
	}

	if err := h.DB.Create(&user).Error; err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Phone number already registered"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create user"})
	}

	token, err := h.generateToken(user.ID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate token"})
	}

	return c.Status(fiber.StatusCreated).JSON(AuthResponse{Token: token, User: user})
}

func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.Phone == "" || req.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Phone and password are required"})
	}

	var user models.User
	if err := h.DB.Where("phone = ?", req.Phone).First(&user).Error; err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid phone or password"})
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid phone or password"})
	}

	// Update online status
	h.DB.Model(&user).Updates(map[string]interface{}{"is_online": true, "last_seen": time.Now()})

	token, err := h.generateToken(user.ID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate token"})
	}

	return c.JSON(AuthResponse{Token: token, User: user})
}

func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if err := h.DB.Model(&models.User{}).Where("id = ?", userID).Updates(map[string]interface{}{
		"is_online": false,
		"last_seen": time.Now(),
	}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to logout"})
	}
	return c.JSON(fiber.Map{"message": "Logged out"})
}

func (h *AuthHandler) GetMe(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	var user models.User
	if err := h.DB.First(&user, "id = ?", userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}
	return c.JSON(user)
}

func (h *AuthHandler) UpdateProfile(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var body struct {
		DisplayName *string `json:"display_name"`
		Username    *string `json:"username"`
		Bio         *string `json:"bio"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	updates := map[string]interface{}{}

	if body.DisplayName != nil {
		updates["display_name"] = *body.DisplayName
	}
	if body.Bio != nil {
		updates["bio"] = *body.Bio
	}
	if body.Username != nil {
		// Check unique
		var count int64
		h.DB.Model(&models.User{}).Where("username = ? AND id != ?", *body.Username, userID).Count(&count)
		if count > 0 {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Username already taken"})
		}
		updates["username"] = *body.Username
	}

	if len(updates) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "No fields to update"})
	}

	if err := h.DB.Model(&models.User{}).Where("id = ?", userID).Updates(updates).Error; err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Username already taken"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update profile"})
	}

	var user models.User
	if err := h.DB.First(&user, "id = ?", userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	return c.JSON(user)
}

func (h *AuthHandler) UpdateAvatar(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	file, err := c.FormFile("avatar")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Avatar file required"})
	}

	// Sanitize filename: only keep safe extension
	ext := strings.ToLower(filepath.Ext(file.Filename))
	if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".webp" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Only jpg, png, webp allowed"})
	}
	filename := uuid.New().String() + ext
	savePath := filepath.Join(h.UploadDir, "avatars", filename)
	if err := c.SaveFile(file, savePath); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save avatar"})
	}

	avatarURL := "/uploads/avatars/" + filename
	if err := h.DB.Model(&models.User{}).Where("id = ?", userID).Update("avatar_url", avatarURL).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update avatar"})
	}

	return c.JSON(fiber.Map{"avatar_url": avatarURL})
}

func (h *AuthHandler) generateToken(userID uuid.UUID) (string, error) {
	claims := jwt.MapClaims{
		"user_id": userID.String(),
		"exp":     time.Now().Add(7 * 24 * time.Hour).Unix(),
		"iat":     time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.JWTSecret))
}
