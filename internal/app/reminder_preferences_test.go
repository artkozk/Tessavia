package app

import (
	"context"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func TestReminderPreferencesOwnerVersionValidationAndQuietDelivery(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "preferences.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	client, other := testClient(t), testClient(t)
	user := registerVerifiedWithoutFixture(t, client, server.URL, "reminder-prefs@example.test", "reminder_prefs")
	registerVerifiedWithoutFixture(t, other, server.URL, "other-prefs@example.test", "other_prefs")
	var workspace Workspace
	requestJSON(t, client, "POST", server.URL+"/api/workspaces", map[string]any{"name": "My delivery project"}, 201, &workspace)
	var foreign Workspace
	requestJSON(t, other, "POST", server.URL+"/api/workspaces", map[string]any{"name": "Other project"}, 201, &foreign)
	var defaults reminderPreferences
	requestJSON(t, client, "GET", server.URL+"/api/me/reminders", nil, 200, &defaults)
	if !defaults.DeadlineEnabled || defaults.Timezone != "Europe/Moscow" || len(defaults.Projects) != 1 || defaults.Projects[0].WorkspaceID != workspace.ID {
		t.Fatalf("defaults: %+v", defaults)
	}
	var rows int
	store.db.QueryRow(`SELECT COUNT(*) FROM reminder_preferences`).Scan(&rows)
	if rows != 0 {
		t.Fatal("GET created preferences")
	}
	payload := map[string]any{"deadlineEnabled": true, "timezone": "America/New_York", "quietStart": "", "quietEnd": "", "projects": []map[string]any{{"workspaceId": workspace.ID, "enabled": false}}, "expectedUpdatedAt": ""}
	var saved reminderPreferences
	requestJSON(t, client, "PUT", server.URL+"/api/me/reminders", payload, 200, &saved)
	if saved.UpdatedAt == "" || saved.Projects[0].Enabled {
		t.Fatalf("save: %+v", saved)
	}
	version := saved.UpdatedAt
	requestJSON(t, client, "PUT", server.URL+"/api/me/reminders", payload, 200, &saved)
	if saved.UpdatedAt != version {
		t.Fatal("same payload replay changed version")
	}
	payload["timezone"] = "UTC"
	requestJSON(t, client, "PUT", server.URL+"/api/me/reminders", payload, 409, nil)
	payload["expectedUpdatedAt"] = version
	for _, zone := range []string{"", "Local", "Invalid/Zone"} {
		payload["timezone"] = zone
		requestJSON(t, client, "PUT", server.URL+"/api/me/reminders", payload, 400, nil)
	}
	payload["timezone"] = "America/New_York"
	payload["quietStart"] = "22:00"
	payload["quietEnd"] = "22:00"
	requestJSON(t, client, "PUT", server.URL+"/api/me/reminders", payload, 400, nil)
	payload["quietStart"] = ""
	payload["quietEnd"] = ""
	payload["projects"] = []map[string]any{{"workspaceId": foreign.ID, "enabled": false}}
	requestJSON(t, client, "PUT", server.URL+"/api/me/reminders", payload, 403, nil)
	payload["projects"] = []map[string]any{{"workspaceId": workspace.ID, "enabled": false}, {"workspaceId": workspace.ID, "enabled": true}}
	requestJSON(t, client, "PUT", server.URL+"/api/me/reminders", payload, 400, nil)
	var unrelated reminderPreferences
	requestJSON(t, other, "GET", server.URL+"/api/me/reminders", nil, 200, &unrelated)
	if unrelated.Timezone != "Europe/Moscow" || len(unrelated.Projects) != 1 || unrelated.Projects[0].WorkspaceID != foreign.ID {
		t.Fatal("preferences leaked to another account")
	}
	now, _ := time.Parse(time.RFC3339, "2026-09-04T05:30:00Z")
	var record Record
	requestWorkspaceJSON(t, client, "POST", server.URL+"/api/records", workspace.ID, map[string]any{"type": "task", "title": "Quiet delivery", "ownerId": user.ID, "status": "planned", "dueAt": "2026-09-04T16:00:00Z"}, 201, &record)
	count := func() int {
		var n int
		store.db.QueryRow(`SELECT COUNT(*) FROM deadline_delivery_sources`).Scan(&n)
		return n
	}
	run := func(at time.Time) {
		if err := deliverDeadlineReminders(context.Background(), store, at); err != nil {
			t.Fatal(err)
		}
	}
	run(now)
	if count() != 0 {
		t.Fatal("disabled project received a reminder")
	}
	payload["projects"] = []map[string]any{{"workspaceId": workspace.ID, "enabled": true}}
	payload["quietStart"] = "22:00"
	payload["quietEnd"] = "08:00"
	requestJSON(t, client, "PUT", server.URL+"/api/me/reminders", payload, 200, &saved)
	payload["expectedUpdatedAt"] = saved.UpdatedAt
	run(now)
	if count() != 0 {
		t.Fatal("delivered during local quiet hours")
	}
	run(now.Add(7 * time.Hour))
	run(now.Add(7 * time.Hour))
	if count() != 1 {
		t.Fatal("quiet hours release missed or duplicated")
	}
	var zone, kind string
	store.db.QueryRow(`SELECT timezone,kind FROM deadline_delivery_sources`).Scan(&zone, &kind)
	if zone != "America/New_York" || kind != "due_today" {
		t.Fatalf("wrong delivery zone: %s %s", zone, kind)
	}
	payload["timezone"] = "UTC"
	payload["deadlineEnabled"] = false
	requestJSON(t, client, "PUT", server.URL+"/api/me/reminders", payload, 200, &saved)
	run(now.Add(24 * time.Hour))
	if count() != 1 {
		t.Fatal("global disabled still delivered")
	}
	var fresh int
	store.db.QueryRow(`SELECT COUNT(*) FROM notifications n WHERE n.type='deadline' AND ` + notificationFresh).Scan(&fresh)
	if fresh != 0 {
		t.Fatal("old timezone still contributes live alerts")
	}
}

func TestReminderQuietHoursIncludeStartExcludeEndAndFollowLocalClock(t *testing.T) {
	loc, _ := time.LoadLocation("America/New_York")
	p := reminderPreferences{QuietStart: "22:00", QuietEnd: "08:00"}
	for _, c := range []struct {
		at    string
		quiet bool
	}{{"2026-09-04T21:59:00-04:00", false}, {"2026-09-04T22:00:00-04:00", true}, {"2026-09-05T07:59:00-04:00", true}, {"2026-09-05T08:00:00-04:00", false}} {
		at, _ := time.Parse(time.RFC3339, c.at)
		if reminderQuiet(p, at, loc) != c.quiet {
			t.Fatal(c.at)
		}
	}
	p.QuietStart = "01:00"
	p.QuietEnd = "02:00"
	for _, value := range []string{"2026-11-01T01:30:00-04:00", "2026-11-01T01:30:00-05:00"} {
		at, _ := time.Parse(time.RFC3339, value)
		if !reminderQuiet(p, at, loc) {
			t.Fatal("DST repeated quiet hour ignored")
		}
	}
}
