package app

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestReadingCalendarAndCatalogue(t *testing.T) {
	if len(bibleBooks) != 66 {
		t.Fatal("catalogue")
	}
	total := 0
	for i, b := range bibleBooks {
		if b.ID != i+1 {
			t.Fatal("stable IDs")
		}
		total += b.Chapters
	}
	if total != 1189 {
		t.Fatal(total)
	}
	if validReadingRange(43, 21, 22) || validReadingRange(0, 1, 1) || validReadingRange(43, 6, 5) {
		t.Fatal("invalid range accepted")
	}
	for _, test := range []struct{ b, c, nb, nc int }{{43, 6, 43, 7}, {43, 21, 44, 1}, {66, 22, 0, 0}, {0, 0, 43, 1}} {
		b, c := nextReading(test.b, test.c)
		if b != test.nb || c != test.nc {
			t.Fatal(test, b, c)
		}
	}
	instant, _ := time.Parse(time.RFC3339, "2026-09-04T21:00:00Z")
	if readingDay(instant) != "2026-09-05" || readingDay(instant.Add(-time.Nanosecond)) != "2026-09-04" {
		t.Fatal("Moscow midnight")
	}
	for _, test := range []struct {
		days          []string
		today         string
		current, best int
	}{
		{[]string{}, "2026-09-04", 0, 0},
		{[]string{"2025-12-30", "2025-12-31", "2026-01-01"}, "2026-01-02", 3, 3},
		{[]string{"2025-12-30", "2025-12-31", "2026-01-01"}, "2026-01-03", 0, 3},
		{[]string{"2026-08-30", "2026-08-31", "2026-09-01", "2026-09-03"}, "2026-09-04", 1, 3},
	} {
		days := map[string]bool{}
		for _, d := range test.days {
			days[d] = true
		}
		a, b := readingStreak(days, test.today)
		if a != test.current || b != test.best {
			t.Fatalf("%+v: %d %d", test, a, b)
		}
	}
}

func TestHomegroupReadingWorkflowAndIsolation(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "reading.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	owner, member, stranger := testClient(t), testClient(t), testClient(t)
	ownerUser := registerVerifiedWithoutFixture(t, owner, server.URL, "read-owner@example.test", "read_owner")
	memberUser := registerVerifiedWithoutFixture(t, member, server.URL, "read-member@example.test", "read_member")
	registerVerifiedWithoutFixture(t, stranger, server.URL, "read-other@example.test", "read_other")
	var workspace Workspace
	requestJSON(t, owner, "POST", server.URL+"/api/workspaces", map[string]any{"name": "Домашка"}, 201, &workspace)
	req := func(client *http.Client, method, path string, payload any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, client, method, server.URL+path, workspace.ID, payload, status, out)
	}
	req(owner, "POST", "/api/reading/enable", map[string]any{}, 200, nil)
	req(owner, "POST", "/api/reading/enable", map[string]any{}, 200, nil)
	var overview ReadingOverview
	req(owner, "GET", "/api/reading", nil, 200, &overview)
	if len(overview.Groups) != 1 || overview.GroupID == "" || overview.NextBook != 43 || overview.NextChapter != 1 {
		t.Fatalf("setup: %+v", overview)
	}
	group := overview.GroupID
	req(owner, "POST", "/api/teams/"+workspace.TeamID+"/members", map[string]any{"username": "read_member", "role": "member", "projectIds": []string{workspace.ID}}, 200, nil)
	req(member, "POST", "/api/reading/join", map[string]any{"groupId": group}, 200, nil)
	req(member, "POST", "/api/reading/enable", map[string]any{}, 403, nil)
	req(stranger, "GET", "/api/reading", nil, 403, nil)
	req(stranger, "POST", "/api/reading/join", map[string]any{"groupId": group}, 403, nil)
	today := readingDay(time.Now())
	entry := map[string]any{"day": today, "book": 43, "first": 5, "last": 6, "complete": true, "stream": "personal", "note": "PRIVATE owner thought", "shared": false}
	req(owner, "POST", "/api/reading/entries", entry, 200, nil)
	req(owner, "POST", "/api/reading/entries", entry, 200, nil)
	entry["day"] = "2020-01-01"
	req(owner, "POST", "/api/reading/entries", entry, 409, nil)
	entry["day"] = "2099-01-01"
	req(owner, "POST", "/api/reading/entries", entry, 409, nil)
	entry["day"] = today
	entry["last"] = 22
	req(owner, "POST", "/api/reading/entries", entry, 400, nil)
	req(owner, "GET", "/api/reading?period=week", nil, 200, &overview)
	if len(overview.Entries) != 2 || overview.NextChapter != 7 || overview.CurrentStreak != 1 || overview.Ranking[0].Chapters != 2 {
		t.Fatalf("marks or duplicate: %+v", overview)
	}
	first := overview.Entries[0]
	req(member, "PATCH", "/api/reading/entries/"+first.ID, map[string]any{"expectedUpdatedAt": first.UpdatedAt, "note": "stolen", "complete": true}, 409, nil)
	req(member, "GET", "/api/reading", nil, 200, &overview)
	if len(overview.Entries) != 0 || len(overview.SharedNotes) != 0 {
		t.Fatal("private notes leaked")
	}
	plan := map[string]any{"groupId": group, "title": "Обсуждаем Иоанна", "book": 43, "first": 5, "last": 7, "meetingDay": today, "questions": "Что вы заметили?"}
	req(member, "POST", "/api/reading/plans", plan, 403, nil)
	req(owner, "POST", "/api/reading/plans", plan, 201, nil)
	req(owner, "GET", "/api/reading", nil, 200, &overview)
	if overview.Plans[0].Done != 2 || overview.Plans[0].Next != 7 || len(overview.Plans[0].Progress) != 2 {
		t.Fatalf("plan progress %+v", overview.Plans)
	}
	planID := overview.Plans[0].ID
	req(member, "POST", "/api/reading/plans/"+planID+"/cancel", map[string]any{"reason": "no"}, 403, nil)
	// Group preparation must not change the independent personal next chapter.
	entry["last"] = 3
	entry["first"] = 3
	entry["book"] = 40
	entry["stream"] = "group"
	entry["complete"] = false
	entry["note"] = "SHARED thought"
	entry["shared"] = true
	req(owner, "POST", "/api/reading/entries", entry, 200, nil)
	req(owner, "GET", "/api/reading", nil, 200, &overview)
	if overview.NextBook != 43 || overview.NextChapter != 7 || overview.Ranking[0].Chapters != 2 {
		t.Fatal("partial/group reading corrupted ranking or route")
	}
	req(member, "GET", "/api/reading", nil, 200, &overview)
	if len(overview.SharedNotes) != 1 || overview.SharedNotes[0].Note != "SHARED thought" || len(overview.Plans[0].Progress) != 0 {
		t.Fatal("shared note or leader privacy")
	}
	var second map[string]string
	req(owner, "POST", "/api/reading/groups", map[string]any{"name": "Вторая домашка", "leaderId": memberUser.ID}, 200, &second)
	req(owner, "POST", "/api/reading/join", map[string]any{"groupId": second["id"]}, 409, nil)
	req(member, "POST", "/api/reading/join", map[string]any{"groupId": second["id"]}, 200, nil)
	plan["groupId"] = second["id"]
	req(member, "POST", "/api/reading/plans", plan, 201, nil)
	req(member, "GET", "/api/reading", nil, 200, &overview)
	if len(overview.SharedNotes) != 0 {
		t.Fatal("other group notes leaked")
	}
	req(owner, "POST", "/api/reading/plans/"+planID+"/cancel", map[string]any{"reason": "Заменили местописание"}, 200, nil)
	req(owner, "PATCH", "/api/reading/entries/"+first.ID, map[string]any{"expectedUpdatedAt": first.UpdatedAt, "cancel": true, "complete": true, "note": first.Note}, 200, nil)
	req(owner, "PATCH", "/api/reading/entries/"+first.ID, map[string]any{"expectedUpdatedAt": first.UpdatedAt, "note": "stale"}, 409, nil)
	req(owner, "GET", "/api/reading", nil, 200, &overview)
	for _, rank := range overview.Ranking {
		if rank.UserID == ownerUser.ID && rank.Chapters != 1 {
			t.Fatal("cancelled chapter counted")
		}
	}
	if len(overview.CancelledEntries) != 1 {
		t.Fatal("cancelled reading not recoverable")
	}
	cancelled := overview.CancelledEntries[0]
	req(owner, "PATCH", "/api/reading/entries/"+cancelled.ID, map[string]any{"expectedUpdatedAt": cancelled.UpdatedAt, "restore": true, "complete": true, "note": cancelled.Note}, 200, nil)
	req(owner, "GET", "/api/reading", nil, 200, &overview)
	if len(overview.CancelledEntries) != 0 {
		t.Fatal("restore failed")
	}
	var auditCount int
	if err = store.db.QueryRow("SELECT COUNT(*) FROM reading_entry_events WHERE entry_id=?", cancelled.ID).Scan(&auditCount); err != nil || auditCount != 2 {
		t.Fatal("cancel/restore history", auditCount, err)
	}
	// An old entry cannot be changed or restored, even by the workspace owner.
	var oldVersion string
	for _, e := range overview.Entries {
		if e.ID == first.ID {
			oldVersion = e.UpdatedAt
		}
	}
	if _, err = store.db.Exec("UPDATE reading_entries SET day='2020-01-01' WHERE id=?", first.ID); err != nil {
		t.Fatal(err)
	}
	req(owner, "PATCH", "/api/reading/entries/"+first.ID, map[string]any{"expectedUpdatedAt": oldVersion, "complete": true, "note": "late"}, 409, nil)
	// Concurrent identical deliveries must still produce exactly one scored chapter.
	payload, _ := json.Marshal(map[string]any{"day": today, "book": 43, "first": 10, "last": 10, "complete": true, "stream": "personal"})
	errorsCh := make(chan error, 8)
	var workers sync.WaitGroup
	for i := 0; i < 8; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			request, _ := http.NewRequest("POST", server.URL+"/api/reading/entries", bytes.NewReader(payload))
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("X-Workspace-ID", workspace.ID)
			response, err := owner.Do(request)
			if err != nil {
				errorsCh <- err
				return
			}
			defer response.Body.Close()
			if response.StatusCode != 200 {
				errorsCh <- fmt.Errorf("concurrent status %d", response.StatusCode)
			}
		}()
	}
	workers.Wait()
	close(errorsCh)
	for err := range errorsCh {
		t.Error(err)
	}
	var duplicates int
	if err = store.db.QueryRow("SELECT COUNT(*) FROM reading_entries WHERE workspace_id=? AND user_id=? AND book=43 AND chapter=10", workspace.ID, ownerUser.ID).Scan(&duplicates); err != nil || duplicates != 1 {
		t.Fatal("concurrent duplicates", duplicates, err)
	}
	var integrity string
	if err = store.db.QueryRow("PRAGMA integrity_check").Scan(&integrity); err != nil || integrity != "ok" {
		t.Fatal(integrity, err)
	}
}
