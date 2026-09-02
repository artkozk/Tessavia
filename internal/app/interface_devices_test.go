package app

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func TestInterfaceDeviceMigrationSnapshotsExistingLayout(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`CREATE TABLE user_interface_preferences (
	 hidden_nav_items_json TEXT, nav_order_json TEXT, hidden_nav_groups_json TEXT,
	 collapsed_nav_groups_json TEXT, dashboard_widgets_json TEXT, layout_json TEXT, updated_at TEXT);
	 INSERT INTO user_interface_preferences VALUES ('["chat"]','["work","personal"]','[]','[]','["focus"]','{"contentWidth":1800}','2026-09-02');`)
	if err != nil {
		t.Fatal(err)
	}
	migration, err := migrationFiles.ReadFile("migrations/022_device_interface_preferences.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(string(migration)); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`UPDATE user_interface_preferences SET hidden_nav_items_json='[]', layout_json='{}'`); err != nil {
		t.Fatal(err)
	}
	var raw string
	if err = db.QueryRow(`SELECT mobile_preferences_json FROM user_interface_preferences`).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var saved InterfacePreferences
	if err = json.Unmarshal([]byte(raw), &saved); err != nil {
		t.Fatal(err)
	}
	if len(saved.HiddenNavItems) != 1 || saved.HiddenNavItems[0] != "chat" || saved.Layout.ContentWidth != 1800 || saved.NavOrder[0] != "work" {
		t.Fatalf("snapshot changed: %#v", saved)
	}
}

func TestInterfaceDevicesRemainIndependent(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "devices.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	client, other := testClient(t), testClient(t)
	registerVerifiedWithoutFixture(t, client, server.URL, "devices@example.test", "devices_owner")
	registerVerifiedWithoutFixture(t, other, server.URL, "devices-other@example.test", "devices_other")
	var project, second Workspace
	requestJSON(t, client, "POST", server.URL+"/api/workspaces", map[string]any{"name": "Devices"}, 201, &project)
	requestJSON(t, client, "POST", server.URL+"/api/workspaces", map[string]any{"name": "Other project"}, 201, &second)
	var saved InterfacePreferences
	mobile := InterfacePreferences{HiddenNavItems: []string{"chat", "invalid"}, NavOrder: []string{"personal", "work"}, DashboardWidgets: []string{"focus"}, Layout: InterfaceLayout{Density: "compact", ToolbarActions: []string{}, QuickActions: []string{}}}
	mobile.Layout.Pages = map[string]PageLayout{"work": {HiddenBlocks: []string{"summary"}, HiddenFields: []string{"owner"}, ContentWidth: 1200}, "idea": {Density: "comfortable"}}
	requestWorkspaceJSON(t, client, "PUT", server.URL+"/api/interface/preferences?device=mobile", project.ID, mobile, 200, &saved)
	if saved.Device != "mobile" || len(saved.HiddenNavItems) != 1 || len(saved.Layout.ToolbarActions) != 0 {
		t.Fatalf("mobile normalization: %#v", saved)
	}
	saved = InterfacePreferences{}
	requestWorkspaceJSON(t, client, "GET", server.URL+"/api/interface/preferences", project.ID, nil, 200, &saved)
	if saved.Device != "desktop" || len(saved.HiddenNavItems) != 0 || len(saved.DashboardWidgets) != 4 {
		t.Fatalf("mobile overwrote desktop: %#v", saved)
	}
	if len(saved.Layout.Pages) != 0 {
		t.Fatal("mobile page settings leaked into desktop")
	}
	desktop := InterfacePreferences{DashboardWidgets: []string{"capacity", "quality"}, Layout: InterfaceLayout{ContentWidth: 1800}}
	requestWorkspaceJSON(t, client, "PUT", server.URL+"/api/interface/preferences?device=desktop", project.ID, desktop, 200, &saved)
	saved = InterfacePreferences{}
	requestWorkspaceJSON(t, client, "GET", server.URL+"/api/interface/preferences?device=mobile", project.ID, nil, 200, &saved)
	if saved.Device != "mobile" || saved.Layout.Density != "compact" || len(saved.HiddenNavItems) != 1 || len(saved.Layout.ToolbarActions) != 0 || len(saved.DashboardWidgets) != 1 {
		t.Fatalf("desktop overwrote mobile: %#v", saved)
	}
	if saved.Layout.Pages["work"].ContentWidth != 1200 || saved.Layout.Pages["idea"].Density != "comfortable" {
		t.Fatal("desktop write lost independent page settings")
	}
	saved = InterfacePreferences{}
	requestWorkspaceJSON(t, client, "GET", server.URL+"/api/interface/preferences?device=mobile", second.ID, nil, 200, &saved)
	if len(saved.HiddenNavItems) != 0 || len(saved.DashboardWidgets) != 4 {
		t.Fatalf("project leak: %#v", saved)
	}
	if len(saved.Layout.Pages) != 0 {
		t.Fatal("page settings leaked into another project")
	}
	saved = InterfacePreferences{}
	requestJSON(t, other, "GET", server.URL+"/api/interface/preferences?device=mobile", nil, 200, &saved)
	if len(saved.HiddenNavItems) != 0 || saved.Layout.Density != "comfortable" {
		t.Fatalf("account leak: %#v", saved)
	}
	if len(saved.Layout.Pages) != 0 {
		t.Fatal("page settings leaked into another account")
	}
	requestWorkspaceJSON(t, other, "GET", server.URL+"/api/interface/preferences?device=mobile", project.ID, nil, http.StatusForbidden, nil)
	requestWorkspaceJSON(t, client, "GET", server.URL+"/api/interface/preferences?device=unknown", project.ID, nil, 400, nil)
	requestWorkspaceJSON(t, client, "PUT", server.URL+"/api/interface/preferences?device=unknown", project.ID, mobile, 400, nil)
}

func TestPageLayoutNormalization(t *testing.T) {
	actions := []string{"create", "create", "injected"}
	pages := normalizePageLayouts(map[string]PageLayout{
		"work": {Order: []string{"summary", "summary", "records", "<script>"}, HiddenFields: []string{"field:abc", "x\"onclick"}, ContentWidth: 99999, Density: "bad", ToolbarActions: &actions, BlockSpans: map[string]int{"summary": 6, "bad": 123}},
		"chat": {}, "#evil": {},
	})
	if len(pages) != 2 || len(pages["work"].Order) != 2 || len(pages["work"].HiddenFields) != 1 || pages["work"].ContentWidth != 2200 || pages["work"].Density != "" || len(pages["work"].BlockSpans) != 1 {
		t.Fatalf("unexpected normalization: %#v", pages)
	}
	if len(*pages["work"].ToolbarActions) != 1 || pages["chat"].ToolbarActions != nil {
		t.Fatal("toolbar inheritance lost")
	}
	empty := []string{}
	pages = normalizePageLayouts(map[string]PageLayout{"chat": {ToolbarActions: &empty}})
	if pages["chat"].ToolbarActions == nil || len(*pages["chat"].ToolbarActions) != 0 {
		t.Fatal("explicit empty toolbar must not inherit defaults")
	}
}
