package app

import (
	"context"
	"testing"
)

func TestPersonalSeriesTemplateSurvivesExceptionsAndExplicitChanges(t *testing.T) {
	store, server, owner, other := newPersonalPlanningFixture(t)
	var first PersonalPlan
	requestJSON(t, owner, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "Исходный еженедельный обзор", "notes": "Общие вопросы", "colorKey": "blue", "itemKind": "event", "startsAt": "2026-09-07T10:00:00+03:00", "endsAt": "2026-09-07T11:00:00+03:00", "plannedMinutes": 60, "recurrence": map[string]any{"cadence": "weekly", "interval": 1, "timezone": "Europe/Moscow", "startDate": "2026-09-07", "untilDate": "2026-09-28"}}, 201, &first)
	if first.Recurrence.Template == nil || first.Recurrence.Template.Title != first.Title {
		t.Fatal("new series has no stable template")
	}
	oldVersion := first.Recurrence.UpdatedAt
	path := server.URL + "/api/personal/plans/" + first.ID
	requestJSON(t, owner, "PATCH", path, map[string]any{"title": "Только эта неделя", "notes": "Личная правка", "status": "done", "colorKey": "red", "plannedMinutes": 15, "actualMinutes": 12, "occurrenceDate": "2026-09-09", "startsAt": "2026-09-09T12:00:00+03:00", "endsAt": "2026-09-09T12:15:00+03:00", "expectedUpdatedAt": first.UpdatedAt}, 200, &first)
	var overview PersonalOverview
	requestJSON(t, owner, "GET", server.URL+"/api/personal/overview", nil, 200, &overview)
	second := onlyPlannedOccurrence(t, overview.Plans, "2026-09-14")
	if second.Title != "Исходный еженедельный обзор" || second.Notes != "Общие вопросы" || second.ColorKey != "blue" || second.PlannedMinutes != 60 || second.ActualMinutes != 0 || *second.StartsAt != "2026-09-14T07:00:00Z" || *second.EndsAt != "2026-09-14T08:00:00Z" {
		t.Fatalf("exception contaminated template: %+v", second)
	}
	// Reopening and completing again is not a request to duplicate the next date.
	requestJSON(t, owner, "PATCH", path, map[string]any{"title": first.Title, "notes": first.Notes, "status": "planned", "expectedUpdatedAt": first.UpdatedAt}, 200, &first)
	requestJSON(t, owner, "PATCH", path, map[string]any{"title": first.Title, "notes": first.Notes, "status": "done", "occurrenceDate": "2026-09-14", "expectedUpdatedAt": first.UpdatedAt}, 200, &first)
	var count int
	store.db.QueryRow(`SELECT COUNT(*) FROM personal_plans WHERE series_id=?`, first.SeriesID).Scan(&count)
	if count != 2 {
		t.Fatal("repeat completion duplicated an occurrence")
	}
	seriesPath := server.URL + "/api/personal/plans/" + second.ID + "/series"
	payload := map[string]any{"title": "Новый общий обзор", "notes": "Обновлённый шаблон", "colorKey": "purple", "plannedMinutes": 45, "startsAt": "2026-09-14T15:00:00+03:00", "endsAt": "2026-09-14T15:45:00+03:00", "expectedUpdatedAt": second.UpdatedAt, "expectedSeriesUpdatedAt": second.Recurrence.UpdatedAt, "recurrence": map[string]any{"cadence": "weekly", "interval": 1, "timezone": "Europe/Moscow", "startDate": "2026-09-07", "untilDate": "2026-09-28"}}
	requestJSON(t, other, "PUT", seriesPath, payload, 404, nil)
	requestJSON(t, owner, "PUT", seriesPath, payload, 200, &second)
	if second.Title != "Новый общий обзор" || second.ColorKey != "purple" || *second.StartsAt != "2026-09-14T12:00:00Z" {
		t.Fatal("explicit series edit was only a response, not persisted values")
	}
	payload["expectedUpdatedAt"] = first.UpdatedAt
	payload["expectedSeriesUpdatedAt"] = oldVersion
	requestJSON(t, owner, "PUT", path+"/series", payload, 409, nil)
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/plans/"+second.ID, map[string]any{"title": second.Title, "notes": second.Notes, "status": "done", "expectedUpdatedAt": second.UpdatedAt}, 200, &second)
	requestJSON(t, owner, "GET", server.URL+"/api/personal/overview", nil, 200, &overview)
	third := onlyPlannedOccurrence(t, overview.Plans, "2026-09-21")
	if third.Title != "Новый общий обзор" || third.ColorKey != "purple" || *third.StartsAt != "2026-09-21T12:00:00Z" || third.ActualMinutes != 0 {
		t.Fatal("future did not use explicitly updated template")
	}
	for _, plan := range overview.Plans {
		if plan.ID == first.ID && (plan.Title != "Только эта неделя" || plan.ColorKey != "red" || plan.ActualMinutes != 12) {
			t.Fatal("series edit rewrote completed history")
		}
	}
}

func TestPersonalSeriesUsesOriginalMonthDayAndLocalClock(t *testing.T) {
	rule := PersonalRecurrenceRule{Cadence: "monthly", Interval: 1, StartDate: "2026-01-31"}
	for _, item := range []struct{ after, want string }{{"2026-01-31", "2026-02-28"}, {"2026-02-28", "2026-03-31"}, {"2026-03-31", "2026-04-30"}, {"2026-04-30", "2026-05-31"}} {
		got, err := nextPersonalSeriesDate(rule, item.after)
		if err != nil || got != item.want {
			t.Fatalf("%s => %s (%v), want %s", item.after, got, err, item.want)
		}
	}
	start, end, due := "2026-03-22T09:00:00Z", "2026-03-22T10:00:00Z", "2026-03-24T11:00:00Z"
	plan, err := projectPersonalRecurrence(PersonalPlan{Title: "Clock", OccurrenceDate: "2026-03-22", StartsAt: &start, EndsAt: &end, DueAt: &due}, "2026-03-29", "Europe/Berlin")
	if err != nil {
		t.Fatal(err)
	}
	if *plan.StartsAt != "2026-03-29T08:00:00Z" || *plan.EndsAt != "2026-03-29T09:00:00Z" || *plan.DueAt != "2026-03-31T10:00:00Z" {
		t.Fatalf("wall clock or deadline offset drifted: %+v", plan)
	}
}

func TestMovingOnlyOccurrenceDateMovesItsTimeButKeepsSeriesAnchor(t *testing.T) {
	_, server, owner, _ := newPersonalPlanningFixture(t)
	var plan PersonalPlan
	requestJSON(t, owner, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "Timed occurrence", "itemKind": "event", "startsAt": "2026-09-07T10:00:00+03:00", "endsAt": "2026-09-07T11:00:00+03:00", "recurrence": map[string]any{"cadence": "weekly", "interval": 1, "timezone": "Europe/Moscow", "startDate": "2026-09-07"}}, 201, &plan)
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/plans/"+plan.ID, map[string]any{"title": plan.Title, "status": "planned", "occurrenceDate": "2026-10-05", "expectedUpdatedAt": plan.UpdatedAt}, 200, &plan)
	if *plan.StartsAt != "2026-10-05T07:00:00Z" || *plan.EndsAt != "2026-10-05T08:00:00Z" {
		t.Fatal("occurrence date and time diverged")
	}
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/plans/"+plan.ID, map[string]any{"title": plan.Title, "status": "done", "expectedUpdatedAt": plan.UpdatedAt}, 200, &plan)
	var overview PersonalOverview
	requestJSON(t, owner, "GET", server.URL+"/api/personal/overview", nil, 200, &overview)
	second := onlyPlannedOccurrence(t, overview.Plans, "2026-09-14")
	if *second.StartsAt != "2026-09-14T07:00:00Z" {
		t.Fatal("moving an occurrence far ahead skipped weeks in the series")
	}
}

func TestPersonalSeriesMigrationPreservesLegacyPlansAndRequiresReview(t *testing.T) {
	store, server, owner, _ := newPersonalPlanningFixture(t)
	var plan PersonalPlan
	requestJSON(t, owner, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "Known legacy state", "recurrence": map[string]any{"cadence": "weekly", "interval": 1, "timezone": "Europe/Moscow", "startDate": "2026-09-07"}}, 201, &plan)
	for _, query := range []string{`DROP TABLE personal_recurrence_instances`, `DROP TABLE personal_recurrence_templates`, `DROP INDEX personal_plans_series_occurrence_idx`, `CREATE UNIQUE INDEX personal_plans_series_occurrence_idx ON personal_plans(owner_id,series_id,occurrence_date) WHERE series_id<>''`, `DELETE FROM schema_migrations WHERE version='059_personal_recurrence_templates.sql'`} {
		if _, err := store.db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	if err := store.migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	var overview PersonalOverview
	requestJSON(t, owner, "GET", server.URL+"/api/personal/overview", nil, 200, &overview)
	if len(overview.Plans) != 1 {
		t.Fatal("migration created or removed plans")
	}
	after := overview.Plans[0]
	if after.ID != plan.ID || after.Title != plan.Title || after.UpdatedAt != plan.UpdatedAt || after.OccurrenceDate != plan.OccurrenceDate || after.Recurrence.Template.Title != plan.Title || !after.Recurrence.NeedsReview {
		t.Fatal("migration guessed historical values or hid legacy review")
	}
}

func TestPersonalSeriesCompletionRollsBackWhenMappingCannotBeSaved(t *testing.T) {
	store, server, owner, _ := newPersonalPlanningFixture(t)
	var plan PersonalPlan
	requestJSON(t, owner, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "Atomic recurrence", "recurrence": map[string]any{"cadence": "weekly", "interval": 1, "timezone": "Europe/Moscow", "startDate": "2026-09-07"}}, 201, &plan)
	if _, err := store.db.Exec(`CREATE TRIGGER fail_occurrence BEFORE INSERT ON personal_recurrence_instances BEGIN SELECT RAISE(ABORT,'synthetic mapping error'); END`); err != nil {
		t.Fatal(err)
	}
	requestJSON(t, owner, "PATCH", server.URL+"/api/personal/plans/"+plan.ID, map[string]any{"title": plan.Title, "status": "done", "expectedUpdatedAt": plan.UpdatedAt}, 500, nil)
	var count int
	store.db.QueryRow(`SELECT COUNT(*) FROM personal_plans WHERE series_id=?`, plan.SeriesID).Scan(&count)
	if count != 1 {
		t.Fatal("failed mapping left an orphan occurrence")
	}
	var status string
	store.db.QueryRow(`SELECT status FROM personal_plans WHERE id=?`, plan.ID).Scan(&status)
	if status != "planned" {
		t.Fatal("failed next occurrence completed current plan")
	}
}
