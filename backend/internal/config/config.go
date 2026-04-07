package config

import "os"

type Config struct {
	DBHost    string
	DBPort    string
	DBUser    string
	DBPass    string
	DBName    string
	JWTSecret string
	Port      string
	UploadDir string
}

func Load() *Config {
	return &Config{
		DBHost:    getEnv("DB_HOST", "localhost"),
		DBPort:    getEnv("DB_PORT", "5432"),
		DBUser:    getEnv("DB_USER", "tguser"),
		DBPass:    getEnv("DB_PASSWORD", "tgpass2024secure"),
		DBName:    getEnv("DB_NAME", "telegram_db"),
		JWTSecret: getEnv("JWT_SECRET", "super-secret-jwt-key-change-me-in-production"),
		Port:      getEnv("SERVER_PORT", "8084"),
		UploadDir: getEnv("UPLOAD_DIR", "./uploads"),
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
