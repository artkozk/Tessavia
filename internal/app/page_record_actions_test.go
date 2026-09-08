package app

import (
	"encoding/json"
	"testing"
)

func TestPageRecordActionPreviewVersionsRightsAndPortableCopy(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(role, method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[role], method, f.url+"/api"+path, f.project.ID, body, status, out)
	}
	var board WorkspaceCollection
	call("owner", "POST", "/collections", map[string]any{"name": "Action requests", "defaultRecordType": "idea"}, 201, &board)
	var field CollectionField
	call("owner", "POST", "/collections/"+board.ID+"/fields", map[string]any{"name": "Channel", "fieldType": "select", "options": []string{"Mail", "Site"}}, 201, &field)
	var schema schemaResponse
	call("owner", "GET", "/collections/"+board.ID+"/schema", nil, 200, &schema)
	field = schema.Fields[0]
	var page WorkspacePage
	call("owner", "POST", "/workspace/pages", map[string]any{"name": "Actions"}, 201, &page)
	path := "/workspace/pages/" + page.ID + "/app"
	value, _ := json.Marshal(field.Options[1].ID)
	def := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "list", Kind: "records", CollectionID: board.ID, Width: 12, Actions: []PageRecordAction{{ID: "site", Label: "Use Site", FieldID: field.ID, Value: value}}}}}
	call("owner", "PUT", path, map[string]any{"expectedRevision": 0, "definition": def}, 200, nil)
	var record Record
	call("owner", "POST", "/records", map[string]any{"type": "idea", "title": "Request", "collectionId": board.ID, "customFields": map[string]any{field.ID: field.Options[0].ID}}, 201, &record)
	body := map[string]any{"blockId": "list", "actionId": "site", "recordId": record.ID, "expectedRevision": 1, "expectedUpdatedAt": record.UpdatedAt}
	var preview pageActionPreview
	call("member", "POST", path+"/action", body, 200, &preview)
	if preview.Before != field.Options[0].ID || string(preview.After) != string(value) {
		t.Fatal(preview)
	}
	var activityCount int
	if err := f.store.db.QueryRow("SELECT count(*) FROM activity WHERE entity_id=? AND action='custom_fields_updated'", record.ID).Scan(&activityCount); err != nil || activityCount != 0 {
		t.Fatal("preview wrote data", err, activityCount)
	}
	body["apply"] = true
	body["schemaHash"] = preview.SchemaHash
	var updated Record
	call("member", "POST", path+"/action", body, 200, &updated)
	if updated.CustomFields[field.ID] != field.Options[1].ID {
		t.Fatal(updated)
	}
	call("member", "POST", path+"/action", body, 409, nil)
	if err := f.store.db.QueryRow("SELECT count(*) FROM activity WHERE entity_id=? AND action='custom_fields_updated'", record.ID).Scan(&activityCount); err != nil || activityCount != 1 {
		t.Fatal("duplicate activity", err, activityCount)
	}
	body["apply"] = false
	body["expectedUpdatedAt"] = updated.UpdatedAt
	call("owner", "POST", path+"/action", body, 200, &preview)
	// A changed schema invalidates the displayed preview even if the record version stays the same.
	call("owner", "PATCH", "/collections/"+board.ID+"/fields/"+field.ID, map[string]any{"name": "Renamed channel", "expectedUpdatedAt": field.UpdatedAt}, 200, nil)
	body["apply"] = true
	body["schemaHash"] = preview.SchemaHash
	call("owner", "POST", path+"/action", body, 409, nil)
	// Saved configuration is authoritative; stale page versions cannot execute old semantics.
	call("owner", "PUT", path, map[string]any{"expectedRevision": 1, "definition": def}, 200, nil)
	call("owner", "POST", path+"/action", body, 409, nil)
	body["expectedRevision"] = 2
	body["apply"] = false
	body["actionId"] = "invented"
	call("owner", "POST", path+"/action", body, 400, nil)
	body["actionId"] = "site"
	var private Record
	call("owner", "POST", "/records", map[string]any{"type": "idea", "title": "Restricted", "collectionId": board.ID, "editPolicy": "owner_only"}, 201, &private)
	body["recordId"] = private.ID
	body["expectedUpdatedAt"] = private.UpdatedAt
	call("member", "POST", path+"/action", body, 403, nil)
	var wrong Record
	call("owner", "POST", "/records", map[string]any{"type": "idea", "title": "Other source"}, 201, &wrong)
	body["recordId"] = wrong.ID
	body["expectedUpdatedAt"] = wrong.UpdatedAt
	call("owner", "POST", path+"/action", body, 400, nil)
	// A kit remaps action field and option IDs, and acts only on independent records.
	var kit PageAppTemplate
	call("owner", "POST", path+"/template", map[string]any{"name": "Action kit", "visibility": "private", "expectedRevision": 2}, 201, &kit)
	var installed WorkspacePage
	call("owner", "POST", "/page-app/templates/"+kit.ID+"/install", map[string]any{}, 201, &installed)
	var copyApp PageAppState
	copyPath := "/workspace/pages/" + installed.ID + "/app"
	call("owner", "GET", copyPath, nil, 200, &copyApp)
	block := copyApp.Definition.Blocks[0]
	action := block.Actions[0]
	if action.FieldID == field.ID || string(action.Value) == string(value) || action.Label != "Use Site" {
		t.Fatal("action bindings not remapped", action)
	}
	var copyRecord Record
	call("owner", "POST", "/records", map[string]any{"type": "idea", "title": "Independent", "collectionId": block.CollectionID}, 201, &copyRecord)
	body = map[string]any{"blockId": block.ID, "actionId": action.ID, "recordId": copyRecord.ID, "expectedRevision": copyApp.Revision, "expectedUpdatedAt": copyRecord.UpdatedAt}
	call("owner", "POST", copyPath+"/action", body, 200, &preview)
	body["apply"] = true
	body["schemaHash"] = preview.SchemaHash
	call("owner", "POST", copyPath+"/action", body, 200, &copyRecord)
	raw, _ := json.Marshal(copyRecord.CustomFields[action.FieldID])
	if string(raw) != string(action.Value) {
		t.Fatal(copyRecord)
	}
	// Invalid bindings do not save, and tampered kits roll back all installed sources.
	def.Blocks[0].Actions[0].FieldID = "missing"
	call("owner", "PUT", path, map[string]any{"expectedRevision": 2, "definition": def}, 400, nil)
	kit.Definition.Blocks[0].Actions[0].Value = json.RawMessage(`"missing-option"`)
	raw, _ = json.Marshal(kit.Definition)
	if _, err := f.store.db.Exec("UPDATE page_app_templates SET definition_json=? WHERE id=?", string(raw), kit.ID); err != nil {
		t.Fatal(err)
	}
	var before, after int
	f.store.db.QueryRow("SELECT count(*) FROM workspace_collections").Scan(&before)
	call("owner", "POST", "/page-app/templates/"+kit.ID+"/install", map[string]any{}, 400, nil)
	f.store.db.QueryRow("SELECT count(*) FROM workspace_collections").Scan(&after)
	if before != after {
		t.Fatal("partial kit installed")
	}

	// Removing an action is persistent and cannot be bypassed by remembering its ID.
	def.Blocks[0].Actions = nil
	call("owner", "PUT", path, map[string]any{"expectedRevision": 2, "definition": def}, 200, nil)
	body = map[string]any{"blockId": "list", "actionId": "site", "recordId": updated.ID, "expectedRevision": 3, "expectedUpdatedAt": updated.UpdatedAt}
	call("owner", "POST", path+"/action", body, 400, nil)
	var other Workspace
	requestJSON(t, f.clients["owner"], "POST", f.url+"/api/workspaces", map[string]any{"name": "Other action workspace"}, 201, &other)
	requestWorkspaceJSON(t, f.clients["owner"], "POST", f.url+"/api"+path+"/action", other.ID, body, 404, nil)
	requestWorkspaceJSON(t, f.clients["member"], "POST", f.url+"/api"+path+"/action", other.ID, body, 403, nil)
}

func TestPageActionMultiSelectRemapPreservesFalseAndZero(t *testing.T) {
	a := PageRecordAction{Value: json.RawMessage(`["a","b"]`)}
	if err := remapPageActionValue(&a, "multi_select", map[string]string{"a": "new-a", "b": "new-b"}); err != nil || string(a.Value) != `["new-a","new-b"]` {
		t.Fatal(a, err)
	}
	for _, raw := range []string{"false", "0"} {
		a.Value = json.RawMessage(raw)
		if err := remapPageActionValue(&a, "number", nil); err != nil || string(a.Value) != raw {
			t.Fatal(a, err)
		}
	}
}
