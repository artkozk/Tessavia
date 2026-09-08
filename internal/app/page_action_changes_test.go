package app

import (
	"encoding/json"
	"testing"
)

func TestCompoundActionAtomicSnapshotAndKit(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(actor, method, path string, body any, status int, out any) {
		t.Helper()
		if r, ok := out.(*Record); ok {
			*r = Record{}
		}
		if p, ok := out.(*pageActionPreview); ok {
			*p = pageActionPreview{}
		}
		requestWorkspaceJSON(t, f.clients[actor], method, f.url+"/api"+path, f.project.ID, body, status, out)
	}
	var board WorkspaceCollection
	call("owner", "POST", "/collections", map[string]any{"name": "Compound", "defaultRecordType": "idea"}, 201, &board)
	fields := []CollectionField{}
	for _, name := range []string{"Estimate", "Confirmed", "Count"} {
		var field CollectionField
		call("owner", "POST", "/collections/"+board.ID+"/fields", map[string]any{"name": name, "fieldType": "number"}, 201, &field)
		fields = append(fields, field)
	}
	var flag CollectionField
	call("owner", "POST", "/collections/"+board.ID+"/fields", map[string]any{"name": "Approved", "fieldType": "checkbox"}, 201, &flag)
	var choice CollectionField
	call("owner", "POST", "/collections/"+board.ID+"/fields", map[string]any{"name": "Channel", "fieldType": "select", "options": []string{"Mail", "Site"}}, 201, &choice)
	var choices schemaResponse
	call("owner", "GET", "/collections/"+board.ID+"/schema", nil, 200, &choices)
	for _, field := range choices.Fields {
		if field.ID == choice.ID {
			choice = field
		}
	}
	selected, _ := json.Marshal(choice.Options[1].ID)
	var page WorkspacePage
	call("owner", "POST", "/workspace/pages", map[string]any{"name": "Approve"}, 201, &page)
	path := "/workspace/pages/" + page.ID + "/app"
	a := PageRecordAction{ID: "approve", Label: "Approve together", FieldID: fields[0].ID, Operation: "set", Value: json.RawMessage("9"), Changes: []PageActionChange{{FieldID: fields[1].ID, Operation: "copy", SourceFieldID: fields[0].ID}, {FieldID: flag.ID, Value: json.RawMessage("true")}, {FieldID: fields[2].ID, Operation: "add", Value: json.RawMessage("1")}}}
	a.Changes = append(a.Changes, PageActionChange{FieldID: choice.ID, Value: selected})
	def := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "list", Kind: "records", CollectionID: board.ID, Actions: []PageRecordAction{a}}}}
	call("owner", "PUT", path, map[string]any{"definition": def, "expectedRevision": 0}, 200, nil)
	var record Record
	call("owner", "POST", "/records", map[string]any{"type": "idea", "title": "Request", "collectionId": board.ID, "customFields": map[string]any{fields[0].ID: 3, fields[1].ID: 1, flag.ID: false}}, 201, &record)
	original := record.UpdatedAt
	body := map[string]any{"blockId": "list", "actionId": "approve", "recordId": record.ID, "expectedRevision": 1, "expectedUpdatedAt": record.UpdatedAt, "apply": true, "schemaHash": "invalid"}
	// Last step cannot add to an empty counter. Even a direct apply writes nothing.
	call("owner", "POST", path+"/action", body, 409, nil)
	call("owner", "GET", "/records/"+record.ID, nil, 200, nil)
	var count int
	f.store.db.QueryRow("SELECT count(*) FROM activity WHERE entity_id=? AND action='custom_fields_updated'", record.ID).Scan(&count)
	if count != 0 {
		t.Fatal(count)
	}
	call("owner", "PUT", "/records/"+record.ID+"/custom-fields", map[string]any{"expectedUpdatedAt": original, "values": map[string]any{fields[2].ID: 0}}, 200, &record)
	body["expectedUpdatedAt"] = record.UpdatedAt
	body["apply"] = false
	var preview pageActionPreview
	call("owner", "POST", path+"/action", body, 200, &preview)
	if len(preview.Changes) != 5 || string(preview.Changes[1].After) != "3" || string(preview.Changes[3].After) != "1" {
		t.Fatal(preview)
	}
	// A later target schema changes without changing the record: old preview must fail.
	var schema schemaResponse
	call("owner", "GET", "/collections/"+board.ID+"/schema", nil, 200, &schema)
	for _, field := range schema.Fields {
		if field.ID == flag.ID {
			flag = field
		}
	}
	call("owner", "PATCH", "/collections/"+board.ID+"/fields/"+flag.ID, map[string]any{"name": "Accepted", "expectedUpdatedAt": flag.UpdatedAt}, 200, nil)
	body["apply"] = true
	body["schemaHash"] = preview.SchemaHash
	call("owner", "POST", path+"/action", body, 409, nil) // A stale client that only reviewed one field cannot apply the compound action.
	body["expectedChangeCount"] = 5
	call("owner", "POST", path+"/action", body, 409, nil)
	body["apply"] = false
	call("owner", "POST", path+"/action", body, 200, &preview)
	// Inject a write failure on the last step, verifying transaction rollback after earlier SQL writes.
	if _, err := f.store.db.Exec("CREATE TRIGGER fail_compound BEFORE UPDATE ON record_field_values WHEN NEW.field_id='" + fields[2].ID + "' BEGIN SELECT RAISE(ABORT,'test failure'); END"); err != nil {
		t.Fatal(err)
	}
	body["apply"] = true
	body["schemaHash"] = preview.SchemaHash
	call("owner", "POST", path+"/action", body, 500, nil)
	f.store.db.QueryRow("SELECT count(*) FROM activity WHERE entity_id=? AND action='custom_fields_updated'", record.ID).Scan(&count)
	if count != 1 {
		t.Fatal(count)
	}
	f.store.db.Exec("DROP TRIGGER fail_compound")
	call("owner", "POST", path+"/action", body, 200, &record)
	call("owner", "POST", path+"/action", body, 409, nil)
	if record.CustomFields[fields[0].ID] != float64(9) || record.CustomFields[fields[1].ID] != float64(3) || record.CustomFields[flag.ID] != true || record.CustomFields[fields[2].ID] != float64(1) {
		t.Fatal(record)
	}
	f.store.db.QueryRow("SELECT count(*) FROM activity WHERE entity_id=? AND action='custom_fields_updated'", record.ID).Scan(&count)
	if count != 2 {
		t.Fatal(count)
	}
	var history string
	if err := f.store.db.QueryRow("SELECT details_json FROM activity WHERE entity_id=? AND reason=?", record.ID, "Действие: "+a.Label).Scan(&history); err != nil {
		t.Fatal(err)
	}
	var details struct{ Changes []pageActionChangePreview }
	if json.Unmarshal([]byte(history), &details) != nil || len(details.Changes) != 5 {
		t.Fatal(history)
	}
	// Rights remain checked before compound execution.
	var restricted Record
	call("owner", "POST", "/records", map[string]any{"type": "idea", "title": "Private", "collectionId": board.ID, "editPolicy": "owner_only"}, 201, &restricted)
	body["recordId"] = restricted.ID
	body["expectedUpdatedAt"] = restricted.UpdatedAt
	call("member", "POST", path+"/action", body, 403, nil)
	// All extra target/source IDs survive independent kit installation.
	var kit PageAppTemplate
	call("owner", "POST", path+"/template", map[string]any{"name": "Compound kit", "visibility": "private", "expectedRevision": 1}, 201, &kit)
	var copy WorkspacePage
	call("owner", "POST", "/page-app/templates/"+kit.ID+"/install", map[string]any{}, 201, &copy)
	var state PageAppState
	copyPath := "/workspace/pages/" + copy.ID + "/app"
	call("owner", "GET", copyPath, nil, 200, &state)
	b := state.Definition.Blocks[0]
	copied := b.Actions[0]
	if len(copied.Changes) != 4 || copied.FieldID == a.FieldID || copied.Changes[0].SourceFieldID != copied.FieldID || copied.Changes[0].FieldID == a.Changes[0].FieldID || copied.Changes[1].FieldID == flag.ID {
		t.Fatal(copied)
	}
	if copied.Changes[3].FieldID == choice.ID || string(copied.Changes[3].Value) == string(selected) {
		t.Fatal("option binding not remapped", copied)
	}
	var own Record
	call("owner", "POST", "/records", map[string]any{"type": "idea", "title": "Own", "collectionId": b.CollectionID, "customFields": map[string]any{copied.FieldID: 0, copied.Changes[0].FieldID: 8, copied.Changes[1].FieldID: false, copied.Changes[2].FieldID: 0}}, 201, &own)
	body = map[string]any{"blockId": b.ID, "actionId": copied.ID, "recordId": own.ID, "expectedRevision": state.Revision, "expectedUpdatedAt": own.UpdatedAt, "expectedChangeCount": 5}
	call("owner", "POST", copyPath+"/action", body, 200, &preview)
	body["apply"] = true
	body["schemaHash"] = preview.SchemaHash
	call("owner", "POST", copyPath+"/action", body, 200, &own)
	var copiedOption string
	json.Unmarshal(copied.Changes[3].Value, &copiedOption)
	if own.CustomFields[copied.Changes[3].FieldID] != copiedOption {
		t.Fatal(own)
	}
	if own.CustomFields[copied.Changes[0].FieldID] != float64(0) || own.CustomFields[copied.Changes[1].FieldID] != true {
		t.Fatal(own)
	}
	// Reject duplicate targets, cross-board fields and more than eight changes.
	def.Blocks[0].Actions[0].Changes = append(a.Changes, PageActionChange{FieldID: a.FieldID, Value: json.RawMessage("0")})
	call("owner", "PUT", path, map[string]any{"definition": def, "expectedRevision": 1}, 400, nil)
	def.Blocks[0].Actions[0].Changes = []PageActionChange{{FieldID: copied.FieldID, Value: json.RawMessage("0")}}
	call("owner", "PUT", path, map[string]any{"definition": def, "expectedRevision": 1}, 400, nil)
	def.Blocks[0].Actions[0].Changes = make([]PageActionChange, 8)
	call("owner", "PUT", path, map[string]any{"definition": def, "expectedRevision": 1}, 400, nil)
}
