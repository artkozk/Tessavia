package app

import (
	"net/http"
	"reflect"
	"slices"
	"testing"
	"time"
)

func dayString(value string) *string { return &value }
func TestPersonalDaySeparatesDatesAndMergesTimeBlocks(t *testing.T) {
	now, _ := time.Parse(time.RFC3339, "2026-09-04T12:00:00+03:00")
	plans := []PersonalPlan{
		{ID: "today", Status: "planned", StartDate: "2026-09-04"},
		{ID: "future", Status: "planned", StartDate: "2026-09-19"},
		{ID: "overdue", Status: "planned", DueAt: dayString("2026-09-03T20:00:00Z")},
		{ID: "done", Status: "done", StartDate: "2026-09-04", DueAt: dayString("2026-09-01T00:00:00Z")},
		{ID: "a", Status: "planned", ItemKind: "event", StartsAt: dayString("2026-09-04T10:00:00+03:00"), EndsAt: dayString("2026-09-04T12:00:00+03:00")},
		{ID: "b", Status: "planned", ItemKind: "event", StartsAt: dayString("2026-09-04T08:00:00Z"), EndsAt: dayString("2026-09-04T10:00:00Z")},
		{ID: "c", Status: "planned", ItemKind: "task", StartsAt: dayString("2026-09-04T15:00:00+03:00"), EndsAt: dayString("2026-09-04T16:00:00+03:00")},
		{ID: "skip", Status: "done", OccurrenceState: "skipped", StartDate: "2026-09-04"},
	}
	out := calculatePersonalDay("2026-09-04", personalDaySettings{Timezone: "Europe/Moscow", Start: "09:00", End: "18:00"}, plans, now)
	if !reflect.DeepEqual(out.Today, []string{"today", "c"}) || !reflect.DeepEqual(out.Upcoming, []string{"future"}) || !reflect.DeepEqual(out.Overdue, []string{"overdue"}) || !reflect.DeepEqual(out.Completed, []string{"done"}) {
		t.Fatalf("classification %#v", out)
	}
	if !out.TimeKnown || out.FreeMinutes != 300 || len(out.Free) != 3 || out.Free[0].Minutes != 60 || out.Free[1].Minutes != 120 || out.Free[2].Minutes != 120 {
		t.Fatalf("overlapping reservations double counted: %#v", out.Free)
	}
	if out.Unscheduled != 1 {
		t.Fatal("unscheduled estimated tasks should not reserve an arbitrary time", out.Unscheduled)
	}
	if out.RemainingFreeMinutes != 240 {
		t.Fatal("past free time was offered as remaining", out.RemainingFreeMinutes)
	}
	unknown := calculatePersonalDay("2026-09-04", personalDaySettings{Timezone: "Europe/Moscow"}, plans, now)
	if unknown.TimeKnown || unknown.FreeMinutes != 0 || unknown.TimeReason == "" {
		t.Fatal("invented free time without a window")
	}
}

func TestPersonalDayIncludesOnlyRelevantAccessibleProjectWork(t *testing.T) {
	store, server, ownerClient, otherClient := newPersonalPlanningFixture(t)
	var owner, other User
	requestJSON(t, ownerClient, http.MethodGet, server.URL+"/api/me", nil, http.StatusOK, &owner)
	requestJSON(t, otherClient, http.MethodGet, server.URL+"/api/me", nil, http.StatusOK, &other)
	var project, revoked Workspace
	requestJSON(t, ownerClient, http.MethodPost, server.URL+"/api/workspaces", map[string]any{"name": "Доступный стартап"}, http.StatusCreated, &project)
	requestJSON(t, ownerClient, http.MethodPost, server.URL+"/api/workspaces", map[string]any{"name": "Отозванный стартап"}, http.StatusCreated, &revoked)
	create := func(workspace, kind, title, status, priority, due string) Record {
		var record Record
		body := map[string]any{"type": kind, "title": title, "ownerId": owner.ID, "status": status, "priority": priority}
		if due != "" {
			body["dueAt"] = due
		}
		requestWorkspaceJSON(t, ownerClient, http.MethodPost, server.URL+"/api/records", workspace, body, http.StatusCreated, &record)
		return record
	}
	dueToday := create(project.ID, "task", "Срок сегодня", "planned", "normal", "2026-09-05T12:00:00Z")
	active := create(project.ID, "task", "Текущая работа", "in_progress", "normal", "")
	blocked := create(project.ID, "task", "Заблокированная работа", "blocked", "high", "")
	overdue := create(project.ID, "task", "Прошедший срок", "planned", "high", "2026-09-04T20:00:00Z")
	review := create(project.ID, "task", "Нужна приёмка", "planned", "normal", "")
	risk := create(project.ID, "risk", "Критический риск", "in_progress", "critical", "")
	completed := create(project.ID, "task", "Уже завершено", "planned", "critical", "2026-09-04T12:00:00Z")
	foreign := create(project.ID, "task", "Назначено другому", "planned", "normal", "2026-09-05T13:00:00Z")
	revokedRecord := create(revoked.ID, "task", "Больше недоступно", "in_progress", "critical", "2026-09-04T12:00:00Z")
	if _, err := store.db.Exec(`UPDATE records SET status='review',progress=100,owner_id=? WHERE id=?`, other.ID, review.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.Exec(`UPDATE records SET status='completed',progress=100,completed_at=? WHERE id=?`, nowText(), completed.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.Exec(`UPDATE records SET owner_id=? WHERE id=?`, other.ID, foreign.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.Exec(`DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?`, revoked.ID, owner.ID); err != nil {
		t.Fatal(err)
	}

	var day personalDaySummary
	requestJSON(t, ownerClient, http.MethodGet, server.URL+"/api/personal/day?date=2026-09-05&timezone=UTC", nil, http.StatusOK, &day)
	if day.ProjectWork.Total != 3 || day.ProjectWork.HasMore || len(day.ProjectWork.Items) != 3 {
		t.Fatalf("project work section: %+v", day.ProjectWork)
	}
	workIDs := []string{}
	for _, item := range day.ProjectWork.Items {
		workIDs = append(workIDs, item.ID)
		if item.WorkspaceID != project.ID || item.Workspace != project.Name {
			t.Fatalf("project context missing: %+v", item)
		}
	}
	for _, id := range []string{dueToday.ID, active.ID, blocked.ID} {
		if !slices.Contains(workIDs, id) {
			t.Fatal("relevant work missing", id, workIDs)
		}
	}
	if day.ProjectAttention.Total != 3 || len(day.ProjectAttention.Items) != 3 {
		t.Fatalf("project attention section: %+v", day.ProjectAttention)
	}
	reasons := map[string]string{}
	for _, item := range day.ProjectAttention.Items {
		reasons[item.ID] = item.Reason
	}
	if reasons[overdue.ID] != "Срок проекта прошёл" || reasons[review.ID] != "Нужна ваша приёмка" || reasons[risk.ID] != "Критический риск проекта" {
		t.Fatalf("unexplained signals: %+v", reasons)
	}
	for _, hidden := range []string{completed.ID, foreign.ID, revokedRecord.ID} {
		if slices.Contains(workIDs, hidden) || reasons[hidden] != "" {
			t.Fatal("completed, unrelated or revoked record leaked", hidden)
		}
	}
	requestJSON(t, otherClient, http.MethodGet, server.URL+"/api/personal/day?date=2026-09-05&timezone=UTC", nil, http.StatusOK, &day)
	if day.ProjectWork.Total != 0 || day.ProjectAttention.Total != 0 {
		t.Fatal("project morning view leaked to another account")
	}

	for index := 0; index < personalDayProjectLimit+1; index++ {
		create(project.ID, "task", "Дополнительная работа "+string(rune('A'+index)), "planned", "normal", "2026-09-05T15:00:00Z")
	}
	requestJSON(t, ownerClient, http.MethodGet, server.URL+"/api/personal/day?date=2026-09-05&timezone=UTC", nil, http.StatusOK, &day)
	if day.ProjectWork.Total != 3+personalDayProjectLimit+1 || len(day.ProjectWork.Items) != personalDayProjectLimit || !day.ProjectWork.HasMore {
		t.Fatalf("unbounded morning project list: %+v", day.ProjectWork)
	}
}

func TestPersonalDayMidnightAllDayAndDST(t *testing.T) {
	plans := []PersonalPlan{{ID: "night", Status: "planned", ItemKind: "event", StartsAt: dayString("2026-09-03T23:00:00Z"), EndsAt: dayString("2026-09-04T01:00:00Z")}, {ID: "midnight", Status: "planned", ItemKind: "event", StartsAt: dayString("2026-09-03T20:00:00Z"), EndsAt: dayString("2026-09-04T00:00:00Z")}}
	out := calculatePersonalDay("2026-09-04", personalDaySettings{Timezone: "UTC", Start: "00:00", End: "02:00"}, plans, time.Now())
	if !reflect.DeepEqual(out.Events, []string{"night"}) || out.FreeMinutes != 60 {
		t.Fatal("midnight must be half-open", out)
	}
	out = calculatePersonalDay("2026-09-03", personalDaySettings{Timezone: "UTC", Start: "22:00", End: "02:00"}, plans, time.Now())
	if out.FreeMinutes != 60 {
		t.Fatal("overnight boundaries", out.FreeMinutes)
	}
	plans = append(plans, PersonalPlan{ID: "all-day", Status: "planned", ItemKind: "event", StartDate: "2026-09-04", EndDate: "2026-09-04"})
	out = calculatePersonalDay("2026-09-04", personalDaySettings{Timezone: "UTC", Start: "09:00", End: "18:00"}, plans, time.Now())
	if !out.TimeKnown || out.FreeMinutes != 0 {
		t.Fatal("explicit all-day event did not reserve the day")
	}
	for _, c := range []struct {
		day     string
		minutes int
	}{{"2026-03-08", 180}, {"2026-11-01", 300}} {
		out = calculatePersonalDay(c.day, personalDaySettings{Timezone: "America/New_York", Start: "00:00", End: "04:00"}, nil, time.Now())
		if out.FreeMinutes != c.minutes {
			t.Fatal("DST must use actual intervals", c, out.FreeMinutes)
		}
	}
	out = calculatePersonalDay("2026-03-08", personalDaySettings{Timezone: "America/New_York", Start: "02:30", End: "04:00"}, nil, time.Now())
	if out.TimeKnown || out.TimeReason == "" {
		t.Fatal("nonexistent clock silently shifted")
	}
	out = calculatePersonalDay("2026-11-01", personalDaySettings{Timezone: "America/New_York", Start: "01:30", End: "04:00"}, nil, time.Now())
	if out.TimeKnown {
		t.Fatal("ambiguous clock occurrence silently selected")
	}
	now, _ := time.Parse(time.RFC3339, "2026-09-04T12:00:00Z")
	out = calculatePersonalDay("2026-09-04", personalDaySettings{Timezone: "UTC", Start: "09:00", End: "18:00"}, []PersonalPlan{{ID: "early-done", Status: "done", ItemKind: "event", StartsAt: dayString("2026-09-04T15:00:00Z"), EndsAt: dayString("2026-09-04T17:00:00Z"), CompletedAt: dayString("2026-09-04T11:00:00Z")}}, now)
	if out.RemainingFreeMinutes != 360 {
		t.Fatal("completed event reserved future time", out.RemainingFreeMinutes)
	}
}

func TestPersonalDayFocusAndSettingsArePrivateVersionedAndNonDestructive(t *testing.T) {
	_, server, owner, other := newPersonalPlanningFixture(t)
	base := server.URL + "/api/personal"
	var plan, foreign PersonalPlan
	requestJSON(t, owner, "POST", base+"/plans", map[string]any{"title": "Focus", "startDate": "2026-09-19", "endDate": "2026-09-19"}, 201, &plan)
	requestJSON(t, other, "POST", base+"/plans", map[string]any{"title": "Private other"}, 201, &foreign)
	focusPath := base + "/day/2026-09-04/focus"
	var focus personalDayFocus
	requestJSON(t, owner, "PUT", focusPath, map[string]any{"planId": foreign.ID, "expectedUpdatedAt": ""}, 404, nil)
	requestJSON(t, owner, "PUT", focusPath, map[string]any{"planId": plan.ID, "expectedUpdatedAt": ""}, 200, &focus)
	firstVersion := focus.UpdatedAt
	requestJSON(t, owner, "PUT", focusPath, map[string]any{"planId": plan.ID, "expectedUpdatedAt": ""}, 200, &focus)
	if focus.UpdatedAt != firstVersion {
		t.Fatal("same choice was not idempotent")
	}
	requestJSON(t, owner, "PUT", focusPath, map[string]any{"planId": "", "expectedUpdatedAt": ""}, 409, nil)
	var day personalDaySummary
	requestJSON(t, owner, "GET", base+"/day?date=2026-09-04&timezone=Europe/Moscow", nil, 200, &day)
	if day.Focus.PlanID != plan.ID || day.TimeKnown || len(day.Today) != 0 {
		t.Fatal("focus changed the plan date", day)
	}
	requestJSON(t, other, "GET", base+"/day?date=2026-09-04", nil, 200, &day)
	if day.Focus.PlanID != "" {
		t.Fatal("focus leaked")
	}
	var settings personalDaySettings
	input := map[string]any{"timezone": "Europe/Moscow", "start": "09:00", "end": "18:00", "expectedUpdatedAt": ""}
	requestJSON(t, owner, "PUT", base+"/day/settings", input, 200, &settings)
	requestJSON(t, owner, "PUT", base+"/day/settings", input, 200, &settings)
	input["start"] = "10:00"
	requestJSON(t, owner, "PUT", base+"/day/settings", input, 409, nil)
	requestJSON(t, other, "GET", base+"/day?date=2026-09-04", nil, 200, &day)
	if day.Settings.Start != "" {
		t.Fatal("work window leaked")
	}
	requestJSON(t, owner, "PATCH", base+"/plans/"+plan.ID, map[string]any{"title": plan.Title, "notes": "", "status": "done", "expectedUpdatedAt": plan.UpdatedAt}, 200, &plan)
	requestJSON(t, owner, "GET", base+"/day?date=2026-09-04", nil, 200, &day)
	if day.Focus.PlanID != plan.ID {
		t.Fatal("completed focus should remain a result")
	}
	requestJSON(t, owner, "DELETE", base+"/plans/"+plan.ID, nil, 204, nil)
	requestJSON(t, owner, "GET", base+"/day?date=2026-09-04", nil, 200, &day)
	if day.Focus.PlanID != "" {
		t.Fatal("archived focus should not be active")
	}
	requestJSON(t, owner, "GET", base+"/day?date=2026-02-30", nil, 400, nil)
	requestJSON(t, owner, "GET", base+"/day?date=2026-09-04&timezone=Local", nil, 400, nil)
}
