package app

import (
	"slices"
	"testing"
	"time"
)

func TestTodayForecastAndPrivateWorkCapacity(t *testing.T) {
	store, server, owner, other := newPersonalPlanningFixture(t)
	var first PersonalPlan
	requestJSON(t, owner, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "Weekly appointment", "itemKind": "event", "startsAt": "2026-09-07T10:00:00+03:00", "endsAt": "2026-09-07T11:00:00+03:00", "recurrence": map[string]any{"cadence": "weekly", "interval": 1, "timezone": "Europe/Moscow", "startDate": "2026-09-07", "untilDate": "2026-09-28"}}, 201, &first)
	requestJSON(t, owner, "PUT", server.URL+"/api/personal/day/settings", map[string]any{"timezone": "Europe/Moscow", "start": "09:00", "end": "18:00", "expectedUpdatedAt": ""}, 200, nil)
	var me User
	requestJSON(t, owner, "GET", server.URL+"/api/me", nil, 200, &me)
	var workspace Workspace
	requestJSON(t, owner, "POST", server.URL+"/api/workspaces", map[string]any{"name": "Private capacity"}, 201, &workspace)
	var task Record
	requestWorkspaceJSON(t, owner, "POST", server.URL+"/api/records", workspace.ID, map[string]any{"type": "task", "title": "Scheduled work", "ownerId": me.ID}, 201, &task)
	requestJSON(t, owner, "PUT", server.URL+"/api/personal/calendar/work/"+task.ID, map[string]any{"startsAt": "2026-09-14T09:30:00+03:00", "endsAt": "2026-09-14T10:30:00+03:00"}, 200, nil)
	url := server.URL + "/api/personal/day?date=2026-09-14&timezone=UTC"
	var out personalDaySummary
	for i := 0; i < 2; i++ {
		requestJSON(t, owner, "GET", url, nil, 200, &out)
		if len(out.Recurrences) != 2 || len(out.Events) != 1 || !slices.Contains(out.Events, out.Recurrences[0].ID) || out.FreeMinutes != 450 || out.WorkBusyCount != 1 || out.Settings.Timezone != "Europe/Moscow" {
			t.Fatalf("forecast/merged capacity: %+v", out)
		}
		if len(out.Upcoming) != 1 || out.Recurrences[1].OccurrenceDate != "2026-09-21" {
			t.Fatal("seven-day horizon missing next week")
		}
	}
	var count int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM personal_plans WHERE series_id=?`, first.SeriesID).Scan(&count); err != nil || count != 1 {
		t.Fatal("day GET materialized records", count, err)
	}
	requestJSON(t, other, "GET", url, nil, 200, &out)
	if len(out.Recurrences) != 0 || len(out.Events) != 0 || out.WorkBusyCount != 0 {
		t.Fatal("private schedule leaked")
	}
	var moved PersonalPlan
	requestJSON(t, owner, "POST", server.URL+"/api/personal/series/"+first.SeriesID+"/occurrences", map[string]any{"date": "2026-09-14", "expectedSeriesUpdatedAt": first.Recurrence.UpdatedAt}, 201, &moved)
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/plans/"+moved.ID, map[string]any{"title": "Moved only this week", "status": "planned", "notes": "", "occurrenceDate": "2026-09-16", "expectedUpdatedAt": moved.UpdatedAt}, 200, &moved)
	requestJSON(t, owner, "GET", url, nil, 200, &out)
	if len(out.Events) != 0 || out.FreeMinutes != 480 || len(out.Recurrences) != 1 || !slices.Contains(out.Upcoming, moved.ID) {
		t.Fatal("moved occurrence left a ghost", out)
	}
	if _, err := store.db.Exec(`DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?`, workspace.ID, me.ID); err != nil {
		t.Fatal(err)
	}
	requestJSON(t, owner, "GET", url, nil, 200, &out)
	if out.WorkBusyCount != 0 || out.FreeMinutes != 540 {
		t.Fatal("revoked work still reserves private time")
	}
	if _, err := store.db.Exec(`UPDATE personal_recurrence_rules SET active=0 WHERE series_id=?`, first.SeriesID); err != nil {
		t.Fatal(err)
	}
	requestJSON(t, owner, "GET", url, nil, 200, &out)
	if len(out.Recurrences) != 0 {
		t.Fatal("stopped series forecast retained")
	}
	// Missing work storage must not turn into an apparently free day.
	if _, err := store.db.Exec(`ALTER TABLE personal_calendar_work_blocks RENAME TO unavailable_work_blocks`); err != nil {
		t.Fatal(err)
	}
	requestJSON(t, owner, "GET", url, nil, 500, nil)
}

func TestTodayCapacityClipsWorkAcrossMidnight(t *testing.T) {
	now, _ := time.Parse(time.RFC3339, "2026-09-07T21:00:00Z")
	parse := func(v string) time.Time { out, _ := time.Parse(time.RFC3339, v); return out }
	plans := []PersonalPlan{{ID: "overnight", Status: "planned", ItemKind: "event", StartsAt: dayString("2026-09-08T01:00:00Z"), EndsAt: dayString("2026-09-08T03:00:00Z")}}
	blocks := []dayWindow{{Start: parse("2026-09-07T23:00:00Z"), End: parse("2026-09-08T02:00:00Z")}, {Start: parse("2026-09-08T05:30:00Z"), End: parse("2026-09-08T08:00:00Z")}, {Start: parse("2026-09-07T10:00:00Z"), End: parse("2026-09-07T11:00:00Z")}}
	out := calculatePersonalDay("2026-09-07", personalDaySettings{Timezone: "UTC", Start: "22:00", End: "06:00"}, plans, now, blocks...)
	if out.FreeMinutes != 210 || out.RemainingFreeMinutes != 210 || out.WorkBusyCount != 2 || len(out.Free) != 2 {
		t.Fatal("overnight overlap not clipped/merged", out)
	}
	out = calculatePersonalDay("2026-09-07", personalDaySettings{Timezone: "UTC"}, plans, now, blocks...)
	if out.TimeKnown || out.FreeMinutes != 0 || len(out.Free) != 0 {
		t.Fatal("invented capacity without boundaries")
	}
	for _, item := range []calendarWorkItem{{Status: "completed", StartsAt: "2026-09-07T09:00:00Z", EndsAt: "2026-09-07T10:00:00Z"}, {Status: "planned", DueAt: "2026-09-07T10:00:00Z"}, {Status: "planned", StartsAt: "bad", EndsAt: "2026-09-07T10:00:00Z"}} {
		if _, _, valid := calendarWorkInterval(item); valid {
			t.Fatal("deadline, invalid or completed work reserved time")
		}
	}
}
