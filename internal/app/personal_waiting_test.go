package app

import (
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func TestPersonalWaitingLifecycleHistoryPrivacyAndToday(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "waiting.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	owner, other := testClient(t), testClient(t)
	registerVerifiedWithoutFixture(t, owner, server.URL, "waiting@example.test", "waiting_owner")
	registerVerifiedWithoutFixture(t, other, server.URL, "waiting-other@example.test", "waiting_other")
	var plan PersonalPlan
	requestJSON(t, owner, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "Source remains open"}, 201, &plan)
	today := time.Now().UTC()
	day := today.Format("2006-01-02")
	past := today.AddDate(0, 0, -2).Format("2006-01-02")
	yesterday := today.AddDate(0, 0, -1).Format("2006-01-02")
	create := map[string]any{"title": "Расчёт стоимости", "waitingFor": "Поставщик типографии", "notes": "Ответ нужен для выбора варианта", "sinceDate": past, "expectedDate": yesterday, "planId": plan.ID, "requestKey": "waiting-create-request-0001"}
	var item personalWaiting
	requestJSON(t, owner, "POST", server.URL+"/api/personal/waiting", create, 201, &item)
	first := item.ID
	requestJSON(t, owner, "POST", server.URL+"/api/personal/waiting", create, 200, &item)
	if item.ID != first {
		t.Fatal("lost create reply duplicated waiting")
	}
	var count int
	store.db.QueryRow(`SELECT COUNT(*) FROM personal_waiting WHERE owner_id=(SELECT owner_id FROM personal_waiting WHERE id=?)`, first).Scan(&count)
	if count != 1 {
		t.Fatal("create receipt missing")
	}
	var list struct {
		Items   []personalWaiting `json:"items"`
		Total   int               `json:"total"`
		Overdue int               `json:"overdue"`
		Today   string            `json:"today"`
	}
	requestJSON(t, owner, "GET", server.URL+"/api/personal/waiting?q=типографии&timezone=UTC", nil, 200, &list)
	if list.Total != 1 || list.Overdue != 1 || !list.Items[0].Overdue || list.Today != day {
		t.Fatal("search or overdue classification failed")
	}
	requestJSON(t, other, "GET", server.URL+"/api/personal/waiting?status=all&timezone=UTC", nil, 200, &list)
	if list.Total != 0 {
		t.Fatal("waiting leaked")
	}
	requestJSON(t, other, "GET", server.URL+"/api/personal/waiting/"+first+"?timezone=UTC", nil, 404, nil)
	update := map[string]any{"title": item.Title, "waitingFor": item.WaitingFor, "notes": item.Notes, "sinceDate": item.SinceDate, "expectedDate": day, "planId": plan.ID, "expectedRevision": item.Revision, "requestKey": "waiting-update-request-0001"}
	requestJSON(t, owner, "PUT", server.URL+"/api/personal/waiting/"+first+"?timezone=UTC", update, 200, &item)
	if item.ExpectedDate != day || item.Revision != 2 {
		t.Fatal("expected date not changed")
	}
	requestJSON(t, owner, "PUT", server.URL+"/api/personal/waiting/"+first+"?timezone=UTC", update, 200, &item)
	if item.Revision != 2 {
		t.Fatal("repeat update created revision")
	}
	var detail struct {
		Waiting personalWaiting `json:"waiting"`
		Events  []waitingEvent  `json:"events"`
	}
	requestJSON(t, owner, "GET", server.URL+"/api/personal/waiting/"+first+"?timezone=UTC", nil, 200, &detail)
	if len(detail.Events) != 2 || detail.Events[0].Action != "expected_changed" || detail.Events[0].OldExpectedDate != yesterday {
		t.Fatal("reschedule history missing")
	}
	action := map[string]any{"expectedRevision": item.Revision, "requestKey": "waiting-receive-request-001"}
	requestJSON(t, owner, "POST", server.URL+"/api/personal/waiting/"+first+"/receive?timezone=UTC", action, 200, &item)
	if item.Status != "received" || item.ClosedAt == nil {
		t.Fatal("receipt not closed")
	}
	requestJSON(t, owner, "POST", server.URL+"/api/personal/waiting/"+first+"/receive?timezone=UTC", action, 200, &item)
	if item.Revision != 3 {
		t.Fatal("repeat action created revision")
	}
	requestJSON(t, owner, "GET", server.URL+"/api/personal/waiting/today?timezone=UTC", nil, 200, &list)
	if len(list.Items) != 0 {
		t.Fatal("resolved waiting stayed on Today")
	}
	var currentPlan PersonalPlan
	requestJSON(t, owner, "GET", server.URL+"/api/personal/overview", nil, 200, nil)
	store.db.QueryRow(`SELECT status FROM personal_plans WHERE id=?`, plan.ID).Scan(&currentPlan.Status)
	if currentPlan.Status != "planned" {
		t.Fatal("waiting completed source plan")
	}
	reopen := map[string]any{"expectedRevision": item.Revision, "requestKey": "waiting-reopen-request-0001"}
	requestJSON(t, owner, "POST", server.URL+"/api/personal/waiting/"+first+"/reopen?timezone=UTC", reopen, 200, &item)
	stale := map[string]any{"expectedRevision": 3, "requestKey": "waiting-cancel-request-0001"}
	requestJSON(t, owner, "POST", server.URL+"/api/personal/waiting/"+first+"/cancel?timezone=UTC", stale, 409, nil)
	cancel := map[string]any{"expectedRevision": item.Revision, "requestKey": "waiting-cancel-request-0002"}
	requestJSON(t, owner, "POST", server.URL+"/api/personal/waiting/"+first+"/cancel?timezone=UTC", cancel, 200, &item)
	if item.Status != "cancelled" {
		t.Fatal("cancel failed")
	}
	create["title"] = "Без ожидаемой даты"
	create["expectedDate"] = ""
	create["planId"] = ""
	create["requestKey"] = "waiting-create-request-0002"
	requestJSON(t, owner, "POST", server.URL+"/api/personal/waiting", create, 201, &item)
	requestJSON(t, owner, "GET", server.URL+"/api/personal/waiting/today?timezone=UTC", nil, 200, &list)
	if len(list.Items) != 1 || list.Items[0].Overdue {
		t.Fatal("undated active waiting missing or overdue")
	}
	create["expectedDate"] = past
	create["sinceDate"] = day
	create["requestKey"] = "waiting-invalid-dates-001"
	requestJSON(t, owner, "POST", server.URL+"/api/personal/waiting", create, 400, nil)
}

func TestPersonalWaitingPaginationAndPlanOwnership(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "waiting-pages.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	owner, other := testClient(t), testClient(t)
	registerVerifiedWithoutFixture(t, owner, server.URL, "pages@example.test", "waiting_pages")
	registerVerifiedWithoutFixture(t, other, server.URL, "foreign-plan@example.test", "waiting_foreign")
	var foreign PersonalPlan
	requestJSON(t, other, "POST", server.URL+"/api/personal/plans", map[string]any{"title": "Foreign"}, 201, &foreign)
	day := time.Now().UTC().Format("2006-01-02")
	invalid := map[string]any{"title": "No link leak", "waitingFor": "Someone", "sinceDate": day, "planId": foreign.ID, "requestKey": "waiting-foreign-plan-0001"}
	requestJSON(t, owner, "POST", server.URL+"/api/personal/waiting", invalid, 400, nil)
	for i := 0; i < 3; i++ {
		requestJSON(t, owner, "POST", server.URL+"/api/personal/waiting", map[string]any{"title": "Page item", "waitingFor": "Person", "sinceDate": day, "requestKey": "waiting-pagination-key-000" + string(rune('1'+i))}, 201, nil)
	}
	var page struct {
		Items                 []personalWaiting `json:"items"`
		Total, Page, PageSize int
	}
	requestJSON(t, owner, "GET", server.URL+"/api/personal/waiting?page=2&pageSize=2&timezone=UTC", nil, 200, &page)
	if page.Total != 3 || page.Page != 2 || page.PageSize != 2 || len(page.Items) != 1 {
		t.Fatal("bounded page failed")
	}
	requestJSON(t, owner, "GET", server.URL+"/api/personal/waiting?pageSize=51&timezone=UTC", nil, 400, nil)
}

func TestPersonalWaitingPingRequiresConfirmationAndExactProjectMembership(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "waiting-ping.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	ownerClient, recipientClient, outsiderClient := testClient(t), testClient(t), testClient(t)
	owner := registerVerifiedWithoutFixture(t, ownerClient, server.URL, "waiting-ping-owner@example.test", "waiting_ping_owner")
	recipient := registerVerifiedWithoutFixture(t, recipientClient, server.URL, "waiting-ping-recipient@example.test", "waiting_ping_recipient")
	outsider := registerVerifiedWithoutFixture(t, outsiderClient, server.URL, "waiting-ping-outsider@example.test", "waiting_ping_outsider")

	var first, second Workspace
	requestJSON(t, ownerClient, "POST", server.URL+"/api/workspaces", map[string]any{"name": "Первый стартап"}, 201, &first)
	requestJSON(t, ownerClient, "POST", server.URL+"/api/workspaces", map[string]any{"name": "Второй стартап"}, 201, &second)
	requestJSON(t, ownerClient, "POST", server.URL+"/api/teams/"+first.TeamID+"/members", map[string]any{"username": recipient.Username, "role": "member", "projectIds": []string{first.ID}}, 200, nil)
	requestJSON(t, ownerClient, "POST", server.URL+"/api/teams/"+second.TeamID+"/members", map[string]any{"username": outsider.Username, "role": "member", "projectIds": []string{second.ID}}, 200, nil)

	today := time.Now().UTC().Format("2006-01-02")
	var waiting personalWaiting
	requestJSON(t, ownerClient, "POST", server.URL+"/api/personal/waiting?timezone=UTC", map[string]any{
		"title": "Приватный расчёт", "waitingFor": "Партнёр", "sinceDate": today,
		"requestKey": "waiting-ping-create-000001",
	}, 201, &waiting)
	var detail struct {
		Waiting     personalWaiting     `json:"waiting"`
		PingTargets []waitingPingTarget `json:"pingTargets"`
		Pings       []waitingPing       `json:"pings"`
	}
	requestJSON(t, ownerClient, "GET", server.URL+"/api/personal/waiting/"+waiting.ID+"?timezone=UTC", nil, 200, &detail)
	if len(detail.PingTargets) != 2 || len(detail.Pings) != 0 {
		t.Fatalf("unexpected ping choices: %#v", detail)
	}
	for _, target := range detail.PingTargets {
		if len(target.Recipients) != 1 {
			t.Fatalf("project recipients mixed: %#v", target)
		}
		if target.WorkspaceID == first.ID && target.Recipients[0].UserID != recipient.ID || target.WorkspaceID == second.ID && target.Recipients[0].UserID != outsider.ID {
			t.Fatalf("recipient crossed project boundary: %#v", target)
		}
	}

	base := server.URL + "/api/personal/waiting/" + waiting.ID + "/ping"
	payload := map[string]any{
		"workspaceId": first.ID, "recipientId": recipient.ID, "includeTitle": false,
		"confirm": false, "expectedRevision": waiting.Revision, "requestKey": "waiting-ping-send-000001",
	}
	requestJSON(t, ownerClient, "POST", base, payload, 400, nil)
	payload["confirm"] = true
	payload["workspaceId"] = second.ID
	requestJSON(t, ownerClient, "POST", base, payload, 403, nil)
	payload["workspaceId"] = first.ID
	payload["recipientId"] = outsider.ID
	requestJSON(t, ownerClient, "POST", base, payload, 403, nil)
	payload["recipientId"] = recipient.ID
	var ping waitingPing
	requestJSON(t, ownerClient, "POST", base, payload, 201, &ping)
	if ping.Message != "@"+owner.Username+" ждёт вашего ответа в «"+first.Name+"»" || ping.IncludeTitle || ping.RecipientID != recipient.ID {
		t.Fatalf("minimal confirmed ping: %#v", ping)
	}
	requestJSON(t, ownerClient, "POST", base, payload, 200, &ping)
	var count int
	if err = store.db.QueryRow(`SELECT COUNT(*) FROM personal_waiting_pings WHERE waiting_id=?`, waiting.ID).Scan(&count); err != nil || count != 1 {
		t.Fatalf("ping retry duplicated delivery: %d %v", count, err)
	}

	payload["includeTitle"] = true
	payload["requestKey"] = "waiting-ping-send-000002"
	requestJSON(t, ownerClient, "POST", base, payload, 201, &ping)
	if ping.Message != "@"+owner.Username+" ждёт вашего ответа в «"+first.Name+"»: «"+waiting.Title+"»" {
		t.Fatalf("confirmed title not exact: %#v", ping)
	}
	var inbox notificationInbox
	requestJSON(t, recipientClient, "GET", server.URL+"/api/notifications/inbox?status=all", nil, 200, &inbox)
	if len(inbox.Items) != 2 {
		t.Fatalf("recipient delivery missing: %#v", inbox.Items)
	}
	for _, notification := range inbox.Items {
		if notification.EntityType == nil || *notification.EntityType != "waiting_ping" || notification.WorkspaceID != first.ID {
			t.Fatalf("waiting notification context missing: %#v", notification)
		}
	}
	requestJSON(t, outsiderClient, "GET", server.URL+"/api/notifications/inbox?status=all", nil, 200, &inbox)
	if len(inbox.Items) != 0 {
		t.Fatal("waiting ping leaked to another startup")
	}
	requestJSON(t, outsiderClient, "POST", base, payload, 404, nil)

	var storedRevision int
	var storedStatus string
	if err = store.db.QueryRow(`SELECT revision,status FROM personal_waiting WHERE id=?`, waiting.ID).Scan(&storedRevision, &storedStatus); err != nil || storedRevision != waiting.Revision || storedStatus != "waiting" {
		t.Fatalf("ping changed waiting: revision=%d status=%s err=%v", storedRevision, storedStatus, err)
	}
	if _, err = store.db.Exec(`UPDATE workspace_members SET status='suspended' WHERE workspace_id=? AND user_id=?`, first.ID, recipient.ID); err != nil {
		t.Fatal(err)
	}
	requestJSON(t, recipientClient, "GET", server.URL+"/api/notifications/inbox?status=all", nil, 200, &inbox)
	if len(inbox.Items) != 0 {
		t.Fatal("revoked project retained waiting ping content")
	}
	requestJSON(t, ownerClient, "GET", server.URL+"/api/personal/waiting/"+waiting.ID+"?timezone=UTC", nil, 200, &detail)
	if len(detail.Pings) != 2 {
		t.Fatal("owner lost sent reminder history")
	}
}
