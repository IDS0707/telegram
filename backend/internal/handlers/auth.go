package handlers

import (
	"log"
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
	DB          *gorm.DB
	JWTSecret   string
	JWTIssuer   string
	JWTTTLHours int
	UploadDir   string
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

func NewAuthHandler(db *gorm.DB, jwtSecret, jwtIssuer string, jwtTTLHours int, uploadDir string) *AuthHandler {
	if jwtTTLHours <= 0 {
		jwtTTLHours = 72
	}
	return &AuthHandler{DB: db, JWTSecret: jwtSecret, JWTIssuer: jwtIssuer, JWTTTLHours: jwtTTLHours, UploadDir: uploadDir}
}

func (h *AuthHandler) Register(c *fiber.Ctx) error {
	var req RegisterRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Noto'g'ri so'rov ma'lumotlari"})
	}
	req.Phone = normalizePhone(strings.TrimSpace(req.Phone))
	req.DisplayName = strings.TrimSpace(req.DisplayName)

	if req.Phone == "" || req.Password == "" || req.ConfirmPassword == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Telefon raqam, parol va parol tasdig'i talab qilinadi"})
	}

	// Validate phone format (digits only, 7-15 chars)
	phoneRegex := regexp.MustCompile(`^\+?[0-9]{7,15}$`)
	if !phoneRegex.MatchString(req.Phone) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Telefon raqam formati noto'g'ri"})
	}

	if len(req.Password) < 6 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Parol kamida 6 ta belgi bo'lishi kerak"})
	}

	if req.Password != req.ConfirmPassword {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Parollar bir xil emas"})
	}

	// Check if phone already exists
	var existing models.User
	result := h.DB.Where("phone = ?", req.Phone).First(&existing)
	if result.Error == nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Bu telefon raqam allaqachon ro'yxatdan o'tgan"})
	}
	if result.Error != gorm.ErrRecordNotFound {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Ma'lumotlar bazasi xatosi"})
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Parolni shifrlashda xato"})
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
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Noto'g'ri so'rov ma'lumotlari"})
	}
	req.Phone = normalizePhone(strings.TrimSpace(req.Phone))

	if req.Phone == "" || req.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Telefon raqam va parol talab qilinadi"})
	}

	var user models.User
	query := h.DB.Where("phone = ?", req.Phone)
	if local := toLocalUZPhone(req.Phone); local != req.Phone {
		query = query.Or("phone = ?", local)
	}
	if err := query.First(&user).Error; err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Telefon raqam yoki parol noto'g'ri"})
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Telefon raqam yoki parol noto'g'ri"})
	}

	// Update online status (best-effort; failure must not block login)
	if err := h.DB.Model(&user).Updates(map[string]interface{}{"is_online": true, "last_seen": time.Now()}).Error; err != nil {
		log.Printf("auth.login: failed to update online status for user %s: %v", user.ID, err)
	}

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
		displayName := strings.TrimSpace(*body.DisplayName)
		if displayName == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Display name cannot be empty"})
		}
		if len([]rune(displayName)) > 64 {
			displayName = string([]rune(displayName)[:64])
		}
		updates["display_name"] = displayName
	}
	if body.Bio != nil {
		bio := strings.TrimSpace(*body.Bio)
		if len([]rune(bio)) > 160 {
			bio = string([]rune(bio)[:160])
		}
		updates["bio"] = bio
	}
	if body.Username != nil {
		username := strings.TrimSpace(*body.Username)
		usernameRegex := regexp.MustCompile(`^[a-zA-Z0-9_]{4,32}$`)
		if !usernameRegex.MatchString(username) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Username must be 4-32 chars (letters, numbers, underscore)"})
		}
		// Check unique
		var count int64
		if err := h.DB.Model(&models.User{}).Where("username = ? AND id != ?", username, userID).Count(&count).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to validate username"})
		}
		if count > 0 {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Username already taken"})
		}
		updates["username"] = username
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

func (h *AuthHandler) GetUserProfile(c *fiber.Ctx) error {
	targetID := c.Params("userId")
	if _, err := uuid.Parse(targetID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid user ID"})
	}
	var user models.User
	if err := h.DB.Select("id, display_name, username, avatar_url, bio, is_online, last_seen, created_at").
		First(&user, "id = ?", targetID).Error; err != nil {
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
	if file.Size > 5*1024*1024 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Avatar size must be <= 5MB"})
	}
	if !isAllowedImageContentType(file.Header.Get("Content-Type")) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid avatar content type"})
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
	now := time.Now()
	claims := jwt.MapClaims{
		"user_id": userID.String(),
		"iss":     h.JWTIssuer,
		"sub":     userID.String(),
		"exp":     now.Add(time.Duration(h.JWTTTLHours) * time.Hour).Unix(),
		"iat":     now.Unix(),
		"nbf":     now.Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.JWTSecret))
}

// isStrongPassword - endi ishlatilmaydi, oddiy length tekshiruv yetarli
// func isStrongPassword(password string) bool {
// 	return len(password) >= 6
// }

func normalizePhone(phone string) string {
	clean := strings.ReplaceAll(phone, " ", "")
	if strings.HasPrefix(clean, "998") && len(clean) == 12 {
		return clean[3:]
	}
	if strings.HasPrefix(clean, "+998") && len(clean) == 13 {
		return clean[4:]
	}
	return clean
}

func toLocalUZPhone(phone string) string {
	if strings.HasPrefix(phone, "+998") && len(phone) == 13 {
		return phone[4:]
	}
	if strings.HasPrefix(phone, "998") && len(phone) == 12 {
		return phone[3:]
	}
	return phone
}

func isAllowedImageContentType(contentType string) bool {
	base := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	return base == "image/jpeg" || base == "image/png" || base == "image/webp"
}
