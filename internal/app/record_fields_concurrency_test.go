package app

import "testing"

func TestRecordFieldEditsRejectStaleAndMissingVersions(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients["owner"], method, f.url+"/api"+path, f.project.ID, body, status, out)
	}
	var board WorkspaceCollection
	call("POST", "/collections", map[string]any{"name": "Concurrent fields"}, 201, &board)
	var a, b CollectionField
	call("POST", "/collections/"+board.ID+"/fields", map[string]any{"name": "Hours", "fieldType": "number"}, 201, &a)
	call("POST", "/collections/"+board.ID+"/fields", map[string]any{"name": "Note", "fieldType": "text"}, 201, &b)
	var record Record
	call("POST", "/records", map[string]any{"type": "idea", "title": "Shared form", "collectionId": board.ID, "customFields": map[string]any{a.ID: 1, b.ID: "original"}}, 201, &record)
	path := "/records/" + record.ID + "/custom-fields"
	old := record.UpdatedAt
	call("PUT", path, map[string]any{"values": map[string]any{a.ID: 7}}, 409, nil)
	call("PUT", path, map[string]any{"expectedUpdatedAt": old, "values": map[string]any{a.ID: 3}}, 200, &record)
	current := record.UpdatedAt
	call("PUT", path, map[string]any{"expectedUpdatedAt": old, "values": map[string]any{a.ID: 7, b.ID: "stale"}}, 409, nil)
	var detail struct {
		Record Record `json:"record"`
	}
	call("GET", "/records/"+record.ID, nil, 200, &detail)
	if detail.Record.CustomFields[a.ID] != float64(3) || detail.Record.CustomFields[b.ID] != "original" || detail.Record.UpdatedAt != current {
		t.Fatal("stale update changed record", detail.Record)
	}
	// Validation failures must also preserve both values and the version.
	call("PUT", path, map[string]any{"expectedUpdatedAt": current, "values": map[string]any{a.ID: "not a number", b.ID: "invalid attempt"}}, 400, nil)
	call("GET", "/records/"+record.ID, nil, 200, &detail)
	if detail.Record.UpdatedAt != current || detail.Record.CustomFields[b.ID] != "original" {
		t.Fatal("failed validation partially saved")
	}
	call("PUT", path, map[string]any{"expectedUpdatedAt": current, "values": map[string]any{b.ID: "reviewed"}}, 200, &record)
	if record.CustomFields[a.ID] != float64(3) || record.CustomFields[b.ID] != "reviewed" {
		t.Fatal("reviewed partial update lost other editor value")
	}
}
