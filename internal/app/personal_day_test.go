package app

import (
	"reflect"
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
