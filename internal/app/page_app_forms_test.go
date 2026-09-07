package app

import (
	"encoding/json"
	"testing"
)

func TestPageFormsValidateRequiredFieldsAndInstallIndependentBindings(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(role, workspace, method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[role], method, f.url+"/api"+path, workspace, body, status, out)
	}
	var board WorkspaceCollection
	call("owner", f.project.ID, "POST", "/collections", map[string]any{"name": "Request form", "defaultRecordType": "idea", "cardLabel": "Request"}, 201, &board)
	var field CollectionField
	call("owner", f.project.ID, "POST", "/collections/"+board.ID+"/fields", map[string]any{"name": "Email", "fieldType": "email", "required": true}, 201, &field)
	var page WorkspacePage
	call("owner", f.project.ID, "POST", "/workspace/pages", map[string]any{"name": "Request page"}, 201, &page)
	path := "/workspace/pages/" + page.ID + "/app"
	def := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "request", Kind: "form", CollectionID: board.ID, Width: 12, DefaultTitle: "Request", ActionLabel: "Send", FormFields: []PageAppFormField{}}}}
	// A hidden required field with no value would make this form impossible to submit.
	call("owner", f.project.ID, "PUT", path, map[string]any{"expectedRevision": 0, "definition": def}, 400, nil)
	def.Blocks[0].FormFields = []PageAppFormField{{Key: "custom:" + field.ID, Label: "Reply to", Width: 6, Color: "#176b58"}, {Key: "description", Label: "Question", Width: 12}}
	call("owner", f.project.ID, "PUT", path, map[string]any{"expectedRevision": 0, "definition": def}, 200, nil)
	// Personal presentation does not allow a normal member to change the shared schema.
	call("member", f.project.ID, "PUT", path, map[string]any{"expectedRevision": 1, "definition": def}, 403, nil)
	def.Blocks[0].DefaultTitle = ""
	call("owner", f.project.ID, "PUT", path, map[string]any{"expectedRevision": 1, "definition": def}, 400, nil)
	def.Blocks[0].DefaultTitle = "Request"
	var kit PageAppTemplate
	call("owner", f.project.ID, "POST", path+"/template", map[string]any{"name": "Request kit", "visibility": "private", "expectedRevision": 1}, 201, &kit)
	if len(kit.Definition.Collections) != 1 {
		t.Fatal("form did not carry its source")
	}
	var installed WorkspacePage
	call("owner", f.project.ID, "POST", "/page-app/templates/"+kit.ID+"/install", map[string]any{}, 201, &installed)
	var app PageAppState
	call("owner", f.project.ID, "GET", "/workspace/pages/"+installed.ID+"/app", nil, 200, &app)
	copied := app.Definition.Blocks[0]
	if copied.CollectionID == board.ID || copied.FormFields[0].Key == "custom:"+field.ID || copied.FormFields[0].Label != "Reply to" || copied.FormFields[0].Width != 6 || copied.FormFields[0].Color != "#176b58" {
		t.Fatal("form lost presentation or kept original bindings", copied)
	}
	var record Record
	// Real record validation remains the authority, even if client-side validation is bypassed.
	body := map[string]any{"type": "idea", "collectionId": copied.CollectionID, "title": "New request", "customFields": map[string]any{copied.FormFields[0].Key[7:]: "invalid"}}
	call("member", f.project.ID, "POST", "/records", body, 400, nil)
	body["customFields"] = map[string]any{copied.FormFields[0].Key[7:]: "person@example.test"}
	call("member", f.project.ID, "POST", "/records", body, 201, &record)
	if record.CustomFields[copied.FormFields[0].Key[7:]] != "person@example.test" {
		t.Fatal(record)
	}
	var count int
	f.store.db.QueryRow("SELECT count(*) FROM records WHERE collection_id=?", board.ID).Scan(&count)
	if count != 0 {
		t.Fatal("copy wrote to source")
	}
	// A required field can be omitted only when the source has an initial value.
	var schema schemaResponse
	call("owner", f.project.ID, "GET", "/collections/"+board.ID+"/schema", nil, 200, &schema)
	field = schema.Fields[0]
	call("owner", f.project.ID, "PATCH", "/collections/"+board.ID+"/fields/"+field.ID, map[string]any{"name": field.Name, "expectedUpdatedAt": field.UpdatedAt, "required": true, "defaultValue": "default@example.test"}, 200, nil)
	def.Blocks[0].FormFields[0].Hidden = true
	call("owner", f.project.ID, "PUT", path, map[string]any{"expectedRevision": 1, "definition": def}, 200, nil)
	// Tampering a stored template cannot leave partial sources after a bad field binding.
	kit.Definition.Blocks[0].FormFields[0].Key = "custom:missing"
	raw, _ := json.Marshal(kit.Definition)
	f.store.db.Exec("UPDATE page_app_templates SET definition_json=? WHERE id=?", string(raw), kit.ID)
	var before, after int
	f.store.db.QueryRow("SELECT count(*) FROM workspace_collections").Scan(&before)
	call("owner", f.project.ID, "POST", "/page-app/templates/"+kit.ID+"/install", map[string]any{}, 400, nil)
	f.store.db.QueryRow("SELECT count(*) FROM workspace_collections").Scan(&after)
	if before != after {
		t.Fatal("failed install left a board")
	}
}
