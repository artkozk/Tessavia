package app

import (
	"encoding/json"
	"testing"
)

func TestActionCopyTypesAndValues(t *testing.T) {
	for _, c := range []struct {
		source, target string
		ok             bool
	}{{"number", "money", true}, {"text", "long_text", true}, {"date", "date", true}, {"checkbox", "checkbox", true}, {"email", "email", true}, {"url", "url", true}, {"phone", "phone", true}, {"datetime", "datetime", true}, {"number", "text", false}, {"date", "datetime", false}, {"select", "select", false}, {"multi_select", "multi_select", false}, {"user", "user", false}, {"relation", "relation", false}} {
		if compatibleActionFields(CollectionField{ID: "s", FieldType: c.source}, CollectionField{ID: "t", FieldType: c.target}) != c.ok {
			t.Fatal(c)
		}
	}
	if compatibleActionFields(CollectionField{ID: "s", FieldType: "number"}, CollectionField{ID: "s", FieldType: "number"}) {
		t.Fatal("self-copy accepted")
	}
	for _, v := range []any{nil, float64(0), false, "", "2026-09-08", "Текст"} {
		raw, err := resolvePageActionValue(PageRecordAction{Operation: "copy", SourceFieldID: "s"}, Record{CustomFields: map[string]any{"s": v}})
		want, _ := json.Marshal(v)
		if err != nil || string(raw) != string(want) {
			t.Fatal(v, string(raw), err)
		}
	}
	for _, a := range []PageRecordAction{{ID: "a", Label: "Copy", FieldID: "target", Operation: "copy", SourceFieldID: "target"}, {ID: "a", Label: "Copy", FieldID: "target", Operation: "copy", SourceFieldID: "s", Value: json.RawMessage("4")}, {ID: "a", Label: "Copy", FieldID: "target", Operation: "set", SourceFieldID: "s", Value: json.RawMessage("4")}} {
		if validatePageRecordActions(PageAppBlock{Kind: "records", Actions: []PageRecordAction{a}}) == nil {
			t.Fatal("bad binding accepted", a)
		}
	}
}

func TestActionCopySourceVersionsEmptyRightsAndKit(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(actor, method, path string, body any, status int, out any) {
		t.Helper()
		if record, ok := out.(*Record); ok {
			*record = Record{}
		}
		if preview, ok := out.(*pageActionPreview); ok {
			*preview = pageActionPreview{}
		}
		requestWorkspaceJSON(t, f.clients[actor], method, f.url+"/api"+path, f.project.ID, body, status, out)
	}
	var board WorkspaceCollection
	call("owner", "POST", "/collections", map[string]any{"name": "Copy values", "defaultRecordType": "idea"}, 201, &board)
	var source, target CollectionField
	call("owner", "POST", "/collections/"+board.ID+"/fields", map[string]any{"name": "Estimate", "fieldType": "number"}, 201, &source)
	call("owner", "POST", "/collections/"+board.ID+"/fields", map[string]any{"name": "Confirmed", "fieldType": "money", "required": true}, 201, &target)
	var page WorkspacePage
	call("owner", "POST", "/workspace/pages", map[string]any{"name": "Approval"}, 201, &page)
	path := "/workspace/pages/" + page.ID + "/app"
	def := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "list", Kind: "records", CollectionID: board.ID, Actions: []PageRecordAction{{ID: "copy", Label: "Accept estimate", FieldID: target.ID, SourceFieldID: source.ID, Operation: "copy"}}}}}
	call("owner", "PUT", path, map[string]any{"definition": def, "expectedRevision": 0}, 200, nil)
	var record Record
	call("owner", "POST", "/records", map[string]any{"type": "idea", "title": "Request", "collectionId": board.ID, "customFields": map[string]any{source.ID: 3, target.ID: 1}}, 201, &record)
	body := map[string]any{"blockId": "list", "actionId": "copy", "recordId": record.ID, "expectedRevision": 1, "expectedUpdatedAt": record.UpdatedAt}
	var preview pageActionPreview
	call("owner", "POST", path+"/action", body, 200, &preview)
	if string(preview.After) != "3" || preview.SourceField == nil || preview.SourceField.ID != source.ID || preview.SourceValue != float64(3) {
		t.Fatal(preview)
	}
	call("owner", "PUT", "/records/"+record.ID+"/custom-fields", map[string]any{"values": map[string]any{source.ID: 4, target.ID: 1}, "expectedUpdatedAt": record.UpdatedAt}, 200, &record)
	body["apply"] = true
	body["schemaHash"] = preview.SchemaHash
	call("owner", "POST", path+"/action", body, 409, nil)
	body["apply"] = false
	body["expectedUpdatedAt"] = record.UpdatedAt
	call("owner", "POST", path+"/action", body, 200, &preview)
	if string(preview.After) != "4" {
		t.Fatal(preview)
	}
	var schema schemaResponse
	call("owner", "GET", "/collections/"+board.ID+"/schema", nil, 200, &schema)
	for _, field := range schema.Fields {
		if field.ID == source.ID {
			source = field
		}
		if field.ID == target.ID {
			target = field
		}
	}
	call("owner", "PATCH", "/collections/"+board.ID+"/fields/"+source.ID, map[string]any{"name": "Latest estimate", "expectedUpdatedAt": source.UpdatedAt}, 200, nil)
	body["apply"] = true
	body["schemaHash"] = preview.SchemaHash
	call("owner", "POST", path+"/action", body, 409, nil)
	body["apply"] = false
	call("owner", "POST", path+"/action", body, 200, &preview)
	body["apply"] = true
	body["schemaHash"] = preview.SchemaHash
	call("owner", "POST", path+"/action", body, 200, &record)
	call("owner", "POST", path+"/action", body, 409, nil)
	if record.CustomFields[target.ID] != float64(4) || record.CustomFields[source.ID] != float64(4) {
		t.Fatal(record)
	}
	var count int
	f.store.db.QueryRow("SELECT count(*) FROM activity WHERE entity_id=? AND action='custom_fields_updated'", record.ID).Scan(&count)
	if count != 2 {
		t.Fatalf("expected one edit and one action, got %d", count)
	}
	var restricted Record
	call("owner", "POST", "/records", map[string]any{"type": "idea", "title": "Private edit", "collectionId": board.ID, "editPolicy": "owner_only", "customFields": map[string]any{source.ID: 3, target.ID: 1}}, 201, &restricted)
	body["recordId"] = restricted.ID
	body["expectedUpdatedAt"] = restricted.UpdatedAt
	body["apply"] = false
	call("member", "POST", path+"/action", body, 403, nil)
	var empty Record
	call("owner", "POST", "/records", map[string]any{"type": "idea", "title": "Empty estimate", "collectionId": board.ID, "customFields": map[string]any{target.ID: 1}}, 201, &empty)
	body["recordId"] = empty.ID
	body["expectedUpdatedAt"] = empty.UpdatedAt
	call("owner", "POST", path+"/action", body, 409, nil)
	call("owner", "PATCH", "/collections/"+board.ID+"/fields/"+target.ID, map[string]any{"name": "Confirmed", "required": false, "expectedUpdatedAt": target.UpdatedAt}, 200, nil)
	call("owner", "POST", path+"/action", body, 200, &preview)
	if string(preview.After) != "null" {
		t.Fatal(preview)
	}
	body["apply"] = true
	body["schemaHash"] = preview.SchemaHash
	call("owner", "POST", path+"/action", body, 200, &empty)
	if empty.CustomFields[target.ID] != nil {
		t.Fatal(empty)
	}
	var kit PageAppTemplate
	def.Blocks[0].Actions[0].Condition = &PageActionCondition{FieldID: source.ID, Operator: "gte", Value: json.RawMessage("0")}
	call("owner", "PUT", path, map[string]any{"definition": def, "expectedRevision": 1}, 200, nil)
	var negative Record
	call("owner", "POST", "/records", map[string]any{"type": "idea", "title": "Negative estimate", "collectionId": board.ID, "customFields": map[string]any{source.ID: -1, target.ID: 5}}, 201, &negative)
	body = map[string]any{"blockId": "list", "actionId": "copy", "recordId": negative.ID, "expectedRevision": 2, "expectedUpdatedAt": negative.UpdatedAt}
	call("owner", "POST", path+"/action", body, 200, &preview)
	if preview.Allowed {
		t.Fatal("copy bypassed its condition")
	}
	body["apply"] = true
	body["schemaHash"] = preview.SchemaHash
	call("owner", "POST", path+"/action", body, 409, nil)
	call("owner", "POST", path+"/template", map[string]any{"name": "Copy kit", "visibility": "private", "expectedRevision": 2}, 201, &kit)
	var copy WorkspacePage
	call("owner", "POST", "/page-app/templates/"+kit.ID+"/install", map[string]any{}, 201, &copy)
	var copied PageAppState
	copyPath := "/workspace/pages/" + copy.ID + "/app"
	call("owner", "GET", copyPath, nil, 200, &copied)
	b := copied.Definition.Blocks[0]
	a := b.Actions[0]
	if a.SourceFieldID == source.ID || a.FieldID == target.ID || a.SourceFieldID == a.FieldID || a.Operation != "copy" || a.Condition.FieldID != a.SourceFieldID {
		t.Fatal(a)
	}
	var own Record
	call("owner", "POST", "/records", map[string]any{"type": "idea", "title": "Own request", "collectionId": b.CollectionID, "customFields": map[string]any{a.SourceFieldID: 0, a.FieldID: 8}}, 201, &own)
	body = map[string]any{"blockId": b.ID, "actionId": a.ID, "recordId": own.ID, "expectedRevision": copied.Revision, "expectedUpdatedAt": own.UpdatedAt}
	call("owner", "POST", copyPath+"/action", body, 200, &preview)
	if string(preview.After) != "0" {
		t.Fatal(preview)
	}
	body["apply"] = true
	body["schemaHash"] = preview.SchemaHash
	call("owner", "POST", copyPath+"/action", body, 200, &own)
	if own.CustomFields[a.FieldID] != float64(0) {
		t.Fatal(own)
	}
	def.Blocks[0].Actions[0].SourceFieldID = a.SourceFieldID
	call("owner", "PUT", path, map[string]any{"definition": def, "expectedRevision": 2}, 400, nil)
}
