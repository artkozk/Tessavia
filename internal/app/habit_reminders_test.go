package app

import (
	"context"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestHabitReminderRespectsDayStateQuotaAndDST(t *testing.T) {
	h := trackerFixture("quantity", "daily", "2026-03-01")
	h.Timezone = "America/New_York"
	h.ID = "habit"
	h.Rules[0].Target = 2
	h.Rules[0].ReminderTime = "02:30"
	snapshot := reminderHabit{habit: h}
	at := func(value string) time.Time { v, _ := time.Parse(time.RFC3339, value); return v }
	_, _, _, _, _, eligible := habitReminderOn(snapshot, at("2026-03-08T01:59:00-05:00"))
	if eligible {
		t.Fatal("delivered before local time")
	}
	_, _, _, _, until, eligible := habitReminderOn(snapshot, at("2026-03-08T03:00:00-04:00"))
	if !eligible || until.Format(time.RFC3339) != "2026-03-09T00:00:00-04:00" {
		t.Fatal("missing spring hour or midnight handled incorrectly")
	}
	snapshot.time = "01:30"
	snapshot.revision = 1
	_, _, first, _, _, yes := habitReminderOn(snapshot, at("2026-11-01T01:30:00-04:00"))
	_, _, second, _, _, again := habitReminderOn(snapshot, at("2026-11-01T01:30:00-05:00"))
	if !yes || !again || first != second {
		t.Fatal("fall repeated hour has a new delivery key")
	}
	now := at("2026-09-04T12:00:00-04:00")
	today := "2026-09-04"
	for _, state := range []string{"failed", "skipped"} {
		snapshot.habit.Checkins = []HabitCheckin{{Date: today, State: state}}
		_, _, _, _, _, eligible = habitReminderOn(snapshot, now)
		if eligible {
			t.Fatal("reminded a recorded result", state)
		}
	}
	snapshot.habit.Checkins = []HabitCheckin{measured(today, 2)}
	_, _, _, _, _, eligible = habitReminderOn(snapshot, now)
	if eligible {
		t.Fatal("successful day still reminded")
	}
	snapshot.habit.Checkins = []HabitCheckin{measured(today, 1)}
	_, _, _, _, _, eligible = habitReminderOn(snapshot, now)
	if !eligible {
		t.Fatal("partial day lost reminder")
	}
	snapshot.habit.Pauses = []HabitPause{{StartDate: today}}
	_, _, _, _, _, eligible = habitReminderOn(snapshot, now)
	if eligible {
		t.Fatal("pause with partial fact still reminded")
	}
	snapshot.habit.Pauses = nil
	snapshot.habit.Checkins = []HabitCheckin{{Date: today, State: "snoozed", UpdatedAt: now.Add(-30 * time.Minute).Format(time.RFC3339)}}
	_, _, _, _, _, eligible = habitReminderOn(snapshot, now)
	if eligible {
		t.Fatal("snooze too early")
	}
	_, _, key, _, _, eligible := habitReminderOn(snapshot, now.Add(31*time.Minute))
	if !eligible || key == first {
		t.Fatal("snooze did not create a later cycle")
	}
	snapshot.habit.Checkins = nil
	snapshot.habit.Moves = []HabitMove{{SourceDate: today, TargetDate: "2026-09-05"}}
	_, _, _, _, _, eligible = habitReminderOn(snapshot, now)
	if eligible {
		t.Fatal("moved source day still reminded")
	}
	snapshot.habit.Moves = nil
	snapshot.habit.Rules[0].Cadence = "weekly"
	snapshot.habit.Rules[0].PeriodTarget = 2
	snapshot.habit.Checkins = []HabitCheckin{measured("2026-09-01", 2), measured("2026-09-02", 2)}
	_, _, _, _, _, eligible = habitReminderOn(snapshot, now)
	if eligible {
		t.Fatal("reached weekly quota still reminded")
	}
	snapshot.habit.Rules[0].Cadence = "monthly"
	snapshot.habit.Rules[0].PeriodMeasure = "volume"
	snapshot.habit.Rules[0].PeriodTarget = 4
	_, _, _, _, _, eligible = habitReminderOn(snapshot, now)
	if eligible {
		t.Fatal("reached monthly volume still reminded")
	}
	snapshot.habit.Rules[0].Mode = "quit"
	snapshot.habit.Rules[0].Cadence = "daily"
	snapshot.habit.Rules[0].Target = 0
	snapshot.habit.Checkins = nil
	_, _, _, _, _, eligible = habitReminderOn(snapshot, now)
	if !eligible {
		t.Fatal("missing quit result was treated as success")
	}
	snapshot.habit.Checkins = []HabitCheckin{measured(today, 0)}
	_, _, _, _, _, eligible = habitReminderOn(snapshot, now)
	if eligible {
		t.Fatal("recorded clean day still reminded")
	}
}

func TestHabitReminderPreferenceDeliveryAndInvalidation(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "habit-delivery.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	client, other := testClient(t), testClient(t)
	registerVerifiedWithoutFixture(t, client, server.URL, "habit-delivery@example.test", "habit_delivery")
	registerVerifiedWithoutFixture(t, other, server.URL, "other-habit-delivery@example.test", "other_habit_delivery")
	today := time.Now().UTC().Format("2006-01-02")
	rule := trackerFixture("build", "daily", today).Rule
	rule.ReminderTime = "00:00"
	var h PersonalHabit
	requestJSON(t, client, "POST", server.URL+"/api/personal/habits", map[string]any{"title": "Only my habit notification", "timezone": "UTC", "startDate": today, "rule": rule}, 201, &h)
	path := server.URL + "/api/personal/habits/" + h.ID + "/reminder"
	var pref habitReminderPreference
	requestJSON(t, client, "GET", path, nil, 200, &pref)
	if !pref.Inherited || pref.Time != "00:00" || pref.Revision != 0 {
		t.Fatal("legacy reminder not inherited")
	}
	requestJSON(t, other, "GET", path, nil, 404, nil)
	payload := map[string]any{"time": "00:00", "expectedRevision": 0, "expectedHabitRevision": h.Revision}
	requestJSON(t, client, "PUT", path, payload, 200, &pref)
	revision := pref.Revision
	requestJSON(t, client, "PUT", path, payload, 200, &pref)
	if pref.Revision != revision {
		t.Fatal("repeat changed preference revision")
	}
	payload["time"] = "01:00"
	requestJSON(t, client, "PUT", path, payload, 409, nil)
	count := func() int {
		var n int
		store.db.QueryRow(`SELECT COUNT(*) FROM habit_reminder_sources`).Scan(&n)
		return n
	}
	requestJSON(t, client, "GET", server.URL+"/api/notifications/inbox", nil, 200, nil)
	if count() != 0 {
		t.Fatal("GET delivered")
	}
	now := time.Now()
	var global reminderPreferences
	requestJSON(t, client, "GET", server.URL+"/api/me/reminders", nil, 200, &global)
	setDelivery := func(enabled bool, start, end string) {
		t.Helper()
		requestJSON(t, client, "PUT", server.URL+"/api/me/reminders", map[string]any{"deadlineEnabled": true, "personalEnabled": true, "habitsEnabled": enabled, "timezone": "UTC", "quietStart": start, "quietEnd": end, "projects": []any{}, "expectedUpdatedAt": global.UpdatedAt}, 200, &global)
	}
	setDelivery(false, "", "")
	if err = deliverHabitReminders(context.Background(), store, now); err != nil {
		t.Fatal(err)
	}
	if count() != 0 {
		t.Fatal("disabled habit delivery sent a notification")
	}
	setDelivery(true, now.UTC().Format("15:04"), now.UTC().Add(time.Minute).Format("15:04"))
	if err = deliverHabitReminders(context.Background(), store, now); err != nil {
		t.Fatal(err)
	}
	if count() != 0 {
		t.Fatal("quiet hours ignored")
	}
	setDelivery(true, "", "")
	var wg sync.WaitGroup
	errs := make(chan error, 5)
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); errs <- deliverHabitReminders(context.Background(), store, now) }()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if count() != 1 {
		t.Fatal("concurrent habit delivery duplicated or missing")
	}
	var inbox notificationInbox
	requestJSON(t, client, "GET", server.URL+"/api/notifications/inbox?status=unread", nil, 200, &inbox)
	if len(inbox.Items) != 1 || inbox.Items[0].Body != h.Title || inbox.Items[0].Obsolete {
		t.Fatal("own habit notification missing")
	}
	notice := inbox.Items[0].ID
	var todayList struct {
		Habits []todayHabitReminder `json:"habits"`
	}
	requestJSON(t, client, "GET", server.URL+"/api/personal/reminders", nil, 200, &todayList)
	if len(todayList.Habits) != 1 || todayList.Habits[0].NotificationID != notice {
		t.Fatal("Today is not showing canonical habit delivery")
	}
	requestJSON(t, other, "GET", server.URL+"/api/personal/reminders", nil, 200, &todayList)
	if len(todayList.Habits) != 0 {
		t.Fatal("Today leaked another owner's habit")
	}
	requestJSON(t, other, "POST", server.URL+"/api/notifications/"+notice+"/read", nil, 404, nil)
	requestJSON(t, other, "GET", server.URL+"/api/notifications/inbox", nil, 200, &inbox)
	if len(inbox.Items) != 0 {
		t.Fatal("habit text leaked")
	}
	var check HabitCheckin
	requestJSON(t, client, "PUT", server.URL+"/api/personal/habits/"+h.ID+"/checkins/"+today, map[string]any{"state": "measured", "value": 1, "revision": h.Revision, "expectedUpdatedAt": ""}, 200, &check)
	requestJSON(t, client, "GET", server.URL+"/api/notifications/inbox?status=unread", nil, 200, &inbox)
	if len(inbox.Items) != 0 {
		t.Fatal("completed habit reminder stayed active")
	}
	requestJSON(t, client, "GET", server.URL+"/api/personal/reminders", nil, 200, &todayList)
	if len(todayList.Habits) != 0 {
		t.Fatal("Today retained completed habit reminder")
	}
	requestJSON(t, client, "DELETE", server.URL+"/api/personal/habits/"+h.ID+"/checkins/"+today, map[string]any{"revision": h.Revision, "expectedUpdatedAt": check.UpdatedAt}, 204, nil)
	if err = deliverHabitReminders(context.Background(), store, now); err != nil {
		t.Fatal(err)
	}
	if count() != 1 {
		t.Fatal("undoing result resurrected old notification")
	}
	requestJSON(t, client, "GET", server.URL+"/api/notifications/inbox?status=all", nil, 200, &inbox)
	if len(inbox.Items) != 1 || !inbox.Items[0].Obsolete {
		t.Fatal("history missing")
	}
	payload["expectedRevision"] = revision
	payload["time"] = ""
	requestJSON(t, client, "PUT", path, payload, 200, &pref)
	if err = deliverHabitReminders(context.Background(), store, now.Add(24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if count() != 1 {
		t.Fatal("explicit off fell back to old rule")
	}
	var storedRevision int
	store.db.QueryRow(`SELECT revision FROM personal_habits WHERE id=?`, h.ID).Scan(&storedRevision)
	if storedRevision != h.Revision {
		t.Fatal("reminder altered goal revision")
	}
	requestJSON(t, client, "DELETE", server.URL+"/api/personal/habits/"+h.ID, map[string]any{"revision": h.Revision}, 204, nil)
	requestJSON(t, client, "GET", server.URL+"/api/notifications/inbox?status=all", nil, 200, &inbox)
	if len(inbox.Items) != 0 {
		t.Fatal("archived habit text still visible")
	}
}
