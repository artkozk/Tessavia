package app

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Address              string
	DatabasePath         string
	CookieSecure         bool
	SessionLifetime      time.Duration
	AllowedUsernames     map[string]struct{}
	GroqAPIKey           string
	GroqModel            string
	GroqBaseURL          string
	GeminiAPIKey         string
	GeminiModel          string
	GeminiBaseURL        string
	AIProxyURL           string
	AIProxyURLs          []string
	UploadPath           string
	ChatSTUNURL          string
	ChatTURNURL          string
	ChatTURNUsername     string
	ChatTURNCredential   string
	RegistrationTestMode bool
}

func LoadConfig() Config {
	proxyURLs := parseAIProxyURLs(os.Getenv("AI_PROXY_URL"), os.Getenv("AI_PROXY_URLS"))
	primaryProxyURL := ""
	if len(proxyURLs) > 0 {
		primaryProxyURL = proxyURLs[0]
	}
	return Config{
		Address:              envOr("BUSINESS_ADDRESS", ":8522"),
		DatabasePath:         envOr("BUSINESS_DATABASE_PATH", "./data/business-control.db"),
		CookieSecure:         envBool("BUSINESS_COOKIE_SECURE", false),
		SessionLifetime:      90 * 24 * time.Hour,
		AllowedUsernames:     parseAllowedUsernames(os.Getenv("BUSINESS_ALLOWED_USERNAMES")),
		GroqAPIKey:           strings.TrimSpace(os.Getenv("GROQ_API_KEY")),
		GroqModel:            envOr("GROQ_MODEL", "openai/gpt-oss-20b"),
		GroqBaseURL:          strings.TrimRight(envOr("GROQ_BASE_URL", "https://api.groq.com/openai/v1"), "/"),
		GeminiAPIKey:         strings.TrimSpace(os.Getenv("GEMINI_API_KEY")),
		GeminiModel:          envOr("GEMINI_MODEL", "gemini-2.5-flash"),
		GeminiBaseURL:        strings.TrimRight(envOr("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"), "/"),
		AIProxyURL:           primaryProxyURL,
		AIProxyURLs:          proxyURLs,
		UploadPath:           envOr("BUSINESS_UPLOAD_PATH", "./data/uploads"),
		ChatSTUNURL:          envOr("BUSINESS_CHAT_STUN_URL", "stun:control.e-rd.ru:3478"),
		ChatTURNURL:          strings.TrimSpace(os.Getenv("BUSINESS_CHAT_TURN_URL")),
		ChatTURNUsername:     strings.TrimSpace(os.Getenv("BUSINESS_CHAT_TURN_USERNAME")),
		ChatTURNCredential:   strings.TrimSpace(os.Getenv("BUSINESS_CHAT_TURN_CREDENTIAL")),
		RegistrationTestMode: envBool("BUSINESS_REGISTRATION_TEST_MODE", false),
	}
}

func parseAIProxyURLs(values ...string) []string {
	seen := make(map[string]struct{})
	proxies := make([]string, 0)
	for _, value := range values {
		for _, proxyURL := range strings.FieldsFunc(value, func(r rune) bool {
			return r == ',' || r == ';' || r == '\n' || r == '\r'
		}) {
			proxyURL = strings.TrimSpace(proxyURL)
			if proxyURL == "" {
				continue
			}
			if _, exists := seen[proxyURL]; exists {
				continue
			}
			seen[proxyURL] = struct{}{}
			proxies = append(proxies, proxyURL)
		}
	}
	return proxies
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
