package app

import (
	"context"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestPersonalPlanReminderDeliveryPrivacyConflictAndCancellation(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "personal-reminders.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	client, other := testClient(t), testClient(t)
	registerVerifiedWithoutFixture(t, client, server.URL, "private-remind@example.test", "private_remind")
	registerVerifiedWithoutFixture(t, other, server.URL, "other-remind@example.test", "other_remind")
	var plan PersonalPlan
	requestJSON(t, client, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "Only my reminder source"}, 201, &plan)
	path := server.URL + "/api/personal/plans/" + plan.ID + "/reminder"
	var item personalPlanReminder
	requestJSON(t, client, "GET", path, nil, 200, &item)
	if item.Revision != 0 || !item.Cancelled {
		t.Fatal("GET created a reminder")
	}
	requestJSON(t, other, "GET", path, nil, 404, nil)
	now := time.Now().UTC()
	at := now.Add(time.Hour)
	payload := map[string]any{"remindAt": at.Format(time.RFC3339Nano), "timezone": "UTC", "expectedRevision": 0, "expectedPlanUpdatedAt": plan.UpdatedAt}
	requestJSON(t, other, "PUT", path, payload, 404, nil)
	requestJSON(t, client, "PUT", path, payload, 200, &item)
	first := item.Revision
	requestJSON(t, client, "PUT", path, payload, 200, &item)
	if item.Revision != first {
		t.Fatal("lost reply retry changed version")
	}
	payload["remindAt"] = at.Add(time.Hour).Format(time.RFC3339Nano)
	requestJSON(t, client, "PUT", path, payload, 409, nil)
	count := func() int {
		var n int
		if err := store.db.QueryRow(`SELECT COUNT(*) FROM notifications WHERE type='personal_reminder'`).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	requestJSON(t, client, "GET", server.URL+"/api/personal/reminders", nil, 200, nil)
	requestJSON(t, client, "GET", server.URL+"/api/notifications/inbox", nil, 200, nil)
	if count() != 0 {
		t.Fatal("GET generated delivery")
	}
	if err := deliverPersonalPlanReminders(context.Background(), store, now); err != nil {
		t.Fatal(err)
	}
	if count() != 0 {
		t.Fatal("early delivery")
	}
	var wg sync.WaitGroup
	errs := make(chan error, 5)
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- deliverPersonalPlanReminders(context.Background(), store, at.Add(time.Second))
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if count() != 1 {
		t.Fatal("missing or duplicate delivery")
	}
	var inbox notificationInbox
	requestJSON(t, client, "GET", server.URL+"/api/notifications/inbox?status=unread", nil, 200, &inbox)
	if len(inbox.Items) != 1 || inbox.Items[0].Body != plan.Title || inbox.Items[0].Obsolete {
		t.Fatalf("own notification: %+v", inbox)
	}
	id := inbox.Items[0].ID
	requestJSON(t, other, "POST", server.URL+"/api/notifications/"+id+"/read", nil, 404, nil)
	requestJSON(t, other, "GET", server.URL+"/api/notifications/inbox", nil, 200, &inbox)
	if len(inbox.Items) != 0 {
		t.Fatal("private message leaked")
	}
	requestJSON(t, client, "POST", server.URL+"/api/notifications/"+id+"/read", nil, 204, nil)
	var pending struct {
		Items []personalPlanReminder `json:"items"`
	}
	requestJSON(t, client, "GET", server.URL+"/api/personal/reminders", nil, 200, &pending)
	if len(pending.Items) != 0 {
		t.Fatal("read notification remained in Today")
	}
	// Snoozing is an explicit rule revision, independent from the plan's due date.
	payload["expectedRevision"] = first
	requestJSON(t, client, "PUT", path, payload, 200, &item)
	if item.Revision != first+1 || item.NotificationID != "" {
		t.Fatal("snooze did not replace current version")
	}
	var unchanged PersonalPlan
	if err := store.db.QueryRow(`SELECT updated_at FROM personal_plans WHERE id=?`, plan.ID).Scan(&unchanged.UpdatedAt); err != nil {
		t.Fatal(err)
	}
	if unchanged.UpdatedAt != plan.UpdatedAt {
		t.Fatal("reminder changed plan")
	}
	if err := deliverPersonalPlanReminders(context.Background(), store, at.Add(2*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if count() != 2 {
		t.Fatal("snooze was not delivered")
	}
	requestJSON(t, client, "PATCH", server.URL+"/api/personal/plans/"+plan.ID, map[string]any{"title": plan.Title, "status": "planned", "dueAt": now.Add(24 * time.Hour).Format(time.RFC3339Nano), "expectedUpdatedAt": plan.UpdatedAt}, 200, &plan)
	requestJSON(t, client, "GET", path, nil, 200, &item)
	if !item.Cancelled {
		t.Fatal("moving plan did not cancel reminder")
	}
	requestJSON(t, client, "GET", server.URL+"/api/notifications/inbox?status=all", nil, 200, &inbox)
	if len(inbox.Items) != 2 || !inbox.Items[0].Obsolete || !inbox.Items[1].Obsolete {
		t.Fatal("history was lost or left current")
	}
	requestJSON(t, client, "PATCH", server.URL+"/api/personal/plans/"+plan.ID, map[string]any{"title": plan.Title, "status": "planned", "dueAt": "", "expectedUpdatedAt": plan.UpdatedAt}, 200, &plan)
	requestJSON(t, client, "GET", path, nil, 200, &item)
	if !item.Cancelled {
		t.Fatal("moving back revived a cancelled reminder")
	}
	payload["expectedRevision"] = item.Revision
	payload["expectedPlanUpdatedAt"] = plan.UpdatedAt
	requestJSON(t, client, "PUT", path, payload, 200, &item)
	requestJSON(t, client, "PATCH", server.URL+"/api/personal/plans/"+plan.ID, map[string]any{"title": plan.Title, "status": "done", "expectedUpdatedAt": plan.UpdatedAt}, 200, &plan)
	requestJSON(t, client, "GET", path, nil, 200, &item)
	if !item.Cancelled {
		t.Fatal("completion did not cancel reminder")
	}
	requestJSON(t, client, "PATCH", server.URL+"/api/personal/plans/"+plan.ID, map[string]any{"title": plan.Title, "status": "planned", "expectedUpdatedAt": plan.UpdatedAt}, 200, &plan)
	requestJSON(t, client, "GET", path, nil, 200, &item)
	if !item.Cancelled {
		t.Fatal("reopening revived reminder")
	}
	requestJSON(t, client, "DELETE", server.URL+"/api/personal/plans/"+plan.ID, map[string]any{"expectedUpdatedAt": plan.UpdatedAt}, 204, nil)
	requestJSON(t, client, "GET", path, nil, 404, nil)
	requestJSON(t, client, "GET", server.URL+"/api/notifications/inbox?status=all", nil, 200, &inbox)
	if len(inbox.Items) != 0 {
		t.Fatal("archived source remained visible")
	}
	var history int
	store.db.QueryRow(`SELECT COUNT(*) FROM personal_plan_reminder_events WHERE plan_id=?`, plan.ID).Scan(&history)
	if history < 5 {
		t.Fatal("rule history missing")
	}
}

func TestPersonalRemindersRespectIndependentPreferencesAndQuietHours(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "personal-quiet.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	client := testClient(t)
	registerVerifiedWithoutFixture(t, client, server.URL, "personal-quiet@example.test", "personal_quiet")
	var plan PersonalPlan
	requestJSON(t, client, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "Personal quiet reminder"}, 201, &plan)
	at := time.Now().UTC().Add(time.Hour)
	rule := map[string]any{"remindAt": at.Format(time.RFC3339Nano), "timezone": "UTC", "expectedRevision": 0, "expectedPlanUpdatedAt": plan.UpdatedAt}
	requestJSON(t, client, "PUT", server.URL+"/api/personal/plans/"+plan.ID+"/reminder", rule, 200, nil)
	prefs := map[string]any{"deadlineEnabled": true, "personalEnabled": false, "timezone": "UTC", "quietStart": "", "quietEnd": "", "expectedUpdatedAt": ""}
	var saved reminderPreferences
	requestJSON(t, client, "PUT", server.URL+"/api/me/reminders", prefs, 200, &saved)
	count := func() int {
		var n int
		store.db.QueryRow(`SELECT COUNT(*) FROM personal_plan_reminder_sources`).Scan(&n)
		return n
	}
	run := func(now time.Time) {
		if err := deliverPersonalPlanReminders(context.Background(), store, now); err != nil {
			t.Fatal(err)
		}
	}
	run(at)
	if count() != 0 {
		t.Fatal("disabled personal delivery sent")
	}
	// Old cached settings clients cannot silently turn personal delivery back on.
	delete(prefs, "personalEnabled")
	prefs["expectedUpdatedAt"] = saved.UpdatedAt
	prefs["deadlineEnabled"] = false
	requestJSON(t, client, "PUT", server.URL+"/api/me/reminders", prefs, 200, &saved)
	if saved.PersonalEnabled {
		t.Fatal("legacy settings client reset personal switch")
	}
	prefs["personalEnabled"] = true
	prefs["expectedUpdatedAt"] = saved.UpdatedAt
	prefs["quietStart"] = at.Add(-30 * time.Minute).Format("15:04")
	prefs["quietEnd"] = at.Add(30 * time.Minute).Format("15:04")
	requestJSON(t, client, "PUT", server.URL+"/api/me/reminders", prefs, 200, &saved)
	run(at)
	if count() != 0 {
		t.Fatal("quiet hour delivery sent")
	}
	run(at.Add(time.Hour))
	run(at.Add(2 * time.Hour))
	if count() != 1 {
		t.Fatal("quiet release missing or duplicated")
	}
}
