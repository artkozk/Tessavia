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

func TestNotificationHistoryFiltersPaginationAndAccess(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "notifications.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	client := testClient(t)
	otherClient := testClient(t)
	user := registerVerifiedWithoutFixture(t, client, server.URL, "inbox@example.test", "inbox_owner")
	other := registerVerifiedWithoutFixture(t, otherClient, server.URL, "other@example.test", "inbox_other")
	var workspaces []Workspace
	requestJSON(t, client, http.MethodGet, server.URL+"/api/workspaces", nil, http.StatusOK, &workspaces)
	var project Workspace
	requestJSON(t, client, http.MethodPost, server.URL+"/api/workspaces", map[string]any{"name": "Notification project"}, http.StatusCreated, &project)
	workspaces[0] = project
	var record Record
	requestWorkspaceJSON(t, client, http.MethodPost, server.URL+"/api/records", workspaces[0].ID, map[string]any{"type": "task", "title": "Закрытая работа"}, http.StatusCreated, &record)
	insert := func(id string, owner int64, entity any, read any, created string) {
		t.Helper()
		if _, err := store.db.Exec(`INSERT INTO notifications(id,user_id,type,title,body,entity_type,entity_id,read_at,created_at) VALUES(?,?,'record_update','Проверка','Описание','task',?,?,?)`, id, owner, entity, read, created); err != nil {
			t.Fatal(err)
		}
	}
	for i := 0; i < 235; i++ {
		insert(fmt.Sprintf("notice-%03d", i), user.ID, record.ID, nil, "2026-09-02T07:00:00Z")
	}
	insert("read-old", user.ID, record.ID, "2026-08-20T08:00:00Z", "2026-08-19T08:00:00Z")
	insert("generic", user.ID, nil, nil, "2026-09-01T08:00:00Z")
	insert("foreign", other.ID, nil, nil, "2026-09-02T09:00:00Z")
	insert("forbidden-project", other.ID, record.ID, nil, "2026-09-02T09:00:00Z")
	var shortList []Notification
	headers := requestGetJSONWithHeaders(t, client, server.URL+"/api/notifications", &shortList)
	if len(shortList) != 200 || headers.Get("X-Unread-Count") != "236" {
		t.Fatalf("legacy badge is truncated: items=%d unread=%s", len(shortList), headers.Get("X-Unread-Count"))
	}
	var page notificationInbox
	requestJSON(t, client, http.MethodGet, server.URL+"/api/notifications/inbox?status=unread", nil, http.StatusOK, &page)
	if len(page.Items) != 30 || page.UnreadCount != 236 || page.NextCursor == "" || page.Items[0].WorkspaceID != workspaces[0].ID {
		t.Fatalf("first page: %#v", page)
	}
	seen := map[string]bool{}
	for {
		for _, n := range page.Items {
			if seen[n.ID] {
				t.Fatalf("duplicate %s", n.ID)
			}
			seen[n.ID] = true
		}
		if page.NextCursor == "" {
			break
		}
		requestJSON(t, client, http.MethodGet, server.URL+"/api/notifications/inbox?status=unread&cursor="+url.QueryEscape(page.NextCursor), nil, http.StatusOK, &page)
	}
	if len(seen) != 236 {
		t.Fatalf("history truncated: %d", len(seen))
	}
	requestJSON(t, client, http.MethodGet, server.URL+"/api/notifications/inbox?status=read", nil, http.StatusOK, &page)
	if len(page.Items) != 1 || page.Items[0].ID != "read-old" {
		t.Fatalf("read: %#v", page)
	}
	requestJSON(t, client, http.MethodGet, server.URL+"/api/notifications/inbox?before=2026-08-25T00:00:00Z", nil, http.StatusOK, &page)
	if len(page.Items) != 1 {
		t.Fatalf("old: %#v", page)
	}
	requestJSON(t, client, http.MethodGet, server.URL+"/api/notifications/inbox?since=2026-09-02T07:00:00.000Z", nil, http.StatusOK, &page)
	if len(page.Items) != 30 {
		t.Fatalf("inclusive fractional boundary: %#v", page)
	}
	requestJSON(t, client, http.MethodPost, server.URL+"/api/notifications/notice-234/read", nil, http.StatusNoContent, nil)
	requestJSON(t, client, http.MethodPost, server.URL+"/api/notifications/notice-234/unread", nil, http.StatusNoContent, nil)
	requestJSON(t, otherClient, http.MethodPost, server.URL+"/api/notifications/notice-234/read", nil, http.StatusNotFound, nil)
	requestJSON(t, otherClient, http.MethodGet, server.URL+"/api/notifications/inbox", nil, http.StatusOK, &page)
	if len(page.Items) != 1 || page.Items[0].ID != "foreign" || page.UnreadCount != 1 {
		t.Fatalf("project access leak: %#v", page)
	}
	if _, err := store.db.Exec(`DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?`, workspaces[0].ID, user.ID); err != nil {
		t.Fatal(err)
	}
	requestJSON(t, client, http.MethodGet, server.URL+"/api/notifications/inbox", nil, http.StatusOK, &page)
	if len(page.Items) != 1 || page.Items[0].ID != "generic" {
		t.Fatalf("revoked access leak: %#v", page)
	}
	requestJSON(t, client, http.MethodPost, server.URL+"/api/notifications/notice-234/unread", nil, http.StatusNotFound, nil)
	for _, query := range []string{"status=bad", "limit=0", "limit=101", "cursor=???", "since=yesterday"} {
		requestJSON(t, client, http.MethodGet, server.URL+"/api/notifications/inbox?"+query, nil, http.StatusBadRequest, nil)
	}
	requestJSON(t, client, http.MethodPost, server.URL+"/api/notifications/read-all", nil, http.StatusNoContent, nil)
	requestJSON(t, client, http.MethodGet, server.URL+"/api/notifications/inbox?status=unread", nil, http.StatusOK, &page)
	if len(page.Items) != 0 || page.UnreadCount != 0 {
		t.Fatalf("read all: %#v", page)
	}
}

func TestInterfaceLayoutValidationAndIsolation(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "layout.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	client := testClient(t)
	otherClient := testClient(t)
	registerVerifiedWithoutFixture(t, client, server.URL, "layout@example.test", "layout_owner")
	registerVerifiedWithoutFixture(t, otherClient, server.URL, "layout-other@example.test", "layout_other")
	var project Workspace
	requestJSON(t, client, http.MethodPost, server.URL+"/api/workspaces", map[string]any{"name": "Layout test"}, http.StatusCreated, &project)
	var saved InterfacePreferences
	input := InterfacePreferences{DashboardWidgets: []string{"quality", "focus", "focus", "invalid"}, Layout: InterfaceLayout{ContentWidth: 99999, SidebarWidth: -1, SidebarSide: "right", Density: "compact", WidgetSpans: map[string]int{"focus": 12, "capture": 99, "invalid": 6}, ToolbarActions: []string{"create", "notifications", "create", "invalid"}, QuickActions: []string{}}}
	requestWorkspaceJSON(t, client, http.MethodPut, server.URL+"/api/interface/preferences", project.ID, input, http.StatusOK, &saved)
	requestWorkspaceJSON(t, client, http.MethodGet, server.URL+"/api/interface/preferences", project.ID, nil, http.StatusOK, &saved)
	if saved.Layout.ContentWidth != 2200 || saved.Layout.SidebarWidth != 196 || saved.Layout.SidebarSide != "right" || saved.Layout.Density != "compact" || saved.Layout.WidgetSpans["focus"] != 12 || saved.Layout.WidgetSpans["capture"] != 4 || len(saved.Layout.ToolbarActions) != 2 || len(saved.Layout.QuickActions) != 0 || len(saved.DashboardWidgets) != 2 {
		t.Fatalf("normalization/roundtrip: %#v", saved)
	}
	requestJSON(t, otherClient, http.MethodGet, server.URL+"/api/interface/preferences", nil, http.StatusOK, &saved)
	if saved.Layout.ContentWidth != 1500 || saved.Layout.SidebarSide != "left" {
		t.Fatalf("account leak: %#v", saved)
	}
	var project2 Workspace
	requestJSON(t, client, http.MethodPost, server.URL+"/api/workspaces", map[string]any{"name": "Separate layout"}, http.StatusCreated, &project2)
	requestWorkspaceJSON(t, client, http.MethodGet, server.URL+"/api/interface/preferences", project2.ID, nil, http.StatusOK, &saved)
	if saved.Layout.ContentWidth != 1500 || saved.Layout.WidgetSpans["focus"] != 8 {
		t.Fatalf("project leak: %#v", saved)
	}
}
