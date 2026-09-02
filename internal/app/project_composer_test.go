package app

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func TestProjectComposerIsolationAndHiddenContent(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "composer.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	ownerClient, memberClient := testClient(t), testClient(t)
	register(t, ownerClient, server.URL, "composer-owner@example.test", "composer_owner")
	member := register(t, memberClient, server.URL, "composer-member@example.test", "composer_member")
	var first, second Workspace
	requestJSON(t, ownerClient, "POST", server.URL+"/api/workspaces", map[string]any{"name": "First", "memberIds": []int64{member.ID}}, 201, &first)
	requestJSON(t, ownerClient, "POST", server.URL+"/api/workspaces", map[string]any{"name": "Second"}, 201, &second)
	req := func(client *http.Client, method, path, workspace string, body any, status int, target any) {
		t.Helper()
		requestWorkspaceJSON(t, client, method, server.URL+path, workspace, body, status, target)
	}
	var navigation ProjectNavigation
	req(ownerClient, "GET", "/api/workspace/navigation", first.ID, nil, 200, &navigation)
	if len(navigation.EnabledViews) != 4 {
		t.Fatalf("default modules: %+v", navigation)
	}
	req(memberClient, "PUT", "/api/workspace/navigation", first.ID, map[string]any{"enabledViews": []string{"idea"}}, 403, nil)
	req(ownerClient, "PUT", "/api/workspace/navigation", first.ID, map[string]any{"enabledViews": []string{"work", "work", "unknown"}}, 200, &navigation)
	if len(navigation.EnabledViews) != 1 || navigation.EnabledViews[0] != "work" {
		t.Fatal(navigation)
	}
	req(ownerClient, "GET", "/api/workspace/navigation", second.ID, nil, 200, &navigation)
	if len(navigation.EnabledViews) != 4 {
		t.Fatal("modules leaked between projects")
	}

	var collection WorkspaceCollection
	req(ownerClient, "POST", "/api/collections", first.ID, map[string]any{"name": "Pipeline", "cardLabel": "Task", "defaultRecordType": "task"}, 201, &collection)
	page := WorkspacePage{Name: "My work", CollectionID: collection.ID, StatusFilter: "active", OwnerFilter: "me", ViewMode: "board", Fields: []string{"owner"}}
	req(memberClient, "POST", "/api/workspace/pages", first.ID, page, 403, nil)
	req(ownerClient, "POST", "/api/workspace/pages", second.ID, page, 400, nil)
	req(ownerClient, "POST", "/api/workspace/pages", first.ID, page, 201, &page)
	if page.ID == "" {
		t.Fatal("missing page ID")
	}
	req(ownerClient, "PATCH", "/api/workspace/pages/"+page.ID, second.ID, WorkspacePage{Name: "foreign"}, 404, nil)
	var pages []WorkspacePage
	req(ownerClient, "GET", "/api/workspace/pages", second.ID, nil, 200, &pages)
	if len(pages) != 0 {
		t.Fatal("page leaked")
	}
	page.Archived = true
	req(ownerClient, "PATCH", "/api/workspace/pages/"+page.ID, first.ID, page, 200, nil)
	req(ownerClient, "GET", "/api/workspace/pages", first.ID, nil, 200, &pages)
	if len(pages) != 0 {
		t.Fatal("archived page visible")
	}
	req(ownerClient, "GET", "/api/workspace/pages?includeArchived=true", first.ID, nil, 200, &pages)
	if len(pages) != 1 {
		t.Fatal("archived page lost")
	}
	page.Archived = false
	req(ownerClient, "PATCH", "/api/workspace/pages/"+page.ID, first.ID, page, 200, nil)
	req(ownerClient, "GET", "/api/workspace/pages", first.ID, nil, 200, &pages)
	if len(pages) != 1 {
		t.Fatal("page not restored")
	}
	invalid := page
	invalid.Fields = []string{"field:foreign"}
	req(ownerClient, "PATCH", "/api/workspace/pages/"+page.ID, first.ID, invalid, 400, nil)

	var preferences InterfacePreferences
	req(ownerClient, "PUT", "/api/interface/preferences", first.ID, map[string]any{"hiddenNavItems": []string{"chat", "unknown"}, "navOrder": []string{"page:" + page.ID, "work"}}, 200, &preferences)
	if len(preferences.HiddenNavItems) != 1 || len(preferences.NavOrder) != 2 {
		t.Fatal(preferences)
	}
	req(memberClient, "GET", "/api/interface/preferences", first.ID, nil, 200, &preferences)
	if len(preferences.HiddenNavItems) != 0 {
		t.Fatal("personal menu changed for colleague")
	}

	var record Record
	req(ownerClient, "POST", "/api/records", first.ID, map[string]any{"type": "idea", "title": "Scoped content"}, 201, &record)
	var sections []RecordSection
	req(ownerClient, "POST", "/api/records/"+record.ID+"/sections", first.ID, map[string]any{"definitionId": "default-limitations", "content": "Keep this result"}, 200, &sections)
	req(memberClient, "PATCH", "/api/section-definitions/default-limitations", first.ID, map[string]any{"active": false}, 403, nil)
	req(ownerClient, "PATCH", "/api/section-definitions/default-limitations", first.ID, map[string]any{"active": false, "name": "Project limits"}, 200, nil)
	req(ownerClient, "GET", "/api/records/"+record.ID+"/sections", first.ID, nil, 200, &sections)
	found := false
	for _, section := range sections {
		if section.DefinitionID != nil && *section.DefinitionID == "default-limitations" {
			found = true
			if !section.Hidden || section.Content != "Keep this result" || section.Title != "Project limits" {
				t.Fatal(section)
			}
		}
	}
	if !found {
		t.Fatal("hidden content lost")
	}
	var definitions []SectionDefinition
	req(ownerClient, "GET", "/api/section-definitions", second.ID, nil, 200, &definitions)
	for _, definition := range definitions {
		if definition.ID == "default-limitations" && (!definition.Active || definition.Name == "Project limits") {
			t.Fatal("template override leaked")
		}
	}
	var created map[string]string
	req(ownerClient, "POST", "/api/section-definitions", first.ID, map[string]any{"name": "Private schema", "scopeType": "idea"}, 201, &created)
	req(ownerClient, "GET", "/api/section-definitions", second.ID, nil, 200, &definitions)
	for _, definition := range definitions {
		if definition.ID == created["id"] {
			t.Fatal("custom definition leaked")
		}
	}
	req(ownerClient, "PATCH", "/api/section-definitions/"+created["id"], second.ID, map[string]any{"active": false}, 404, nil)
	var exported struct {
		SchemaVersion int                         `json:"schemaVersion"`
		Tables        map[string][]map[string]any `json:"tables"`
	}
	req(ownerClient, "GET", "/api/export", second.ID, nil, 200, &exported)
	if exported.SchemaVersion != 13 || len(exported.Tables["workspacePages"]) != 0 || len(exported.Tables["sectionOverrides"]) != 0 {
		t.Fatal("export leaked composer settings", exported)
	}
	for _, definition := range exported.Tables["sectionDefinitions"] {
		if definition["id"] == created["id"] {
			t.Fatal("export leaked custom definition")
		}
	}
	req(ownerClient, "GET", "/api/export", first.ID, nil, 200, &exported)
	if len(exported.Tables["workspacePages"]) != 1 || len(exported.Tables["myInterfacePreferences"]) != 1 || len(exported.Tables["sectionOverrides"]) == 0 {
		t.Fatal("export omitted composer settings")
	}
	req(ownerClient, "GET", "/api/section-definitions", first.ID, nil, 200, &definitions)
	ids := []string{}
	for _, definition := range definitions {
		if definition.Active && definition.ScopeType != nil && *definition.ScopeType == "idea" {
			ids = append(ids, definition.ID)
		}
	}
	req(ownerClient, "POST", "/api/section-definitions/reorder", first.ID, map[string]any{"scopeType": "idea", "orderedIds": ids}, 200, nil)
	req(ownerClient, "PATCH", "/api/section-definitions/default-limitations", first.ID, map[string]any{"active": true}, 200, nil)
	req(ownerClient, "GET", "/api/records/"+record.ID+"/sections", first.ID, nil, 200, &sections)
	for _, section := range sections {
		if section.DefinitionID != nil && *section.DefinitionID == "default-limitations" && section.Hidden {
			t.Fatal("content not restored")
		}
	}
}
