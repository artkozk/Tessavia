package app

import (
	"testing"
)

func TestCollectionDefaultsApplyOnlyToMissingNewValues(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(role, method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[role], method, f.url+"/api"+path, f.project.ID, body, status, out)
	}
	var board WorkspaceCollection
	call("owner", "POST", "/collections", map[string]any{"name": "Defaults"}, 201, &board)
	base := "/collections/" + board.ID
	for _, kind := range []string{"number", "checkbox", "multi_select"} {
		call("owner", "POST", base+"/fields", map[string]any{"name": kind, "fieldType": kind, "options": []string{"One", "Two"}}, 201, nil)
	}
	var schema schemaResponse
	call("owner", "GET", base+"/schema", nil, 200, &schema)
	fields := map[string]CollectionField{}
	for _, field := range schema.Fields {
		fields[field.FieldType] = field
	}
	num, check, multi := fields["number"], fields["checkbox"], fields["multi_select"]
	create := func(title string, values map[string]any, status int) Record {
		var out Record
		call("owner", "POST", "/records", map[string]any{"type": "idea", "title": title, "collectionId": board.ID, "customFields": values}, status, &out)
		return out
	}
	old := create("Old values", map[string]any{num.ID: 7, check.ID: true, multi.ID: []string{multi.Options[1].ID}}, 201)
	configure := func(field CollectionField, value any, role string, status int) CollectionField {
		var out CollectionField
		call(role, "PATCH", base+"/fields/"+field.ID, map[string]any{"name": field.Name, "required": field.Required, "showOnCard": true, "expectedUpdatedAt": field.UpdatedAt, "defaultValue": value}, status, &out)
		return out
	}
	configure(num, 0, "member", 403)
	call("owner", "PATCH", base+"/fields/"+num.ID, map[string]any{"name": num.Name, "defaultValue": 0}, 409, nil)
	var other WorkspaceCollection
	call("owner", "POST", "/collections", map[string]any{"name": "Other board"}, 201, &other)
	call("owner", "PATCH", "/collections/"+other.ID+"/fields/"+num.ID, map[string]any{"name": num.Name, "expectedUpdatedAt": num.UpdatedAt, "defaultValue": 0}, 404, nil)
	configure(num, "wrong", "owner", 400)
	updated := configure(num, 0, "owner", 200)
	configure(num, 4, "owner", 409)
	check = configure(check, false, "owner", 200)
	multi = configure(multi, []string{multi.Options[0].ID, multi.Options[0].ID}, "owner", 200)
	record := create("Missing fields", nil, 201)
	if record.CustomFields[num.ID] != float64(0) || record.CustomFields[check.ID] != false {
		t.Fatalf("false/zero defaults lost: %#v", record.CustomFields)
	}
	values := record.CustomFields[multi.ID].([]any)
	if len(values) != 1 || values[0] != multi.Options[0].ID {
		t.Fatal("choice default not normalized", values)
	}
	explicit := create("Explicit values", map[string]any{num.ID: nil, check.ID: true, multi.ID: []string{}}, 201)
	if _, ok := explicit.CustomFields[num.ID]; ok {
		t.Fatal("explicit null replaced by default")
	}
	if _, ok := explicit.CustomFields[multi.ID]; ok {
		t.Fatal("explicit empty choices replaced")
	}
	if explicit.CustomFields[check.ID] != true {
		t.Fatal("explicit true overwritten")
	}
	var before string
	if err := f.store.db.QueryRow(`SELECT value_json FROM record_field_values WHERE record_id=? AND field_id=?`, old.ID, num.ID).Scan(&before); err != nil || before != "7" {
		t.Fatal("old record overwritten", before, err)
	}
	updated = configure(updated, 5, "owner", 200)
	// Editing an old record does not backfill missing fields.
	call("owner", "PUT", "/records/"+explicit.ID+"/custom-fields", map[string]any{"expectedUpdatedAt": explicit.UpdatedAt, "values": map[string]any{num.ID: nil, check.ID: false, multi.ID: []string{}}}, 200, &explicit)
	if _, ok := explicit.CustomFields[num.ID]; ok {
		t.Fatal("editing backfilled a default")
	}
	updated.Required = true
	updated = configure(updated, 5, "owner", 200)
	create("Required default", nil, 201)
	create("Explicit required null", map[string]any{num.ID: nil}, 400)
	updated = configure(updated, nil, "owner", 200)
	if string(updated.DefaultValue) != "null" {
		t.Fatal("default not removed")
	}
	create("No required default", nil, 400)
	updated.Required = false
	updated = configure(updated, 3, "owner", 200)
	call("owner", "DELETE", base+"/fields/"+updated.ID, map[string]any{"expectedUpdatedAt": updated.UpdatedAt}, 204, nil)
	call("owner", "GET", base+"/schema", nil, 200, &schema)
	var archived CollectionField
	for _, field := range schema.Fields {
		if field.ID == updated.ID {
			archived = field
		}
	}
	if string(archived.DefaultValue) != "3" {
		t.Fatal("archive erased setting")
	}
	call("owner", "POST", base+"/fields/"+updated.ID+"/restore", map[string]any{"expectedUpdatedAt": archived.UpdatedAt}, 204, nil)
	restored := create("Restored default", nil, 201)
	if restored.CustomFields[num.ID] != float64(3) {
		t.Fatal("restored default lost")
	}
	// A default cannot refer to another field's choices, even in the same board.
	configure(multi, []string{"foreign-option"}, "owner", 400)
	var raw string
	if err := f.store.db.QueryRow(`SELECT value_json FROM collection_field_defaults WHERE field_id=?`, multi.ID).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	if string(raw) != "[\""+multi.Options[0].ID+"\"]" {
		t.Fatal("failed update damaged prior default")
	}
}
