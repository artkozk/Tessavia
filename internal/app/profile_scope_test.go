package app

import (
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestProfileDoesNotLeakAnotherProjectOrPersonalActivity(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "profile-scope.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	ownerClient, viewerClient := testClient(t), testClient(t)
	owner := register(t, ownerClient, server.URL, "profile-owner@example.test", "profile_owner")
	viewer := register(t, viewerClient, server.URL, "profile-viewer@example.test", "profile_viewer")
	var shared, private Workspace
	requestJSON(t, ownerClient, "POST", server.URL+"/api/workspaces", map[string]any{"name": "Shared", "memberIds": []int64{viewer.ID}}, 201, &shared)
	requestJSON(t, ownerClient, "POST", server.URL+"/api/workspaces", map[string]any{"name": "Private project"}, 201, &private)
	var visible, hidden Record
	requestWorkspaceJSON(t, ownerClient, "POST", server.URL+"/api/records", shared.ID, map[string]any{"type": "task", "title": "Shared task"}, 201, &visible)
	requestWorkspaceJSON(t, ownerClient, "POST", server.URL+"/api/records", private.ID, map[string]any{"type": "task", "title": "secret-profile-scope-marker"}, 201, &hidden)
	// Fixtures represent completed work without creating unrelated proof records.
	if _, err := store.db.Exec(`UPDATE records SET status='completed',estimate_minutes=10,actual_minutes=20 WHERE id IN (?,?)`, visible.ID, hidden.ID); err != nil {
		t.Fatal(err)
	}
	requestWorkspaceJSON(t, ownerClient, "POST", server.URL+"/api/presence", private.ID, map[string]any{"activeSeconds": 45, "interactions": 12}, 204, nil)
	var profile UserProfile
	url := server.URL + "/api/users/" + strconv.FormatInt(owner.ID, 10) + "/profile"
	requestWorkspaceJSON(t, viewerClient, "GET", url, shared.ID, nil, 200, &profile)
	if profile.CompletedRecords != 1 || profile.EstimateMinutes != 10 || profile.ActualMinutes != 20 {
		t.Fatalf("cross-project totals: %+v", profile)
	}
	if len(profile.Activity) != 0 || profile.ActiveSeconds30Days != 0 || profile.Interactions30Days != 0 {
		t.Fatal("private activity leaked")
	}
	body, _ := json.Marshal(profile)
	if strings.Contains(string(body), hidden.ID) || strings.Contains(string(body), "secret-profile-scope-marker") {
		t.Fatal("private history leaked")
	}
	for _, event := range profile.RecentActions {
		if event.EntityID == hidden.ID {
			t.Fatal("private event leaked")
		}
	}
	requestWorkspaceJSON(t, ownerClient, "GET", url, shared.ID, nil, 200, &profile)
	if profile.ActiveSeconds30Days != 45 || len(profile.Activity) != 1 {
		t.Fatal("owner lost private activity")
	}
}

func TestBasicProfileDoesNotLoadPersonalCollectionsOrExposeSettingsToPartner(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "basic-profile.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: time.Hour}))
	defer server.Close()
	ownerClient, partnerClient := testClient(t), testClient(t)
	owner := register(t, ownerClient, server.URL, "basic_owner@example.test", "basic_owner")
	register(t, partnerClient, server.URL, "basic_partner@example.test", "basic_partner")
	requestJSON(t, ownerClient, "PATCH", server.URL+"/api/me", map[string]any{"birthDate": "1990-01-02", "lifeExpectancyYears": 90}, 200, nil)
	requestJSON(t, ownerClient, "POST", server.URL+"/api/personal/notes", map[string]any{"title": "Private note", "body": "private-note-must-not-be-loaded-with-profile"}, 201, nil)
	path := server.URL + "/api/users/" + strconv.FormatInt(owner.ID, 10) + "/profile?view=basic"
	var basic map[string]any
	requestJSON(t, ownerClient, "GET", path, nil, 200, &basic)
	if len(basic) != 2 || basic["settings"].(map[string]any)["birthDate"] != "1990-01-02" {
		t.Fatalf("bad own basic profile: %#v", basic)
	}
	data, _ := json.Marshal(basic)
	if strings.Contains(string(data), "private-note-must-not") || basic["recentActions"] != nil || basic["activity"] != nil {
		t.Fatal("basic profile includes unrelated collections")
	}
	// Omitted fields remain unchanged while their separate request is still pending.
	requestJSON(t, ownerClient, "PATCH", server.URL+"/api/me", map[string]any{"displayName": "Updated immediately"}, 200, nil)
	requestJSON(t, ownerClient, "GET", path, nil, 200, &basic)
	if basic["settings"].(map[string]any)["birthDate"] != "1990-01-02" {
		t.Fatal("saving name cleared private setting")
	}
	requestJSON(t, ownerClient, "PUT", server.URL+"/api/me/password", map[string]any{"currentPassword": "wrong-password", "newPassword": "new-long-password"}, 400, nil)
	requestJSON(t, ownerClient, "GET", server.URL+"/api/me", nil, 200, nil)
	basic = nil
	requestJSON(t, partnerClient, "GET", path, nil, 200, &basic)
	if len(basic) != 1 || basic["settings"] != nil {
		t.Fatal("private settings leaked to partner")
	}
}
