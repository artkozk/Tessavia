package app

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Address          string
	DatabasePath     string
	CookieSecure     bool
	SessionLifetime  time.Duration
	AllowedUsernames map[string]struct{}
	GroqAPIKey       string
	GroqModel        string
	GroqBaseURL      string
}

func LoadConfig() Config {
	return Config{
		Address:          envOr("BUSINESS_ADDRESS", ":8522"),
		DatabasePath:     envOr("BUSINESS_DATABASE_PATH", "./data/business-control.db"),
		CookieSecure:     envBool("BUSINESS_COOKIE_SECURE", false),
		SessionLifetime:  90 * 24 * time.Hour,
		AllowedUsernames: parseAllowedUsernames(os.Getenv("BUSINESS_ALLOWED_USERNAMES")),
		GroqAPIKey:       strings.TrimSpace(os.Getenv("GROQ_API_KEY")),
		GroqModel:        envOr("GROQ_MODEL", "openai/gpt-oss-20b"),
		GroqBaseURL:      strings.TrimRight(envOr("GROQ_BASE_URL", "https://api.groq.com/openai/v1"), "/"),
	}
}

func envOr(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func envBool(name string, fallback bool) bool {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func parseAllowedUsernames(value string) map[string]struct{} {
	allowed := make(map[string]struct{})
	for _, username := range strings.Split(value, ",") {
		username = strings.ToLower(strings.TrimSpace(username))
		if username != "" {
			allowed[username] = struct{}{}
		}
	}
	return allowed
}
