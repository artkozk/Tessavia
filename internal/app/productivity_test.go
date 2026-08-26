package app

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"testing"
	"time"
)

func TestCapacityQualityAndIncrementalSync(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "productivity.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	client := testClient(t)
	user := register(t, client, server.URL, "founder@example.test", "founder")
	partnerClient := testClient(t)
	partner := register(t, partnerClient, server.URL, "partner@example.test", "partner")

	var capacity []TeamCapacity
	requestJSON(t, client, http.MethodPut, server.URL+"/api/users/"+itoa(user.ID)+"/capacity", map[string]any{
		"weeklyMinutes": 600,
	}, http.StatusOK, &capacity)
	requestJSON(t, client, http.MethodPut, server.URL+"/api/users/"+itoa(partner.ID)+"/capacity", map[string]any{
		"weeklyMinutes": 300,
	}, http.StatusForbidden, nil)

	start, _ := weekBounds(time.Now())
	due := start.Add(48 * time.Hour).Format(time.RFC3339Nano)
	createRecord(t, client, server.URL, map[string]any{
		"type": "task", "title": "Проверить недельный план", "dueAt": due, "estimateMinutes": 180,
	})
	createRecord(t, client, server.URL, map[string]any{
		"type": "task", "title": "Работа без слота", "estimateMinutes": 90,
	})
	createRecord(t, client, server.URL, map[string]any{
		"type": "task", "title": "Повторяющаяся работа",
	})
	createRecord(t, client, server.URL, map[string]any{
		"type": "task", "title": "Повторяющаяся работа",
	})
	createRecord(t, client, server.URL, map[string]any{
		"type": "criterion", "title": "Критерий без происхождения", "description": "Используется при отборе",
	})

	requestJSON(t, client, http.MethodGet, server.URL+"/api/team/capacity", nil, http.StatusOK, &capacity)
	if len(capacity) != 2 || capacity[0].WeeklyCapacityMinutes != 600 || capacity[0].ScheduledMinutes != 180 || capacity[0].UnscheduledMinutes != 90 || capacity[0].UtilizationPercent != 30 {
		t.Fatalf("capacity = %#v", capacity)
	}
	var profile UserProfile
	requestJSON(t, client, http.MethodGet, server.URL+"/api/users/"+itoa(user.ID)+"/profile", nil, http.StatusOK, &profile)
	if profile.WeeklyCapacityMinutes != 600 || profile.ScheduledMinutes != 180 {
		t.Fatalf("profile capacity = %#v", profile)
	}

	var report QualityReport
	requestJSON(t, client, http.MethodGet, server.URL+"/api/quality", nil, http.StatusOK, &report)
	if report.Counts["orphan"] < 1 || report.Counts["duplicate"] != 2 || report.Counts["missing_source"] != 1 {
		t.Fatalf("quality counts = %#v, issues = %#v", report.Counts, report.Issues)
	}

	var syncPayload struct {
		Records  []Record   `json:"records"`
		Activity []Activity `json:"activity"`
		SyncedAt string     `json:"syncedAt"`
	}
	requestJSON(t, client, http.MethodGet, server.URL+"/api/sync?recordsSince="+url.QueryEscape("1970-01-01T00:00:00Z")+"&activitySince="+url.QueryEscape("1970-01-01T00:00:00Z"), nil, http.StatusOK, &syncPayload)
	if len(syncPayload.Records) != 5 || len(syncPayload.Activity) < 6 || syncPayload.SyncedAt == "" {
		t.Fatalf("sync payload: records=%d activity=%d syncedAt=%q", len(syncPayload.Records), len(syncPayload.Activity), syncPayload.SyncedAt)
	}
	cursor := syncPayload.SyncedAt
	created := createRecord(t, client, server.URL, map[string]any{"type": "task", "title": "Изменение после курсора"})
	requestJSON(t, client, http.MethodGet, server.URL+"/api/sync?recordsSince="+url.QueryEscape(cursor)+"&activitySince="+url.QueryEscape(cursor), nil, http.StatusOK, &syncPayload)
	if len(syncPayload.Records) != 1 || syncPayload.Records[0].ID != created.ID || len(syncPayload.Activity) != 1 {
		t.Fatalf("incremental sync after cursor: records=%#v activity=%#v", syncPayload.Records, syncPayload.Activity)
	}
	requestJSON(t, client, http.MethodGet, server.URL+"/api/sync?recordsSince=broken&activitySince="+url.QueryEscape(cursor), nil, http.StatusBadRequest, nil)
}

func TestWeekBoundsUseMoscowWeek(t *testing.T) {
	start, end := weekBounds(time.Date(2026, time.August, 30, 21, 30, 0, 0, time.UTC))
	want := time.Date(2026, time.August, 30, 21, 0, 0, 0, time.UTC)
	if !start.Equal(want) || !end.Equal(want.AddDate(0, 0, 7)) {
		t.Fatalf("week bounds = %s..%s, want %s..%s", start, end, want, want.AddDate(0, 0, 7))
	}
}

func itoa(value int64) string {
	return fmt.Sprintf("%d", value)
}
