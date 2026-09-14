package app

import (
	"net/http"
	"reflect"
	"testing"
)

// Successful responses are deliberately discarded: the next request represents
// a recovered client which retained only its original body and operation key.
func TestPageComponentLateRecoveryPreservesCurrentPageAndAccess(t *testing.T) {
	f := newLifecycleFixture(t)
	actor := f.clients["admin"]
	workspace := f.project.ID
	call := func(t *testing.T, client *http.Client, method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, client, method, f.url+path, workspace, body, status, out)
	}
	exec := func(t *testing.T, query string, args ...any) {
		t.Helper()
		if _, err := f.store.db.Exec(query, args...); err != nil {
			t.Fatal(err)
		}
	}
	var page WorkspacePage
	call(t, actor, "POST", "/api/workspace/pages", map[string]any{"name": "Recovery target"}, 201, &page)
	var source WorkspaceCollection
	call(t, actor, "POST", "/api/collections", map[string]any{"name": "Original source", "defaultRecordType": "idea"}, 201, &source)
	sheet := sheetTestBlock()
	sheet.ParentID = "group"
	definition := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{
		{ID: "group", Kind: "group", Title: "Reusable group"},
		{ID: "tracker", Kind: "tracker", ParentID: "group", Items: []PageAppItem{{ID: "one", Label: "Read"}}},
		{ID: "records", Kind: "records", ParentID: "group", CollectionID: source.ID, Fields: []string{}},
		sheet,
	}}
	create := map[string]any{"name": "Recover exactly once", "description": "Original description", "rootBlockId": "group", "definition": definition, "clientRequestId": "component_recovery_create"}
	call(t, actor, "POST", "/api/page-app/components", create, 201, nil)
	var componentID string
	if err := f.store.db.QueryRow(`SELECT id FROM page_app_components WHERE owner_id=? AND request_id=?`, f.users["admin"].ID, create["clientRequestId"]).Scan(&componentID); err != nil {
		t.Fatal(err)
	}
	var originalComponent PageAppComponent
	call(t, actor, "GET", "/api/page-app/components/"+componentID, nil, 200, &originalComponent)
	path := "/api/workspace/pages/" + page.ID + "/app"
	insert := map[string]any{
		"componentId": componentID, "clientRequestId": "component_recovery_insert", "parentId": "", "pageName": "Initial insertion name", "expectedRevision": 0,
		"definition": PageAppDefinition{Version: 1, Blocks: []PageAppBlock{
			{ID: "host_text", Kind: "text", Text: "Original host draft"},
			{ID: "old_source", Kind: "records", CollectionID: source.ID, Fields: []string{}},
		}},
	}
	call(t, actor, "POST", path+"/component", insert, 200, nil)
	var originalRoot string
	if err := f.store.db.QueryRow(`SELECT root_block_id FROM page_app_component_insertions WHERE owner_id=? AND request_id=?`, f.users["admin"].ID, insert["clientRequestId"]).Scan(&originalRoot); err != nil {
		t.Fatal(err)
	}
	var first PageAppState
	call(t, actor, "GET", path, nil, 200, &first)
	var trackerID, sheetID string
	changed := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{}}
	for _, block := range first.Definition.Blocks {
		if block.ID == "old_source" {
			continue // The old request will reference a source that is now archived.
		}
		if block.ID == "host_text" {
			block.Text = "Newer host content must survive recovery"
		}
		if block.Kind == "tracker" {
			trackerID = block.ID
		}
		if block.Kind == "sheet" {
			sheetID = block.ID
		}
		changed.Blocks = append(changed.Blocks, block)
	}
	changed.Blocks = append(changed.Blocks, PageAppBlock{ID: "later_text", Kind: "text", Text: "Added in another editor"})
	var current PageAppState
	call(t, actor, "PUT", path, map[string]any{"definition": changed, "expectedRevision": 1, "pageName": "Newer page name"}, 200, &current)
	call(t, actor, "PUT", path+"/marks", map[string]any{"blockId": trackerID, "itemId": "one", "checked": true, "expectedRevision": 2}, 200, nil)
	call(t, actor, "PUT", path+"/sheets/"+sheetID, map[string]any{"values": map[string]string{"units": "7"}, "expectedRevision": 2, "expectedValuesRevision": 0}, 200, nil)
	exec(t, `UPDATE workspace_collections SET archived_at=? WHERE id=?`, nowText(), source.ID)
	call(t, actor, "GET", path, nil, 200, &current)
	if current.Revision != 2 || !current.Marks[trackerID+":one"] || current.Sheets[sheetID].Values["units"] != "7" {
		t.Fatal("newer page setup is incomplete")
	}
	counts := func(t *testing.T) [4]int {
		t.Helper()
		var result [4]int
		queries := []string{
			`SELECT COUNT(*) FROM page_app_components`,
			`SELECT COUNT(*) FROM page_app_component_insertions`,
			`SELECT COUNT(*) FROM workspace_collections`,
			`SELECT COUNT(*) FROM activity WHERE action='component_inserted'`,
		}
		for i, query := range queries {
			if err := f.store.db.QueryRow(query).Scan(&result[i]); err != nil {
				t.Fatal(err)
			}
		}
		return result
	}
	wantCounts := counts(t)
	if wantCounts[0] != 1 || wantCounts[1] != 1 || wantCounts[3] != 1 {
		t.Fatalf("initial discarded responses must have committed exactly once: %v", wantCounts)
	}
	assertRecovery := func(t *testing.T) {
		t.Helper()
		var saved PageAppComponent
		call(t, actor, "POST", "/api/page-app/components", create, 201, &saved)
		if !reflect.DeepEqual(saved, originalComponent) {
			t.Fatal("creation replay changed the stored component")
		}
		var recovered PageAppComponentInsertion
		call(t, actor, "POST", path+"/component", insert, 200, &recovered)
		if !recovered.AlreadyInserted || recovered.RootBlockID != originalRoot || recovered.PageName != "Newer page name" || !reflect.DeepEqual(recovered.PageAppState, current) {
			t.Fatal("late replay duplicated a block or replaced current schema, name, marks or numbers")
		}
		if got := counts(t); got != wantCounts {
			t.Fatalf("recovery wrote another component, receipt, source or activity: got %v want %v", got, wantCounts)
		}
	}
	assertRecovery(t)

	t.Run("401 then same account", func(t *testing.T) {
		anonymous := testClient(t)
		call(t, anonymous, "POST", "/api/page-app/components", create, 401, nil)
		call(t, anonymous, "POST", path+"/component", insert, 401, nil)
		assertRecovery(t)
	})
	t.Run("403 after admin downgrade", func(t *testing.T) {
		exec(t, `UPDATE workspace_members SET role='member' WHERE workspace_id=? AND user_id=?`, workspace, f.users["admin"].ID)
		call(t, actor, "POST", "/api/page-app/components", create, 403, nil)
		call(t, actor, "POST", path+"/component", insert, 403, nil)
		exec(t, `UPDATE workspace_members SET role='admin' WHERE workspace_id=? AND user_id=?`, workspace, f.users["admin"].ID)
		assertRecovery(t)
	})
	t.Run("403 while workspace is unavailable", func(t *testing.T) {
		exec(t, `UPDATE workspaces SET archived_at=? WHERE id=?`, nowText(), workspace)
		call(t, actor, "POST", "/api/page-app/components", create, 403, nil)
		call(t, actor, "POST", path+"/component", insert, 403, nil)
		exec(t, `UPDATE workspaces SET archived_at=NULL WHERE id=?`, workspace)
		assertRecovery(t)
	})
	t.Run("404 while page is archived", func(t *testing.T) {
		exec(t, `UPDATE workspace_pages SET archived_at=? WHERE id=?`, nowText(), page.ID)
		call(t, actor, "POST", path+"/component", insert, 404, nil)
		exec(t, `UPDATE workspace_pages SET archived_at=NULL WHERE id=?`, page.ID)
		assertRecovery(t)
	})
	t.Run("changed bodies cannot reuse receipts", func(t *testing.T) {
		create["description"] = "Different content with the same key"
		call(t, actor, "POST", "/api/page-app/components", create, 409, nil)
		create["description"] = "Original description"
		insert["expectedRevision"] = 2 // Updating only the revision is still a new request.
		call(t, actor, "POST", path+"/component", insert, 409, nil)
		insert["expectedRevision"] = 0
		assertRecovery(t)
	})
}
