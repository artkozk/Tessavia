package app

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestPageAppRecordSourcesInstallIndependentSchemasWithoutData(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(role, workspace, method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[role], method, f.url+"/api"+path, workspace, body, status, out)
	}
	var board WorkspaceCollection
	call("owner", f.project.ID, "POST", "/collections", map[string]any{"name": "Learning records", "defaultRecordType": "idea", "cardLabel": "Entry"}, 201, &board)
	var field CollectionField
	call("owner", f.project.ID, "POST", "/collections/"+board.ID+"/fields", map[string]any{"name": "Subject", "fieldType": "select", "options": []string{"Reading", "Practice"}}, 201, &field)
	var schema schemaResponse
	call("owner", f.project.ID, "GET", "/collections/"+board.ID+"/schema", nil, 200, &schema)
	field = schema.Fields[0]
	call("owner", f.project.ID, "PATCH", "/collections/"+board.ID+"/fields/"+field.ID, map[string]any{"name": field.Name, "expectedUpdatedAt": field.UpdatedAt, "defaultValue": field.Options[1].ID, "showOnCard": true}, 200, &field)
	var original Record
	call("owner", f.project.ID, "POST", "/records", map[string]any{"type": "idea", "title": "Private source business data", "collectionId": board.ID}, 201, &original)
	var page WorkspacePage
	call("owner", f.project.ID, "POST", "/workspace/pages", map[string]any{"name": "Study page"}, 201, &page)
	path := "/workspace/pages/" + page.ID + "/app"
	def := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "entries", Kind: "records", Title: "Journal", CollectionID: board.ID, Fields: []string{field.ID}, AllowCreate: true, Width: 12}, {ID: "same", Kind: "records", Title: "Second view", CollectionID: board.ID, Fields: []string{}, Width: 12}}}
	call("owner", f.project.ID, "PUT", path, map[string]any{"definition": def, "expectedRevision": 0}, 200, nil)
	var other Workspace
	requestJSON(t, f.clients["owner"], "POST", f.url+"/api/workspaces", map[string]any{"name": "Receiver"}, 201, &other)
	var foreignPage WorkspacePage
	call("owner", other.ID, "POST", "/workspace/pages", map[string]any{"name": "Foreign source"}, 201, &foreignPage)
	call("owner", other.ID, "PUT", "/workspace/pages/"+foreignPage.ID+"/app", map[string]any{"definition": def, "expectedRevision": 0}, 400, nil)
	var kit PageAppTemplate
	call("owner", f.project.ID, "POST", path+"/template", map[string]any{"name": "Study kit", "visibility": "public", "expectedRevision": 1}, 201, &kit)
	if len(kit.Definition.Collections) != 1 {
		t.Fatal("duplicate source snapshot", kit)
	}
	raw, _ := json.Marshal(kit)
	if strings.Contains(string(raw), original.Title) || strings.Contains(string(raw), original.ID) || strings.Contains(string(raw), f.project.ID) {
		t.Fatal("template leaked records or workspace")
	}
	var installed WorkspacePage
	call("owner", other.ID, "POST", "/page-app/templates/"+kit.ID+"/install", map[string]any{}, 201, &installed)
	var app PageAppState
	call("owner", other.ID, "GET", "/workspace/pages/"+installed.ID+"/app", nil, 200, &app)
	target := app.Definition.Blocks[0].CollectionID
	if target == board.ID || target == "" || app.Definition.Blocks[1].CollectionID != target || len(app.Definition.Collections) > 0 {
		t.Fatal("invalid bindings", app)
	}
	if app.Definition.Blocks[0].Fields[0] == field.ID {
		t.Fatal("field ID was not remapped")
	}
	var boards []WorkspaceCollection
	call("owner", other.ID, "GET", "/collections", nil, 200, &boards)
	if len(boards) != 1 || boards[0].ID != target || len(boards[0].Fields) != 1 {
		t.Fatal(boards)
	}
	copyField := boards[0].Fields[0]
	var defaultID string
	if json.Unmarshal(copyField.DefaultValue, &defaultID) != nil || defaultID != copyField.Options[1].ID || defaultID == field.Options[1].ID {
		t.Fatal("default option did not remap", copyField)
	}
	var count int
	f.store.db.QueryRow("SELECT count(*) FROM records WHERE collection_id=?", target).Scan(&count)
	if count != 0 {
		t.Fatal("source records copied")
	}
	var added Record
	call("owner", other.ID, "POST", "/records", map[string]any{"type": "idea", "title": "New receiver entry", "collectionId": target}, 201, &added)
	if added.CustomFields[copyField.ID] != defaultID {
		t.Fatal("installed schema not usable")
	}
	f.store.db.QueryRow("SELECT count(*) FROM records WHERE collection_id=?", board.ID).Scan(&count)
	if count != 1 {
		t.Fatal("copy affected source records")
	}
	// Invalid live bindings fail without advancing the app revision.
	def.Blocks[0].Fields = []string{"missing"}
	call("owner", f.project.ID, "PUT", path, map[string]any{"definition": def, "expectedRevision": 1}, 400, nil)
	// Damaged dependency must roll back new boards as well as the new page.
	kit.Definition.Blocks[0].Fields = []string{"missing"}
	raw, _ = json.Marshal(kit.Definition)
	if _, err := f.store.db.Exec("UPDATE page_app_templates SET definition_json=? WHERE id=?", string(raw), kit.ID); err != nil {
		t.Fatal(err)
	}
	call("owner", other.ID, "POST", "/page-app/templates/"+kit.ID+"/install", map[string]any{}, 400, nil)
	var after []WorkspaceCollection
	call("owner", other.ID, "GET", "/collections", nil, 200, &after)
	if len(after) != 1 {
		t.Fatal("failed install left orphan source")
	}
}
