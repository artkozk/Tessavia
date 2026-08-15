package app

import (
	"errors"
	"testing"
)

func TestGeminiDeveloperAPIDefaults(t *testing.T) {
	t.Setenv("GEMINI_MODEL", "")
	t.Setenv("GEMINI_BASE_URL", "")
	t.Setenv("AI_PROXY_URL", "")

	config := LoadConfig()
	if config.GeminiModel != "gemini-2.5-flash" {
		t.Fatalf("GeminiModel = %q", config.GeminiModel)
	}
	if config.GeminiBaseURL != "https://generativelanguage.googleapis.com/v1beta" {
		t.Fatalf("GeminiBaseURL = %q", config.GeminiBaseURL)
	}
	if config.AIProxyURL != "" {
		t.Fatalf("AIProxyURL = %q", config.AIProxyURL)
	}
}

func TestAIUnavailableMessageExplainsActionableProviderFailures(t *testing.T) {
	tests := []struct {
		name     string
		provider string
		err      error
		want     string
	}{
		{name: "billing", provider: "gemini", err: errors.New("gemini status 403: BILLING_DISABLED"), want: "В Google Cloud не включён биллинг; локальный анализ активен"},
		{name: "quota", provider: "gemini", err: errors.New("gemini status 429: RESOURCE_EXHAUSTED"), want: "Квота внешнего AI исчерпана; локальный анализ активен"},
		{name: "proxy", provider: "gemini", err: errInvalidAIProxy, want: "Прокси внешнего AI настроен неверно; локальный анализ активен"},
		{name: "generic Gemini", provider: "gemini", err: errors.New("gemini status 503: UNAVAILABLE"), want: "Google Gemini API временно недоступен; локальный анализ активен"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := aiUnavailableMessage(test.provider, test.err); got != test.want {
				t.Fatalf("message = %q, want %q", got, test.want)
			}
		})
	}
}
