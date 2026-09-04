package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestReminderDigestsSchedulePrivacyGroupingAndProjectFilter(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "digests.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	owner, other := testClient(t), testClient(t)
	user := registerVerifiedWithoutFixture(t, owner, server.URL, "digest@example.test", "digest_owner")
	registerVerifiedWithoutFixture(t, other, server.URL, "digest-other@example.test", "digest_other")
	var project, muted Workspace
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/workspaces", map[string]any{"name": "Digest project"}, http.StatusCreated, &project)
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/workspaces", map[string]any{"name": "Muted digest project"}, http.StatusCreated, &muted)

	createRecord := func(workspace, title, due string) Record {
		var record Record
		requestWorkspaceJSON(t, owner, http.MethodPost, server.URL+"/api/records", workspace, map[string]any{"type": "task", "title": title, "ownerId": user.ID, "status": "planned", "dueAt": due}, http.StatusCreated, &record)
		return record
	}
	createRecord(project.ID, "Private active title", "2026-09-06T22:00:00Z")
	createRecord(muted.ID, "Muted active title", "2026-09-06T21:00:00Z")
	completed := createRecord(project.ID, "Private completed title", "2026-09-05T20:00:00Z")
	mutedCompleted := createRecord(muted.ID, "Muted completed title", "2026-09-05T20:00:00Z")
	if _, err = store.db.Exec(`UPDATE records SET status='completed',completed_at='2026-09-05T18:00:00Z' WHERE id IN (?,?)`, completed.ID, mutedCompleted.ID); err != nil {
		t.Fatal(err)
	}

	var todayPlan, donePlan PersonalPlan
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/personal/plans", map[string]any{"title": "Private plan", "startDate": "2026-09-06"}, http.StatusCreated, &todayPlan)
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/personal/plans", map[string]any{"title": "Private done", "startDate": "2026-09-05"}, http.StatusCreated, &donePlan)
	if _, err = store.db.Exec(`UPDATE personal_plans SET status='done',completed_at='2026-09-05T17:00:00Z' WHERE id=?`, donePlan.ID); err != nil {
		t.Fatal(err)
	}
	var waiting personalWaiting
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/personal/waiting", map[string]any{"title": "Private waiting", "waitingFor": "Private person", "sinceDate": "2026-09-01", "expectedDate": "2026-09-06", "requestKey": "digest-waiting-create-0001"}, http.StatusCreated, &waiting)
	rule := trackerFixture("build", "daily", "2026-09-01").Rule
	var habit PersonalHabit
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/personal/habits", map[string]any{"title": "Private habit", "timezone": "UTC", "startDate": "2026-09-01", "rule": rule}, http.StatusCreated, &habit)
	if _, err = store.db.Exec(`INSERT INTO personal_habit_checkins(id,habit_id,owner_id,checkin_date,value,note,created_at,updated_at,result_state,amount) VALUES('digest-checkin',?,?, '2026-09-05',1,'','2026-09-05T12:00:00Z','2026-09-05T12:00:00Z','measured',1)`, habit.ID, user.ID); err != nil {
		t.Fatal(err)
	}

	var defaults reminderPreferences
	requestJSON(t, owner, http.MethodGet, server.URL+"/api/me/reminders", nil, http.StatusOK, &defaults)
	if defaults.DailyDigestEnabled || defaults.WeeklyDigestEnabled || defaults.DailyDigestTime != "08:00" || defaults.WeeklyDigestWeekday != 7 || defaults.WeeklyDigestTime != "18:00" {
		t.Fatalf("unsafe digest defaults: %+v", defaults)
	}
	payload := map[string]any{
		"deadlineEnabled": true, "personalEnabled": true, "habitsEnabled": true,
		"dailyDigestEnabled": true, "dailyDigestTime": "18:00",
		"weeklyDigestEnabled": true, "weeklyDigestWeekday": 7, "weeklyDigestTime": "18:00",
		"timezone": "UTC", "quietStart": "17:00", "quietEnd": "19:00",
		"projects":          []map[string]any{{"workspaceId": project.ID, "enabled": true}, {"workspaceId": muted.ID, "enabled": false}},
		"expectedUpdatedAt": defaults.UpdatedAt,
	}
	var saved reminderPreferences
	bad := map[string]any{}
	for key, value := range payload {
		bad[key] = value
	}
	bad["dailyDigestTime"] = "25:00"
	requestJSON(t, owner, http.MethodPut, server.URL+"/api/me/reminders", bad, http.StatusBadRequest, nil)
	bad["dailyDigestTime"], bad["weeklyDigestWeekday"] = "18:00", 0
	requestJSON(t, owner, http.MethodPut, server.URL+"/api/me/reminders", bad, http.StatusBadRequest, nil)
	requestJSON(t, owner, http.MethodPut, server.URL+"/api/me/reminders", payload, http.StatusOK, &saved)
	now, _ := time.Parse(time.RFC3339, "2026-09-06T18:00:00Z")
	if err = deliverReminderDigests(context.Background(), store, now); err != nil {
		t.Fatal(err)
	}
	var count int
	store.db.QueryRow(`SELECT COUNT(*) FROM reminder_digest_sources`).Scan(&count)
	if count != 0 {
		t.Fatal("digest delivered during quiet hours")
	}
	now = now.Add(time.Hour)
	errs := make(chan error, 5)
	var workers sync.WaitGroup
	for i := 0; i < 5; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			errs <- deliverReminderDigests(context.Background(), store, now)
		}()
	}
	workers.Wait()
	close(errs)
	for deliveryErr := range errs {
		if deliveryErr != nil {
			t.Fatal(deliveryErr)
		}
	}
	store.db.QueryRow(`SELECT COUNT(*) FROM reminder_digest_sources`).Scan(&count)
	if count != 2 {
		t.Fatalf("digest missing or duplicated: %d", count)
	}
	var page notificationInbox
	requestJSON(t, owner, http.MethodGet, server.URL+"/api/notifications/inbox?status=unread", nil, http.StatusOK, &page)
	if page.UnreadCount != 2 || len(page.Items) != 2 {
		t.Fatalf("owner digest inbox: %+v", page)
	}
	found := map[string]Notification{}
	for _, notification := range page.Items {
		found[notification.Type] = notification
		if strings.Contains(notification.Body, "Private") || strings.Contains(notification.Body, "Muted") {
			t.Fatal("digest leaked a source title")
		}
		if notification.EntityType == nil || *notification.EntityType != "personal_digest" {
			t.Fatal("digest does not have a private destination")
		}
	}
	if found["daily_digest"].Body != "Личных дел: 1 · сроков проектов: 1 · привычек: 1 · ожиданий: 1" {
		t.Fatalf("daily summary: %s", found["daily_digest"].Body)
	}
	if found["weekly_digest"].Body != "За неделю: личных дел выполнено 1 · карточек завершено 1 · привычек с отметками 1 · активных ожиданий 1" {
		t.Fatalf("weekly summary: %s", found["weekly_digest"].Body)
	}
	requestJSON(t, other, http.MethodGet, server.URL+"/api/notifications/inbox", nil, http.StatusOK, &page)
	if len(page.Items) != 0 || page.UnreadCount != 0 {
		t.Fatal("digest leaked to another account")
	}

	payload["dailyDigestEnabled"] = false
	payload["weeklyDigestEnabled"] = false
	payload["expectedUpdatedAt"] = saved.UpdatedAt
	requestJSON(t, owner, http.MethodPut, server.URL+"/api/me/reminders", payload, http.StatusOK, &saved)
	requestJSON(t, owner, http.MethodGet, server.URL+"/api/notifications/inbox?status=unread", nil, http.StatusOK, &page)
	if page.UnreadCount != 0 || len(page.Items) != 0 {
		t.Fatal("disabled digest remained a live alert")
	}
	requestJSON(t, owner, http.MethodGet, server.URL+"/api/notifications/inbox?status=all", nil, http.StatusOK, &page)
	if len(page.Items) != 2 || !page.Items[0].Obsolete || !page.Items[1].Obsolete {
		t.Fatal("digest history disappeared after disabling")
	}
}

func TestReminderDigestCivilScheduleAcrossDST(t *testing.T) {
	loc, _ := time.LoadLocation("America/New_York")
	prefs := reminderPreferences{DailyDigestEnabled: true, DailyDigestTime: "08:00", WeeklyDigestEnabled: true, WeeklyDigestWeekday: 7, WeeklyDigestTime: "18:00"}
	before, _ := time.Parse(time.RFC3339, "2026-11-01T07:59:00-05:00")
	after := before.Add(time.Minute)
	if digestDue("daily", prefs, before, loc) || !digestDue("daily", prefs, after, loc) {
		t.Fatal("daily digest did not follow the civil clock after DST")
	}
	period, valid := digestPeriod("daily", prefs, after, loc)
	if period != "2026-11-01" || valid.In(loc).Format("2006-01-02 15:04 -07:00") != "2026-11-02 08:00 -05:00" {
		t.Fatalf("daily DST validity: %s %s", period, valid.In(loc))
	}
}
