package app

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"
	"strings"
	"testing"
)

func TestPageBlockTrashRetainsIdentityPrivateValuesAndAtomicDraft(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(actor, method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[actor], method, f.url+path, f.project.ID, body, status, out)
	}
	var page WorkspacePage
	call("owner", "POST", "/api/workspace/pages", map[string]any{"name": "Original page"}, 201, &page)
	path := "/api/workspace/pages/" + page.ID + "/app"
	sheet := sheetTestBlock()
	sheet.ParentID = "group"
	def := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{
		{ID: "before", Kind: "heading", Title: "Before"},
		{ID: "group", Kind: "group", Title: "Reusable routine"},
		{ID: "tracker", Kind: "tracker", ParentID: "group", Items: []PageAppItem{{ID: "one", Label: "Read"}, {ID: "two", Label: "Plan", Hidden: true}}},
		{ID: "progress", Kind: "progress", Source: "tracker", ParentID: "group"},
		{ID: "conditional", Kind: "text", ParentID: "group", Text: "ARCHIVED_SCHEMA_SENTINEL", Visibility: &PageBlockVisibility{Source: "tracker", Metric: "checked", Operator: "gt"}},
		sheet,
		{ID: "after", Kind: "text", Title: "After", Source: "group"},
	}}
	var baseline PageAppState
	call("owner", "PUT", path, map[string]any{"definition": def, "expectedRevision": 0}, 200, &baseline)
	def = baseline.Definition
	for actor, number := range map[string]string{"owner": "123456.75", "member": "654321.25"} {
		call(actor, "PUT", path+"/marks", map[string]any{"blockId": "tracker", "itemId": "one", "checked": true, "expectedRevision": 1}, 200, nil)
		call(actor, "PUT", path+"/sheets/estimate", map[string]any{"values": map[string]string{"units": number}, "expectedRevision": 1, "expectedValuesRevision": 0}, 200, nil)
	}
	def.Blocks[0].Text = "Unsaved draft kept"
	remove := pageBlockTrashInput{BlockID: "group", Definition: def, PageName: "Saved draft name", ExpectedRevision: 1, ClientRequestID: "trash_remove_identity_01"}
	call("member", "POST", path+"/trash", remove, 403, nil)
	call("member", "GET", path+"/trash", nil, 403, nil)
	var gone PageBlockTrashResult
	call("owner", "POST", path+"/trash", remove, 200, &gone)
	if gone.Revision != 2 || gone.PageName != "Saved draft name" || len(gone.Definition.Blocks) != 2 || gone.Definition.Blocks[0].Text != "Unsaved draft kept" || gone.Definition.Blocks[1].Source != "group" {
		t.Fatal("archive lost draft/dormant setting", gone)
	}
	if len(gone.Sheets) != 0 {
		t.Fatal("removed sheet still exposed")
	}
	call("member", "PUT", path+"/marks", map[string]any{"blockId": "tracker", "itemId": "one", "checked": false, "expectedRevision": 2}, 400, nil)
	call("member", "PUT", path+"/sheets/estimate", map[string]any{"values": map[string]string{"units": "0"}, "expectedRevision": 2, "expectedValuesRevision": 1}, 400, nil)
	var items PageBlockTrashPage
	call("admin", "GET", path+"/trash", nil, 200, &items)
	if len(items.Items) != 1 || items.Items[0].ID != gone.TrashID || items.Items[0].BlockCount != 5 || items.Items[0].RemovedBy != f.users["owner"].Username {
		t.Fatal(items)
	}
	var raw string
	if err := f.store.db.QueryRow(`SELECT details_json FROM activity WHERE id=?`, gone.TrashID).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(raw, "ARCHIVED_SCHEMA_SENTINEL") || strings.Contains(raw, "123456.75") || strings.Contains(raw, "654321.25") || strings.Contains(raw, `"marks"`) {
		t.Fatal("snapshot missing structure or includes runtime")
	}
	// None of the four general activity readers exports the full trash payload.
	for _, endpoint := range []string{"/api/activity", "/api/sync", "/api/sync?pageSize=500", fmt.Sprintf("/api/users/%d/profile", f.users["owner"].ID)} {
		var response any
		call("owner", "GET", endpoint, nil, 200, &response)
		encoded, _ := json.Marshal(response)
		if strings.Contains(string(encoded), "ARCHIVED_SCHEMA_SENTINEL") || strings.Contains(string(encoded), "requestHash") || strings.Contains(string(encoded), "trash_remove_identity_01") {
			t.Fatal("general activity disclosed snapshot", endpoint)
		}
	}
	// Template export uses only the active composition, not a hidden trash backup.
	var kit PageAppTemplate
	call("owner", "POST", path+"/template", map[string]any{"name": "Remaining", "visibility": "private", "expectedRevision": 2}, 201, &kit)
	if len(kit.Definition.Blocks) != 2 {
		t.Fatal("trash copied to template")
	}
	var receipt PageBlockTrashResult
	call("owner", "POST", path+"/trash", remove, 200, &receipt)
	if !receipt.AlreadyApplied || receipt.Revision != 2 || receipt.TrashID != gone.TrashID {
		t.Fatal("lost-response retry reapplied removal", receipt)
	}
	changed := remove
	changed.PageName = "Changed request"
	call("owner", "POST", path+"/trash", changed, 409, nil)
	// Restoring is allowed for another administrator and preserves every identity.
	restore := pageBlockTrashInput{Definition: gone.Definition, PageName: "Restored page", ExpectedRevision: 2, ClientRequestID: "trash_restore_identity_01"}
	var restored PageBlockTrashResult
	call("admin", "POST", path+"/trash/"+gone.TrashID+"/restore", restore, 200, &restored)
	if restored.Revision != 3 || !reflect.DeepEqual(restored.Definition, def) {
		t.Fatal("structure/order/IDs changed on restore", restored.Definition, def)
	}
	for actor, want := range map[string]string{"owner": "123456.75", "member": "654321.25"} {
		var state PageAppState
		call(actor, "GET", path, nil, 200, &state)
		if !state.Marks["tracker:one"] || state.Sheets["estimate"].Values["units"] != want || state.Sheets["estimate"].Revision != 1 {
			t.Fatal("restore lost or leaked private runtime", actor, state)
		}
	}
	call("admin", "POST", path+"/trash/"+gone.TrashID+"/restore", restore, 200, &receipt)
	if !receipt.AlreadyApplied || receipt.Revision != 3 {
		t.Fatal("restore retry duplicated operation")
	}
	call("owner", "GET", path+"/trash", nil, 200, &items)
	if len(items.Items) != 0 {
		t.Fatal("restored entry remains active")
	}
	// An old archive request cannot undo a later restoration; it returns current state.
	call("owner", "POST", path+"/trash", remove, 200, &receipt)
	if receipt.Revision != 3 || len(receipt.Definition.Blocks) != 7 {
		t.Fatal("old receipt returned stale page")
	}
	var count int
	f.store.db.QueryRow(`SELECT count(*) FROM activity_undos WHERE activity_id=?`, gone.TrashID).Scan(&count)
	if count != 1 {
		t.Fatal("missing restore receipt")
	}
}

func TestPageBlockTrashCapacityReservationCASAndPrivacy(t *testing.T) {
	f := newPersonalConstructorFixture(t)
	own := f.workspaces[0].ID
	call := func(method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[0], method, f.url+path, own, body, status, out)
	}
	var page WorkspacePage
	call("POST", "/api/workspace/pages", map[string]any{"name": "Capacity"}, 201, &page)
	path := "/api/workspace/pages/" + page.ID + "/app"
	def := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{}}
	for i := range 40 {
		def.Blocks = append(def.Blocks, PageAppBlock{ID: fmt.Sprintf("hidden_%d", i), Kind: "text", Title: fmt.Sprintf("Hidden %d", i), Hidden: true})
	}
	var baseline PageAppState
	call("PUT", path, map[string]any{"definition": def, "expectedRevision": 0}, 200, &baseline)
	remove := pageBlockTrashInput{BlockID: "hidden_1", Definition: baseline.Definition, PageName: "Saved", ExpectedRevision: 0, ClientRequestID: "capacity_remove_conflict"}
	call("POST", path+"/trash", remove, 409, nil)
	var items PageBlockTrashPage
	call("GET", path+"/trash", nil, 200, &items)
	if len(items.Items) != 0 {
		t.Fatal("conflict left archive")
	}
	remove.ExpectedRevision = 1
	remove.ClientRequestID = "capacity_remove_success"
	var removed PageBlockTrashResult
	call("POST", path+"/trash", remove, 200, &removed)
	if len(removed.Definition.Blocks) != 39 {
		t.Fatal("slot not freed")
	}
	// A normal save and insertion payload must both respect the reserved ID.
	call("PUT", path, map[string]any{"definition": baseline.Definition, "expectedRevision": 2}, 409, nil)
	var component PageAppComponent
	call("POST", "/api/page-app/components", map[string]any{"rootBlockId": "copy", "name": "Copy", "definition": PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "copy", Kind: "text"}}}, "clientRequestId": "capacity_component_save"}, 201, &component)
	forged := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "hidden_1", Kind: "text", Text: "forged"}}}
	call("POST", path+"/component", map[string]any{"definition": forged, "expectedRevision": 2, "componentId": component.ID, "pageName": "Forged", "clientRequestId": "capacity_component_insert"}, 409, nil)
	var count int
	f.store.db.QueryRow(`SELECT count(*) FROM page_app_component_insertions WHERE page_id=?`, page.ID).Scan(&count)
	if count != 0 {
		t.Fatal("reserved-ID insertion left receipt")
	}
	filled := removed.Definition
	filled.Blocks = append(filled.Blocks, PageAppBlock{ID: "new_block", Kind: "text"})
	call("PUT", path, map[string]any{"definition": filled, "expectedRevision": 2}, 200, nil)
	restore := pageBlockTrashInput{Definition: filled, ExpectedRevision: 3, PageName: "Too full", ClientRequestID: "capacity_restore_full"}
	var failure map[string]string
	call("POST", path+"/trash/"+removed.TrashID+"/restore", restore, 400, &failure)
	if !strings.Contains(failure["error"], "свободно 0") {
		t.Fatal(failure)
	}
	call("GET", path+"/trash", nil, 200, &items)
	if len(items.Items) != 1 {
		t.Fatal("capacity failure consumed trash")
	}
	requestWorkspaceJSON(t, f.clients[1], "GET", f.url+path+"/trash", f.workspaces[1].ID, nil, 404, nil)
	requestWorkspaceJSON(t, f.clients[1], "POST", f.url+path+"/trash/"+removed.TrashID+"/restore", f.workspaces[1].ID, restore, 404, nil)
	// Concurrent additions/edits remain untouched by a stale restore body.
	restore.Definition = removed.Definition
	restore.ExpectedRevision = 2
	restore.ClientRequestID = "capacity_restore_stale"
	call("POST", path+"/trash/"+removed.TrashID+"/restore", restore, 409, nil)
	var state PageAppState
	call("GET", path, nil, 200, &state)
	if state.Revision != 3 || len(state.Definition.Blocks) != 40 {
		t.Fatal("stale restore changed page")
	}
}

func TestPageBlockTrashDependenciesAndMissingOriginalSources(t *testing.T) {
	f := newPersonalConstructorFixture(t)
	workspace := f.workspaces[0].ID
	call := func(method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[0], method, f.url+path, workspace, body, status, out)
	}
	var page WorkspacePage
	call("POST", "/api/workspace/pages", map[string]any{"name": "Dependencies"}, 201, &page)
	path := "/api/workspace/pages/" + page.ID + "/app"
	for _, dependent := range []PageAppBlock{
		{ID: "dependent", Kind: "progress", Title: "Outside progress", Source: "tracker", Hidden: true},
		{ID: "dependent", Kind: "button", Title: "Outside button", Source: "tracker"},
		{ID: "dependent", Kind: "text", Title: "Outside condition", Visibility: &PageBlockVisibility{Mode: "all", Conditions: []PageBlockVisibility{{Source: "tracker", Metric: "checked", Operator: "eq"}}}},
	} {
		def := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "group", Kind: "group"}, {ID: "tracker", Kind: "tracker", ParentID: "group"}, dependent}}
		var failure map[string]string
		call("POST", path+"/trash", pageBlockTrashInput{BlockID: "group", Definition: def, PageName: "Dependencies", ExpectedRevision: 0, ClientRequestID: "dependencies_" + dependent.Kind}, 400, &failure)
		if !strings.Contains(failure["error"], dependent.Title) {
			t.Fatal("dependency not identified", failure)
		}
	}
	// Child can be removed alone, but cannot be silently detached on restoration.
	def := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "parent", Kind: "group", Title: "Parent"}, {ID: "child", Kind: "text", Title: "Child", ParentID: "parent"}}}
	var child, parent PageBlockTrashResult
	call("POST", path+"/trash", pageBlockTrashInput{BlockID: "child", Definition: def, PageName: "Children", ExpectedRevision: 0, ClientRequestID: "dependencies_remove_child"}, 200, &child)
	call("POST", path+"/trash", pageBlockTrashInput{BlockID: "parent", Definition: child.Definition, PageName: "Children", ExpectedRevision: 1, ClientRequestID: "dependencies_remove_parent"}, 200, &parent)
	var failure map[string]string
	call("POST", path+"/trash/"+child.TrashID+"/restore", pageBlockTrashInput{Definition: parent.Definition, PageName: "Children", ExpectedRevision: 2, ClientRequestID: "dependencies_restore_child"}, 400, &failure)
	if !strings.Contains(failure["error"], "исходную группу") || !strings.Contains(failure["error"], "Child") {
		t.Fatal(failure)
	}
	// Missing board is a reason to remove an obsolete list, not to block removal.
	var source WorkspaceCollection
	call("POST", "/api/collections", map[string]any{"name": "Old board", "defaultRecordType": "idea"}, 201, &source)
	def = PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "records", Kind: "records", Title: "Old list", CollectionID: source.ID}, {ID: "safe", Kind: "text"}}}
	call("PUT", path, map[string]any{"definition": def, "expectedRevision": 2}, 200, nil)
	if _, err := f.store.db.Exec(`UPDATE workspace_collections SET archived_at=? WHERE id=?`, nowText(), source.ID); err != nil {
		t.Fatal(err)
	}
	var removed PageBlockTrashResult
	call("POST", path+"/trash", pageBlockTrashInput{BlockID: "records", Definition: def, PageName: "Clean page", ExpectedRevision: 3, ClientRequestID: "dependencies_obsolete_remove"}, 200, &removed)
	call("POST", path+"/trash/"+removed.TrashID+"/restore", pageBlockTrashInput{Definition: removed.Definition, PageName: "Do not rebind", ExpectedRevision: 4, ClientRequestID: "dependencies_obsolete_restore"}, 400, &failure)
	if !strings.Contains(failure["error"], "Old list") || !strings.Contains(failure["error"], "Доска") {
		t.Fatal(failure)
	}
	if _, err := f.store.db.Exec(`UPDATE workspace_collections SET archived_at=NULL WHERE id=?`, source.ID); err != nil {
		t.Fatal(err)
	}
	var restored PageBlockTrashResult
	call("POST", path+"/trash/"+removed.TrashID+"/restore", pageBlockTrashInput{Definition: removed.Definition, PageName: "Same board", ExpectedRevision: 4, ClientRequestID: "dependencies_obsolete_restore"}, 200, &restored)
	if restored.Definition.Blocks[0].ID != "records" || restored.Definition.Blocks[0].CollectionID != source.ID {
		t.Fatal("restoration rebound the original board", restored.Definition)
	}
}

func TestPageBlockTrashConcurrentRestoreAndReceiptSurvivesLaterSourceChanges(t *testing.T) {
	f := newPersonalConstructorFixture(t)
	workspace := f.workspaces[0].ID
	call := func(method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[0], method, f.url+path, workspace, body, status, out)
	}
	var page WorkspacePage
	call("POST", "/api/workspace/pages", map[string]any{"name": "Restore retries"}, 201, &page)
	var source WorkspaceCollection
	call("POST", "/api/collections", map[string]any{"name": "Remaining source", "defaultRecordType": "idea"}, 201, &source)
	path := "/api/workspace/pages/" + page.ID + "/app"
	definition := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "text", Kind: "text", Title: "Restore me"}, {ID: "records", Kind: "records", CollectionID: source.ID}}}
	remove := pageBlockTrashInput{BlockID: "text", Definition: definition, PageName: "Restore retries", ExpectedRevision: 0, ClientRequestID: "receipt_source_remove"}
	var removed PageBlockTrashResult
	call("POST", path+"/trash", remove, 200, &removed)
	restore := pageBlockTrashInput{Definition: removed.Definition, PageName: "Restore retries", ExpectedRevision: 1, ClientRequestID: "concurrent_trash_restore"}
	raw, _ := json.Marshal(restore)
	results := make(chan error, 6)
	for range 6 {
		go func() {
			req, _ := http.NewRequest("POST", f.url+path+"/trash/"+removed.TrashID+"/restore", bytes.NewReader(raw))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-Workspace-ID", workspace)
			response, err := f.clients[0].Do(req)
			if err != nil {
				results <- err
				return
			}
			defer response.Body.Close()
			var out PageBlockTrashResult
			err = json.NewDecoder(response.Body).Decode(&out)
			if err == nil && (response.StatusCode != 200 || out.Revision != 2 || len(out.Definition.Blocks) != 2) {
				err = fmt.Errorf("status=%d revision=%d", response.StatusCode, out.Revision)
			}
			results <- err
		}()
	}
	for range 6 {
		if err := <-results; err != nil {
			t.Error(err)
		}
	}
	var count int
	f.store.db.QueryRow(`SELECT count(*) FROM activity WHERE entity_id=? AND action='app_blocks_restored'`, page.ID).Scan(&count)
	if count != 1 {
		t.Fatal("concurrent restores duplicated the receipt", count)
	}
	// A lost-response retry must read its receipt before validating sources which
	// another operation may have removed after the original request committed.
	if _, err := f.store.db.Exec(`UPDATE workspace_collections SET archived_at=? WHERE id=?`, nowText(), source.ID); err != nil {
		t.Fatal(err)
	}
	var receipt PageBlockTrashResult
	call("POST", path+"/trash", remove, 200, &receipt)
	if !receipt.AlreadyApplied || receipt.Revision != 2 {
		t.Fatal("removal receipt revalidated an obsolete source")
	}
	call("POST", path+"/trash/"+removed.TrashID+"/restore", restore, 200, &receipt)
	if !receipt.AlreadyApplied || receipt.Revision != 2 {
		t.Fatal("restore receipt revalidated an obsolete source")
	}
	restore.PageName = "Changed body"
	call("POST", path+"/trash/"+removed.TrashID+"/restore", restore, 409, nil)
}

func TestPageBlockTrashConcurrentRetryAndPaginationWithoutCapacityDeadlock(t *testing.T) {
	f := newPersonalConstructorFixture(t)
	workspace := f.workspaces[0].ID
	var page WorkspacePage
	requestWorkspaceJSON(t, f.clients[0], "POST", f.url+"/api/workspace/pages", workspace, map[string]any{"name": "Concurrent trash"}, 201, &page)
	path := f.url + "/api/workspace/pages/" + page.ID + "/app"
	def := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "one", Kind: "text", Text: "Keep exact"}}}
	input := pageBlockTrashInput{BlockID: "one", Definition: def, PageName: "Concurrent", ExpectedRevision: 0, ClientRequestID: "concurrent_trash_request"}
	raw, _ := json.Marshal(input)
	results := make(chan error, 6)
	for range 6 {
		go func() {
			req, _ := http.NewRequest("POST", path+"/trash", bytes.NewReader(raw))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-Workspace-ID", workspace)
			response, err := f.clients[0].Do(req)
			if err != nil {
				results <- err
				return
			}
			defer response.Body.Close()
			var out PageBlockTrashResult
			err = json.NewDecoder(response.Body).Decode(&out)
			if err == nil && (response.StatusCode != 200 || out.Revision != 1 || len(out.Definition.Blocks) != 0) {
				err = fmt.Errorf("status=%d revision=%d", response.StatusCode, out.Revision)
			}
			results <- err
		}()
	}
	for range 6 {
		if err := <-results; err != nil {
			t.Error(err)
		}
	}
	var count int
	f.store.db.QueryRow(`SELECT count(*) FROM activity WHERE entity_id=? AND action='app_blocks_removed'`, page.ID).Scan(&count)
	if count != 1 {
		t.Fatal("concurrent request duplicated snapshot", count)
	}
	// Fill the bounded trash with valid synthetic schema-only history entries.
	for i := 1; i < 100; i++ {
		id := fmt.Sprintf("limit_%d", i)
		snapshot := pageBlockTrashSnapshot{Version: 1, RootBlockID: id, Blocks: []PageAppBlock{{ID: id, Kind: "text"}}, Positions: []int{0}}
		details, _ := json.Marshal(map[string]any{"snapshot": snapshot, "title": id, "blockCount": 1})
		if _, err := f.store.db.Exec(`INSERT INTO activity(id,actor_id,entity_type,entity_id,action,details_json,reason,created_at,workspace_id) VALUES(?,?,'workspace_page',?,'app_blocks_removed',?,'',?,?)`, id, f.users[0].ID, page.ID, string(details), nowText(), workspace); err != nil {
			t.Fatal(err)
		}
	}
	// A full page and a populated trash must still allow removal of another block.
	input.Definition = PageAppDefinition{Version: 1, Blocks: []PageAppBlock{}}
	for i := range 40 {
		input.Definition.Blocks = append(input.Definition.Blocks, PageAppBlock{ID: fmt.Sprintf("new_%d", i), Kind: "text", Hidden: true})
	}
	requestWorkspaceJSON(t, f.clients[0], "PUT", path, workspace, map[string]any{"definition": input.Definition, "expectedRevision": 1}, 200, nil)
	input.BlockID = "new_0"
	input.ExpectedRevision = 2
	input.ClientRequestID = "trash_101st_remove"
	var removed PageBlockTrashResult
	requestWorkspaceJSON(t, f.clients[0], "POST", path+"/trash", workspace, input, 200, &removed)
	if len(removed.Definition.Blocks) != 39 || removed.Revision != 3 {
		t.Fatal("trash capacity trapped a full page")
	}
	f.store.db.QueryRow(`SELECT count(*) FROM activity WHERE entity_id=? AND action='app_blocks_removed'`, page.ID).Scan(&count)
	if count != 101 {
		t.Fatal("history was purged", count)
	}
	cursor := ""
	seen := map[string]bool{}
	sizes := []int{}
	for {
		var listing PageBlockTrashPage
		requestWorkspaceJSON(t, f.clients[0], "GET", path+"/trash?limit=50&cursor="+cursor, workspace, nil, 200, &listing)
		sizes = append(sizes, len(listing.Items))
		for _, item := range listing.Items {
			if seen[item.ID] {
				t.Fatal("pagination repeated an entry", item.ID)
			}
			seen[item.ID] = true
		}
		cursor = listing.NextCursor
		if cursor == "" {
			break
		}
	}
	if len(seen) != 101 || !reflect.DeepEqual(sizes, []int{50, 50, 1}) {
		t.Fatal("pagination omitted entries", sizes, len(seen))
	}
	requestWorkspaceJSON(t, f.clients[0], "GET", path+"/trash?cursor=malformed", workspace, nil, 400, nil)
}
