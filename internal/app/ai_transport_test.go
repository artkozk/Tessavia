package app

import (
	"bytes"
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

func TestAITransportFailsOverAndRemembersWorkingRoute(t *testing.T) {
	failedCalls := 0
	failedProxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		failedCalls++
		http.Error(w, "proxy unavailable", http.StatusBadGateway)
	}))
	defer failedProxy.Close()

	workingCalls := 0
	workingProxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		workingCalls++
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer workingProxy.Close()

	clients, err := newAIHTTPClients([]string{failedProxy.URL, workingProxy.URL})
	if err != nil {
		t.Fatalf("newAIHTTPClients: %v", err)
	}
	server := &Server{aiClients: clients}
	request := func() *http.Request {
		req, requestErr := http.NewRequest(http.MethodPost, "http://provider.test/generate", bytes.NewBufferString(`{"prompt":"test"}`))
		if requestErr != nil {
			t.Fatalf("new request: %v", requestErr)
		}
		return req
	}

	response, err := server.doAIRequest(request())
	if err != nil {
		t.Fatalf("first request: %v", err)
	}
	_ = response.Body.Close()
	response, err = server.doAIRequest(request())
	if err != nil {
		t.Fatalf("second request: %v", err)
	}
	_ = response.Body.Close()

	if failedCalls != 1 {
		t.Fatalf("failed proxy calls = %d, want 1", failedCalls)
	}
	if workingCalls != 2 {
		t.Fatalf("working proxy calls = %d, want 2", workingCalls)
	}
}

func TestAITransportNeverFallsBackToDirectTraffic(t *testing.T) {
	directCalls := 0
	directProvider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		directCalls++
		_, _ = w.Write([]byte(`{"unexpected":true}`))
	}))
	defer directProvider.Close()

	clients, err := newAIHTTPClients([]string{"http://127.0.0.1:1", "http://127.0.0.1:2"})
	if err != nil {
		t.Fatalf("newAIHTTPClients: %v", err)
	}
	server := &Server{aiClients: clients}
	request, err := http.NewRequest(http.MethodPost, directProvider.URL, bytes.NewBufferString(`{"prompt":"test"}`))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if _, err = server.doAIRequest(request); err == nil {
		t.Fatal("request unexpectedly succeeded")
	}
	if directCalls != 0 {
		t.Fatalf("direct provider calls = %d, want 0", directCalls)
	}
}
