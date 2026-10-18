// Package config loads the API's settings from environment variables.
package config

import (
	"errors"
	"fmt"
	"os"
	"time"
)

type Config struct {
	DatabaseURL string
	JWTSecret   string
	Port        string
	TokenTTL    time.Duration
}

const (
	defaultDatabaseURL = "postgres://fitness:fitness@localhost:5432/fitness?sslmode=disable"
	defaultPort        = "8080"
	defaultTokenTTL    = 30 * 24 * time.Hour
	minSecretLength    = 32
)

func Load() (Config, error) {
	cfg := Config{
		DatabaseURL: getenv("DATABASE_URL", defaultDatabaseURL),
		JWTSecret:   os.Getenv("JWT_SECRET"),
		Port:        getenv("PORT", defaultPort),
		TokenTTL:    defaultTokenTTL,
	}

	if len(cfg.JWTSecret) < minSecretLength {
		return Config{}, fmt.Errorf("JWT_SECRET must be set and at least %d characters", minSecretLength)
	}

	if raw := os.Getenv("TOKEN_TTL"); raw != "" {
		ttl, err := time.ParseDuration(raw)
		if err != nil {
			return Config{}, fmt.Errorf("TOKEN_TTL: %w", err)
		}
		if ttl <= 0 {
			return Config{}, errors.New("TOKEN_TTL must be positive")
		}
		cfg.TokenTTL = ttl
	}

	return cfg, nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
