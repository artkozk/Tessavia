package app

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestPageElementStylesValidateTypesAndSource(t *testing.T) {
	negative, large := -1, 97
	for _, b := range []PageAppBlock{{ElementStyles: map[string]PageElementStyle{"body script": {}}}, {ElementStyles: map[string]PageElementStyle{"title": {FontSize: &large}}}, {ElementStyles: map[string]PageElementStyle{"item": {Padding: &negative}}}, {ElementStyles: map[string]PageElementStyle{"title": {Color: "url(javascript:1)"}}}, {ElementStyles: map[string]PageElementStyle{"title": {Align: "absolute"}}}} {
		if validatePageElementStyles(b) == nil {
			t.Fatal("invalid style accepted", b)
		}
	}
	b := PageAppBlock{ElementStyles: map[string]PageElementStyle{"fieldValue:foreign": {}}}
	if validatePageElementStyleSource(b, []CollectionField{{ID: "own"}}) == nil {
		t.Fatal("foreign field accepted")
	}
}

func TestPageElementStylesTemplateRemapsFieldsAndPreservesInactiveOverrides(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(role, workspace, method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[role], method, f.url+"/api"+path, workspace, body, status, out)
	}
	var board WorkspaceCollection
	call("owner", f.project.ID, "POST", "/collections", map[string]any{"name": "Styled entries", "defaultRecordType": "idea"}, 201, &board)
	var field CollectionField
	call("owner", f.project.ID, "POST", "/collections/"+board.ID+"/fields", map[string]any{"name": "Amount", "fieldType": "number"}, 201, &field)
	var record Record
	call("owner", f.project.ID, "POST", "/records", map[string]any{"title": "Private entry", "type": "idea", "collectionId": board.ID}, 201, &record)
	var page WorkspacePage
	call("owner", f.project.ID, "POST", "/workspace/pages", map[string]any{"name": "Styled page"}, 201, &page)
	size, zero, hidden, shown := 24, 0, true, false
	def := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "list", Kind: "text", CollectionID: board.ID, ElementStyles: map[string]PageElementStyle{"fieldValue": {FontSize: &size, Hidden: &hidden}, "fieldValue:" + field.ID: {Padding: &zero, Hidden: &shown, Color: "#123456"}}}, {ID: "steps", Kind: "tracker", Items: []PageAppItem{{ID: "one", Label: "One"}}, ElementStyles: map[string]PageElementStyle{"item:one": {Hidden: &hidden}}}}}
	path := "/workspace/pages/" + page.ID + "/app"
	call("owner", f.project.ID, "PUT", path, map[string]any{"definition": def, "expectedRevision": 0}, 200, nil)
	call("owner", f.project.ID, "PUT", path+"/marks", map[string]any{"blockId": "steps", "itemId": "one", "checked": true, "expectedRevision": 1}, 200, nil)
	call("member", f.project.ID, "PUT", path, map[string]any{"definition": def, "expectedRevision": 1}, 403, nil)
	var kit PageAppTemplate
	call("owner", f.project.ID, "POST", path+"/template", map[string]any{"name": "Styled kit", "visibility": "public", "expectedRevision": 1}, 201, &kit)
	raw, _ := json.Marshal(kit)
	if strings.Contains(string(raw), record.ID) || strings.Contains(string(raw), record.Title) {
		t.Fatal("record leaked")
	}
	var other Workspace
	requestJSON(t, f.clients["member"], "POST", f.url+"/api/workspaces", map[string]any{"name": "Independent"}, 201, &other)
	var copy WorkspacePage
	call("member", other.ID, "POST", "/page-app/templates/"+kit.ID+"/install", map[string]any{}, 201, &copy)
	var state PageAppState
	copyPath := "/workspace/pages/" + copy.ID + "/app"
	call("member", other.ID, "GET", copyPath, nil, 200, &state)
	if len(state.Marks) != 0 || state.Definition.Blocks[0].ElementStyles["fieldValue:"+field.ID].Padding != nil {
		t.Fatal("old field or personal marks copied")
	}
	var newID string
	for key, style := range state.Definition.Blocks[0].ElementStyles {
		if id := elementFieldID(key); id != "" {
			newID = id
			if style.Padding == nil || *style.Padding != 0 || style.Hidden == nil || *style.Hidden || style.Color != "#123456" {
				t.Fatal("zero/false lost", style)
			}
		}
	}
	if newID == "" || newID == field.ID {
		t.Fatal("field not remapped")
	}
	state.Definition.Blocks[0].Kind = "records"
	state.Definition.Blocks[0].Fields = []string{newID}
	state.Definition.Blocks[0].ElementStyles = nil
	call("member", other.ID, "PUT", copyPath, map[string]any{"definition": state.Definition, "expectedRevision": 1}, 200, nil)
	call("member", other.ID, "PUT", copyPath, map[string]any{"definition": state.Definition, "expectedRevision": 1}, 409, nil)
	state = PageAppState{}
	call("owner", f.project.ID, "GET", path, nil, 200, &state)
	if !state.Marks["steps:one"] || len(state.Definition.Blocks[0].ElementStyles) != 2 {
		t.Fatal("source changed")
	}
	f.store.db.Exec("UPDATE collection_fields SET archived_at=updated_at WHERE id=?", field.ID)
	call("owner", f.project.ID, "POST", path+"/template", map[string]any{"name": "Stale", "expectedRevision": 1}, 400, nil)
}
