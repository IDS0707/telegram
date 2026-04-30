package middleware

import (
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type AccessClaims struct {
	UserID string `json:"user_id"`
	jwt.RegisteredClaims
}

func AuthRequired(secret, issuer string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing authorization header"})
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid authorization format"})
		}

		claims := &AccessClaims{}
		parser := jwt.NewParser(jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithIssuedAt())
		token, err := parser.ParseWithClaims(parts[1], claims, func(t *jwt.Token) (interface{}, error) {
			return []byte(secret), nil
		})
		if err != nil || !token.Valid {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid or expired token"})
		}
		if claims.ExpiresAt == nil || !claims.ExpiresAt.After(time.Now()) {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Token expired"})
		}
		if issuer != "" && claims.Issuer != issuer {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid token issuer"})
		}

		if claims.UserID == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid user_id in token"})
		}

		userID, err := uuid.Parse(claims.UserID)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid user_id format"})
		}

		c.Locals("userID", userID)
		return c.Next()
	}
}

func GetUserID(c *fiber.Ctx) uuid.UUID {
	if id, ok := c.Locals("userID").(uuid.UUID); ok {
		return id
	}
	return uuid.Nil
}
