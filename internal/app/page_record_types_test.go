package app

import (
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

func TestMixedPageTypesPersistenceValidationAndExport(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "pages.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	client := testClient(t)
	register(t, client, server.URL, "mixed@example.test", "mixed_pages")
	var workspace Workspace
	requestJSON(t, client, "POST", server.URL+"/api/workspaces", map[string]any{"name": "Mixed"}, 201, &workspace)
	req := func(method, path string, body any, status int, target any) {
		t.Helper()
		requestWorkspaceJSON(t, client, method, server.URL+path, workspace.ID, body, status, target)
	}
	var page WorkspacePage
	req("POST", "/api/workspace/pages", map[string]any{"name": "Research + tasks", "recordTypes": []string{"research", "task", "research"}}, 201, &page)
	if !reflect.DeepEqual(page.RecordTypes, []string{"research", "task"}) || page.RecordType != "" {
		t.Fatal(page)
	}
	var pages []WorkspacePage
	req("GET", "/api/workspace/pages", nil, 200, &pages)
	if len(pages) != 1 || !reflect.DeepEqual(pages[0].RecordTypes, page.RecordTypes) {
		t.Fatal(pages)
	}
	req("PATCH", "/api/workspace/pages/"+page.ID, map[string]any{"name": "Invalid", "recordTypes": []string{"task", "not-a-type"}}, 400, nil)
	// Older clients can rename/archive without silently broadening a mixed source.
	req("PATCH", "/api/workspace/pages/"+page.ID, map[string]any{"name": "Renamed", "archived": true}, 200, &page)
	if len(page.RecordTypes) != 2 || !page.Archived {
		t.Fatal(page)
	}
	page.Archived = false
	req("PATCH", "/api/workspace/pages/"+page.ID, page, 200, &page)
	var exported struct {
		SchemaVersion int                         `json:"schemaVersion"`
		Tables        map[string][]map[string]any `json:"tables"`
	}
	req("GET", "/api/export", nil, 200, &exported)
	if exported.SchemaVersion != 15 {
		t.Fatal(exported.SchemaVersion)
	}
	var types []string
	if err := json.Unmarshal([]byte(exported.Tables["workspacePages"][0]["record_types_json"].(string)), &types); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(types, page.RecordTypes) {
		t.Fatal(types)
	}
	req("PATCH", "/api/workspace/pages/"+page.ID, map[string]any{"name": "All", "recordTypes": []string{}}, 200, &page)
	if len(page.RecordTypes) != 0 || page.RecordType != "" {
		t.Fatal(page)
	}
	req("PATCH", "/api/workspace/pages/"+page.ID, map[string]any{"name": "Legacy", "recordType": "task"}, 200, &page)
	if !reflect.DeepEqual(page.RecordTypes, []string{"task"}) || page.RecordType != "task" {
		t.Fatal(page)
	}
	// The existing project-scope and membership suite covers mixed pages too.
	var other Workspace
	requestJSON(t, client, "POST", server.URL+"/api/workspaces", map[string]any{"name": "Other"}, 201, &other)
	requestWorkspaceJSON(t, client, "GET", server.URL+"/api/workspace/pages", other.ID, nil, 200, &pages)
	if len(pages) != 0 {
		t.Fatal("page leaked between projects")
	}
}
