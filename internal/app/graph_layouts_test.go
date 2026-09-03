package app

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

type graphWorkspaceTransport struct{ workspace string }

func (transport graphWorkspaceTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	copy := request.Clone(request.Context())
	copy.Header.Set("X-Workspace-ID", transport.workspace)
	return http.DefaultTransport.RoundTrip(copy)
}

func TestGraphLayoutsIsolationConcurrencyAndUndo(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "layouts.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	ownerClient, partnerClient := testClient(t), testClient(t)
	owner := register(t, ownerClient, server.URL, "layout-owner@example.test", "layout_owner")
	register(t, partnerClient, server.URL, "layout-partner@example.test", "layout_partner")
	workspace := collaborativeTestTeamsValue(t, server.URL)
	root := createRecord(t, ownerClient, server.URL, map[string]any{"type": "goal", "title": "Root", "isRoot": true})
	child := createRecord(t, ownerClient, server.URL, map[string]any{"type": "task", "title": "Child", "parentId": root.ID})
	requestWorkspaceJSON(t, ownerClient, "POST", server.URL+"/api/records/"+root.ID+"/links", workspace, map[string]any{"targetId": child.ID, "relationType": "supports"}, 201, nil)
	var other Workspace
	requestJSON(t, ownerClient, "POST", server.URL+"/api/workspaces", map[string]any{"name": "Other layout project"}, 201, &other)
	var foreign Record
	requestWorkspaceJSON(t, ownerClient, "POST", server.URL+"/api/records", other.ID, map[string]any{"type": "task", "title": "Other"}, 201, &foreign)
	get := func(client *http.Client, space, view string) GraphLayout {
		var result GraphLayout
		requestWorkspaceJSON(t, client, "GET", server.URL+"/api/graph/layout?view="+view, space, nil, 200, &result)
		return result
	}
	put := func(client *http.Client, space, view string, version int64, data GraphLayoutData, status int) GraphLayout {
		var result GraphLayout
		requestWorkspaceJSON(t, client, "PUT", server.URL+"/api/graph/layout?view="+view, space, map[string]any{"expectedVersion": version, "data": data}, status, &result)
		return result
	}
	before := get(ownerClient, workspace, "project")
	if before.Version != 0 || len(before.Data.Positions) != 0 {
		t.Fatal("new layout not empty")
	}
	data := GraphLayoutData{Depth: 2, Search: "root", BranchRootID: graphRecordID(root.ID), Positions: map[string]GraphPosition{graphRecordID(root.ID): {X: 10, Y: 20}, graphRecordID(child.ID): {X: 30, Y: 40}}, Settings: map[string]any{"showDiscussion": false, "nodeSize": 100}}
	var recordCount, activityCount, linkCount int
	store.db.QueryRow(`SELECT COUNT(*) FROM records`).Scan(&recordCount)
	store.db.QueryRow(`SELECT COUNT(*) FROM activity`).Scan(&activityCount)
	store.db.QueryRow(`SELECT COUNT(*) FROM record_links`).Scan(&linkCount)
	first := put(ownerClient, workspace, "project", 0, data, 200)
	if first.Version != 1 || !reflect.DeepEqual(first.Data.Positions, data.Positions) {
		t.Fatal("layout not saved")
	}
	// The second HTTP client has its own cookie jar/session for the same account.
	secondWindow := testClient(t)
	requestJSON(t, secondWindow, "POST", server.URL+"/api/auth/login", map[string]any{"login": owner.Username, "password": "strong-password-123"}, 200, nil)
	loaded := get(secondWindow, workspace, "project")
	if loaded.Version != 1 || loaded.Data.Search != "root" {
		t.Fatal("another device lost layout")
	}
	if get(partnerClient, workspace, "project").Version != 0 || get(ownerClient, other.ID, "project").Version != 0 || get(ownerClient, workspace, "record:"+root.ID).Version != 0 {
		t.Fatal("scopes share a layout")
	}
	wrapped := &http.Client{Jar: ownerClient.Jar, Transport: graphWorkspaceTransport{workspace}}
	wrappedSecond := &http.Client{Jar: secondWindow.Jar, Transport: graphWorkspaceTransport{workspace}}
	statuses := concurrentScoreStatuses(t, []*http.Client{wrapped, wrappedSecond}, server.URL+"/api/graph/layout", []map[string]any{{"expectedVersion": 1, "data": data}, {"expectedVersion": 1, "data": data}})
	if statuses[0] != 200 || statuses[1] != 409 {
		t.Fatalf("concurrent layout writes: %v", statuses)
	}
	reset := put(ownerClient, workspace, "project", 2, GraphLayoutData{Depth: 2}, 200)
	if len(reset.Data.Positions) != 0 {
		t.Fatal("reset retained positions")
	}
	undo := put(ownerClient, workspace, "project", reset.Version, data, 200)
	if undo.Version != 4 || len(undo.Data.Positions) != 2 {
		t.Fatal("undo did not restore positions as a new version")
	}
	// Only preferences changed: object IDs, record timestamps, hierarchy and history stay intact.
	var count int
	store.db.QueryRow(`SELECT COUNT(*) FROM records`).Scan(&count)
	if count != recordCount {
		t.Fatal("layout mutated records")
	}
	store.db.QueryRow(`SELECT COUNT(*) FROM activity`).Scan(&count)
	if count != activityCount {
		t.Fatal("layout polluted activity")
	}
	store.db.QueryRow(`SELECT COUNT(*) FROM record_links`).Scan(&count)
	if count != linkCount {
		t.Fatal("layout mutated links")
	}
	var relation string
	if err := store.db.QueryRow(`SELECT relation_type FROM record_links WHERE source_id=? AND target_id=? AND active=1`, root.ID, child.ID).Scan(&relation); err != nil || relation != "supports" {
		t.Fatal("layout changed semantic link", err)
	}
	var parent, updated string
	store.db.QueryRow(`SELECT parent_id,updated_at FROM records WHERE id=?`, child.ID).Scan(&parent, &updated)
	if parent != root.ID || updated != child.UpdatedAt {
		t.Fatal("layout changed hierarchy or record version")
	}
	put(partnerClient, workspace, "project", 0, data, 200)
	put(ownerClient, workspace, "record:"+root.ID, 0, data, 200)
	put(ownerClient, other.ID, "project", 0, GraphLayoutData{Depth: 2}, 200)
	var export struct {
		Tables map[string][]map[string]any `json:"tables"`
	}
	requestWorkspaceJSON(t, ownerClient, "GET", server.URL+"/api/export", workspace, nil, 200, &export)
	if len(export.Tables["myGraphLayouts"]) != 2 {
		t.Fatalf("wrong layout export: %#v", export.Tables["myGraphLayouts"])
	}
	for _, row := range export.Tables["myGraphLayouts"] {
		if row["user_id"] != float64(owner.ID) || row["workspace_id"] != workspace {
			t.Fatal("export leaked personal layout")
		}
	}
	// Scope validation includes local roots, arbitrary positions and branches.
	requestWorkspaceJSON(t, ownerClient, "GET", server.URL+"/api/graph/layout?view=record:"+foreign.ID, workspace, nil, 404, nil)
	invalid := data
	invalid.Positions = map[string]GraphPosition{graphRecordID(foreign.ID): {X: 1, Y: 2}}
	put(ownerClient, workspace, "project", 4, invalid, 400)
	invalid = data
	invalid.BranchRootID = graphRecordID(foreign.ID)
	put(ownerClient, workspace, "project", 4, invalid, 400)
	invalid = data
	invalid.Settings = map[string]any{"nodeSize": 900}
	put(ownerClient, workspace, "project", 4, invalid, 400)
	invalid = data
	invalid.Positions = map[string]GraphPosition{graphRecordID(root.ID): {X: 1e7, Y: 0}}
	put(ownerClient, workspace, "project", 4, invalid, 400)
	requestWorkspaceJSON(t, partnerClient, "GET", server.URL+"/api/graph/layout", other.ID, nil, 403, nil)
	requestWorkspaceJSON(t, ownerClient, "PUT", server.URL+"/api/graph/layout", workspace, map[string]any{"data": data}, 400, nil)
}
