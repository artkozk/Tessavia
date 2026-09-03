package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func TestInterfacePresetsPublishApplyAndUndoWithoutProjectData(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "interface-presets.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	ownerClient, recipientClient := testClient(t), testClient(t)
	registerVerifiedWithoutFixture(t, ownerClient, server.URL, "preset-owner@example.test", "preset_owner")
	registerVerifiedWithoutFixture(t, recipientClient, server.URL, "preset-recipient@example.test", "preset_recipient")

	var source, target Workspace
	requestJSON(t, ownerClient, http.MethodPost, server.URL+"/api/workspaces", map[string]any{"name": "Source project"}, http.StatusCreated, &source)
	requestJSON(t, recipientClient, http.MethodPost, server.URL+"/api/workspaces", map[string]any{"name": "Target project"}, http.StatusCreated, &target)
	var page WorkspacePage
	requestWorkspaceJSON(t, ownerClient, http.MethodPost, server.URL+"/api/workspace/pages", source.ID, map[string]any{
		"name": "Secret sales page", "recordType": "task", "statusFilter": "active", "ownerFilter": "all", "viewMode": "list", "fields": []string{"owner"},
	}, http.StatusCreated, &page)

	desktop := InterfacePreferences{
		HiddenNavItems:   []string{"chat", "page:" + page.ID},
		NavOrder:         []string{"page:" + page.ID, "work", "personal"},
		DashboardWidgets: []string{"focus", "capacity"},
		Layout: InterfaceLayout{ContentWidth: 1800, Pages: map[string]PageLayout{
			"work":                  {HiddenFields: []string{"owner", "field:private-customer-id"}, HiddenBlocks: []string{"summary"}},
			"page:" + page.ID:       {HiddenFields: []string{"owner"}},
			"collection:crm-secret": {HiddenBlocks: []string{"heading"}},
		}},
	}
	mobile := InterfacePreferences{
		HiddenNavItems:   []string{"research"},
		NavOrder:         []string{"personal", "work"},
		DashboardWidgets: []string{"focus"},
		Layout: InterfaceLayout{Density: "compact", ToolbarActions: []string{"notifications"}, Pages: map[string]PageLayout{
			"personal": {HiddenBlocks: []string{"life"}},
		}},
	}
	requestWorkspaceJSON(t, ownerClient, http.MethodPut, server.URL+"/api/interface/preferences?device=desktop", source.ID, desktop, http.StatusOK, &InterfacePreferences{})
	requestWorkspaceJSON(t, ownerClient, http.MethodPut, server.URL+"/api/interface/preferences?device=mobile", source.ID, mobile, http.StatusOK, &InterfacePreferences{})

	var created InterfacePreset
	requestWorkspaceJSON(t, ownerClient, http.MethodPost, server.URL+"/api/interface/presets", source.ID, map[string]any{
		"name": "Подготовка к экзамену", "description": "Спокойное меню и компактный телефон", "visibility": "private",
	}, http.StatusCreated, &created)
	if !created.Mine || created.Visibility != "private" || created.Summary["mobile"].CustomizedPages != 1 {
		t.Fatalf("created preset = %#v", created)
	}
	requestWorkspaceJSON(t, recipientClient, http.MethodGet, server.URL+"/api/interface/presets/"+created.ID, target.ID, nil, http.StatusNotFound, nil)

	var payloadJSON string
	if err := store.db.QueryRow(`SELECT payload_json FROM interface_presets WHERE id = ?`, created.ID).Scan(&payloadJSON); err != nil {
		t.Fatal(err)
	}
	var payload InterfacePresetPayload
	if err := json.Unmarshal([]byte(payloadJSON), &payload); err != nil {
		t.Fatal(err)
	}
	if len(payload.Desktop.HiddenNavItems) != 1 || payload.Desktop.HiddenNavItems[0] != "chat" || len(payload.Desktop.Layout.Pages) != 1 {
		t.Fatalf("project identifiers leaked into preset: %#v", payload.Desktop)
	}
	if fields := payload.Desktop.Layout.Pages["work"].HiddenFields; len(fields) != 1 || fields[0] != "owner" {
		t.Fatalf("custom field identifier leaked into preset: %#v", fields)
	}

	visibility := "public"
	var published InterfacePreset
	requestWorkspaceJSON(t, ownerClient, http.MethodPatch, server.URL+"/api/interface/presets/"+created.ID, source.ID, map[string]any{
		"visibility": visibility, "expectedUpdatedAt": created.UpdatedAt,
	}, http.StatusOK, &published)
	if published.PublishedAt == nil || published.Visibility != "public" {
		t.Fatalf("published preset = %#v", published)
	}
	var publicCatalog []InterfacePreset
	requestWorkspaceJSON(t, recipientClient, http.MethodGet, server.URL+"/api/interface/presets?scope=public", target.ID, nil, http.StatusOK, &publicCatalog)
	if len(publicCatalog) != 1 || publicCatalog[0].OwnerName != "preset_owner" {
		t.Fatalf("public catalog = %#v", publicCatalog)
	}

	targetDesktop := InterfacePreferences{DashboardWidgets: []string{"quality"}, Layout: InterfaceLayout{ContentWidth: 2100}}
	requestWorkspaceJSON(t, recipientClient, http.MethodPut, server.URL+"/api/interface/preferences?device=desktop", target.ID, targetDesktop, http.StatusOK, &InterfacePreferences{})
	var application interfacePresetApplicationResponse
	requestWorkspaceJSON(t, recipientClient, http.MethodPost, server.URL+"/api/interface/presets/"+created.ID+"/apply", target.ID, map[string]any{
		"devices": []string{"mobile"},
	}, http.StatusOK, &application)
	if application.ApplicationID == "" || application.Profiles["mobile"].Layout.Density != "compact" {
		t.Fatalf("application = %#v", application)
	}
	var latest *interfacePresetLatestApplication
	requestWorkspaceJSON(t, recipientClient, http.MethodGet, server.URL+"/api/interface/preset-applications/latest", target.ID, nil, http.StatusOK, &latest)
	if latest == nil || latest.ID != application.ApplicationID || !latest.CanUndo {
		t.Fatalf("latest application = %#v", latest)
	}
	var unchangedDesktop, appliedMobile InterfacePreferences
	requestWorkspaceJSON(t, recipientClient, http.MethodGet, server.URL+"/api/interface/preferences?device=desktop", target.ID, nil, http.StatusOK, &unchangedDesktop)
	requestWorkspaceJSON(t, recipientClient, http.MethodGet, server.URL+"/api/interface/preferences?device=mobile", target.ID, nil, http.StatusOK, &appliedMobile)
	if unchangedDesktop.Layout.ContentWidth != 2100 || appliedMobile.Layout.Density != "compact" || len(appliedMobile.HiddenNavItems) != 1 {
		t.Fatalf("device isolation after apply: desktop=%#v mobile=%#v", unchangedDesktop, appliedMobile)
	}

	var undone interfacePresetApplicationResponse
	requestWorkspaceJSON(t, recipientClient, http.MethodPost, server.URL+"/api/interface/preset-applications/"+application.ApplicationID+"/undo", target.ID, map[string]any{}, http.StatusOK, &undone)
	requestWorkspaceJSON(t, recipientClient, http.MethodGet, server.URL+"/api/interface/preferences?device=mobile", target.ID, nil, http.StatusOK, &appliedMobile)
	if appliedMobile.Layout.Density != "comfortable" || len(appliedMobile.HiddenNavItems) != 0 {
		t.Fatalf("undo did not restore previous mobile preferences: %#v", appliedMobile)
	}
	requestWorkspaceJSON(t, recipientClient, http.MethodPost, server.URL+"/api/interface/preset-applications/"+application.ApplicationID+"/undo", target.ID, map[string]any{}, http.StatusConflict, nil)
	requestWorkspaceJSON(t, recipientClient, http.MethodGet, server.URL+"/api/interface/preset-applications/latest", target.ID, nil, http.StatusOK, &latest)
	if latest != nil {
		t.Fatal("undone application must not offer another undo")
	}

	requestWorkspaceJSON(t, recipientClient, http.MethodPost, server.URL+"/api/interface/presets/"+created.ID+"/apply", target.ID, map[string]any{"devices": []string{"mobile"}}, http.StatusOK, &application)
	changedMobile := InterfacePreferences{DashboardWidgets: []string{"focus", "quality"}, Layout: InterfaceLayout{Density: "comfortable"}}
	requestWorkspaceJSON(t, recipientClient, http.MethodPut, server.URL+"/api/interface/preferences?device=mobile", target.ID, changedMobile, http.StatusOK, &InterfacePreferences{})
	requestWorkspaceJSON(t, recipientClient, http.MethodPost, server.URL+"/api/interface/preset-applications/"+application.ApplicationID+"/undo", target.ID, map[string]any{}, http.StatusConflict, nil)
	requestWorkspaceJSON(t, recipientClient, http.MethodGet, server.URL+"/api/interface/preset-applications/latest", target.ID, nil, http.StatusOK, &latest)
	if latest == nil || latest.CanUndo {
		t.Fatalf("manual edits must disable automatic undo: %#v", latest)
	}
	var exported struct {
		SchemaVersion int                         `json:"schemaVersion"`
		Tables        map[string][]map[string]any `json:"tables"`
	}
	requestWorkspaceJSON(t, ownerClient, http.MethodGet, server.URL+"/api/export", source.ID, nil, http.StatusOK, &exported)
	if exported.SchemaVersion != 16 || len(exported.Tables["myInterfacePresets"]) != 1 {
		t.Fatal("owned presets missing from account export")
	}
	requestWorkspaceJSON(t, recipientClient, http.MethodGet, server.URL+"/api/export", target.ID, nil, http.StatusOK, &exported)
	if len(exported.Tables["myInterfacePresets"]) != 0 {
		t.Fatal("another account's presets leaked into export")
	}

	requestWorkspaceJSON(t, recipientClient, http.MethodPatch, server.URL+"/api/interface/presets/"+created.ID, target.ID, map[string]any{"name": "Stolen"}, http.StatusNotFound, nil)
	requestWorkspaceJSON(t, ownerClient, http.MethodDelete, server.URL+"/api/interface/presets/"+created.ID, source.ID, nil, http.StatusNoContent, nil)
	requestWorkspaceJSON(t, recipientClient, http.MethodGet, server.URL+"/api/interface/presets/"+created.ID, target.ID, nil, http.StatusNotFound, nil)
}

func TestRequestedPresetDevicesRejectsDuplicatesAndUnknownValues(t *testing.T) {
	if devices, err := requestedPresetDevices(nil); err != nil || len(devices) != 2 {
		t.Fatalf("default devices = %#v, %v", devices, err)
	}
	if _, err := requestedPresetDevices([]string{"desktop", "desktop"}); err == nil {
		t.Fatal("duplicate devices must be rejected")
	}
	if _, err := requestedPresetDevices([]string{"tablet"}); err == nil {
		t.Fatal("unknown device must be rejected")
	}
}

func TestPortablePresetMergeKeepsTargetProjectLayouts(t *testing.T) {
	current := defaultInterfacePreferences("desktop")
	current.HiddenNavItems = []string{"chat", "page:local"}
	current.NavOrder = []string{"page:local", "work"}
	current.Layout.Pages = map[string]PageLayout{
		"collection:local": {HiddenFields: []string{"field:local"}},
		"work":             {HiddenBlocks: []string{"heading"}},
	}
	preset := defaultInterfacePreferences("desktop")
	preset.HiddenNavItems = []string{"research"}
	preset.NavOrder = []string{"personal", "work"}
	preset.Layout.Pages = map[string]PageLayout{
		"work":              {HiddenBlocks: []string{"summary", "private-secret"}, HiddenFields: []string{"owner", "field:secret"}, Order: []string{"records", "customer-id"}},
		"collection:source": {HiddenFields: []string{"field:source"}},
	}
	merged := mergePortableInterfacePreferences(current, preset, "desktop")
	if len(merged.HiddenNavItems) != 2 || merged.HiddenNavItems[1] != "page:local" || merged.NavOrder[2] != "page:local" {
		t.Fatalf("local menu was lost: %#v", merged)
	}
	if _, ok := merged.Layout.Pages["collection:local"]; !ok {
		t.Fatal("target CRM layout was lost")
	}
	if _, ok := merged.Layout.Pages["collection:source"]; ok {
		t.Fatal("source CRM identifier leaked")
	}
	work := merged.Layout.Pages["work"]
	if len(work.HiddenBlocks) != 1 || work.HiddenBlocks[0] != "summary" || len(work.HiddenFields) != 1 || len(work.Order) != 1 {
		t.Fatalf("portable block allowlist failed: %#v", work)
	}
}
