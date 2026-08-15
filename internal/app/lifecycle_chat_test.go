package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestResearchAndDecisionLifecycleSemantics(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "lifecycle.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer store.Close()
	application := &Server{store: store, config: Config{SessionLifetime: 24 * time.Hour}, mux: http.NewServeMux(), aiClient: http.DefaultClient}
	application.routes()
	server := httptest.NewServer(application.securityHeaders(application.mux))
	defer server.Close()
	client := testClient(t)
	register(t, client, server.URL, "founder@example.test", "founder")

	decision := createRecord(t, client, server.URL, map[string]any{
		"type": "decision", "title": "Арендовать Begget", "description": "Выбор принят после сравнения.",
		"dueAt": "2026-08-20T12:00:00Z", "estimateMinutes": 90, "actualMinutes": 45,
	})
	if decision.Status != "completed" || decision.Progress != 100 || decision.CompletedAt == nil || decision.DueAt != nil || decision.EstimateMinutes != 0 || decision.ActualMinutes != 0 {
		t.Fatalf("decision must be a completed fact without planning fields: %#v", decision)
	}

	research := createRecord(t, client, server.URL, map[string]any{
		"type": "research", "title": "Выбор сервера", "description": "Сравнить инфраструктуру для запуска.",
	})
	if research.Progress != 15 || research.Status != "draft" {
		t.Fatalf("new research progress = %d status=%q, want 15/draft", research.Progress, research.Status)
	}
	var comparison ResearchComparison
	requestJSON(t, client, http.MethodPost, server.URL+"/api/records/"+research.ID+"/research-fields", map[string]any{
		"name": "Цена в месяц", "fieldType": "number",
	}, http.StatusCreated, &comparison)
	fieldID := comparison.Fields[0].ID
	requestJSON(t, client, http.MethodPost, server.URL+"/api/records/"+research.ID+"/research-options", map[string]any{
		"title": "Begget", "rating": 8, "summaryMd": "Стабильный знакомый вариант.",
		"prosMd": "- Надёжность", "consMd": "- Платный", "values": map[string]string{fieldID: "500"},
	}, http.StatusCreated, &comparison)
	loadedResearch, err := application.getRecord(context.Background(), research.ID)
	if err != nil {
		t.Fatalf("load research for AI context: %v", err)
	}
	dossier, coverage, err := application.buildAIRecordContext(context.Background(), loadedResearch)
	if err != nil {
		t.Fatalf("build AI research context: %v", err)
	}
	dossierJSON, _ := json.Marshal(dossier)
	for _, expected := range []string{"Begget", "Цена в месяц", "500", "Надёжность", "Платный"} {
		if !strings.Contains(string(dossierJSON), expected) {
			t.Fatalf("AI dossier does not contain %q: %s", expected, dossierJSON)
		}
	}
	if coverage.ResearchFields != 1 || coverage.ResearchOptions != 1 {
		t.Fatalf("AI research coverage = %#v", coverage)
	}

	var prepared Record
	requestJSON(t, client, http.MethodPatch, server.URL+"/api/records/"+research.ID, map[string]any{
		"result": "Для первого запуска выбираем Begget.", "expectedUpdatedAt": research.UpdatedAt,
	}, http.StatusConflict, nil)
	requestJSON(t, client, http.MethodGet, server.URL+"/api/records/"+research.ID, nil, http.StatusOK, &struct {
		Record *Record `json:"record"`
	}{Record: &prepared})
	requestJSON(t, client, http.MethodPatch, server.URL+"/api/records/"+research.ID, map[string]any{
		"result": "Для первого запуска выбираем Begget.", "expectedUpdatedAt": prepared.UpdatedAt,
	}, http.StatusOK, &prepared)
	if prepared.Progress < 70 || prepared.Progress >= 100 {
		t.Fatalf("prepared research progress = %d, want derived progress below 100", prepared.Progress)
	}
	var completed Record
	requestJSON(t, client, http.MethodPost, server.URL+"/api/records/"+research.ID+"/complete-research", map[string]any{
		"result": prepared.Result, "reason": "Варианты и стоимость проверены",
	}, http.StatusOK, &completed)
	if completed.Status != "completed" || completed.Progress != 100 || completed.CompletedAt == nil {
		t.Fatalf("completed research = %#v", completed)
	}
}

func TestTeamChatReadReplyReactionFavoriteAndCall(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "chat.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{
		SessionLifetime:    24 * time.Hour,
		UploadPath:         t.TempDir(),
		ChatSTUNURL:        "stun:control.example.test:3478",
		ChatTURNURL:        "turn:control.example.test:3478?transport=udp",
		ChatTURNUsername:   "founders",
		ChatTURNCredential: "test-credential",
	}))
	defer server.Close()
	artkozk := testClient(t)
	sweetybboy := testClient(t)
	register(t, artkozk, server.URL, "artkozk@example.test", "artkozk")
	register(t, sweetybboy, server.URL, "sweetybboy@example.test", "sweetybboy")
	record := createRecord(t, artkozk, server.URL, map[string]any{"type": "idea", "title": "Новая ветка бизнеса"})

	var threads []ChatThread
	requestJSON(t, artkozk, http.MethodGet, server.URL+"/api/chat/threads", nil, http.StatusOK, &threads)
	if len(threads) != 1 || threads[0].Kind != "team" {
		t.Fatalf("team threads = %#v", threads)
	}
	threadID := threads[0].ID
	var iceConfig struct {
		ICEServers []map[string]any `json:"iceServers"`
	}
	requestJSON(t, artkozk, http.MethodGet, server.URL+"/api/chat/ice-config", nil, http.StatusOK, &iceConfig)
	if len(iceConfig.ICEServers) != 2 {
		t.Fatalf("test ICE config should expose STUN and TURN: %#v", iceConfig.ICEServers)
	}
	if iceConfig.ICEServers[1]["username"] != "founders" || iceConfig.ICEServers[1]["credential"] != "test-credential" {
		t.Fatalf("TURN credentials were not mapped into authenticated ICE config: %#v", iceConfig.ICEServers[1])
	}
	var first ChatMessage
	requestJSON(t, artkozk, http.MethodPost, server.URL+"/api/chat/threads/"+threadID+"/messages", map[string]any{
		"body": "Посмотри связанную идею", "linkedRecordId": record.ID, "clientNonce": "message-send-1",
	}, http.StatusCreated, &first)
	if first.LinkedRecordID != record.ID || first.LinkedRecordTitle != record.Title {
		t.Fatalf("linked chat message = %#v", first)
	}
	var duplicate ChatMessage
	requestJSON(t, artkozk, http.MethodPost, server.URL+"/api/chat/threads/"+threadID+"/messages", map[string]any{
		"body": "Посмотри связанную идею", "linkedRecordId": record.ID, "clientNonce": "message-send-1",
	}, http.StatusCreated, &duplicate)
	if duplicate.ID != first.ID {
		t.Fatalf("idempotent chat send created duplicate: first=%s duplicate=%s", first.ID, duplicate.ID)
	}

	requestJSON(t, sweetybboy, http.MethodGet, server.URL+"/api/chat/threads", nil, http.StatusOK, &threads)
	if threads[0].UnreadCount != 1 {
		t.Fatalf("partner unread = %d, want 1", threads[0].UnreadCount)
	}
	requestJSON(t, sweetybboy, http.MethodPost, server.URL+"/api/chat/threads/"+threadID+"/read", nil, http.StatusNoContent, nil)
	var reply ChatMessage
	requestJSON(t, sweetybboy, http.MethodPost, server.URL+"/api/chat/threads/"+threadID+"/messages", map[string]any{
		"body": "Посмотрел, нужно проверить спрос.", "replyToId": first.ID,
	}, http.StatusCreated, &reply)
	if reply.ReplyToID != first.ID || reply.ReplyAuthor != "artkozk" {
		t.Fatalf("reply = %#v", reply)
	}
	requestJSON(t, sweetybboy, http.MethodPost, server.URL+"/api/chat/messages/"+first.ID+"/reaction", map[string]any{"emoji": "✅"}, http.StatusNoContent, nil)
	requestJSON(t, artkozk, http.MethodPost, server.URL+"/api/chat/messages/"+first.ID+"/favorite", nil, http.StatusNoContent, nil)

	var messages []ChatMessage
	requestJSON(t, artkozk, http.MethodGet, server.URL+"/api/chat/threads/"+threadID+"/messages", nil, http.StatusOK, &messages)
	if len(messages) != 2 || len(messages[0].ReadBy) != 1 || len(messages[0].Reactions) != 1 || messages[0].Reactions[0].Count != 1 {
		t.Fatalf("chat state = %#v", messages)
	}
	var favorites []ChatMessage
	requestJSON(t, artkozk, http.MethodGet, server.URL+"/api/chat/threads/"+threadID+"/messages?favorites=true", nil, http.StatusOK, &favorites)
	if len(favorites) != 1 || favorites[0].ID != first.ID {
		t.Fatalf("favorites = %#v", favorites)
	}
	requestJSON(t, artkozk, http.MethodPatch, server.URL+"/api/chat/messages/"+first.ID, map[string]any{"body": "Посмотри связанную идею и оцени спрос"}, http.StatusNoContent, nil)
	requestJSON(t, sweetybboy, http.MethodPatch, server.URL+"/api/chat/messages/"+first.ID, map[string]any{"body": "Чужая правка"}, http.StatusForbidden, nil)
	requestJSON(t, sweetybboy, http.MethodDelete, server.URL+"/api/chat/messages/"+reply.ID, map[string]any{"reason": "Ответ сформулирован неточно"}, http.StatusNoContent, nil)
	requestJSON(t, artkozk, http.MethodGet, server.URL+"/api/chat/threads/"+threadID+"/messages", nil, http.StatusOK, &messages)
	if len(messages) != 1 || messages[0].Body != "Посмотри связанную идею и оцени спрос" || messages[0].EditedAt == nil {
		t.Fatalf("edited and archived messages = %#v", messages)
	}
	var revisionCount int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM chat_message_revisions`).Scan(&revisionCount); err != nil || revisionCount != 2 {
		t.Fatalf("message revision count = %d, err = %v", revisionCount, err)
	}

	var call ChatCall
	requestJSON(t, artkozk, http.MethodPost, server.URL+"/api/chat/threads/"+threadID+"/calls", map[string]any{"offerSdp": `{"type":"offer","sdp":"test"}`}, http.StatusCreated, &call)
	requestJSON(t, artkozk, http.MethodPost, server.URL+"/api/chat/threads/"+threadID+"/calls", map[string]any{"offerSdp": `{"type":"offer","sdp":"duplicate"}`}, http.StatusConflict, nil)
	requestJSON(t, sweetybboy, http.MethodGet, server.URL+"/api/chat/threads/"+threadID+"/calls/active", nil, http.StatusOK, &call)
	requestJSON(t, artkozk, http.MethodPost, server.URL+"/api/chat/calls/"+call.ID+"/answer", map[string]any{"answerSdp": `{"type":"answer","sdp":"self"}`}, http.StatusForbidden, nil)
	requestJSON(t, sweetybboy, http.MethodPost, server.URL+"/api/chat/calls/"+call.ID+"/answer", map[string]any{"answerSdp": `{"type":"answer","sdp":"test"}`}, http.StatusOK, &call)
	if call.Status != "active" || call.AnsweredAt == nil {
		t.Fatalf("active call = %#v", call)
	}
	requestJSON(t, artkozk, http.MethodPost, server.URL+"/api/chat/calls/"+call.ID+"/end", nil, http.StatusOK, &call)
	requestJSON(t, sweetybboy, http.MethodPost, server.URL+"/api/chat/calls/"+call.ID+"/end", nil, http.StatusConflict, nil)
	if call.Status != "ended" || call.EndedAt == nil {
		t.Fatalf("ended call = %#v", call)
	}
}
