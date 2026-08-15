package app

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGeminiRequestUsesConfiguredProxy(t *testing.T) {
	proxyCalled := false
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxyCalled = true
		if r.Header.Get("x-goog-api-key") != "test-key" {
			t.Fatalf("Gemini API key header was not forwarded through the proxy")
		}
		var payload struct {
			GenerationConfig struct {
				ThinkingConfig *struct {
					ThinkingBudget int `json:"thinkingBudget"`
				} `json:"thinkingConfig"`
			} `json:"generationConfig"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode Gemini payload: %v", err)
		}
		if payload.GenerationConfig.ThinkingConfig == nil || payload.GenerationConfig.ThinkingConfig.ThinkingBudget != 0 {
			t.Fatalf("thinking config = %#v", payload.GenerationConfig.ThinkingConfig)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"candidates":[{"content":{"parts":[{"text":"{\"priority\":\"normal\"}"}]}}]}`))
	}))
	defer proxy.Close()

	client, err := newAIHTTPClient(proxy.URL)
	if err != nil {
		t.Fatalf("newAIHTTPClient: %v", err)
	}
	server := &Server{
		config: Config{
			GeminiAPIKey:  "test-key",
			GeminiModel:   "test-model",
			GeminiBaseURL: "http://gemini.test/v1beta",
			AIProxyURL:    proxy.URL,
		},
		aiClient: client,
	}

	content, err := server.geminiJSON(context.Background(), "system", "prompt", 32)
	if err != nil {
		t.Fatalf("geminiJSON: %v", err)
	}
	if !proxyCalled {
		t.Fatal("configured proxy was not used")
	}
	if !strings.Contains(content, `"priority":"normal"`) {
		t.Fatalf("content = %q", content)
	}
}

func TestInvalidAIProxyDoesNotFallBackToDirectTraffic(t *testing.T) {
	client, err := newAIHTTPClient("http://")
	if !errors.Is(err, errInvalidAIProxy) || client != nil {
		t.Fatalf("client = %v, err = %v", client, err)
	}
}
