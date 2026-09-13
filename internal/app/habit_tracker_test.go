package app

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func trackerFixture(mode, cadence, start string) PersonalHabit {
	r := HabitRule{EffectiveDate: start, Mode: mode, Cadence: cadence, Target: 1, PeriodTarget: 2, PeriodMeasure: "days", Interval: 2, Weekdays: []int{1, 3, 5}, Unit: "раз"}
	if mode == "quit" {
		r.Target = 0
	}
	return PersonalHabit{StartDate: start, Rule: r, Rules: []HabitRule{r}, Timezone: "Europe/Moscow", Checkins: []HabitCheckin{}}
}
func measured(date string, value float64) HabitCheckin {
	return HabitCheckin{Date: date, Value: value, State: "measured"}
}
func TestHabitTrackerDistinguishesZeroMissingSkipAndLapse(t *testing.T) {
	h := trackerFixture("quit", "daily", "2026-08-28")
	h.Checkins = []HabitCheckin{measured("2026-08-28", 0), measured("2026-08-29", 0), {Date: "2026-08-30", State: "skipped"}, measured("2026-08-31", 2), measured("2026-09-01", 0)}
	got := buildHabitTracker(h, "2026-08-28", "2026-09-03", "2026-09-03")
	s := got.Summary
	if s.Success != 3 || s.Failed != 1 || s.Skipped != 1 || s.Unmarked != 1 || s.Planned != 5 || s.Percent == nil || *s.Percent != 60 || s.BestStreak != 2 || s.CurrentStreak != 0 || s.Total != 2 || s.LastLapse != "2026-08-31" {
		t.Fatalf("incorrect quit stats: %+v", s)
	}
	if got.Days[6].State != "pending" {
		t.Fatalf("today must be unmarked: %+v", got.Days[6])
	}
}
func TestHabitTrackerScheduleRestPauseAndHistoricalGoal(t *testing.T) {
	h := trackerFixture("quantity", "weekdays", "2026-08-28")
	h.Rule.Target = 20
	h.Rules[0] = h.Rule
	next := h.Rule
	next.EffectiveDate = "2026-09-01"
	next.Target = 30
	h.Rules = append(h.Rules, next)
	h.Checkins = []HabitCheckin{measured("2026-08-28", 20), measured("2026-08-31", 20), measured("2026-09-04", 30)}
	h.Pauses = []HabitPause{{StartDate: "2026-09-02", EndDate: "2026-09-03"}}
	out := buildHabitTracker(h, "2026-08-28", "2026-09-06", "2026-09-04")
	if out.Summary.CurrentStreak != 3 || out.Summary.BestStreak != 3 || out.Summary.Success != 3 || out.Summary.Paused != 1 || out.Days[1].State != "rest" {
		t.Fatalf("schedule stats: %+v", out.Summary)
	}
	if out.Days[3].Rule.Target != 20 || out.Days[7].Rule.Target != 30 {
		t.Fatal("historical target rewritten")
	}
}
func TestHabitTrackerPeriodsCountDaysOnceAndLeaveCurrentWeekOpen(t *testing.T) {
	h := trackerFixture("quantity", "weekly", "2026-08-24")
	h.Rule.Target = 2
	h.Rules[0] = h.Rule
	h.Checkins = []HabitCheckin{measured("2026-08-24", 12), measured("2026-08-26", 2), measured("2026-08-31", 3)}
	out := buildHabitTracker(h, "2026-08-24", "2026-09-06", "2026-09-03")
	if out.Summary.CurrentStreak != 1 || len(out.Periods) != 2 || out.Periods[0].Actual != 2 || out.Periods[1].State != "pending" || *out.Summary.Percent != 100 {
		t.Fatalf("weekly result: %+v %+v", out.Summary, out.Periods)
	}
	out = buildHabitTracker(h, "2026-08-24", "2026-09-07", "2026-09-07")
	if out.Summary.CurrentStreak != 0 || out.Summary.BestStreak != 1 || *out.Summary.Percent != 50 {
		t.Fatalf("closed week: %+v", out.Summary)
	}
	h.Rule.PeriodMeasure = "volume"
	h.Rule.PeriodTarget = 14
	h.Rules[0] = h.Rule
	out = buildHabitTracker(h, "2026-08-24", "2026-09-06", "2026-09-03")
	if out.Periods[0].Actual != 14 || out.Periods[0].State != "success" {
		t.Fatal(out.Periods)
	}
}
func TestHabitTrackerLeapDayIntervalTimezoneAndReduce(t *testing.T) {
	h := trackerFixture("reduce", "interval", "2024-02-27")
	h.Timezone = "America/New_York"
	h.Rule.Target = 0.5
	h.Rules[0] = h.Rule
	h.Checkins = []HabitCheckin{measured("2024-02-27", 0), measured("2024-02-29", 0.5), measured("2024-03-02", 0.75)}
	out := buildHabitTracker(h, "2024-02-27", "2024-03-03", "2024-03-03")
	if out.Summary.Success != 2 || out.Summary.Failed != 1 || out.Summary.BestStreak != 2 || out.Summary.Total != 1.25 || out.Days[2].State != "success" {
		t.Fatalf("fraction/leap stats: %+v", out)
	}
	h = trackerFixture("build", "daily", "2026-03-07")
	h.Timezone = "America/New_York"
	h.Checkins = []HabitCheckin{measured("2026-03-07", 1), measured("2026-03-08", 1), measured("2026-03-09", 1)}
	out = buildHabitTracker(h, "2026-03-07", "2026-03-10", "2026-03-10")
	if out.Summary.CurrentStreak != 3 || out.Summary.Planned != 3 {
		t.Fatal("DST broke civil-day streak", out.Summary)
	}
	start, end := habitPeriodBounds("2024-02-29", "monthly")
	if start != "2024-02-01" || end != "2024-02-29" {
		t.Fatal(start, end)
	}
}
func TestHabitTrackerMovedOccurrenceAndNoPlan(t *testing.T) {
	h := trackerFixture("build", "weekdays", "2026-08-28")
	h.Moves = []HabitMove{{SourceDate: "2026-08-28", TargetDate: "2026-08-29"}}
	h.Checkins = []HabitCheckin{measured("2026-08-29", 1), measured("2026-08-31", 1)}
	out := buildHabitTracker(h, "2026-08-28", "2026-08-31", "2026-08-31")
	if out.Days[0].State != "moved" || out.Days[1].SourceDate != "2026-08-28" || out.Summary.CurrentStreak != 2 || out.Summary.Planned != 2 {
		t.Fatalf("move: %+v", out)
	}
	h = trackerFixture("quit", "daily", "2026-09-01")
	out = buildHabitTracker(h, "2026-09-01", "2026-09-05", "2026-09-01")
	if out.Summary.Percent != nil || out.Summary.Planned != 0 || out.Summary.Success != 0 {
		t.Fatal("invented empty success", out.Summary)
	}
}

func TestHabitTrackerAPILifecycleConflictAndPrivacy(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "habits.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	owner, other := testClient(t), testClient(t)
	register(t, owner, server.URL, "habit-owner@example.test", "habit_owner")
	register(t, other, server.URL, "habit-other@example.test", "habit_other")
	today := time.Now().In(personalLocation()).Format("2006-01-02")
	start := habitAdd(today, -4)
	rule := trackerFixture("reduce", "daily", start).Rule
	rule.Target = 0.5
	var h PersonalHabit
	requestJSON(t, owner, "POST", server.URL+"/api/personal/habits", map[string]any{"title": "Меньше", "startDate": start, "rule": rule}, 201, &h)
	base := server.URL + "/api/personal/habits/" + h.ID
	requestJSON(t, owner, "PATCH", base, map[string]any{"title": h.Title, "description": "Смысл привычки", "revision": h.Revision, "rule": h.Rule}, 200, &h)
	if len(h.Rules) != 1 {
		t.Fatal("description edit changed the schedule phase")
	}
	empty := ""
	var c HabitCheckin
	requestJSON(t, owner, "PUT", base+"/checkins/"+start, map[string]any{"value": 0, "expectedUpdatedAt": empty, "revision": h.Revision}, 200, &c)
	if c.Value != 0 {
		t.Fatal("zero became one")
	}
	requestJSON(t, owner, "PUT", base+"/checkins/"+start, map[string]any{"value": 0, "expectedUpdatedAt": empty, "revision": h.Revision}, 200, nil) // lost response replay
	requestJSON(t, owner, "PUT", base+"/checkins/"+start, map[string]any{"value": 0.5, "expectedUpdatedAt": empty, "revision": h.Revision}, 409, nil)
	requestJSON(t, owner, "PUT", base+"/checkins/"+start, map[string]any{"value": 0.5, "expectedUpdatedAt": c.UpdatedAt, "revision": h.Revision}, 200, &c)
	if c.Value != 0.5 {
		t.Fatal("fraction lost")
	}
	requestJSON(t, owner, "PUT", base+"/checkins/"+habitAdd(today, 1), map[string]any{"value": 0}, 400, nil)
	requestJSON(t, owner, "PUT", base+"/checkins/"+habitAdd(start, -1), map[string]any{"value": 0}, 400, nil)
	requestJSON(t, other, "GET", base+"/tracker", nil, 404, nil)
	requestJSON(t, other, "GET", base+"/export", nil, 404, nil)
	requestJSON(t, other, "PUT", base+"/checkins/"+start, map[string]any{"value": 0}, 404, nil)
	requestJSON(t, other, "POST", base+"/pause", map[string]any{"revision": h.Revision}, 404, nil)
	rule.Target = 0.25
	rule.EffectiveDate = habitAdd(today, 1)
	requestJSON(t, owner, "PATCH", base, map[string]any{"title": h.Title, "revision": h.Revision, "rule": rule}, 200, &h)
	var out HabitTracker
	requestJSON(t, owner, "GET", base+"/tracker?from="+start+"&to="+today, nil, 200, &out)
	if out.Days[0].State != "success" || out.Days[0].Rule.Target != 0.5 {
		t.Fatal("new target changed history")
	}
	var exported PersonalHabit
	requestJSON(t, owner, "GET", base+"/export", nil, 200, &exported)
	if len(exported.Rules) != 2 || len(exported.Checkins) != 1 || exported.Checkins[0].Value != 0.5 {
		t.Fatal("export omitted historical facts")
	}
	requestJSON(t, owner, "PATCH", base, map[string]any{"title": "stale", "revision": 1, "rule": rule}, 409, nil)
	requestJSON(t, owner, "POST", base+"/pause", map[string]any{"revision": h.Revision}, 204, nil)
	requestJSON(t, owner, "GET", base+"/tracker?from="+today+"&to="+today, nil, 200, &out)
	if out.Days[0].State != "paused" {
		t.Fatal("pause unavailable")
	}
	requestJSON(t, owner, "PUT", base+"/checkins/"+today, map[string]any{"value": 0}, 400, nil)
	requestJSON(t, owner, "POST", base+"/resume", map[string]any{"revision": out.Habit.Revision}, 204, nil)
	requestJSON(t, owner, "GET", base+"/tracker", nil, 200, &out)
	requestJSON(t, owner, "DELETE", base, map[string]any{"revision": out.Habit.Revision}, 204, nil)
	requestJSON(t, owner, "GET", base+"/tracker", nil, 200, &out)
	if out.Habit.ArchivedAt == "" {
		t.Fatal("archive not persisted")
	}
	requestJSON(t, owner, "POST", base+"/restore", map[string]any{"revision": out.Habit.Revision}, 204, nil)
	requestJSON(t, owner, "GET", base+"/tracker?from="+start+"&to="+today, nil, 200, &out)
	if len(out.Habit.Checkins) != 1 || out.Habit.Checkins[0].Value != 0.5 {
		t.Fatal("archive lost data")
	}
	requestJSON(t, owner, "DELETE", base+"/checkins/"+start, map[string]any{"expectedUpdatedAt": c.UpdatedAt, "revision": out.Habit.Revision}, 204, nil)
	requestJSON(t, owner, "GET", base+"/tracker?from="+start+"&to="+today, nil, 200, &out)
	if out.Days[0].State != "pending" {
		t.Fatal("deletion invented a success")
	}
	requestJSON(t, owner, http.MethodGet, base+"/tracker?from=2000-01-01&to="+today, nil, 400, nil)
}

// A simple tick is an absolute measurement, not a business-task completion
// requiring evidence. Exercise the exact empty-note payload sent by the UI.
func TestHabitSimpleCheckinWithoutRequiredTextAndReversibleCorrection(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "simple-habits.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	owner := testClient(t)
	register(t, owner, server.URL, "simple-habits@example.test", "simple_habits")
	today := time.Now().In(personalLocation()).Format("2006-01-02")
	for _, mode := range []string{"build", "quit"} {
		t.Run(mode, func(t *testing.T) {
			var h PersonalHabit
			rule := trackerFixture(mode, "daily", today).Rule
			requestJSON(t, owner, "POST", server.URL+"/api/personal/habits", map[string]any{"title": "Simple tick " + mode, "startDate": today, "rule": rule}, 201, &h)
			base := server.URL + "/api/personal/habits/" + h.ID
			path := base + "/checkins/" + today
			var c HabitCheckin
			payload := map[string]any{"state": "measured", "value": rule.Target, "note": "", "expectedUpdatedAt": "", "revision": h.Revision}
			requestJSON(t, owner, "PUT", path, payload, 200, &c)
			if c.Value != rule.Target || c.Note != "" || c.State != "measured" {
				t.Fatalf("simple tick changed: %+v", c)
			}
			firstVersion := c.UpdatedAt
			requestJSON(t, owner, "PUT", path, payload, 200, &c)
			if c.UpdatedAt != firstVersion {
				t.Fatal("replayed simple tick was saved twice")
			}
			var tracker HabitTracker
			requestJSON(t, owner, "GET", base+"/tracker?from="+today+"&to="+today, nil, 200, &tracker)
			if len(tracker.Days) != 1 || tracker.Days[0].State != "success" {
				t.Fatalf("tick is not a success: %+v", tracker.Days)
			}
			// The explicit alternative can record a lapse/non-completion without text.
			requestJSON(t, owner, "PUT", path, map[string]any{"state": "failed", "value": 0, "note": "", "expectedUpdatedAt": c.UpdatedAt, "revision": h.Revision}, 200, &c)
			requestJSON(t, owner, "GET", base+"/tracker?from="+today+"&to="+today, nil, 200, &tracker)
			if tracker.Days[0].State != "failed" {
				t.Fatal("explicit failure became missing or successful")
			}
			// A stale empty-day click cannot overwrite the subsequent correction.
			requestJSON(t, owner, "PUT", path, payload, 409, nil)
			requestJSON(t, owner, "DELETE", path, map[string]any{"expectedUpdatedAt": c.UpdatedAt, "revision": h.Revision}, 204, nil)
			tracker = HabitTracker{} // An omitted checkin must not retain a prior decode target.
			requestJSON(t, owner, "GET", base+"/tracker?from="+today+"&to="+today, nil, 200, &tracker)
			if tracker.Days[0].State != "pending" || tracker.Days[0].Checkin != nil {
				t.Fatal("removing a tick must return an unmarked day")
			}
		})
	}
}
