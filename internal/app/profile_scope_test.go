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
