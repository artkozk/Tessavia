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
	requestWorkspaceJSON(t, client, "PUT", server.URL+"/api/interface/preferences?device=mobile", project.ID, mobile, 200, &saved)
	if saved.Device != "mobile" || len(saved.HiddenNavItems) != 1 || len(saved.Layout.ToolbarActions) != 0 {
		t.Fatalf("mobile normalization: %#v", saved)
	}
	requestWorkspaceJSON(t, client, "GET", server.URL+"/api/interface/preferences", project.ID, nil, 200, &saved)
	if saved.Device != "desktop" || len(saved.HiddenNavItems) != 0 || len(saved.DashboardWidgets) != 4 {
		t.Fatalf("mobile overwrote desktop: %#v", saved)
	}
	desktop := InterfacePreferences{DashboardWidgets: []string{"capacity", "quality"}, Layout: InterfaceLayout{ContentWidth: 1800}}
	requestWorkspaceJSON(t, client, "PUT", server.URL+"/api/interface/preferences?device=desktop", project.ID, desktop, 200, &saved)
	requestWorkspaceJSON(t, client, "GET", server.URL+"/api/interface/preferences?device=mobile", project.ID, nil, 200, &saved)
	if saved.Device != "mobile" || saved.Layout.Density != "compact" || len(saved.HiddenNavItems) != 1 || len(saved.Layout.ToolbarActions) != 0 || len(saved.DashboardWidgets) != 1 {
		t.Fatalf("desktop overwrote mobile: %#v", saved)
	}
	requestWorkspaceJSON(t, client, "GET", server.URL+"/api/interface/preferences?device=mobile", second.ID, nil, 200, &saved)
	if len(saved.HiddenNavItems) != 0 || len(saved.DashboardWidgets) != 4 {
		t.Fatalf("project leak: %#v", saved)
	}
	requestJSON(t, other, "GET", server.URL+"/api/interface/preferences?device=mobile", nil, 200, &saved)
	if len(saved.HiddenNavItems) != 0 || saved.Layout.Density != "comfortable" {
		t.Fatalf("account leak: %#v", saved)
	}
	requestWorkspaceJSON(t, other, "GET", server.URL+"/api/interface/preferences?device=mobile", project.ID, nil, http.StatusForbidden, nil)
	requestWorkspaceJSON(t, client, "GET", server.URL+"/api/interface/preferences?device=unknown", project.ID, nil, 400, nil)
	requestWorkspaceJSON(t, client, "PUT", server.URL+"/api/interface/preferences?device=unknown", project.ID, mobile, 400, nil)
}
