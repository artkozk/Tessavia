package app

import (
	"encoding/json"
	"os"
	"testing"
)

func TestActionConditionBrowserServerParity(t *testing.T) {
	raw, err := os.ReadFile("../../web/page-action-condition-cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Kind     string
		Operator string
		Current  any
		Value    json.RawMessage
		Expected bool
	}
	if err = json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	for i, c := range cases {
		condition := &PageActionCondition{FieldID: "field", Operator: c.Operator, Value: c.Value}
		got := actionConditionMatches(condition, Record{CustomFields: map[string]any{"field": c.Current}}, []CollectionField{{ID: "field", FieldType: c.Kind}})
		if got != c.Expected {
			t.Errorf("case %d: got %v want %v", i, got, c.Expected)
		}
	}
}

func TestPageActionConditionsEnforceAndInstallIndependentBindings(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients["owner"], method, f.url+"/api"+path, f.project.ID, body, status, out)
	}
	var board WorkspaceCollection
	call("POST", "/collections", map[string]any{"name": "Conditional requests", "defaultRecordType": "idea"}, 201, &board)
	var hours, channel CollectionField
	call("POST", "/collections/"+board.ID+"/fields", map[string]any{"name": "Hours", "fieldType": "number"}, 201, &hours)
	call("POST", "/collections/"+board.ID+"/fields", map[string]any{"name": "Channel", "fieldType": "select", "options": []string{"Mail", "Chat"}}, 201, &channel)
	var schema schemaResponse
	call("GET", "/collections/"+board.ID+"/schema", nil, 200, &schema)
	for _, field := range schema.Fields {
		if field.ID == channel.ID {
			channel = field
		}
	}
	var page WorkspacePage
	call("POST", "/workspace/pages", map[string]any{"name": "Conditional workflow"}, 201, &page)
	path := "/workspace/pages/" + page.ID + "/app"
	condition := &PageActionCondition{FieldID: hours.ID, Operator: "gt", Value: json.RawMessage("0")}
	def := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "list", Kind: "records", CollectionID: board.ID, Width: 12, Actions: []PageRecordAction{{ID: "reset", Label: "Reset positive estimate", FieldID: hours.ID, Value: json.RawMessage("0"), Condition: condition}}}}}
	call("PUT", path, map[string]any{"expectedRevision": 0, "definition": def}, 200, nil)
	var record Record
	call("POST", "/records", map[string]any{"type": "idea", "title": "Request", "collectionId": board.ID, "customFields": map[string]any{hours.ID: 2, channel.ID: channel.Options[0].ID}}, 201, &record)
	body := map[string]any{"blockId": "list", "actionId": "reset", "recordId": record.ID, "expectedRevision": 1, "expectedUpdatedAt": record.UpdatedAt}
	var preview pageActionPreview
	call("POST", path+"/action", body, 200, &preview)
	if !preview.Allowed {
		t.Fatal("positive estimate blocked")
	}
	body["apply"] = true
	body["schemaHash"] = preview.SchemaHash
	call("POST", path+"/action", body, 200, &record)
	body["expectedUpdatedAt"] = record.UpdatedAt
	body["apply"] = false
	call("POST", path+"/action", body, 200, &preview)
	if preview.Allowed || preview.ConditionReason == "" {
		t.Fatal("zero was allowed", preview)
	}
	body["apply"] = true
	body["schemaHash"] = preview.SchemaHash
	call("POST", path+"/action", body, 409, nil)
	var count int
	if err := f.store.db.QueryRow("SELECT count(*) FROM activity WHERE entity_id=? AND action='custom_fields_updated'", record.ID).Scan(&count); err != nil || count != 1 {
		t.Fatal("blocked action wrote history", err, count)
	}
	// The condition field contributes to the schema hash, even when it differs from the target field.
	condition.FieldID = channel.ID
	condition.Operator = "eq"
	condition.Value, _ = json.Marshal(channel.Options[0].ID)
	call("PUT", path, map[string]any{"expectedRevision": 1, "definition": def}, 200, nil)
	body["expectedRevision"] = 2
	body["apply"] = false
	call("POST", path+"/action", body, 200, &preview)
	if !preview.Allowed {
		t.Fatal(preview)
	}
	call("PATCH", "/collections/"+board.ID+"/fields/"+channel.ID, map[string]any{"name": "Renamed channel", "expectedUpdatedAt": channel.UpdatedAt}, 200, nil)
	body["apply"] = true
	body["schemaHash"] = preview.SchemaHash
	call("POST", path+"/action", body, 409, nil)
	var kit PageAppTemplate
	call("POST", path+"/template", map[string]any{"name": "Conditional kit", "visibility": "private", "expectedRevision": 2}, 201, &kit)
	var installed WorkspacePage
	call("POST", "/page-app/templates/"+kit.ID+"/install", map[string]any{}, 201, &installed)
	var app PageAppState
	copyPath := "/workspace/pages/" + installed.ID + "/app"
	call("GET", copyPath, nil, 200, &app)
	block := app.Definition.Blocks[0]
	action := block.Actions[0]
	c := action.Condition
	if c == nil || c.FieldID == channel.ID || string(c.Value) == string(condition.Value) || action.FieldID == hours.ID {
		t.Fatal("condition bindings not remapped", action)
	}
	var wanted any
	json.Unmarshal(c.Value, &wanted)
	var copyRecord Record
	call("POST", "/records", map[string]any{"type": "idea", "title": "Copy request", "collectionId": block.CollectionID, "customFields": map[string]any{action.FieldID: 5, c.FieldID: wanted}}, 201, &copyRecord)
	body = map[string]any{"blockId": block.ID, "actionId": action.ID, "recordId": copyRecord.ID, "expectedRevision": app.Revision, "expectedUpdatedAt": copyRecord.UpdatedAt}
	call("POST", copyPath+"/action", body, 200, &preview)
	if !preview.Allowed {
		t.Fatal("copy condition does not work")
	}
	body["apply"] = true
	body["schemaHash"] = preview.SchemaHash
	call("POST", copyPath+"/action", body, 200, &copyRecord)
	if copyRecord.CustomFields[action.FieldID] != float64(0) {
		t.Fatal(copyRecord)
	}
	// Missing fields and invalid numeric comparisons fail at configuration time.
	condition.Operator = "gt"
	call("PUT", path, map[string]any{"expectedRevision": 2, "definition": def}, 400, nil)
	condition.Operator = "eq"
	condition.FieldID = "missing"
	call("PUT", path, map[string]any{"expectedRevision": 2, "definition": def}, 400, nil)
	def.Blocks[0].Actions[0].Condition = nil
	call("PUT", path, map[string]any{"expectedRevision": 2, "definition": def}, 200, nil)
	body = map[string]any{"blockId": "list", "actionId": "reset", "recordId": record.ID, "expectedRevision": 3, "expectedUpdatedAt": record.UpdatedAt}
	call("POST", path+"/action", body, 200, &preview)
	if !preview.Allowed {
		t.Fatal("removed condition still blocks")
	}
}
