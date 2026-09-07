package app

import (
	"context"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func TestHabitSnoozePreservesFactAndRejectsStaleReplay(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "snooze.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	client, other := testClient(t), testClient(t)
	registerVerifiedWithoutFixture(t, client, server.URL, "snooze@example.test", "snooze_owner")
	registerVerifiedWithoutFixture(t, other, server.URL, "snooze-other@example.test", "snooze_other")
	today := time.Now().UTC().Format("2006-01-02")
	rule := trackerFixture("duration", "daily", today).Rule
	rule.Target = 30
	rule.Unit = "мин"
	rule.ReminderTime = "00:00"
	var h PersonalHabit
	requestJSON(t, client, "POST", server.URL+"/api/personal/habits", map[string]any{"title": "Measured time survives later", "timezone": "UTC", "startDate": today, "rule": rule}, 201, &h)
	base := server.URL + "/api/personal/habits/" + h.ID
	path := base + "/checkins/" + today
	var fact HabitCheckin
	requestJSON(t, client, "PUT", path, map[string]any{"state": "measured", "value": 10.5, "note": "First walk", "expectedUpdatedAt": "", "revision": h.Revision}, 200, &fact)
	if err = deliverHabitReminders(context.Background(), store, time.Now()); err != nil {
		t.Fatal(err)
	}
	payload := map[string]any{"state": "snoozed", "value": 0, "note": "must not replace the saved note", "expectedUpdatedAt": fact.UpdatedAt, "revision": h.Revision}
	var snoozed HabitCheckin
	requestJSON(t, other, "PUT", path, payload, 404, nil)
	requestJSON(t, client, "PUT", path, payload, 200, &snoozed)
	if snoozed.State != "measured" || snoozed.Value != 10.5 || snoozed.Note != fact.Note || snoozed.SnoozedAt == "" {
		t.Fatal("postpone replaced measured fact or note")
	}
	var replay HabitCheckin
	requestJSON(t, client, "PUT", path, payload, 200, &replay)
	if replay.UpdatedAt != snoozed.UpdatedAt || replay.SnoozedAt != snoozed.SnoozedAt {
		t.Fatal("lost-reply retry postponed again")
	}
	var tracker HabitTracker
	requestJSON(t, client, "GET", base+"/tracker?from="+today+"&to="+today, nil, 200, &tracker)
	if len(tracker.Days) != 1 || tracker.Days[0].State != "partial" || tracker.Summary.Total != 10.5 {
		t.Fatal("postpone changed tracker statistics")
	}
	var exported PersonalHabit
	requestJSON(t, client, "GET", base+"/export", nil, 200, &exported)
	if len(exported.Checkins) != 1 || exported.Checkins[0].SnoozedAt != snoozed.SnoozedAt || exported.Checkins[0].Note != fact.Note {
		t.Fatal("export lost fact or deferral")
	}
	var inbox notificationInbox
	requestJSON(t, client, "GET", server.URL+"/api/notifications/inbox?status=unread", nil, 200, &inbox)
	if len(inbox.Items) != 0 {
		t.Fatal("old reminder stayed active after postponing")
	}
	at, _ := time.Parse(time.RFC3339Nano, snoozed.SnoozedAt)
	if err = deliverHabitReminders(context.Background(), store, at.Add(30*time.Minute)); err != nil {
		t.Fatal(err)
	}
	var count int
	// Advancing the clock near midnight can also create tomorrow's ordinary reminder.
	store.db.QueryRow(`SELECT COUNT(*) FROM habit_reminder_sources WHERE habit_id=? AND day=?`, h.ID, today).Scan(&count)
	if count != 1 {
		t.Fatal("reminded before one hour")
	}
	if err = deliverHabitReminders(context.Background(), store, at.Add(61*time.Minute)); err != nil {
		t.Fatal(err)
	}
	// Advancing the clock near midnight can also create tomorrow's ordinary reminder.
	store.db.QueryRow(`SELECT COUNT(*) FROM habit_reminder_sources WHERE habit_id=? AND day=?`, h.ID, today).Scan(&count)
	if at.Add(61*time.Minute).UTC().Format("2006-01-02") == today && count != 2 {
		t.Fatal("partial fact did not get deferred reminder")
	}
	requestJSON(t, client, "PUT", path, map[string]any{"state": "measured", "value": 10.5, "note": fact.Note, "expectedUpdatedAt": snoozed.UpdatedAt, "revision": h.Revision}, 200, &fact)
	if fact.SnoozedAt != "" {
		t.Fatal("new measurement retained deferral")
	}
	requestJSON(t, client, "PUT", path, payload, 409, nil)
	requestJSON(t, client, "PUT", path, map[string]any{"state": "measured", "value": 30, "note": fact.Note, "expectedUpdatedAt": fact.UpdatedAt, "revision": h.Revision}, 200, &fact)
	requestJSON(t, client, "PUT", path, map[string]any{"state": "snoozed", "expectedUpdatedAt": fact.UpdatedAt, "revision": h.Revision}, 400, nil)
}

func TestHabitSnoozeWithoutFactDoesNotInventSuccess(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "empty-snooze.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	client := testClient(t)
	registerVerifiedWithoutFixture(t, client, server.URL, "empty-snooze@example.test", "empty_snooze")
	today := time.Now().UTC().Format("2006-01-02")
	rule := trackerFixture("quit", "daily", today).Rule
	var h PersonalHabit
	requestJSON(t, client, "POST", server.URL+"/api/personal/habits", map[string]any{"title": "No automatic clean day", "timezone": "UTC", "startDate": today, "rule": rule}, 201, &h)
	path := server.URL + "/api/personal/habits/" + h.ID + "/checkins/" + today
	payload := map[string]any{"state": "snoozed", "expectedUpdatedAt": "", "revision": h.Revision}
	var a, b HabitCheckin
	requestJSON(t, client, "PUT", path, payload, 200, &a)
	requestJSON(t, client, "PUT", path, payload, 200, &b)
	if a.SnoozedAt == "" || a.State != "snoozed" || a.UpdatedAt != b.UpdatedAt {
		t.Fatal("empty-day deferral is not idempotent")
	}
	h.Checkins = []HabitCheckin{a}
	checks := map[string]HabitCheckin{today: a}
	if habitDay(h, today, today, checks).State != "snoozed" || habitDay(h, today, habitAdd(today, 1), checks).State != "pending" {
		t.Fatal("empty result became success")
	}
	requestJSON(t, client, "DELETE", path, map[string]any{"expectedUpdatedAt": a.UpdatedAt, "revision": h.Revision}, 204, nil)
	var n int
	store.db.QueryRow(`SELECT COUNT(*) FROM personal_habit_checkins WHERE habit_id=?`, h.ID).Scan(&n)
	if n != 0 {
		t.Fatal("deletion retained deferral")
	}
	requestJSON(t, client, "POST", server.URL+"/api/personal/habits/"+h.ID+"/pause", map[string]any{"revision": h.Revision}, 204, nil)
	requestJSON(t, client, "PUT", path, payload, 400, nil)
}
