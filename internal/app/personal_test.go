package app

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"testing"
	"time"
)

func TestPersonalWorkspaceIsPrivateAndConnected(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "personal.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()

	ownerClient := testClient(t)
	partnerClient := testClient(t)
	owner := register(t, ownerClient, server.URL, "owner@example.test", "owner_user")
	register(t, partnerClient, server.URL, "partner@example.test", "partner_user")

	var ownerWorkspaces []Workspace
	requestJSON(t, ownerClient, http.MethodGet, server.URL+"/api/workspaces", nil, http.StatusOK, &ownerWorkspaces)
	if len(ownerWorkspaces) != 2 || ownerWorkspaces[0].Kind != "personal" || ownerWorkspaces[1].Kind != "team" {
		t.Fatalf("owner workspaces = %#v", ownerWorkspaces)
	}
	var partnerWorkspaces []Workspace
	requestJSON(t, partnerClient, http.MethodGet, server.URL+"/api/workspaces", nil, http.StatusOK, &partnerWorkspaces)
	if len(partnerWorkspaces) != 2 || partnerWorkspaces[0].ID == ownerWorkspaces[0].ID {
		t.Fatalf("partner workspaces do not isolate personal workspace: %#v", partnerWorkspaces)
	}

	var note PersonalNote
	requestJSON(t, ownerClient, http.MethodPost, server.URL+"/api/personal/notes", map[string]any{
		"title": "Купить угли", "body": "Для отдыха на даче", "pinned": true,
	}, http.StatusCreated, &note)
	var plan PersonalPlan
	requestJSON(t, ownerClient, http.MethodPost, server.URL+"/api/personal/plans", map[string]any{
		"title": "Подготовить поездку", "notes": "Собрать список", "dueAt": "2026-09-05T09:00:00+03:00",
	}, http.StatusCreated, &plan)
	var habit PersonalHabit
	requestJSON(t, ownerClient, http.MethodPost, server.URL+"/api/personal/habits", map[string]any{
		"title": "Читать", "scheduleKind": "weekly_target", "targetPerWeek": 5, "unit": "дней", "startDate": "2026-09-01",
	}, http.StatusCreated, &habit)
	requestJSON(t, ownerClient, http.MethodPut, server.URL+"/api/personal/habits/"+habit.ID+"/checkins/2026-09-01", map[string]any{
		"value": 1, "note": "30 минут",
	}, http.StatusOK, nil)

	var partnerOverview PersonalOverview
	requestJSON(t, partnerClient, http.MethodGet, server.URL+"/api/personal/overview", nil, http.StatusOK, &partnerOverview)
	if len(partnerOverview.Notes) != 0 || len(partnerOverview.Plans) != 0 || len(partnerOverview.Habits) != 0 || len(partnerOverview.Links) != 0 {
		t.Fatalf("partner can see owner personal data: %#v", partnerOverview)
	}
	requestJSON(t, partnerClient, http.MethodPatch, server.URL+"/api/personal/notes/"+note.ID, map[string]any{
		"title": "Чужая правка", "body": "", "pinned": false,
	}, http.StatusNotFound, nil)
	requestJSON(t, partnerClient, http.MethodPut, server.URL+"/api/personal/habits/"+habit.ID+"/checkins/2026-09-02", map[string]any{
		"value": 1, "note": "",
	}, http.StatusNotFound, nil)

	record := createRecord(t, ownerClient, server.URL, map[string]any{
		"type": "idea", "title": "Отдых на даче", "description": "Выходные за городом",
	})
	var link PersonalLink
	requestJSON(t, ownerClient, http.MethodPost, server.URL+"/api/personal/links", map[string]any{
		"sourceType": "note", "sourceId": note.ID, "targetType": "record", "targetId": record.ID, "relationType": "prepares_for",
	}, http.StatusCreated, &link)
	if link.TargetTitle != record.Title {
		t.Fatalf("personal link target title = %q", link.TargetTitle)
	}
	requestJSON(t, partnerClient, http.MethodPost, server.URL+"/api/personal/links", map[string]any{
		"sourceType": "note", "sourceId": note.ID, "targetType": "record", "targetId": record.ID, "relationType": "related",
	}, http.StatusNotFound, nil)
	var temporaryNote PersonalNote
	requestJSON(t, ownerClient, http.MethodPost, server.URL+"/api/personal/notes", map[string]any{
		"title": "Временный список", "body": "Будет архивирован", "pinned": false,
	}, http.StatusCreated, &temporaryNote)
	requestJSON(t, ownerClient, http.MethodPost, server.URL+"/api/personal/links", map[string]any{
		"sourceType": "note", "sourceId": note.ID, "targetType": "note", "targetId": temporaryNote.ID, "relationType": "related",
	}, http.StatusCreated, nil)
	requestJSON(t, ownerClient, http.MethodDelete, server.URL+"/api/personal/notes/"+temporaryNote.ID, nil, http.StatusNoContent, nil)

	var suggestions []PersonalSuggestion
	requestJSON(t, ownerClient, http.MethodGet, server.URL+"/api/personal/suggestions?q="+url.QueryEscape("даче"), nil, http.StatusOK, &suggestions)
	if len(suggestions) == 0 || suggestions[0].ID != record.ID {
		t.Fatalf("record suggestion not found: %#v", suggestions)
	}

	var overview PersonalOverview
	requestJSON(t, ownerClient, http.MethodGet, server.URL+"/api/personal/overview", nil, http.StatusOK, &overview)
	if len(overview.Notes) != 1 || len(overview.Plans) != 1 || len(overview.Habits) != 1 || len(overview.Habits[0].Checkins) != 1 || len(overview.Links) != 1 {
		t.Fatalf("owner overview incomplete: %#v", overview)
	}

	var updated User
	requestJSON(t, ownerClient, http.MethodPatch, server.URL+"/api/me", map[string]any{
		"displayName": "Артемий", "bio": "Создаю продукты", "birthDate": "2000-03-12", "lifeExpectancyYears": 95,
	}, http.StatusOK, &updated)
	if updated.DisplayName != "Артемий" || updated.Bio != "Создаю продукты" || updated.ID != owner.ID {
		t.Fatalf("updated profile = %#v", updated)
	}
	requestJSON(t, ownerClient, http.MethodGet, server.URL+"/api/personal/overview", nil, http.StatusOK, &overview)
	if overview.Settings.BirthDate == nil || *overview.Settings.BirthDate != "2000-03-12" || overview.Settings.LifeExpectancyYears != 95 {
		t.Fatalf("private profile settings = %#v", overview.Settings)
	}
	var publicProfile map[string]any
	requestJSON(t, partnerClient, http.MethodGet, server.URL+"/api/users/"+itoa(owner.ID)+"/profile", nil, http.StatusOK, &publicProfile)
	publicUser := publicProfile["user"].(map[string]any)
	if _, ok := publicUser["email"]; ok {
		t.Fatalf("public profile leaks email: %#v", publicUser)
	}
	if _, ok := publicUser["birthDate"]; ok {
		t.Fatalf("public profile leaks birth date: %#v", publicUser)
	}
}

func TestPasswordChangeKeepsCurrentSessionAndRevokesOthers(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "password.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()

	current := testClient(t)
	register(t, current, server.URL, "password@example.test", "password_user")
	otherSession := testClient(t)
	requestJSON(t, otherSession, http.MethodPost, server.URL+"/api/auth/login", map[string]any{
		"login": "password_user", "password": "strong-password-123",
	}, http.StatusOK, nil)
	requestJSON(t, current, http.MethodPut, server.URL+"/api/me/password", map[string]any{
		"currentPassword": "strong-password-123", "newPassword": "new-strong-password-456",
	}, http.StatusNoContent, nil)
	requestJSON(t, current, http.MethodGet, server.URL+"/api/me", nil, http.StatusOK, nil)
	requestJSON(t, otherSession, http.MethodGet, server.URL+"/api/me", nil, http.StatusUnauthorized, nil)
	oldPassword := testClient(t)
	requestJSON(t, oldPassword, http.MethodPost, server.URL+"/api/auth/login", map[string]any{
		"login": "password_user", "password": "strong-password-123",
	}, http.StatusUnauthorized, nil)
	newPassword := testClient(t)
	requestJSON(t, newPassword, http.MethodPost, server.URL+"/api/auth/login", map[string]any{
		"login": "password_user", "password": "new-strong-password-456",
	}, http.StatusOK, nil)
}
