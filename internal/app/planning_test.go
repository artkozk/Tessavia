package app

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func TestPlanningCycleLifecycleAndAudit(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "planning.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	client := testClient(t)
	register(t, client, server.URL, "founder@example.test", "founder")

	var response PlanningCyclesResponse
	requestJSON(t, client, http.MethodGet, server.URL+"/api/planning/cycles", nil, http.StatusOK, &response)
	if response.Active != nil || len(response.Cycles) != 0 {
		t.Fatalf("new project planning cycles = %#v", response)
	}
	requestJSON(t, client, http.MethodPost, server.URL+"/api/planning/cycles", map[string]any{
		"title": "Осенний цикл", "startDate": "2026-09-31",
	}, http.StatusBadRequest, nil)
	requestJSON(t, client, http.MethodPost, server.URL+"/api/planning/cycles", map[string]any{
		"title": "Осенний цикл", "startDate": "2026-09-01",
	}, http.StatusCreated, &response)
	if response.Active == nil || response.Active.StartDate != "2026-09-01" || response.Active.EndDate != "2026-11-23" || response.Active.ReviewWeekStart != "2026-11-24" {
		t.Fatalf("created planning cycle = %#v", response.Active)
	}
	first := *response.Active
	requestJSON(t, client, http.MethodPatch, server.URL+"/api/planning/cycles/"+first.ID, map[string]any{
		"startDate": "2026-09-07", "expectedUpdatedAt": first.UpdatedAt,
	}, http.StatusBadRequest, nil)
	requestJSON(t, client, http.MethodPatch, server.URL+"/api/planning/cycles/"+first.ID, map[string]any{
		"title": "Осенний фокус", "expectedUpdatedAt": first.UpdatedAt,
	}, http.StatusOK, &response)
	if response.Active == nil || response.Active.Title != "Осенний фокус" {
		t.Fatalf("renamed planning cycle = %#v", response.Active)
	}
	requestJSON(t, client, http.MethodPost, server.URL+"/api/planning/cycles", map[string]any{
		"title": "Следующий цикл", "startDate": "2026-12-01", "reason": "Первый цикл закрыт",
	}, http.StatusCreated, &response)
	if response.Active == nil || response.Active.Title != "Следующий цикл" || len(response.Cycles) != 2 || response.Cycles[1].Status != "archived" {
		t.Fatalf("replaced planning cycles = %#v", response)
	}
	var activityCount int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM activity WHERE entity_type = 'planning_cycle'`).Scan(&activityCount); err != nil {
		t.Fatalf("count planning activity: %v", err)
	}
	if activityCount != 4 {
		t.Fatalf("planning activity count = %d, want 4", activityCount)
	}
}

func TestPlanningStartAcceptsChosenCalendarDate(t *testing.T) {
	if _, err := parsePlanningStart("2026-08-31"); err != nil {
		t.Fatalf("valid date rejected: %v", err)
	}
	if _, err := parsePlanningStart("2026-09-01"); err != nil {
		t.Fatalf("chosen Tuesday rejected: %v", err)
	}
	if _, err := parsePlanningStart("2026-09-31"); err == nil {
		t.Fatal("nonexistent calendar date must be rejected")
	}
}
