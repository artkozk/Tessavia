package app

import "testing"

type schemaResponse struct {
	Fields []CollectionField `json:"fields"`
	Stages []CollectionStage `json:"stages"`
}

func TestCollectionSchemaArchiveRestorePreservesValuesAndLifecycle(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(role, method, path string, body any, status int, result any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[role], method, f.url+"/api"+path, f.project.ID, body, status, result)
	}
	var board WorkspaceCollection
	call("owner", "POST", "/collections", map[string]any{"name": "Schema"}, 201, &board)
	base := "/collections/" + board.ID
	var field CollectionField
	call("owner", "POST", base+"/fields", map[string]any{"name": "Required note", "fieldType": "text", "required": true}, 201, &field)
	var record Record
	call("owner", "POST", "/records", map[string]any{"type": "idea", "title": "Preserve idea", "collectionId": board.ID, "stageId": board.Stages[0].ID, "customFields": map[string]any{field.ID: "Original value"}}, 201, &record)
	var schema schemaResponse
	call("owner", "GET", base+"/schema", nil, 200, &schema)
	version := schema.Fields[0].UpdatedAt
	path := base + "/fields/" + field.ID
	call("owner", "PATCH", path, map[string]any{"name": "Required note", "required": true, "showOnCard": true, "expectedUpdatedAt": "stale"}, 409, nil)
	call("member", "DELETE", path, map[string]any{"expectedUpdatedAt": version}, 403, nil)
	call("owner", "DELETE", path, map[string]any{"expectedUpdatedAt": "stale"}, 409, nil)
	call("owner", "DELETE", path, map[string]any{"expectedUpdatedAt": version}, 204, nil)
	call("owner", "PUT", "/records/"+record.ID+"/custom-fields", map[string]any{"values": map[string]any{}}, 200, nil)
	var saved string
	if err := f.store.db.QueryRow(`SELECT value_json FROM record_field_values WHERE record_id=? AND field_id=?`, record.ID, field.ID).Scan(&saved); err != nil || saved != `"Original value"` {
		t.Fatalf("value lost: %q %v", saved, err)
	}
	var collections []WorkspaceCollection
	call("owner", "GET", "/collections", nil, 200, &collections)
	if len(collections[0].Fields) != 0 {
		t.Fatal("archived field still visible")
	}
	call("owner", "GET", base+"/schema", nil, 200, &schema)
	if schema.Fields[0].ArchivedAt == "" {
		t.Fatal("archive not available for restore")
	}
	call("owner", "POST", path+"/restore", map[string]any{"expectedUpdatedAt": schema.Fields[0].UpdatedAt}, 204, nil)
	call("owner", "GET", "/collections", nil, 200, &collections)
	if len(collections[0].Fields) != 1 || !collections[0].Fields[0].Required {
		t.Fatal("field not restored")
	}
	call("owner", "GET", base+"/schema", nil, 200, &schema)
	source, target := schema.Stages[0], schema.Stages[1]
	stagePath := base + "/stages/" + source.ID
	call("owner", "PATCH", stagePath, map[string]any{"name": source.Name, "category": source.Category, "colorKey": source.ColorKey, "expectedUpdatedAt": "stale"}, 409, nil)
	if source.RecordCount != 1 {
		t.Fatalf("count=%d", source.RecordCount)
	}
	call("owner", "DELETE", stagePath, map[string]any{"expectedUpdatedAt": source.UpdatedAt}, 409, nil)
	call("owner", "DELETE", stagePath, map[string]any{"expectedUpdatedAt": source.UpdatedAt, "moveToStageId": "foreign"}, 409, nil)
	call("owner", "DELETE", stagePath, map[string]any{"expectedUpdatedAt": source.UpdatedAt, "moveToStageId": target.ID}, 204, nil)
	var stage, status, kind string
	if err := f.store.db.QueryRow(`SELECT stage_id,status,type FROM records WHERE id=?`, record.ID).Scan(&stage, &status, &kind); err != nil {
		t.Fatal(err)
	}
	if stage != target.ID || status != record.Status || kind != record.Type {
		t.Fatalf("converted record: %s/%s/%s", stage, status, kind)
	}
	var historyType, historyWorkspace string
	if err := f.store.db.QueryRow(`SELECT entity_type,workspace_id FROM activity WHERE entity_id=? AND action='collection_stage_relocated'`, record.ID).Scan(&historyType, &historyWorkspace); err != nil || historyType != record.Type || historyWorkspace != f.project.ID {
		t.Fatalf("relocation missing from typed team history: %s/%s %v", historyType, historyWorkspace, err)
	}
	call("owner", "GET", base+"/schema", nil, 200, &schema)
	for _, item := range schema.Stages {
		if item.ID == source.ID {
			source = item
		}
	}
	call("owner", "POST", stagePath+"/restore", map[string]any{"expectedUpdatedAt": source.UpdatedAt}, 204, nil)
	if err := f.store.db.QueryRow(`SELECT stage_id FROM records WHERE id=?`, record.ID).Scan(&stage); err != nil || stage != target.ID {
		t.Fatal("restore moved records back")
	}
	call("owner", "GET", base+"/schema", nil, 200, &schema)
	for _, item := range schema.Stages {
		if item.ID != target.ID {
			call("owner", "DELETE", base+"/stages/"+item.ID, map[string]any{"expectedUpdatedAt": item.UpdatedAt}, 204, nil)
		}
	}
	call("owner", "DELETE", base+"/stages/"+target.ID, map[string]any{"expectedUpdatedAt": target.UpdatedAt}, 409, nil)
}

func TestCollectionSchemaOrderChecksScopeVersionsAndExactMembership(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(method, path string, body any, status int, result any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients["owner"], method, f.url+"/api"+path, f.project.ID, body, status, result)
	}
	var board WorkspaceCollection
	call("POST", "/collections", map[string]any{"name": "Order"}, 201, &board)
	base := "/collections/" + board.ID
	call("POST", base+"/fields", map[string]any{"name": "A", "fieldType": "text"}, 201, nil)
	call("POST", base+"/fields", map[string]any{"name": "B", "fieldType": "number"}, 201, nil)
	var schema schemaResponse
	call("GET", base+"/schema", nil, 200, &schema)
	a, b := schema.Fields[0], schema.Fields[1]
	versions := map[string]string{a.ID: a.UpdatedAt, b.ID: b.UpdatedAt}
	payload := map[string]any{"kind": "fields", "ids": []string{b.ID, a.ID}, "versions": versions}
	requestWorkspaceJSON(t, f.clients["member"], "PUT", f.url+"/api"+base+"/schema-order", f.project.ID, payload, 403, nil)
	call("PUT", base+"/schema-order", map[string]any{"kind": "fields", "ids": []string{a.ID, a.ID}, "versions": versions}, 409, nil)
	call("PUT", base+"/schema-order", payload, 204, nil)
	call("PUT", base+"/schema-order", payload, 409, nil)
	call("GET", base+"/schema", nil, 200, &schema)
	if schema.Fields[0].ID != b.ID || schema.Fields[1].ID != a.ID {
		t.Fatal("order not persisted")
	}
	var other Workspace
	call("POST", "/workspaces", map[string]any{"name": "Other"}, 201, &other)
	requestWorkspaceJSON(t, f.clients["owner"], "GET", f.url+"/api"+base+"/schema", other.ID, nil, 404, nil)
	requestWorkspaceJSON(t, f.clients["owner"], "DELETE", f.url+"/api"+base+"/fields/"+a.ID, other.ID, map[string]any{"expectedUpdatedAt": schema.Fields[1].UpdatedAt}, 404, nil)
	ids := []string{}
	stageVersions := map[string]string{}
	for i := len(schema.Stages) - 1; i >= 0; i-- {
		ids = append(ids, schema.Stages[i].ID)
		stageVersions[schema.Stages[i].ID] = schema.Stages[i].UpdatedAt
	}
	call("PUT", base+"/schema-order", map[string]any{"kind": "stages", "ids": ids, "versions": stageVersions}, 204, nil)
	call("GET", base+"/schema", nil, 200, &schema)
	if schema.Stages[0].ID != ids[0] {
		t.Fatal("stage order not persisted")
	}
}
