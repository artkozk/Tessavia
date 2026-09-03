package app

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestProjectInboxNotebook(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "notebook.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	owner, member := testClient(t), testClient(t)
	register(t, owner, server.URL, "notebook@example.test", "notebook")
	register(t, member, server.URL, "reader@example.test", "reader")
	endpoint := server.URL + "/api/records"
	body := "\n## Поездка на дачу\n\n- Купить угли\n- **Мясо**\nhttps://example.test/list"
	requestJSON(t, testClient(t), http.MethodPost, endpoint, map[string]any{"type": "inbox", "description": body}, http.StatusUnauthorized, nil)
	inbox := createRecord(t, owner, server.URL, map[string]any{"type": "inbox", "description": body, "editPolicy": "owner_only"})
	if inbox.Title != "Поездка на дачу" || inbox.Description != strings.TrimSpace(body) || inbox.Type != "inbox" || inbox.CreatedAt == "" {
		t.Fatalf("body-only inbox = %#v", inbox)
	}
	for _, payload := range []map[string]any{
		{"type": "inbox", "description": "  \n  "},
		{"type": "inbox", "title": strings.Repeat("я", 241)},
		{"type": "inbox", "description": strings.Repeat("я", 100001)},
		{"type": "task", "description": body},
	} {
		requestJSON(t, owner, http.MethodPost, endpoint, payload, http.StatusBadRequest, nil)
	}
	named := createRecord(t, owner, server.URL, map[string]any{"type": "inbox", "title": strings.Repeat("я", 240), "description": body})
	if named.Title != strings.Repeat("я", 240) {
		t.Fatal("explicit Unicode title changed")
	}
	longBody := strings.Repeat("я", 150) + "\nContinuation"
	long := createRecord(t, owner, server.URL, map[string]any{"type": "inbox", "description": longBody})
	if len([]rune(long.Title)) != 120 || long.Description != longBody {
		t.Fatal("title abbreviation must not truncate body")
	}

	url := endpoint + "/" + inbox.ID
	requestJSON(t, member, http.MethodPatch, url, map[string]any{"title": "", "description": "Other text"}, http.StatusForbidden, nil)
	var edited Record
	requestJSON(t, owner, http.MethodPatch, url, map[string]any{"description": body + "\n- Вода", "expectedUpdatedAt": inbox.UpdatedAt}, http.StatusOK, &edited)
	if edited.Title != inbox.Title || edited.ID != inbox.ID || edited.CreatedAt != inbox.CreatedAt {
		t.Fatal("body edit changed identity or title")
	}
	requestJSON(t, owner, http.MethodPatch, url, map[string]any{"title": "", "description": "Stale", "expectedUpdatedAt": inbox.UpdatedAt}, http.StatusConflict, nil)
	requestJSON(t, owner, http.MethodPatch, url, map[string]any{"title": "", "description": ""}, http.StatusBadRequest, nil)
	requestJSON(t, owner, http.MethodPatch, url, map[string]any{"description": strings.Repeat("я", 100001)}, http.StatusBadRequest, nil)
	requestJSON(t, owner, http.MethodPatch, url, map[string]any{"title": strings.Repeat("я", 241)}, http.StatusBadRequest, nil)
	requestJSON(t, owner, http.MethodPatch, url, map[string]any{"title": "", "description": "# Новый список\n- Вода", "expectedUpdatedAt": edited.UpdatedAt}, http.StatusOK, &edited)
	if edited.Title != "Новый список" || edited.Description != "# Новый список\n- Вода" {
		t.Fatal("clearing title must derive from effective new body")
	}
	requestJSON(t, owner, http.MethodPatch, url, map[string]any{"title": "Временное название", "expectedUpdatedAt": edited.UpdatedAt}, http.StatusOK, &edited)
	requestJSON(t, owner, http.MethodPatch, url, map[string]any{"title": "", "expectedUpdatedAt": edited.UpdatedAt}, http.StatusOK, &edited)
	if edited.Title != "Новый список" {
		t.Fatal("title-only patch must use existing body")
	}
	requestJSON(t, owner, http.MethodPost, url+"/links", map[string]any{"targetId": named.ID, "relationType": "related"}, http.StatusCreated, nil)
	var triaged Record
	requestJSON(t, owner, http.MethodPost, url+"/triage", map[string]any{"targetType": "task", "reason": "Готово к выполнению"}, http.StatusOK, &triaged)
	if triaged.ID != inbox.ID || triaged.CreatedAt != inbox.CreatedAt || triaged.Description != edited.Description || triaged.Title != edited.Title {
		t.Fatal("triage lost notebook contents or identity")
	}
	var relations struct {
		Links []RecordLink `json:"links"`
	}
	requestJSON(t, owner, http.MethodGet, url+"/relations", nil, http.StatusOK, &relations)
	if len(relations.Links) != 1 || relations.Links[0].Record.ID != named.ID {
		t.Fatal("triage lost notebook link")
	}
}
