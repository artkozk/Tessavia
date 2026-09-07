package app

import "testing"

func TestCollectionOptionsRenameAppendPreserveValuesAndRejectForeignOrStale(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(role, method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[role], method, f.url+"/api"+path, f.project.ID, body, status, out)
	}
	var board WorkspaceCollection
	call("owner", "POST", "/collections", map[string]any{"name": "Flexible process"}, 201, &board)
	base := "/collections/" + board.ID
	var field CollectionField
	call("owner", "POST", base+"/fields", map[string]any{"name": "Channels", "fieldType": "multi_select", "options": []string{"Site", "Referral"}}, 201, &field)
	var schema schemaResponse
	call("owner", "GET", base+"/schema", nil, 200, &schema)
	field = schema.Fields[0]
	var record Record
	call("owner", "POST", "/records", map[string]any{"type": "idea", "title": "Preserve selected channel", "collectionId": board.ID, "stageId": board.Stages[0].ID, "customFields": map[string]any{field.ID: []string{field.Options[0].ID}}}, 201, &record)
	var oldValues string
	if err := f.store.db.QueryRow(`SELECT value_json FROM record_field_values WHERE record_id=? AND field_id=?`, record.ID, field.ID).Scan(&oldValues); err != nil {
		t.Fatal(err)
	}
	options := []map[string]string{{"id": field.Options[0].ID, "name": "Referral"}, {"id": field.Options[1].ID, "name": "Site"}, {"name": "Partner"}}
	body := map[string]any{"name": field.Name, "required": false, "showOnCard": true, "expectedUpdatedAt": field.UpdatedAt, "options": options}
	path := base + "/fields/" + field.ID
	call("member", "PATCH", path, body, 403, nil)
	var updated CollectionField
	call("owner", "PATCH", path, body, 200, &updated)
	if len(updated.Options) != 3 || updated.Options[0].ID != field.Options[0].ID || updated.Options[0].Name != "Referral" {
		t.Fatal("option identity lost")
	}
	var saved string
	if err := f.store.db.QueryRow(`SELECT value_json FROM record_field_values WHERE record_id=? AND field_id=?`, record.ID, field.ID).Scan(&saved); err != nil || saved != oldValues {
		t.Fatal("record values rewritten")
	}
	call("owner", "PATCH", path, body, 409, nil)
	body["expectedUpdatedAt"] = updated.UpdatedAt
	body["options"] = []map[string]string{{"id": "foreign", "name": "Foreign"}}
	call("owner", "PATCH", path, body, 400, nil)
	body["options"] = []map[string]string{{"id": updated.Options[0].ID, "name": "Only one"}}
	call("owner", "PATCH", path, body, 400, nil)
	call("owner", "GET", base+"/schema", nil, 200, &schema)
	if schema.Fields[0].UpdatedAt != updated.UpdatedAt || len(schema.Fields[0].Options) != 3 {
		t.Fatal("failed update mutated schema")
	}
	body["options"] = []map[string]string{{"id": updated.Options[0].ID, "name": "Same"}, {"id": updated.Options[1].ID, "name": "Same"}, {"id": updated.Options[2].ID, "name": "Partner"}}
	call("owner", "PATCH", path, body, 400, nil)
}
