package app

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func TestPersonalComponentsPrivateReuseAndAtomicRetry(t *testing.T) {
	f := newPersonalConstructorFixture(t)
	own, other := f.workspaces[0].ID, f.workspaces[1].ID
	call := func(actor int, workspace, method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[actor], method, f.url+path, workspace, body, status, out)
	}
	var original, target, foreign WorkspacePage
	call(0, own, "POST", "/api/workspace/pages", map[string]any{"name": "Source page"}, 201, &original)
	call(0, own, "POST", "/api/workspace/pages", map[string]any{"name": "Target page"}, 201, &target)
	call(1, other, "POST", "/api/workspace/pages", map[string]any{"name": "Other user's page"}, 201, &foreign)
	var source WorkspaceCollection
	call(0, own, "POST", "/api/collections", map[string]any{"name": "Own data", "defaultRecordType": "idea"}, 201, &source)
	var record Record
	call(0, own, "POST", "/api/records", map[string]any{"type": "idea", "title": "PRIVATE RECORD SENTINEL", "collectionId": source.ID}, 201, &record)
	sheet := sheetTestBlock()
	sheet.ParentID = "group"
	def := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{
		{ID: "group", Kind: "group", Title: "Daily practice", ParentID: "wrapper"},
		{ID: "tracker", Kind: "tracker", ParentID: "group", Items: []PageAppItem{{ID: "one", Label: "Read"}}},
		{ID: "progress", Kind: "progress", Source: "tracker", ParentID: "group"},
		{ID: "button", Kind: "button", Source: "tracker", ParentID: "group"},
		{ID: "conditional", Kind: "text", Text: "Next step", ParentID: "group", Visibility: &PageBlockVisibility{Source: "tracker", Metric: "checked", Operator: "gt", Value: 0}},
		{ID: "records", Kind: "records", ParentID: "group", CollectionID: source.ID, Fields: []string{}},
		sheet,
		{ID: "wrapper", Kind: "group", Title: "OUTSIDE SUBTREE SENTINEL"},
	}}
	path := "/api/workspace/pages/" + original.ID + "/app"
	call(0, own, "PUT", path, map[string]any{"definition": def, "expectedRevision": 0}, 200, nil)
	call(0, own, "PUT", path+"/marks", map[string]any{"blockId": "tracker", "itemId": "one", "checked": true, "expectedRevision": 1}, 200, nil)
	call(0, own, "PUT", path+"/sheets/estimate", map[string]any{"values": map[string]string{"units": "987654.123456"}, "expectedRevision": 1, "expectedValuesRevision": 0}, 200, nil)
	create := map[string]any{"name": "Own composed block", "description": "Reusable", "rootBlockId": "group", "definition": def, "clientRequestId": "save_component_request_one"}
	var component, repeated PageAppComponent
	call(0, own, "POST", "/api/page-app/components", create, 201, &component)
	call(0, own, "POST", "/api/page-app/components", create, 201, &repeated)
	if repeated.ID != component.ID || len(component.Definition.Blocks) != 7 || component.Definition.Blocks[0].ParentID != "" {
		t.Fatal("request duplicated or subtree changed", component, repeated)
	}
	raw, _ := json.Marshal(component)
	for _, secret := range []string{"PRIVATE RECORD SENTINEL", record.ID, "987654.123456", "OUTSIDE SUBTREE SENTINEL", `"marks"`, `"checked":`, own} {
		if strings.Contains(string(raw), secret) {
			t.Fatalf("component leaks private content %q", secret)
		}
	}
	create["name"] = "Changed request"
	call(0, own, "POST", "/api/page-app/components", create, 409, nil)
	call(1, other, "GET", "/api/page-app/components/"+component.ID, nil, 404, nil)
	var foreignLibrary []PageAppComponent
	call(1, other, "GET", "/api/page-app/components", nil, 200, &foreignLibrary)
	if len(foreignLibrary) != 0 {
		t.Fatal("private library exposed")
	}

	input := map[string]any{"componentId": component.ID, "clientRequestId": "insert_component_request_one", "parentId": "", "pageName": "Target renamed", "expectedRevision": 0, "definition": PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "kept", Kind: "text", Text: "unsaved host draft"}}}}
	call(1, other, "POST", "/api/workspace/pages/"+foreign.ID+"/app/component", input, 404, nil)
	var inserted PageAppComponentInsertion
	targetPath := "/api/workspace/pages/" + target.ID + "/app"
	call(0, own, "POST", targetPath+"/component", input, 200, &inserted)
	if inserted.Revision != 1 || len(inserted.Definition.Blocks) != 8 || len(inserted.Marks) != 0 || inserted.Definition.Blocks[0].Text != "unsaved host draft" {
		t.Fatal("host draft or state lost", inserted)
	}
	ids := map[string]PageAppBlock{}
	for _, b := range inserted.Definition.Blocks {
		ids[b.ID] = b
	}
	if inserted.RootBlockID == "group" || ids[inserted.RootBlockID].Kind != "group" {
		t.Fatal("root not remapped")
	}
	var tracker, copiedBoard, copiedSheet string
	for _, b := range inserted.Definition.Blocks {
		if b.Kind == "tracker" {
			tracker = b.ID
		}
		if b.Kind == "records" {
			copiedBoard = b.CollectionID
		}
		if b.Kind == "sheet" {
			copiedSheet = b.ID
		}
		if b.ID != "kept" && b.ID != inserted.RootBlockID && b.ParentID != inserted.RootBlockID {
			t.Fatal("hierarchy not remapped", b)
		}
		if b.Kind == "progress" || b.Kind == "button" {
			if ids[b.Source].Kind != "tracker" || b.Source == "tracker" {
				t.Fatal("block link not remapped", b)
			}
		}
		if b.Visibility != nil && ids[b.Visibility.Source].Kind != "tracker" {
			t.Fatal("condition source not remapped")
		}
	}
	if copiedBoard == source.ID || copiedBoard == "" || len(inserted.Sheets[copiedSheet].Values) != 0 {
		t.Fatal("source or private numbers copied")
	}
	var count int
	f.store.db.QueryRow(`SELECT count(*) FROM records WHERE collection_id=?`, copiedBoard).Scan(&count)
	if count != 0 {
		t.Fatal("records copied")
	}
	call(0, own, "PUT", targetPath+"/marks", map[string]any{"blockId": tracker, "itemId": "one", "checked": true, "expectedRevision": 1}, 200, nil)
	call(0, own, "POST", targetPath+"/component", input, 200, &inserted)
	if !inserted.AlreadyInserted || inserted.Revision != 1 || !inserted.Marks[tracker+":one"] {
		t.Fatal("retry duplicated structure or reset state")
	}
	var boardCount int
	f.store.db.QueryRow(`SELECT count(*) FROM workspace_collections WHERE workspace_id=?`, own).Scan(&boardCount)
	input["clientRequestId"] = "insert_component_request_conflict"
	call(0, own, "POST", targetPath+"/component", input, 409, nil)
	f.store.db.QueryRow(`SELECT count(*) FROM workspace_collections WHERE workspace_id=?`, own).Scan(&count)
	if count != boardCount {
		t.Fatal("conflict left orphan source")
	}
	f.store.db.QueryRow(`SELECT count(*) FROM page_app_component_insertions WHERE request_id='insert_component_request_conflict'`).Scan(&count)
	if count != 0 {
		t.Fatal("conflict claimed request")
	}
	input["clientRequestId"] = "insert_component_request_second"
	input["expectedRevision"], input["definition"] = 1, inserted.Definition
	var second PageAppComponentInsertion
	call(0, own, "POST", targetPath+"/component", input, 200, &second)
	if len(second.Definition.Blocks) != 15 || second.RootBlockID == inserted.RootBlockID {
		t.Fatal("second independent copy failed")
	}
	for _, b := range second.Definition.Blocks {
		if b.ParentID == second.RootBlockID && b.Kind == "tracker" && second.Marks[b.ID+":one"] {
			t.Fatal("second copy reused marks")
		}
	}
	var unchanged PageAppState
	call(0, own, "GET", path, nil, 200, &unchanged)
	if len(unchanged.Definition.Blocks) != 8 || !unchanged.Marks["tracker:one"] || unchanged.Sheets["estimate"].Values["units"] != "987654.123456" {
		t.Fatal("source changed")
	}
}

func TestPageComponentConcurrentInsertAndAdminBoundary(t *testing.T) {
	f := newLifecycleFixture(t)
	var page WorkspacePage
	requestWorkspaceJSON(t, f.clients["owner"], "POST", f.url+"/api/workspace/pages", f.project.ID, map[string]any{"name": "Concurrent insertion"}, 201, &page)
	definition := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "text", Kind: "text", Text: "Reusable text"}}}
	create := map[string]any{"name": "Component", "rootBlockId": "text", "definition": definition, "clientRequestId": "component_concurrent_create"}
	requestWorkspaceJSON(t, f.clients["member"], "POST", f.url+"/api/page-app/components", f.project.ID, create, 403, nil)
	var component PageAppComponent
	requestWorkspaceJSON(t, f.clients["owner"], "POST", f.url+"/api/page-app/components", f.project.ID, create, 201, &component)
	input := map[string]any{"componentId": component.ID, "clientRequestId": "component_parallel_insert", "pageName": "Concurrent insertion", "expectedRevision": 0, "definition": PageAppDefinition{Version: 1, Blocks: []PageAppBlock{}}}
	url := f.url + "/api/workspace/pages/" + page.ID + "/app/component"
	requestWorkspaceJSON(t, f.clients["member"], "POST", url, f.project.ID, input, 403, nil)
	raw, _ := json.Marshal(input)
	results := make(chan error, 6)
	for range 6 {
		go func() {
			req, _ := http.NewRequest("POST", url, bytes.NewReader(raw))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-Workspace-ID", f.project.ID)
			resp, err := f.clients["owner"].Do(req)
			if err != nil {
				results <- err
				return
			}
			defer resp.Body.Close()
			var out PageAppComponentInsertion
			err = json.NewDecoder(resp.Body).Decode(&out)
			if err == nil && (resp.StatusCode != 200 || out.Revision != 1 || len(out.Definition.Blocks) != 1) {
				err = fmt.Errorf("parallel result: status=%d revision=%d blocks=%d", resp.StatusCode, out.Revision, len(out.Definition.Blocks))
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
	f.store.db.QueryRow(`SELECT COUNT(*) FROM page_app_component_insertions WHERE page_id=?`, page.ID).Scan(&count)
	if count != 1 {
		t.Fatal("parallel retries duplicated receipt", count)
	}
}

func TestPageComponentExternalDependenciesAndLimits(t *testing.T) {
	base := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "group", Kind: "group"}, {ID: "tracker", Kind: "tracker"}, {ID: "progress", Kind: "progress", ParentID: "group", Source: "tracker"}}}
	if _, err := extractPageComponent(base, "group"); err == nil || !strings.Contains(err.Error(), "вне выбранной группы") {
		t.Fatal("external progress accepted", err)
	}
	base.Blocks[2] = PageAppBlock{ID: "text", Kind: "text", ParentID: "group", Visibility: &PageBlockVisibility{Source: "tracker", Metric: "checked", Operator: "gt"}}
	if _, err := extractPageComponent(base, "group"); err == nil || !strings.Contains(err.Error(), "вне группы") {
		t.Fatal("external visibility accepted", err)
	}
	base.Blocks[2].Visibility = nil
	base.Blocks[2].Source = "tracker"
	out, err := extractPageComponent(base, "group")
	if err != nil || out.Blocks[1].Source != "" {
		t.Fatal("irrelevant type-switch dependency kept", err)
	}
	base.Collections = []WorkspaceCollection{{ID: "forged"}}
	if _, err = extractPageComponent(base, "group"); err == nil {
		t.Fatal("untrusted schema accepted")
	}
	base.Collections = nil
	if _, err = extractPageComponent(base, "unknown"); err == nil {
		t.Fatal("missing root accepted")
	}
}
