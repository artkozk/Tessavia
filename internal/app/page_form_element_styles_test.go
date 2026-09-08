package app

import "testing"

func TestPageFormElementStylesKeepRequiredInputAndRemapKit(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(role, ws, method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[role], method, f.url+"/api"+path, ws, body, status, out)
	}
	var board WorkspaceCollection
	call("owner", f.project.ID, "POST", "/collections", map[string]any{"name": "Form style test", "defaultRecordType": "idea"}, 201, &board)
	var field CollectionField
	call("owner", f.project.ID, "POST", "/collections/"+board.ID+"/fields", map[string]any{"name": "Required amount", "fieldType": "number", "required": true}, 201, &field)
	var page WorkspacePage
	call("owner", f.project.ID, "POST", "/workspace/pages", map[string]any{"name": "Form presentation"}, 201, &page)
	hidden := true
	size := 22
	b := PageAppBlock{ID: "form", Kind: "form", CollectionID: board.ID, FormFields: []PageAppFormField{{Key: "title", Width: 12}, {Key: "custom:" + field.ID, Width: 12}}, ElementStyles: map[string]PageElementStyle{"formLabel:custom:" + field.ID: {Hidden: &hidden}, "formControl:custom:" + field.ID: {FontSize: &size}, "formSubmit": {Background: "#176b58"}}}
	def := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{b}}
	path := "/workspace/pages/" + page.ID + "/app"
	call("owner", f.project.ID, "PUT", path, map[string]any{"definition": def, "expectedRevision": 0}, 200, nil)
	b.ElementStyles["formControl"] = PageElementStyle{Hidden: &hidden}
	def.Blocks[0] = b
	call("owner", f.project.ID, "PUT", path, map[string]any{"definition": def, "expectedRevision": 1}, 400, nil)
	delete(b.ElementStyles, "formControl")
	b.FormFields[1].Hidden = true
	def.Blocks[0] = b
	call("owner", f.project.ID, "PUT", path, map[string]any{"definition": def, "expectedRevision": 1}, 400, nil)
	b.FormFields[1].Hidden = false
	var kit PageAppTemplate
	call("owner", f.project.ID, "POST", path+"/template", map[string]any{"name": "Form kit", "visibility": "public", "expectedRevision": 1}, 201, &kit)
	var ws Workspace
	requestJSON(t, f.clients["member"], "POST", f.url+"/api/workspaces", map[string]any{"name": "Form recipient"}, 201, &ws)
	var copy WorkspacePage
	call("member", ws.ID, "POST", "/page-app/templates/"+kit.ID+"/install", map[string]any{}, 201, &copy)
	var state PageAppState
	cp := "/workspace/pages/" + copy.ID + "/app"
	call("member", ws.ID, "GET", cp, nil, 200, &state)
	block := state.Definition.Blocks[0]
	newKey := block.FormFields[1].Key
	if newKey == "custom:"+field.ID || block.ElementStyles["formLabel:"+newKey].Hidden == nil || !*block.ElementStyles["formLabel:"+newKey].Hidden || *block.ElementStyles["formControl:"+newKey].FontSize != 22 {
		t.Fatal("form style not remapped", block)
	}
	delete(block.ElementStyles, "formControl:"+newKey)
	state.Definition.Blocks[0] = block
	call("member", ws.ID, "PUT", cp, map[string]any{"definition": state.Definition, "expectedRevision": 1}, 200, nil)
	call("member", ws.ID, "PUT", cp, map[string]any{"definition": state.Definition, "expectedRevision": 1}, 409, nil)
	call("member", f.project.ID, "PUT", path, map[string]any{"definition": def, "expectedRevision": 1}, 403, nil)
	state = PageAppState{}
	call("owner", f.project.ID, "GET", path, nil, 200, &state)
	if len(state.Definition.Blocks[0].ElementStyles) != 3 {
		t.Fatal("source changed")
	}
}
