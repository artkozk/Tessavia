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

type testRecordPage struct {
	Records    []Record   `json:"records"`
	Activity   []Activity `json:"activity"`
	NextCursor string     `json:"nextCursor"`
	Checkpoint string     `json:"checkpoint"`
}

func seedPagedRecords(t *testing.T, store *Store, workspace string, user int64, count int) {
	t.Helper()
	tx, err := store.db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	for i := 0; i < count; i++ {
		_, err := tx.Exec(`INSERT INTO records(id,workspace_id,type,title,status,author_id,owner_id,due_at,created_at,updated_at)
			VALUES(?,?,'task',?,'planned',?,?,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z')`,
			fmt.Sprintf("paged-%04d", i), workspace, fmt.Sprintf("Карточка %04d", i), user, user)
		if err != nil {
			t.Fatal(err)
		}
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
}

func TestRecordPaginationPreservesAllRecordsDuringEdits(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "pages.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: time.Hour}))
	defer server.Close()
	client, partner := testClient(t), testClient(t)
	user := register(t, client, server.URL, "pages@example.test", "pages")
	register(t, partner, server.URL, "partner@example.test", "partner")
	fixture := createRecord(t, client, server.URL, map[string]any{"type": "task", "title": "Основа"})
	seedPagedRecords(t, store, fixture.WorkspaceID, user.ID, 1201)
	base := server.URL + "/api/records?includeArchived=true&pageSize=137"
	page := testRecordPage{}
	requestJSON(t, client, http.MethodGet, base, nil, 200, &page)
	if len(page.Records) != 137 || page.NextCursor == "" {
		t.Fatalf("first page: count=%d cursor=%q", len(page.Records), page.NextCursor)
	}
	checkpoint := page.Checkpoint
	// Restore/VACUUM is done with the service stopped; old cursors cannot survive a restart.
	restarted := httptest.NewServer(NewServer(store, Config{SessionLifetime: time.Hour}))
	requestJSON(t, client, http.MethodGet, restarted.URL+"/api/records?includeArchived=true&pageSize=137&cursor="+url.QueryEscape(page.NextCursor), nil, 400, nil)
	restarted.Close()
	// Editing ordering fields cannot move a record behind/ahead of an insertion cursor.
	requestJSON(t, client, http.MethodPatch, server.URL+"/api/records/paged-0001", map[string]any{"title": "Изменена уже прочитанная", "dueAt": "2026-12-01T00:00:00Z", "reason": "Проверка порядка"}, 200, nil)
	requestJSON(t, client, http.MethodPatch, server.URL+"/api/records/paged-1199", map[string]any{"title": "Изменена ещё не прочитанная", "dueAt": "2026-01-01T00:00:00Z", "reason": "Проверка порядка"}, 200, nil)
	late := createRecord(t, client, server.URL, map[string]any{"type": "task", "title": "Добавлена между страницами"})
	requestJSON(t, partner, http.MethodGet, base+"&cursor="+url.QueryEscape(page.NextCursor), nil, 400, nil)
	requestJSON(t, client, http.MethodGet, base+"&status=planned&cursor="+url.QueryEscape(page.NextCursor), nil, 400, nil)
	seen := map[string]bool{}
	for pages := 0; ; pages++ {
		if pages > 20 {
			t.Fatal("cursor did not finish")
		}
		if page.Checkpoint != checkpoint {
			t.Fatal("checkpoint changed between pages")
		}
		for _, record := range page.Records {
			if seen[record.ID] {
				t.Fatalf("duplicate %s", record.ID)
			}
			seen[record.ID] = true
		}
		if page.NextCursor == "" {
			break
		}
		requestJSON(t, client, http.MethodGet, base+"&cursor="+url.QueryEscape(page.NextCursor), nil, 200, &page)
	}
	if len(seen) != 1202 || seen[late.ID] {
		t.Fatalf("snapshot size=%d contains later insert=%v", len(seen), seen[late.ID])
	}
	var changes testRecordPage
	requestJSON(t, client, http.MethodGet, server.URL+"/api/sync?pageSize=200&recordsSince="+url.QueryEscape(checkpoint)+"&activitySince="+url.QueryEscape(checkpoint), nil, 200, &changes)
	changed := map[string]bool{}
	for _, record := range changes.Records {
		changed[record.ID] = true
	}
	if !changed[late.ID] || !changed["paged-0001"] || !changed["paged-1199"] {
		t.Fatalf("writes during paging missing: %v", changed)
	}
	var legacy []Record
	requestJSON(t, client, http.MethodGet, server.URL+"/api/records?includeArchived=true", nil, 200, &legacy)
	if len(legacy) != 1203 {
		t.Fatalf("legacy response still truncated: %d", len(legacy))
	}
	for _, suffix := range []string{"pageSize=0", "pageSize=501", "cursor=invalid"} {
		requestJSON(t, client, http.MethodGet, server.URL+"/api/records?"+suffix, nil, 400, nil)
	}
}

func TestSyncPagesDrainTiedTimestampsAndRemainWorkspaceScoped(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "sync-pages.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: time.Hour}))
	defer server.Close()
	client := testClient(t)
	user := register(t, client, server.URL, "sync@example.test", "syncpages")
	fixture := createRecord(t, client, server.URL, map[string]any{"type": "task", "title": "Основа"})
	seedPagedRecords(t, store, fixture.WorkspaceID, user.ID, 1001)
	tx, err := store.db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 1001; i++ {
		_, err = tx.Exec(`INSERT INTO activity(id,workspace_id,actor_id,entity_type,entity_id,action,details_json,reason,created_at)
			VALUES(?,?,?,'task',?,'updated','{}','','2026-09-01T00:00:00Z')`, fmt.Sprintf("page-event-%04d", i), fixture.WorkspaceID, user.ID, fmt.Sprintf("paged-%04d", i))
		if err != nil {
			tx.Rollback()
			t.Fatal(err)
		}
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	base := server.URL + "/api/sync?pageSize=113&recordsSince=2026-09-01T00:00:00Z&activitySince=2026-09-01T00:00:00Z"
	var page testRecordPage
	requestJSON(t, client, http.MethodGet, base, nil, 200, &page)
	var private Workspace
	requestJSON(t, client, http.MethodPost, server.URL+"/api/workspaces", map[string]any{"name": "Отдельный проект"}, 201, &private)
	requestWorkspaceJSON(t, client, http.MethodGet, base+"&cursor="+url.QueryEscape(page.NextCursor), private.ID, nil, 400, nil)
	seenRecords, seenEvents := map[string]bool{}, map[string]bool{}
	for pages := 0; ; pages++ {
		if pages > 20 {
			t.Fatal("sync stuck on tied timestamps")
		}
		for _, r := range page.Records {
			if seenRecords[r.ID] {
				t.Fatal("duplicate record", r.ID)
			}
			seenRecords[r.ID] = true
		}
		for _, event := range page.Activity {
			if seenEvents[event.ID] {
				t.Fatal("duplicate event", event.ID)
			}
			seenEvents[event.ID] = true
		}
		if page.NextCursor == "" {
			break
		}
		requestWorkspaceJSON(t, client, http.MethodGet, base+"&cursor="+url.QueryEscape(page.NextCursor), fixture.WorkspaceID, nil, 200, &page)
	}
	if len(seenRecords) != 1002 {
		t.Fatalf("records=%d", len(seenRecords))
	}
	for i := 0; i < 1001; i++ {
		if !seenEvents[fmt.Sprintf("page-event-%04d", i)] {
			t.Fatalf("missing event %d", i)
		}
	}
}
