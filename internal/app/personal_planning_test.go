package app

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"testing"
	"time"
)

func newPersonalPlanningFixture(t *testing.T) (*Store, *httptest.Server, *http.Client, *http.Client) {
	t.Helper()
	store, err := OpenStore(filepath.Join(t.TempDir(), "personal-planning.db"))
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	owner, other := testClient(t), testClient(t)
	register(t, owner, server.URL, "personal-planning@example.test", "personal_planning")
	register(t, other, server.URL, "personal-planning-other@example.test", "personal_planning_other")
	t.Cleanup(server.Close)
	t.Cleanup(func() { store.Close() })
	return store, server, owner, other
}

func TestPersonalProjectsGoalsTasksAndEventsStayPrivate(t *testing.T) {
	_, server, owner, other := newPersonalPlanningFixture(t)

	var project PersonalProject
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/personal/projects", map[string]any{
		"title": "Только мой запуск", "notes": "Не показывать команде", "colorKey": "blue",
	}, http.StatusCreated, &project)
	var goal PersonalGoal
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/personal/goals", map[string]any{
		"projectId": project.ID, "title": "Запустить за 12 недель", "horizon": "twelve_weeks",
		"startDate": "2026-09-07", "plannedMinutes": 2400,
	}, http.StatusCreated, &goal)
	if goal.EndDate != "2026-11-29" || goal.PlannedMinutes != 2400 {
		t.Fatalf("12-week goal = %#v", goal)
	}

	var parent PersonalPlan
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/personal/plans", map[string]any{
		"title": "Подготовить запуск", "projectId": project.ID, "goalId": goal.ID,
		"plannedMinutes": 180, "actualMinutes": 45, "itemKind": "task",
	}, http.StatusCreated, &parent)
	if parent.DueAt != nil || parent.StartDate != "" || parent.PlannedMinutes != 180 || parent.ActualMinutes != 45 {
		t.Fatalf("undated task changed its meaning: %#v", parent)
	}
	var child PersonalPlan
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/personal/plans", map[string]any{
		"title": "Собрать материалы", "goalId": goal.ID, "parentId": parent.ID,
	}, http.StatusCreated, &child)
	if child.ProjectID != project.ID || child.ParentID != parent.ID {
		t.Fatalf("subtask did not inherit goal project: %#v", child)
	}

	var event PersonalPlan
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/personal/plans", map[string]any{
		"title": "Личный созвон", "itemKind": "event",
		"startsAt": "2026-09-08T10:00:00+03:00", "endsAt": "2026-09-08T10:45:00+03:00",
	}, http.StatusCreated, &event)
	if event.ItemKind != "event" || event.DueAt != nil || event.StartsAt == nil || event.EndsAt == nil {
		t.Fatalf("time block = %#v", event)
	}
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/personal/plans", map[string]any{
		"title": "Неполный блок", "itemKind": "event", "startsAt": "2026-09-08T10:00:00+03:00",
	}, http.StatusBadRequest, nil)

	requestJSON(t, other, http.MethodPost, server.URL+"/api/personal/goals", map[string]any{
		"projectId": project.ID, "title": "Чужая цель", "horizon": "month", "startDate": "2026-09-01",
	}, http.StatusNotFound, nil)
	requestJSON(t, other, http.MethodPost, server.URL+"/api/personal/plans", map[string]any{
		"title": "Чужое дело", "projectId": project.ID,
	}, http.StatusBadRequest, nil)

	var overview PersonalOverview
	requestJSON(t, owner, http.MethodGet, server.URL+"/api/personal/overview", nil, http.StatusOK, &overview)
	if len(overview.Projects) != 1 || len(overview.Goals) != 1 || len(overview.Plans) != 3 {
		t.Fatalf("personal overview = %#v", overview)
	}
	var personalResults []PersonalSearchResult
	requestJSON(t, owner, http.MethodGet, server.URL+"/api/personal/search?q="+url.QueryEscape("мой запуск"), nil, http.StatusOK, &personalResults)
	if len(personalResults) != 1 || personalResults[0].Type != "project" {
		t.Fatalf("personal project search = %#v", personalResults)
	}
	var teamResults []SearchResult
	requestJSON(t, owner, http.MethodGet, server.URL+"/api/search?q="+url.QueryEscape("мой запуск"), nil, http.StatusOK, &teamResults)
	if len(teamResults) != 0 {
		t.Fatalf("personal data leaked into team search: %#v", teamResults)
	}
}

func TestPersonalRecurrenceCreatesOneNextOccurrenceAndCanStop(t *testing.T) {
	_, server, owner, _ := newPersonalPlanningFixture(t)
	var first PersonalPlan
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/personal/plans", map[string]any{
		"title": "Ежедневный обзор", "itemKind": "task", "plannedMinutes": 20,
		"recurrence": map[string]any{"cadence": "daily", "interval": 1, "timezone": "Europe/Berlin", "startDate": "2026-03-28", "untilDate": "2026-03-31"},
	}, http.StatusCreated, &first)
	if first.OccurrenceDate != "2026-03-28" || first.Recurrence == nil || first.Recurrence.Timezone != "Europe/Berlin" {
		t.Fatalf("first recurrence = %#v", first)
	}
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/personal/plans/"+first.ID+"/skip", map[string]any{
		"expectedUpdatedAt": first.UpdatedAt,
	}, http.StatusOK, &first)
	if first.OccurrenceState != "skipped" {
		t.Fatalf("skipped instance = %#v", first)
	}

	var overview PersonalOverview
	requestJSON(t, owner, http.MethodGet, server.URL+"/api/personal/overview", nil, http.StatusOK, &overview)
	second := onlyPlannedOccurrence(t, overview.Plans, "2026-03-29")
	requestJSON(t, owner, http.MethodPut, server.URL+"/api/personal/plans/"+second.ID+"/series", map[string]any{
		"expectedSeriesUpdatedAt": second.Recurrence.UpdatedAt,
		"title":                   "Обзор по новому правилу", "notes": "", "itemKind": "task", "plannedMinutes": 30,
		"expectedUpdatedAt": second.UpdatedAt,
		"recurrence":        map[string]any{"cadence": "daily", "interval": 1, "timezone": "Europe/Berlin", "untilDate": "2026-03-31", "active": false},
	}, http.StatusOK, &second)
	if second.Recurrence == nil || second.Recurrence.Active || second.Recurrence.StartDate != "2026-03-28" {
		t.Fatalf("stopped series = %#v", second.Recurrence)
	}
	requestJSON(t, owner, http.MethodPatch, server.URL+"/api/personal/plans/"+second.ID, map[string]any{
		"title": second.Title, "notes": second.Notes, "status": "done", "itemKind": second.ItemKind,
		"plannedMinutes": second.PlannedMinutes, "actualMinutes": 25, "expectedUpdatedAt": second.UpdatedAt,
	}, http.StatusOK, &second)

	overview = PersonalOverview{}
	requestJSON(t, owner, http.MethodGet, server.URL+"/api/personal/overview", nil, http.StatusOK, &overview)
	if len(overview.Plans) != 2 {
		t.Fatalf("inactive series created another occurrence: %#v", overview.Plans)
	}
}

func TestPersonalRecurrenceCompletionAndInstanceMove(t *testing.T) {
	_, server, owner, _ := newPersonalPlanningFixture(t)
	var first PersonalPlan
	requestJSON(t, owner, http.MethodPost, server.URL+"/api/personal/plans", map[string]any{
		"title": "Еженедельная проверка", "plannedMinutes": 15,
		"recurrence": map[string]any{"cadence": "weekly", "interval": 1, "timezone": "Europe/Moscow", "startDate": "2026-09-03"},
	}, http.StatusCreated, &first)
	requestJSON(t, owner, http.MethodPatch, server.URL+"/api/personal/plans/"+first.ID, map[string]any{
		"title": first.Title, "notes": "", "status": "done", "actualMinutes": 12, "expectedUpdatedAt": first.UpdatedAt,
	}, http.StatusOK, &first)
	var overview PersonalOverview
	requestJSON(t, owner, http.MethodGet, server.URL+"/api/personal/overview", nil, http.StatusOK, &overview)
	second := onlyPlannedOccurrence(t, overview.Plans, "2026-09-10")

	requestJSON(t, owner, http.MethodPatch, server.URL+"/api/personal/plans/"+second.ID, map[string]any{
		"title": "Перенесён только этот экземпляр", "notes": "", "status": "planned",
		"occurrenceDate": "2026-09-11", "expectedUpdatedAt": second.UpdatedAt,
	}, http.StatusOK, &second)
	if second.OccurrenceState != "moved" || second.OccurrenceDate != "2026-09-11" {
		t.Fatalf("moved instance = %#v", second)
	}
	requestJSON(t, owner, http.MethodPatch, server.URL+"/api/personal/plans/"+second.ID, map[string]any{
		"title": second.Title, "notes": "Отдельная правка", "status": "planned",
		"occurrenceDate": second.OccurrenceDate, "expectedUpdatedAt": second.UpdatedAt,
	}, http.StatusOK, &second)
	if second.OccurrenceState != "moved" {
		t.Fatalf("unchanged occurrence lost moved state: %#v", second)
	}
	requestJSON(t, owner, http.MethodPatch, server.URL+"/api/personal/plans/"+second.ID, map[string]any{
		"title": second.Title, "notes": second.Notes, "status": "done", "actualMinutes": 10,
		"occurrenceDate": second.OccurrenceDate, "expectedUpdatedAt": second.UpdatedAt,
	}, http.StatusOK, &second)
	overview = PersonalOverview{}
	requestJSON(t, owner, http.MethodGet, server.URL+"/api/personal/overview", nil, http.StatusOK, &overview)
	third := onlyPlannedOccurrence(t, overview.Plans, "2026-09-17")
	if third.ActualMinutes != 0 || third.Title != "Еженедельная проверка" {
		t.Fatalf("next occurrence = %#v", third)
	}
}

func TestNextPersonalOccurrenceDateClampsMonthEnd(t *testing.T) {
	for _, item := range []struct {
		current, cadence string
		interval         int
		want             string
	}{
		{"2026-01-31", "monthly", 1, "2026-02-28"},
		{"2028-01-31", "monthly", 1, "2028-02-29"},
		{"2026-09-03", "weekly", 2, "2026-09-17"},
	} {
		got, err := nextPersonalOccurrenceDate(item.current, item.cadence, item.interval)
		if err != nil || got != item.want {
			t.Fatalf("next %s/%s/%d = %q, %v", item.current, item.cadence, item.interval, got, err)
		}
	}
}

func onlyPlannedOccurrence(t *testing.T, plans []PersonalPlan, date string) PersonalPlan {
	t.Helper()
	var found []PersonalPlan
	for _, plan := range plans {
		if plan.Status == "planned" && plan.OccurrenceDate == date {
			found = append(found, plan)
		}
	}
	if len(found) != 1 {
		t.Fatalf("wanted one planned occurrence on %s, got %#v", date, plans)
	}
	return found[0]
}
