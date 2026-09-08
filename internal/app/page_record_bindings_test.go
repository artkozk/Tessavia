package app

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestPageRecordBindingsPreserveSchemaAndIsolateInstalledData(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(actor, workspace, method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[actor], method, f.url+"/api"+path, workspace, body, status, out)
	}
	var board WorkspaceCollection
	call("owner", f.project.ID, "POST", "/collections", map[string]any{"name": "Learning", "defaultRecordType": "idea"}, 201, &board)
	var field CollectionField
	call("owner", f.project.ID, "POST", "/collections/"+board.ID+"/fields", map[string]any{"name": "Chapters", "fieldType": "number"}, 201, &field)
	var original Record
	call("owner", f.project.ID, "POST", "/records", map[string]any{"type": "idea", "title": "Original private title", "collectionId": board.ID, "customFields": map[string]any{field.ID: 0}}, 201, &original)
	var page WorkspacePage
	call("owner", f.project.ID, "POST", "/workspace/pages", map[string]any{"name": "Bindings"}, 201, &page)
	path := "/workspace/pages/" + page.ID + "/app"
	def := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "list", Kind: "records", CollectionID: board.ID, RecordBindings: map[string]PageTextBinding{"title": {FieldID: field.ID, Prefix: "Read ", Suffix: " chapters", EmptyText: "Not started"}, "subtitle": {FieldID: field.ID}}}}}
	call("owner", f.project.ID, "PUT", path, map[string]any{"definition": def, "expectedRevision": 0}, 200, nil)
	call("member", f.project.ID, "PUT", path, map[string]any{"definition": def, "expectedRevision": 1}, 403, nil)
	// A different block kind retains inactive bindings, including template remapping.
	def.Blocks[0].Kind = "text"
	call("owner", f.project.ID, "PUT", path, map[string]any{"definition": def, "expectedRevision": 1}, 200, nil)
	var kit PageAppTemplate
	call("owner", f.project.ID, "POST", path+"/template", map[string]any{"name": "Bindings kit", "visibility": "public", "expectedRevision": 2}, 201, &kit)
	raw, _ := json.Marshal(kit)
	if strings.Contains(string(raw), original.Title) || strings.Contains(string(raw), original.ID) {
		t.Fatal("source data leaked")
	}
	var other Workspace
	requestJSON(t, f.clients["member"], "POST", f.url+"/api/workspaces", map[string]any{"name": "My journal"}, 201, &other)
	var copy WorkspacePage
	call("member", other.ID, "POST", "/page-app/templates/"+kit.ID+"/install", map[string]any{}, 201, &copy)
	var state PageAppState
	copyPath := "/workspace/pages/" + copy.ID + "/app"
	call("member", other.ID, "GET", copyPath, nil, 200, &state)
	b := state.Definition.Blocks[0]
	id := b.RecordBindings["title"].FieldID
	if id == field.ID || id == "" || b.RecordBindings["subtitle"].FieldID != id || b.CollectionID == board.ID || b.RecordBindings["title"].Prefix != "Read " {
		t.Fatal("bad remapping", b)
	}
	var count int
	f.store.db.QueryRow("SELECT count(*) FROM records WHERE collection_id=?", b.CollectionID).Scan(&count)
	if count != 0 {
		t.Fatal("records copied")
	}
	state.Definition.Blocks[0].Kind = "records"
	call("member", other.ID, "PUT", copyPath, map[string]any{"definition": state.Definition, "expectedRevision": 1}, 200, nil)
	state.Definition.Blocks[0].RecordBindings = nil
	call("member", other.ID, "PUT", copyPath, map[string]any{"definition": state.Definition, "expectedRevision": 2}, 200, nil)
	call("member", other.ID, "PUT", copyPath, map[string]any{"definition": state.Definition, "expectedRevision": 2}, 409, nil)
	var saved PageAppState
	call("owner", f.project.ID, "GET", path, nil, 200, &saved)
	if len(saved.Definition.Blocks[0].RecordBindings) != 2 {
		t.Fatal("copy changed source")
	}
	// Reject foreign/missing source fields on save, including inactive bindings.
	def.Blocks[0].RecordBindings["title"] = PageTextBinding{FieldID: id}
	call("owner", f.project.ID, "PUT", path, map[string]any{"definition": def, "expectedRevision": 2}, 400, nil)
	f.store.db.Exec("UPDATE collection_fields SET archived_at=updated_at WHERE id=?", field.ID)
	call("owner", f.project.ID, "POST", path+"/template", map[string]any{"name": "Stale", "expectedRevision": 2}, 400, nil)
}

func TestPageRecordBindingsRejectInvalidPropertiesAndTypes(t *testing.T) {
	for _, b := range []PageAppBlock{{RecordBindings: map[string]PageTextBinding{"onclick": {FieldID: "f"}}}, {RecordBindings: map[string]PageTextBinding{"title": {FieldID: "f", Prefix: strings.Repeat("a", 161)}}}} {
		if validatePageRecordBindings(b) == nil {
			t.Fatal("invalid binding accepted")
		}
	}
	b := PageAppBlock{RecordBindings: map[string]PageTextBinding{"title": {FieldID: "f"}}}
	for _, kind := range []string{"relation", "user", "unknown"} {
		if validatePageRecordBindingSource(b, []CollectionField{{ID: "f", FieldType: kind}}) == nil {
			t.Fatal("unsupported type accepted", kind)
		}
	}
}
