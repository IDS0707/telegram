package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	DBHost             string
	DBPort             string
	DBUser             string
	DBPass             string
	DBName             string
	DBSSLMode          string
	JWTSecret          string
	JWTIssuer          string
	JWTTTLHours        int
	Port               string
	UploadDir          string
	Environment        string
	CORSAllowedOrigins []string
	AuthRateLimitMax   int
	UploadMaxMB        int
}

func Load() *Config {
	return &Config{
		DBHost:             getEnv("DB_HOST", "localhost"),
		DBPort:             getEnv("DB_PORT", "5432"),
		DBUser:             getEnv("DB_USER", "tguser"),
		DBPass:             getEnv("DB_PASSWORD", "tgpass2024secure"),
		DBName:             getEnv("DB_NAME", "telegram_db"),
		DBSSLMode:          getEnv("DB_SSLMODE", "disable"),
		JWTSecret:          getEnv("JWT_SECRET", "dev-secret-CHANGE-THIS-IN-PRODUCTION-MUST-BE-VERY-STRONG-32CHARS"),
		JWTIssuer:          getEnv("JWT_ISSUER", "telegram-clone-backend"),
		JWTTTLHours:        getEnvInt("JWT_TTL_HOURS", 72),
		Port:               getEnv("SERVER_PORT", "8084"),
		UploadDir:          getEnv("UPLOAD_DIR", "./uploads"),
		Environment:        strings.ToLower(getEnv("APP_ENV", "development")),
		CORSAllowedOrigins: getEnvCSV("CORS_ALLOWED_ORIGINS", "http://localhost:19006,http://localhost:8081,http://localhost:8082,https://localhost:8082,http://localhost:3000"),
		AuthRateLimitMax:   getEnvInt("AUTH_RATE_LIMIT_MAX", 5), // Kamaytirildi: 8 dan 5 ga
		UploadMaxMB:        getEnvInt("UPLOAD_MAX_MB", 40),
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(val)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func getEnvCSV(key, fallback string) []string {
	raw := getEnv(key, fallback)
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		v := strings.TrimSpace(p)
		if v != "" {
			out = append(out, v)
		}
	}
	if len(out) == 0 {
		return []string{"http://localhost:19006"}
	}
	return out
}
