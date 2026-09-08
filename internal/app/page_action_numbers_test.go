package app

import (
	"encoding/json"
	"testing"
)

func TestPageActionNumberResults(t *testing.T) {
	for _, c := range []struct {
		current       any
		delta, result string
	}{
		{float64(0), "1", "1"}, {float64(3), "-1", "2"}, {0.1, "0.2", "0.3"}, {float64(3), "0", "3"},
		{nil, "1", ""}, {"2", "1", ""}, {false, "1", ""}, {float64(1), "null", ""},
		{float64(actionNumberLimit), "1", ""}, {float64(1e16), "-1", ""}, {float64(1), "1e-100", ""},
	} {
		a := PageRecordAction{Operation: "add", FieldID: "f", Value: json.RawMessage(c.delta)}
		value, err := resolvePageActionValue(a, Record{CustomFields: map[string]any{"f": c.current}})
		if c.result == "" {
			if err == nil {
				t.Errorf("unexpected result %s for %+v", value, c)
			}
			continue
		}
		if err != nil || string(value) != c.result {
			t.Errorf("%+v got %s %v", c, value, err)
		}
	}
	for _, c := range []struct {
		operation, kind, value string
		valid                  bool
	}{
		{"add", "number", "1", true}, {"add", "money", "-0.5", true}, {"add", "text", "1", false},
		{"execute", "number", "1", false}, {"add", "number", "null", false}, {"add", "number", "1e300", false},
	} {
		err := validateActionOperation(PageRecordAction{Operation: c.operation, Value: json.RawMessage(c.value)}, CollectionField{FieldType: c.kind})
		if (err == nil) != c.valid {
			t.Errorf("validation %+v: %v", c, err)
		}
	}
}

func TestPageActionIncrementVersionsConditionAndKit(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients["owner"], method, f.url+"/api"+path, f.project.ID, body, status, out)
	}
	var board WorkspaceCollection
	call("POST", "/collections", map[string]any{"name": "Reading counter", "defaultRecordType": "idea"}, 201, &board)
	var count CollectionField
	call("POST", "/collections/"+board.ID+"/fields", map[string]any{"name": "Chapters", "fieldType": "number"}, 201, &count)
	var schema schemaResponse
	call("GET", "/collections/"+board.ID+"/schema", nil, 200, &schema)
	for _, field := range schema.Fields {
		if field.ID == count.ID {
			count = field
		}
	}
	call("PATCH", "/collections/"+board.ID+"/fields/"+count.ID, map[string]any{"name": "Chapters", "defaultValue": 0, "expectedUpdatedAt": count.UpdatedAt}, 200, nil)
	var page WorkspacePage
	call("POST", "/workspace/pages", map[string]any{"name": "Reading log"}, 201, &page)
	path := "/workspace/pages/" + page.ID + "/app"
	action := PageRecordAction{ID: "chapter", Label: "Read one chapter", FieldID: count.ID, Operation: "add", Value: json.RawMessage("1"), Condition: &PageActionCondition{FieldID: count.ID, Operator: "lt", Value: json.RawMessage("2")}}
	def := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "list", Kind: "records", CollectionID: board.ID, Width: 12, Actions: []PageRecordAction{action}}}}
	call("PUT", path, map[string]any{"expectedRevision": 0, "definition": def}, 200, nil)
	var record Record
	call("POST", "/records", map[string]any{"type": "idea", "title": "Book", "collectionId": board.ID}, 201, &record)
	body := map[string]any{"blockId": "list", "actionId": "chapter", "recordId": record.ID, "expectedRevision": 1, "expectedUpdatedAt": record.UpdatedAt}
	var preview pageActionPreview
	call("POST", path+"/action", body, 200, &preview)
	if string(preview.After) != "1" || !preview.Allowed {
		t.Fatal(preview)
	}
	body["apply"] = true
	body["schemaHash"] = preview.SchemaHash
	call("POST", path+"/action", body, 200, &record)
	call("POST", path+"/action", body, 409, nil) // A repeated confirmation never increments twice.
	if record.CustomFields[count.ID] != float64(1) {
		t.Fatal(record)
	}
	body["expectedUpdatedAt"] = record.UpdatedAt
	body["apply"] = false
	call("POST", path+"/action", body, 200, &preview)
	if string(preview.After) != "2" {
		t.Fatal(preview)
	}
	body["apply"] = true
	body["schemaHash"] = preview.SchemaHash
	call("POST", path+"/action", body, 200, &record)
	body["expectedUpdatedAt"] = record.UpdatedAt
	call("POST", path+"/action", body, 409, nil) // Condition caps the count.
	var history int
	if err := f.store.db.QueryRow("SELECT count(*) FROM activity WHERE entity_id=? AND action='custom_fields_updated'", record.ID).Scan(&history); err != nil || history != 2 {
		t.Fatal(history, err)
	}
	var kit PageAppTemplate
	call("POST", path+"/template", map[string]any{"name": "Counter kit", "visibility": "private", "expectedRevision": 1}, 201, &kit)
	var copy WorkspacePage
	call("POST", "/page-app/templates/"+kit.ID+"/install", map[string]any{}, 201, &copy)
	copyPath := "/workspace/pages/" + copy.ID + "/app"
	var copied PageAppState
	call("GET", copyPath, nil, 200, &copied)
	b := copied.Definition.Blocks[0]
	a := b.Actions[0]
	if a.Operation != "add" || a.FieldID == count.ID || a.Condition.FieldID != a.FieldID {
		t.Fatal(a)
	}
	var own Record
	call("POST", "/records", map[string]any{"type": "idea", "title": "Own book", "collectionId": b.CollectionID}, 201, &own)
	body = map[string]any{"blockId": b.ID, "actionId": a.ID, "recordId": own.ID, "expectedRevision": copied.Revision, "expectedUpdatedAt": own.UpdatedAt}
	call("POST", copyPath+"/action", body, 200, &preview)
	body["apply"] = true
	body["schemaHash"] = preview.SchemaHash
	call("POST", copyPath+"/action", body, 200, &own)
	if own.CustomFields[a.FieldID] != float64(1) || record.CustomFields[count.ID] != float64(2) {
		t.Fatal(own, record)
	}
	var emptyRecord Record
	call("POST", "/records", map[string]any{"type": "idea", "title": "Empty counter", "collectionId": board.ID, "customFields": map[string]any{count.ID: nil}}, 201, &emptyRecord)
	body = map[string]any{"blockId": "list", "actionId": "chapter", "recordId": emptyRecord.ID, "expectedRevision": 1, "expectedUpdatedAt": emptyRecord.UpdatedAt}
	call("POST", path+"/action", body, 409, nil)
	body["apply"] = true
	body["schemaHash"] = preview.SchemaHash
	call("POST", path+"/action", body, 409, nil)
	if err := f.store.db.QueryRow("SELECT count(*) FROM activity WHERE entity_id=? AND action='custom_fields_updated'", emptyRecord.ID).Scan(&history); err != nil || history != 0 {
		t.Fatal(history, err)
	}
	def.Blocks[0].Actions[0].Operation = "execute"
	call("PUT", path, map[string]any{"expectedRevision": 1, "definition": def}, 400, nil)
}
