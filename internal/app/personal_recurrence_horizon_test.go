package app

import "testing"

func TestRecurrenceCalendarForecastMaterializationAndHiddenWork(t *testing.T) {
	store, server, owner, other := newPersonalPlanningFixture(t)
	var first PersonalPlan
	requestJSON(t, owner, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "Weekly review", "itemKind": "event", "startsAt": "2026-09-07T10:00:00+03:00", "endsAt": "2026-09-07T11:00:00+03:00", "recurrence": map[string]any{"cadence": "weekly", "interval": 1, "timezone": "Europe/Moscow", "startDate": "2026-09-07", "untilDate": "2026-09-28"}}, 201, &first)
	url := server.URL + "/api/personal/calendar?from=2026-09-01&to=2026-10-01&timezone=Europe%2FMoscow"
	var out calendarOverview
	for i := 0; i < 2; i++ {
		requestJSON(t, owner, "GET", url, nil, 200, &out)
		if len(out.Recurrences) != 3 || out.Recurrences[0].OccurrenceDate != "2026-09-14" {
			t.Fatalf("missing future dates: %+v", out.Recurrences)
		}
	}
	var count int
	store.db.QueryRow(`SELECT COUNT(*) FROM personal_plans WHERE series_id=?`, first.SeriesID).Scan(&count)
	if count != 1 {
		t.Fatal("calendar read created records")
	}
	requestJSON(t, other, "GET", url, nil, 200, &out)
	if len(out.Recurrences) != 0 {
		t.Fatal("private recurrence leaked")
	}
	var me User
	requestJSON(t, owner, "GET", server.URL+"/api/me", nil, 200, &me)
	var workspace Workspace
	requestJSON(t, owner, "POST", server.URL+"/api/workspaces", map[string]any{"name": "Forecast conflicts"}, 201, &workspace)
	var task Record
	requestWorkspaceJSON(t, owner, "POST", server.URL+"/api/records", workspace.ID, map[string]any{"type": "task", "title": "Assigned work", "ownerId": me.ID}, 201, &task)
	requestJSON(t, owner, "PUT", server.URL+"/api/personal/calendar/work/"+task.ID, map[string]any{"startsAt": "2026-09-14T07:30:00Z", "endsAt": "2026-09-14T09:00:00Z"}, 200, nil)
	requestJSON(t, owner, "GET", url, nil, 200, &out)
	if len(out.Conflicts) != 1 {
		t.Fatalf("forecast ignored hidden work: %+v", out.Conflicts)
	}
	requestJSON(t, owner, "PUT", server.URL+"/api/personal/calendar/confirmations?from=2026-09-01&to=2026-10-01&timezone=Europe%2FMoscow", map[string]any{"id": out.Conflicts[0].ID, "confirmed": true}, 200, nil)
	path := server.URL + "/api/personal/series/" + first.SeriesID + "/occurrences"
	body := map[string]any{"date": "2026-09-14", "expectedSeriesUpdatedAt": first.Recurrence.UpdatedAt}
	requestJSON(t, other, "POST", path, body, 404, nil)
	requestJSON(t, owner, "POST", path, map[string]any{"date": "2026-09-15", "expectedSeriesUpdatedAt": first.Recurrence.UpdatedAt}, 400, nil)
	requestJSON(t, owner, "POST", path, map[string]any{"date": "2026-09-14", "expectedSeriesUpdatedAt": "old"}, 409, nil)
	var second, again PersonalPlan
	requestJSON(t, owner, "POST", path, body, 201, &second)
	requestJSON(t, owner, "POST", path, body, 200, &again)
	if again.ID != second.ID {
		t.Fatal("duplicate materialization")
	}
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/plans/"+second.ID, map[string]any{"title": "Only moved week", "status": "planned", "notes": "", "occurrenceDate": "2026-09-16", "expectedUpdatedAt": second.UpdatedAt}, 200, &second)
	requestJSON(t, owner, "GET", url, nil, 200, &out)
	if len(out.Recurrences) != 2 || out.Recurrences[0].OccurrenceDate != "2026-09-21" || len(out.Conflicts) != 0 {
		t.Fatal("moved instance left a ghost or changed later dates")
	}
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/plans/"+first.ID, map[string]any{"title": first.Title, "notes": "", "status": "done", "expectedUpdatedAt": first.UpdatedAt}, 200, &first)
	store.db.QueryRow(`SELECT COUNT(*) FROM personal_plans WHERE series_id=?`, first.SeriesID).Scan(&count)
	if count != 2 {
		t.Fatal("completion duplicated already materialized week")
	}
	requestJSON(t, owner, "POST", server.URL+"/api/personal/plans/"+second.ID+"/skip", map[string]any{"expectedUpdatedAt": second.UpdatedAt}, 200, nil)
	requestJSON(t, owner, "GET", url, nil, 200, &out)
	if len(out.Recurrences) != 1 || out.Recurrences[0].OccurrenceDate != "2026-09-28" {
		t.Fatal("skip left forecast duplicate")
	}
	if _, err := store.db.Exec(`UPDATE personal_recurrence_rules SET active=0 WHERE series_id=?`, first.SeriesID); err != nil {
		t.Fatal(err)
	}
	requestJSON(t, owner, "GET", url, nil, 200, &out)
	if len(out.Recurrences) != 0 {
		t.Fatal("stopped series still projected")
	}
	requestJSON(t, owner, "POST", path, map[string]any{"date": "2026-09-28", "expectedSeriesUpdatedAt": first.Recurrence.UpdatedAt}, 409, nil)
}

func TestRecurrenceHorizonIncludesSpanningEventsAcrossDST(t *testing.T) {
	_, server, owner, _ := newPersonalPlanningFixture(t)
	var first PersonalPlan
	requestJSON(t, owner, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "Overnight", "itemKind": "event", "startsAt": "2026-03-22T23:00:00+01:00", "endsAt": "2026-03-23T01:00:00+01:00", "recurrence": map[string]any{"cadence": "weekly", "interval": 1, "timezone": "Europe/Berlin", "startDate": "2026-03-22", "untilDate": "2026-04-05"}}, 201, &first)
	var out calendarOverview
	requestJSON(t, owner, "GET", server.URL+"/api/personal/calendar?from=2026-03-30&to=2026-03-31&timezone=Europe%2FBerlin", nil, 200, &out)
	if len(out.Recurrences) != 1 || out.Recurrences[0].OccurrenceDate != "2026-03-29" || *out.Recurrences[0].StartsAt != "2026-03-29T21:00:00Z" {
		t.Fatalf("cross-day DST projection lost: %+v", out.Recurrences)
	}
}
