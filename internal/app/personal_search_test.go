package app

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestPersonalSearchIsPrivateUnicodeAwareAndExcludesArchive(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "personal-search.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	ownerClient, otherClient := testClient(t), testClient(t)
	register(t, ownerClient, server.URL, "personal-search@example.test", "personal_search_owner")
	register(t, otherClient, server.URL, "personal-search-other@example.test", "personal_search_other")
	var note PersonalNote
	requestJSON(t, ownerClient, http.MethodPost, server.URL+"/api/personal/notes", map[string]any{"title": "Поездка", "body": "Спрятанный МойСекрет в тексте"}, http.StatusCreated, &note)
	requestJSON(t, ownerClient, http.MethodPost, server.URL+"/api/personal/plans", map[string]any{"title": "МойСекретный план", "notes": "На осень"}, http.StatusCreated, nil)
	requestJSON(t, ownerClient, http.MethodPost, server.URL+"/api/personal/habits", map[string]any{"title": "Проверять мойсекрет", "scheduleKind": "daily", "targetPerWeek": 7, "unit": "раз", "startDate": "2026-09-03"}, http.StatusCreated, nil)
	requestJSON(t, otherClient, http.MethodPost, server.URL+"/api/personal/notes", map[string]any{"title": "Чужой МОЙСЕКРЕТ", "body": "Никогда не показывать"}, http.StatusCreated, nil)
	var results []PersonalSearchResult
	requestJSON(t, ownerClient, http.MethodGet, server.URL+"/api/personal/search?q="+url.QueryEscape("МОЙСЕКРЕТ"), nil, http.StatusOK, &results)
	if len(results) != 3 || results[0].Type != "plan" {
		t.Fatalf("personal results = %#v", results)
	}
	for _, result := range results {
		if strings.Contains(result.Title+result.Context, "Чужой") {
			t.Fatal("another account leaked into search")
		}
	}
	requestJSON(t, ownerClient, http.MethodDelete, server.URL+"/api/personal/notes/"+note.ID, nil, http.StatusNoContent, nil)
	requestJSON(t, ownerClient, http.MethodGet, server.URL+"/api/personal/search?q="+url.QueryEscape("мойсекрет"), nil, http.StatusOK, &results)
	if len(results) != 2 {
		t.Fatalf("archived note remained in search: %#v", results)
	}
	requestJSON(t, ownerClient, http.MethodGet, server.URL+"/api/personal/search?q=", nil, http.StatusOK, &results)
	if len(results) != 0 {
		t.Fatal("empty query returned data")
	}
	requestJSON(t, ownerClient, http.MethodGet, server.URL+"/api/personal/search?q="+url.QueryEscape(strings.Repeat("я", 201)), nil, http.StatusBadRequest, nil)
}

func TestPersonalWorkspaceAndSearchWorkWithoutATeam(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "personal-only.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	client := testClient(t)
	registerVerifiedWithoutFixture(t, client, server.URL, "personal-only@example.test", "personal_only")

	var workspaces []Workspace
	requestJSON(t, client, http.MethodGet, server.URL+"/api/workspaces", nil, http.StatusOK, &workspaces)
	if len(workspaces) != 1 || workspaces[0].Kind != "personal" {
		t.Fatalf("account without a team must keep one personal workspace: %#v", workspaces)
	}
	requestJSON(t, client, http.MethodPost, server.URL+"/api/personal/notes", map[string]any{
		"title": "Личная запись", "body": "Доступна без команды",
	}, http.StatusCreated, nil)
	var results []PersonalSearchResult
	requestJSON(t, client, http.MethodGet, server.URL+"/api/personal/search?q="+url.QueryEscape("без КОМАНДЫ"), nil, http.StatusOK, &results)
	if len(results) != 1 || results[0].Type != "note" || results[0].Title != "Личная запись" {
		t.Fatalf("personal search without a team = %#v", results)
	}
}

func TestPersonalContextSurvivesTeamRoleAndProjectAccessChanges(t *testing.T) {
	fixture := newLifecycleFixture(t)
	member := fixture.users["member"]
	client := fixture.clients["member"]
	teamPath := fixture.url + "/api/teams/" + fixture.project.TeamID
	memberPath := teamPath + "/members/" + strconv.FormatInt(member.ID, 10)
	requestJSON(t, client, http.MethodPost, fixture.url+"/api/personal/notes", map[string]any{
		"title": "Независимая запись", "body": "Переживает смену роли",
	}, http.StatusCreated, nil)

	requestJSON(t, fixture.clients["owner"], http.MethodPatch, memberPath, map[string]any{
		"role": "admin", "projectIds": []string{fixture.project.ID},
	}, http.StatusOK, nil)
	var workspaces []Workspace
	requestJSON(t, client, http.MethodGet, fixture.url+"/api/workspaces", nil, http.StatusOK, &workspaces)
	personalCount, adminProjectCount := 0, 0
	for _, workspace := range workspaces {
		if workspace.Kind == "personal" {
			personalCount++
		}
		if workspace.ID == fixture.project.ID && workspace.TeamRole == "admin" {
			adminProjectCount++
		}
	}
	if personalCount != 1 || adminProjectCount != 1 {
		t.Fatalf("role change corrupted workspace contexts: %#v", workspaces)
	}

	requestJSON(t, fixture.clients["owner"], http.MethodPatch, memberPath, map[string]any{
		"role": "member", "projectIds": []string{},
	}, http.StatusOK, nil)
	workspaces = nil
	requestJSON(t, client, http.MethodGet, fixture.url+"/api/workspaces", nil, http.StatusOK, &workspaces)
	if len(workspaces) != 1 || workspaces[0].Kind != "personal" {
		t.Fatalf("removing project access removed or mixed the personal workspace: %#v", workspaces)
	}
	var results []PersonalSearchResult
	requestJSON(t, client, http.MethodGet, fixture.url+"/api/personal/search?q="+url.QueryEscape("смену РОЛИ"), nil, http.StatusOK, &results)
	if len(results) != 1 || results[0].Title != "Независимая запись" {
		t.Fatalf("personal search changed with the team role: %#v", results)
	}
}
