package app

import (
	"context"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestDeadlineWindowUsesCivilDaysAndExactDueBoundary(t *testing.T) {
	cases := []struct{ now, due, zone, kind, until string }{
		{"2026-09-04T00:30:00+03:00", "2026-09-04T23:30:00+03:00", "Europe/Moscow", "due_today", "2026-09-04T23:30:00+03:00"},
		{"2026-09-04T23:30:00+03:00", "2026-09-05T01:00:00+03:00", "Europe/Moscow", "due_tomorrow", "2026-09-05T00:00:00+03:00"},
		{"2026-09-04T12:00:00+03:00", "2026-09-04T12:00:00+03:00", "Europe/Moscow", "overdue", "2026-09-05T00:00:00+03:00"},
		{"2026-03-08T00:30:00-05:00", "2026-03-09T01:00:00-04:00", "America/New_York", "due_tomorrow", "2026-03-09T00:00:00-04:00"},
		{"2026-11-01T00:30:00-04:00", "2026-11-02T01:00:00-05:00", "America/New_York", "due_tomorrow", "2026-11-02T00:00:00-05:00"},
		{"2026-09-04T12:00:00+03:00", "2026-09-06T00:00:00+03:00", "Europe/Moscow", "", ""},
	}
	for _, c := range cases {
		now, _ := time.Parse(time.RFC3339, c.now)
		due, _ := time.Parse(time.RFC3339, c.due)
		loc, _ := time.LoadLocation(c.zone)
		kind, _, until := deadlineWindow(now, due, loc)
		if kind != c.kind || c.until != "" && until.Format(time.RFC3339) != c.until {
			t.Fatalf("%+v: %s %v", c, kind, until)
		}
	}
}

func TestDeadlineWorkerReplayCancellationAndReadOnlyHTTP(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "reminders.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	client, other := testClient(t), testClient(t)
	user := registerVerifiedWithoutFixture(t, client, server.URL, "reminder@example.test", "reminder_owner")
	otherUser := registerVerifiedWithoutFixture(t, other, server.URL, "other-reminder@example.test", "reminder_other")
	var workspace Workspace
	requestJSON(t, client, "POST", server.URL+"/api/workspaces", map[string]any{"name": "Deadline delivery"}, 201, &workspace)
	now := time.Now().UTC()
	due := now.Add(-time.Hour).Format(time.RFC3339Nano)
	var record Record
	requestWorkspaceJSON(t, client, "POST", server.URL+"/api/records", workspace.ID, map[string]any{"type": "task", "title": "Private deadline source", "dueAt": due, "ownerId": user.ID, "status": "planned"}, 201, &record)
	count := func() int {
		var n int
		if err := store.db.QueryRow(`SELECT COUNT(*) FROM notifications WHERE type='deadline'`).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	for i := 0; i < 2; i++ {
		requestJSON(t, client, "GET", server.URL+"/api/notifications", nil, 200, nil)
		requestJSON(t, client, "GET", server.URL+"/api/notifications/inbox", nil, 200, nil)
	}
	if count() != 0 {
		t.Fatal("HTTP read generated a delivery")
	}
	var wg sync.WaitGroup
	errs := make(chan error, 5)
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); errs <- deliverDeadlineReminders(context.Background(), store, now) }()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if count() != 1 {
		t.Fatalf("concurrent/restart duplicate: %d", count())
	}
	var original string
	store.db.QueryRow(`SELECT id FROM notifications WHERE type='deadline'`).Scan(&original)
	fresh := func() int {
		var n int
		if err := store.db.QueryRow(`SELECT COUNT(*) FROM notifications n WHERE n.type='deadline' AND ` + notificationFresh).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	if fresh() != 1 {
		t.Fatal("new delivery is not fresh")
	}
	update := func(query string, args ...any) {
		if _, err := store.db.Exec(query, args...); err != nil {
			t.Fatal(err)
		}
	}
	moved := now.Add(7 * 24 * time.Hour).Format(time.RFC3339Nano)
	update(`UPDATE records SET due_at=?,updated_at=? WHERE id=?`, moved, nowText(), record.ID)
	if fresh() != 0 {
		t.Fatal("moved deadline is still a live alert")
	}
	requestJSON(t, client, "GET", server.URL+"/api/notifications/inbox?status=all", nil, 200, nil)
	var history notificationInbox
	requestJSON(t, client, "GET", server.URL+"/api/notifications/inbox?status=all", nil, 200, &history)
	found := false
	for _, n := range history.Items {
		if n.ID == original {
			found = n.Obsolete
		}
	}
	if !found {
		t.Fatal("historical message was lost or presented as current")
	}
	update(`UPDATE records SET due_at=?,updated_at=? WHERE id=?`, now.Add(-2*time.Hour).Format(time.RFC3339Nano), nowText(), record.ID)
	if err = deliverDeadlineReminders(context.Background(), store, now); err != nil {
		t.Fatal(err)
	}
	if count() != 2 || fresh() != 1 {
		t.Fatal("changed deadline was not replaced exactly once")
	}
	update(`UPDATE records SET status='completed' WHERE id=?`, record.ID)
	if fresh() != 0 {
		t.Fatal("completed record still alerts")
	}
	update(`UPDATE records SET status='planned',owner_id=? WHERE id=?`, otherUser.ID, record.ID)
	if fresh() != 0 {
		t.Fatal("reassigned record still alerts the old owner")
	}
	if err = deliverDeadlineReminders(context.Background(), store, now); err != nil {
		t.Fatal(err)
	}
	if count() != 2 {
		t.Fatal("sent to owner without project access")
	}
	var denied notificationInbox
	requestJSON(t, other, "GET", server.URL+"/api/notifications/inbox", nil, 200, &denied)
	if len(denied.Items) != 0 {
		t.Fatal("another account read notification text")
	}
	update(`UPDATE records SET owner_id=? WHERE id=?`, user.ID, record.ID)
	update(`UPDATE workspace_members SET status='suspended' WHERE workspace_id=? AND user_id=?`, workspace.ID, user.ID)
	var revoked notificationInbox
	requestJSON(t, client, "GET", server.URL+"/api/notifications/inbox", nil, 200, &revoked)
	if len(revoked.Items) != 0 || revoked.UnreadCount != 0 {
		t.Fatal("revoked access still reveals notification")
	}
	if err = deliverDeadlineReminders(context.Background(), store, now.Add(24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if count() != 2 {
		t.Fatal("worker delivered after membership revocation")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	done := make(chan struct{})
	go func() { RunReminderWorker(ctx, store); close(done) }()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("cancelled worker did not stop")
	}
}
