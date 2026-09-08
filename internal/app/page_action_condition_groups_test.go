package app

import (
	"encoding/json"
	"testing"
)

func TestActionConditionGroupsVersionsAndPortableKit(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(method, path string, body any, status int, out any) {
		t.Helper()
		if r, ok := out.(*Record); ok {
			*r = Record{}
		}
		if p, ok := out.(*pageActionPreview); ok {
			*p = pageActionPreview{}
		}
		requestWorkspaceJSON(t, f.clients["owner"], method, f.url+"/api"+path, f.project.ID, body, status, out)
	}
	var board WorkspaceCollection
	call("POST", "/collections", map[string]any{"name": "Condition groups", "defaultRecordType": "idea"}, 201, &board)
	var number, flag, choice CollectionField
	call("POST", "/collections/"+board.ID+"/fields", map[string]any{"name": "Estimate", "fieldType": "number"}, 201, &number)
	call("POST", "/collections/"+board.ID+"/fields", map[string]any{"name": "Ready", "fieldType": "checkbox"}, 201, &flag)
	call("POST", "/collections/"+board.ID+"/fields", map[string]any{"name": "Channel", "fieldType": "select", "options": []string{"Mail", "Site"}}, 201, &choice)
	var schema schemaResponse
	call("GET", "/collections/"+board.ID+"/schema", nil, 200, &schema)
	for _, field := range schema.Fields {
		if field.ID == choice.ID {
			choice = field
		}
	}
	chosen, _ := json.Marshal(choice.Options[1].ID)
	group := &PageActionCondition{Mode: "all", Conditions: []PageActionCondition{{FieldID: number.ID, Operator: "gt", Value: json.RawMessage("0")}, {FieldID: flag.ID, Operator: "eq", Value: json.RawMessage("false")}, {FieldID: choice.ID, Operator: "eq", Value: chosen}}}
	var page WorkspacePage
	call("POST", "/workspace/pages", map[string]any{"name": "Review"}, 201, &page)
	path := "/workspace/pages/" + page.ID + "/app"
	def := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "list", Kind: "records", CollectionID: board.ID, Actions: []PageRecordAction{{ID: "accept", Label: "Accept", FieldID: number.ID, Value: json.RawMessage("9"), Condition: group}}}}}
	call("PUT", path, map[string]any{"definition": def, "expectedRevision": 0}, 200, nil)
	var record Record
	call("POST", "/records", map[string]any{"type": "idea", "title": "Request", "collectionId": board.ID, "customFields": map[string]any{number.ID: 0, flag.ID: false, choice.ID: choice.Options[0].ID}}, 201, &record)
	body := map[string]any{"blockId": "list", "actionId": "accept", "recordId": record.ID, "expectedRevision": 1, "expectedUpdatedAt": record.UpdatedAt}
	var preview pageActionPreview
	call("POST", path+"/action", body, 200, &preview)
	if preview.Allowed || len(preview.ConditionResults) != 3 || preview.ConditionResults[0] || !preview.ConditionResults[1] || preview.ConditionResults[2] {
		t.Fatal(preview)
	}
	body["apply"] = true
	body["expectedConditionCount"] = 3
	body["schemaHash"] = preview.SchemaHash
	call("POST", path+"/action", body, 409, nil)
	group.Mode = "any"
	call("PUT", path, map[string]any{"definition": def, "expectedRevision": 1}, 200, nil)
	body["expectedRevision"] = 2
	body["apply"] = false
	call("POST", path+"/action", body, 200, &preview)
	if !preview.Allowed {
		t.Fatal(preview)
	}
	// The last condition schema participates even when another OR branch is already true.
	call("PATCH", "/collections/"+board.ID+"/fields/"+choice.ID, map[string]any{"name": "Updated channel", "expectedUpdatedAt": choice.UpdatedAt}, 200, nil)
	body["apply"] = true
	body["schemaHash"] = preview.SchemaHash
	call("POST", path+"/action", body, 409, nil)
	body["apply"] = false
	call("POST", path+"/action", body, 200, &preview)
	body["apply"] = true
	body["schemaHash"] = preview.SchemaHash
	delete(body, "expectedConditionCount")
	call("POST", path+"/action", body, 409, nil)
	body["expectedConditionCount"] = 3
	call("POST", path+"/action", body, 200, &record)
	call("POST", path+"/action", body, 409, nil)
	if record.CustomFields[number.ID] != float64(9) {
		t.Fatal(record)
	}
	var history int
	f.store.db.QueryRow("SELECT count(*) FROM activity WHERE entity_id=? AND action='custom_fields_updated'", record.ID).Scan(&history)
	if history != 1 {
		t.Fatal(history)
	}
	// A fresh preview after another editor changes the only true branch must block execution.
	call("PUT", "/records/"+record.ID+"/custom-fields", map[string]any{"expectedUpdatedAt": record.UpdatedAt, "values": map[string]any{number.ID: 0, flag.ID: true}}, 200, &record)
	body["expectedUpdatedAt"] = record.UpdatedAt
	body["apply"] = false
	call("POST", path+"/action", body, 200, &preview)
	if preview.Allowed {
		t.Fatal(preview)
	}
	body["apply"] = true
	body["schemaHash"] = preview.SchemaHash
	call("POST", path+"/action", body, 409, nil)
	var kit PageAppTemplate
	call("POST", path+"/template", map[string]any{"name": "Conditional kit", "visibility": "private", "expectedRevision": 2}, 201, &kit)
	var copy WorkspacePage
	call("POST", "/page-app/templates/"+kit.ID+"/install", map[string]any{}, 201, &copy)
	var state PageAppState
	copyPath := "/workspace/pages/" + copy.ID + "/app"
	call("GET", copyPath, nil, 200, &state)
	b := state.Definition.Blocks[0]
	a := b.Actions[0]
	c := a.Condition
	if c.Mode != "any" || len(c.Conditions) != 3 || c.Conditions[0].FieldID != a.FieldID || c.Conditions[1].FieldID == flag.ID || c.Conditions[2].FieldID == choice.ID || string(c.Conditions[2].Value) == string(chosen) {
		t.Fatal(c)
	}
	var own Record
	call("POST", "/records", map[string]any{"type": "idea", "title": "Own request", "collectionId": b.CollectionID, "customFields": map[string]any{a.FieldID: 0, c.Conditions[1].FieldID: false}}, 201, &own)
	body = map[string]any{"blockId": b.ID, "actionId": a.ID, "recordId": own.ID, "expectedRevision": state.Revision, "expectedUpdatedAt": own.UpdatedAt, "expectedConditionCount": 3}
	call("POST", copyPath+"/action", body, 200, &preview)
	if !preview.Allowed || len(preview.ConditionFields) != 3 {
		t.Fatal(preview)
	}
	body["apply"] = true
	body["schemaHash"] = preview.SchemaHash
	call("POST", copyPath+"/action", body, 200, &own)
	// Removing all restrictions is explicit nil and restores legacy unconditional semantics.
	def.Blocks[0].Actions[0].Condition = nil
	call("PUT", path, map[string]any{"definition": def, "expectedRevision": 2}, 200, nil)
	for _, bad := range []*PageActionCondition{{Mode: "all"}, {Mode: "unknown", Conditions: group.Conditions}, {Mode: "all", FieldID: number.ID, Conditions: group.Conditions}, {Mode: "all", Conditions: []PageActionCondition{{Mode: "any", Conditions: group.Conditions}}}, {Mode: "any", Conditions: []PageActionCondition{{FieldID: a.FieldID, Operator: "empty"}}}, {Mode: "any", Conditions: make([]PageActionCondition, 9)}} {
		def.Blocks[0].Actions[0].Condition = bad
		call("PUT", path, map[string]any{"definition": def, "expectedRevision": 3}, 400, nil)
	}
}
