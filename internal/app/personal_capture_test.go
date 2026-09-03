package app

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestPersonalCapturePrivacyRetriesAndTriage(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "capture.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	owner, partner := testClient(t), testClient(t)
	register(t, owner, server.URL, "capture@example.test", "capture_owner")
	register(t, partner, server.URL, "other@example.test", "capture_other")
	body := "Список для дачи\n- Купить угли\nhttps://example.test/list"
	key := "0123456789abcdef0123456789abcdef"
	payload := map[string]any{"body": body, "requestKey": key}
	requestJSON(t, testClient(t), http.MethodPost, server.URL+"/api/personal/capture", payload, http.StatusUnauthorized, nil)
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/personal/capture", map[string]any{"body": "", "requestKey": key}, http.StatusBadRequest, nil)
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/personal/capture", map[string]any{"body": body, "requestKey": "bad"}, http.StatusBadRequest, nil)
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/personal/capture", map[string]any{"body": strings.Repeat("я", 100001), "requestKey": key}, http.StatusBadRequest, nil)
	var note, repeat PersonalNote
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/personal/capture", payload, http.StatusCreated, &note)
	if !note.InInbox || note.Title != "Список для дачи" || note.Body != body || note.CreatedAt == "" || note.ScheduledDate != nil {
		t.Fatalf("capture = %#v", note)
	}
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/personal/capture", payload, http.StatusOK, &repeat)
	if note.ID != repeat.ID || note.CreatedAt != repeat.CreatedAt {
		t.Fatal("retry duplicated or replaced the note")
	}
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/personal/capture", map[string]any{"body": "Different body", "requestKey": key}, http.StatusConflict, nil)
	var otherOverview PersonalOverview
	requestJSON(t, partner, http.MethodGet, server.URL+"/api/personal/overview", nil, http.StatusOK, &otherOverview)
	if len(otherOverview.Notes) != 0 {
		t.Fatal("personal inbox leaked to another account")
	}
	triage := server.URL + "/api/personal/notes/" + note.ID + "/inbox"
	requestJSON(t, partner, http.MethodPatch, triage, map[string]any{"inInbox": false, "expectedUpdatedAt": note.UpdatedAt}, http.StatusNotFound, nil)
	requestJSON(t, owner, http.MethodPatch, triage, map[string]any{"expectedUpdatedAt": note.UpdatedAt}, http.StatusBadRequest, nil)
	var plan PersonalPlan
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/personal/plans", map[string]any{"title": "Поездка", "notes": "", "dueAt": ""}, http.StatusCreated, &plan)
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/personal/links", map[string]any{"sourceType": "note", "sourceId": note.ID, "targetType": "plan", "targetId": plan.ID, "relationType": "prepares_for"}, http.StatusCreated, nil)
	var edited PersonalNote
	requestJSON(t, owner, http.MethodPatch, server.URL+"/api/personal/notes/"+note.ID, map[string]any{"title": note.Title, "body": body + "\n- Мясо", "pinned": true}, http.StatusOK, &edited)
	if !edited.InInbox || edited.CreatedAt != note.CreatedAt {
		t.Fatal("ordinary editing must preserve inbox state and creation date")
	}
	requestJSON(t, owner, http.MethodPatch, triage, map[string]any{"inInbox": false, "expectedUpdatedAt": note.UpdatedAt}, http.StatusConflict, nil)
	requestJSON(t, owner, http.MethodPatch, triage, map[string]any{"inInbox": false, "expectedUpdatedAt": edited.UpdatedAt}, http.StatusNoContent, nil)
	var overview PersonalOverview
	requestJSON(t, owner, http.MethodGet, server.URL+"/api/personal/overview", nil, http.StatusOK, &overview)
	if len(overview.Notes) != 1 || overview.Notes[0].InInbox || overview.Notes[0].Body != edited.Body || len(overview.Links) != 1 || overview.Links[0].SourceID != note.ID {
		t.Fatalf("triage lost content or links: %#v", overview)
	}
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/personal/capture", payload, http.StatusOK, &repeat)
	if repeat.InInbox || repeat.Body != edited.Body || repeat.ID != note.ID {
		t.Fatal("retry must not overwrite subsequent edits or return a processed note to inbox")
	}
	requestJSON(t, owner, http.MethodPatch, triage, map[string]any{"inInbox": true, "expectedUpdatedAt": overview.Notes[0].UpdatedAt}, http.StatusNoContent, nil)
	requestJSON(t, owner, http.MethodGet, server.URL+"/api/personal/overview", nil, http.StatusOK, &overview)
	if !overview.Notes[0].InInbox {
		t.Fatal("undo did not restore inbox state")
	}
	var ordinary PersonalNote
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/personal/notes", map[string]any{"title": "Обычная заметка", "body": "Без разбора"}, http.StatusCreated, &ordinary)
	if ordinary.InInbox {
		t.Fatal("ordinary notes must not become unprocessed automatically")
	}
	var partnerNote PersonalNote
	requestJSON(t, partner, http.MethodPost, server.URL+"/api/personal/capture", payload, http.StatusCreated, &partnerNote)
	if partnerNote.ID == note.ID {
		t.Fatal("request keys must be scoped to the authenticated owner")
	}
	requestJSON(t, owner, http.MethodDelete, server.URL+"/api/personal/notes/"+note.ID, nil, http.StatusNoContent, nil)
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/personal/capture", payload, http.StatusConflict, nil)
	requestJSON(t, owner, http.MethodPatch, triage, map[string]any{"inInbox": false, "expectedUpdatedAt": edited.UpdatedAt}, http.StatusNotFound, nil)
}
