package app

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
)

func workspaceFinanceRequest(t *testing.T, client *http.Client, method, base, path, workspace, source, revision string, body any, want int, target any) {
	t.Helper()
	data, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	req, err := http.NewRequest(method, base+"/api/workspace/finance"+path, bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Workspace-ID", workspace)
	if source != "" {
		req.Header.Set("X-Finance-Source", source)
	}
	if revision != "" {
		req.Header.Set("X-Finance-Revision", revision)
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	payload, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != want {
		t.Fatalf("%s %s workspace=%s got=%d want=%d body=%s", method, path, workspace, resp.StatusCode, want, payload)
	}
	if want == 200 || want == 201 {
		if resp.Header.Get("Cache-Control") != "no-store" {
			t.Fatalf("financial response cacheable")
		}
	}
	if target != nil && json.Unmarshal(payload, target) != nil {
		t.Fatalf("invalid response %s", payload)
	}
}

func workspaceFinanceProject(t *testing.T, client *http.Client, base, name string) Workspace {
	t.Helper()
	var project Workspace
	requestJSON(t, client, "POST", base+"/api/workspaces", map[string]any{"name": name}, 201, &project)
	return project
}
func workspaceFinanceMember(t *testing.T, owner *http.Client, base string, project Workspace, username, role string) {
	t.Helper()
	requestWorkspaceJSON(t, owner, "POST", base+"/api/teams/"+project.TeamID+"/members", project.ID, map[string]any{"username": username, "role": role, "projectIds": []string{project.ID}}, 200, nil)
}
func workspaceFinanceFixture(t *testing.T, client *http.Client, base, workspace string) (financeBucket, financeSource, financeEntry, financeExpense) {
	t.Helper()
	var bucket financeBucket
	workspaceFinanceRequest(t, client, "POST", base, "/buckets", workspace, workspace, "0", map[string]any{"name": "Командный счёт"}, 201, &bucket)
	var source financeSource
	workspaceFinanceRequest(t, client, "POST", base, "/sources", workspace, workspace, "0", map[string]any{"name": "Продажи", "allocations": []financeRule{{bucket.ID, 10000}}}, 201, &source)
	var entry financeEntry
	workspaceFinanceRequest(t, client, "POST", base, "/entries", workspace, workspace, "0", financeInput(source.ID, 25000, 0), 201, &entry)
	var expense financeExpense
	workspaceFinanceRequest(t, client, "POST", base, "/expenses", workspace, workspace, "0", financeExpenseInput{ClientRequestID: "expense-team-001", BucketID: bucket.ID, ExpectedBucketRevision: 1, Date: "2026-09-15", AmountMinor: 7000, Note: "Общий расход"}, 201, &expense)
	return bucket, source, entry, expense
}

func TestWorkspaceFinanceEmptyDefaultAndPersonalIsolation(t *testing.T) {
	store, server, owner, user := financeTestServer(t)
	personalBucket := financeCreateBucket(t, owner, server.URL, "Private secret")
	personalSource := financeCreateSource(t, owner, server.URL, "Private source", false, []financeRule{{personalBucket.ID, 10000}})
	personalEntry := financeCreateEntry(t, owner, server.URL, financeInput(personalSource.ID, 190000, 0))
	project := workspaceFinanceProject(t, owner, server.URL, "First team")
	var overview financeOverview
	workspaceFinanceRequest(t, owner, "GET", server.URL, "", project.ID, "", "", nil, 200, &overview)
	if len(overview.Buckets)+len(overview.Sources)+len(overview.Entries)+len(overview.Expenses) != 0 || overview.Scope == nil || overview.Scope.Linked || !overview.Scope.CanWrite || overview.Scope.Revision != 0 {
		t.Fatalf("bad empty team %#v", overview)
	}
	workspaceFinanceRequest(t, owner, "GET", server.URL, "", "", "", "", nil, 400, nil)
	workspaceFinanceRequest(t, owner, "GET", server.URL, "", fmt.Sprintf("personal-%d", user.ID), "", "", nil, 403, nil)
	workspaceFinanceRequest(t, owner, "GET", server.URL, "", "unknown", "", "", nil, 403, nil)
	workspaceFinanceRequest(t, testClient(t), "GET", server.URL, "", project.ID, "", "", nil, 401, nil)
	bucket, source, entry, _ := workspaceFinanceFixture(t, owner, server.URL, project.ID)
	workspaceFinanceRequest(t, owner, "GET", server.URL, "?from=2026-09-01&to=2026-09-30", project.ID, "", "", nil, 200, &overview)
	if len(overview.Entries) != 1 || overview.Balances[0].BalanceMinor != 18000 || overview.Entries[0].ID != entry.ID {
		t.Fatalf("wrong team sums %#v", overview)
	}
	var private financeOverview
	requestWorkspaceJSON(t, owner, "GET", server.URL+"/api/personal/finance?from=2026-09-01&to=2026-09-30", project.ID, nil, 200, &private)
	if private.Scope != nil || len(private.Buckets) != 1 || private.Entries[0].ID != personalEntry.ID {
		t.Fatal("team affected personal ledger")
	}
	workspaceFinanceRequest(t, owner, "PUT", server.URL, "/buckets/"+personalBucket.ID, project.ID, project.ID, "0", map[string]any{"name": "leak", "expectedRevision": 1}, 404, nil)
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/sources", project.ID, project.ID, "0", map[string]any{"name": "leak", "allocations": []financeRule{{personalBucket.ID, 10000}}}, 400, nil)
	crossInput := financeInput(personalSource.ID, 500, 0)
	crossInput.ClientRequestID = "personal-source-in-team"
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/entries", project.ID, project.ID, "0", crossInput, 404, nil)
	requestJSON(t, owner, "PUT", server.URL+"/api/personal/finance/buckets/"+bucket.ID, map[string]any{"name": "private", "expectedRevision": 1}, 404, nil)
	requestJSON(t, owner, "POST", server.URL+"/api/personal/finance/entries", financeInput(source.ID, 500, 0), 409, nil) // existing personal idempotency key has a different payload
	var count int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM workspace_finance_settings`).Scan(&count); err != nil || count != 0 {
		t.Fatal("reading finance seeded a binding", err, count)
	}
}

func TestWorkspaceFinanceLinksReadOnlyRevocationAndReset(t *testing.T) {
	store, server, owner, _ := financeTestServer(t)
	a := workspaceFinanceProject(t, owner, server.URL, "Source")
	b := workspaceFinanceProject(t, owner, server.URL, "Destination")
	_, _, entry, _ := workspaceFinanceFixture(t, owner, server.URL, a.ID)
	_, _, ownB, _ := workspaceFinanceFixture(t, owner, server.URL, b.ID)
	member := testClient(t)
	memberUser := registerVerifiedWithoutFixture(t, member, server.URL, "fin-member@example.test", "finance_reader")
	workspaceFinanceMember(t, owner, server.URL, b, "finance_reader", "member")
	var settings workspaceFinanceSettings
	workspaceFinanceRequest(t, owner, "GET", server.URL, "/settings", b.ID, "", "", nil, 200, &settings)
	if len(settings.Options) != 2 || settings.Scope.Revision != 0 {
		t.Fatalf("wrong settings %#v", settings)
	}
	workspaceFinanceRequest(t, owner, "PUT", server.URL, "/settings", b.ID, "", "", map[string]any{"sourceWorkspaceId": a.ID, "expectedRevision": 0}, 200, &settings)
	if settings.Scope.Revision != 1 || !settings.Scope.Linked || settings.Scope.CanWrite {
		t.Fatalf("wrong linked scope %#v", settings)
	}
	workspaceFinanceRequest(t, owner, "PUT", server.URL, "/settings", b.ID, "", "", map[string]any{"sourceWorkspaceId": b.ID, "expectedRevision": 0}, 409, nil)
	var overview financeOverview
	workspaceFinanceRequest(t, owner, "GET", server.URL, "?from=2026-09-01&to=2026-09-30", b.ID, "", "", nil, 200, &overview)
	if len(overview.Entries) != 1 || overview.Entries[0].ID != entry.ID || overview.Scope.SourceWorkspaceName != a.Name {
		t.Fatalf("wrong linked ledger %#v", overview)
	}
	workspaceFinanceRequest(t, member, "GET", server.URL, "", b.ID, "", "", nil, 403, nil)
	workspaceFinanceRequest(t, member, "GET", server.URL, "/settings", b.ID, "", "", nil, 200, &settings)
	if settings.Scope.SourceAvailable || settings.Scope.SourceWorkspaceName != "" || len(settings.Options) != 0 {
		t.Fatalf("source leaked %#v", settings)
	}
	workspaceFinanceMember(t, owner, server.URL, a, "finance_reader", "member")
	workspaceFinanceRequest(t, member, "GET", server.URL, "", b.ID, "", "", nil, 200, nil)
	workspaceFinanceRequest(t, member, "PUT", server.URL, "/settings", b.ID, "", "", map[string]any{"sourceWorkspaceId": b.ID, "expectedRevision": 1}, 403, nil)
	if _, err := store.db.Exec(`UPDATE team_members SET status='suspended' WHERE team_id=? AND user_id=?`, a.TeamID, memberUser.ID); err != nil {
		t.Fatal(err)
	}
	workspaceFinanceRequest(t, member, "GET", server.URL, "", b.ID, "", "", nil, 403, nil)
	// Even the destination owner can restore their own untouched ledger after
	// the original workspace becomes unavailable.
	if _, err := store.db.Exec(`UPDATE workspaces SET archived_at=? WHERE id=?`, nowText(), a.ID); err != nil {
		t.Fatal(err)
	}
	workspaceFinanceRequest(t, owner, "GET", server.URL, "", b.ID, "", "", nil, 403, nil)
	workspaceFinanceRequest(t, owner, "GET", server.URL, "/settings", b.ID, "", "", nil, 200, &settings)
	if settings.Scope.SourceAvailable || !settings.Scope.CanConfigure {
		t.Fatal("cannot recover unavailable source")
	}
	workspaceFinanceRequest(t, owner, "PUT", server.URL, "/settings", b.ID, "", "", map[string]any{"sourceWorkspaceId": b.ID, "expectedRevision": 1}, 200, &settings)
	workspaceFinanceRequest(t, owner, "GET", server.URL, "?from=2026-09-01&to=2026-09-30", b.ID, "", "", nil, 200, &overview)
	if overview.Scope.Revision != 2 || overview.Scope.Linked || overview.Entries[0].ID != ownB.ID {
		t.Fatal("original own ledger lost")
	}
}

func TestWorkspaceFinanceAllWritesRespectScopeRoleAndStaleForms(t *testing.T) {
	store, server, owner, _ := financeTestServer(t)
	a := workspaceFinanceProject(t, owner, server.URL, "Own")
	b := workspaceFinanceProject(t, owner, server.URL, "Other")
	bucket, source, entry, expense := workspaceFinanceFixture(t, owner, server.URL, a.ID)
	member := testClient(t)
	memberUser := registerVerifiedWithoutFixture(t, member, server.URL, "finance-admin@example.test", "finance_editor")
	workspaceFinanceMember(t, owner, server.URL, a, "finance_editor", "member")
	var counterparty financeCounterparty
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/counterparties", a.ID, a.ID, "0", map[string]any{"name": "Командный заказчик"}, 201, &counterparty)
	var category financeCategory
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/categories", a.ID, a.ID, "0", map[string]any{"name": "Командная группа"}, 201, &category)
	entryInput := financeInput(source.ID, 26000, 0)
	entryInput.ClientRequestID = ""
	entryInput.ExpectedRevision = 1
	expenseInput := financeExpenseInput{BucketID: bucket.ID, ExpectedBucketRevision: 1, ExpectedRevision: 1, Date: "2026-09-15", AmountMinor: 100}
	expenseCreateInput := expenseInput
	expenseCreateInput.ExpectedRevision, expenseCreateInput.ClientRequestID = 0, "team-extra-expense"
	writes := []struct {
		method, path string
		input        any
	}{
		{"POST", "/buckets", map[string]any{"name": "New"}},
		{"PUT", "/buckets/" + bucket.ID, map[string]any{"name": "Change", "expectedRevision": 1}},
		{"POST", "/sources", map[string]any{"name": "New", "allocations": source.Allocations}},
		{"PUT", "/sources/" + source.ID, map[string]any{"name": "Change", "allocations": source.Allocations, "expectedRevision": 1}},
		{"POST", "/counterparties", map[string]any{"name": "New"}},
		{"PUT", "/counterparties/" + counterparty.ID, map[string]any{"name": "Change", "expectedRevision": 1}},
		{"POST", "/categories", map[string]any{"name": "New"}},
		{"PUT", "/categories/" + category.ID, map[string]any{"name": "Change", "expectedRevision": 1}},
		{"POST", "/entries", financeInput(source.ID, 200, 0)},
		{"PUT", "/entries/" + entry.ID, entryInput},
		{"PATCH", "/entries/" + entry.ID + "/transfers", map[string]any{"bucketId": bucket.ID, "paidMinor": 10, "expectedRevision": 1}},
		{"PATCH", "/entries/" + entry.ID + "/void", map[string]any{"voided": true, "expectedRevision": 1}},
		{"POST", "/expenses", expenseCreateInput},
		{"PUT", "/expenses/" + expense.ID, expenseInput},
		{"PATCH", "/expenses/" + expense.ID + "/void", map[string]any{"voided": true, "expectedRevision": 1}},
	}
	// Each endpoint must reject a normal team member and a stale/missing pin.
	for _, write := range writes {
		workspaceFinanceRequest(t, member, write.method, server.URL, write.path, a.ID, a.ID, "0", write.input, 403, nil)
		workspaceFinanceRequest(t, owner, write.method, server.URL, write.path, a.ID, "", "", write.input, 409, nil)
		workspaceFinanceRequest(t, owner, write.method, server.URL, write.path, a.ID, a.ID, "99", write.input, 409, nil)
	}
	workspaceFinanceRequest(t, owner, "GET", server.URL, "/expenses/"+expense.ID, a.ID, a.ID, "99", nil, 409, nil)
	workspaceFinanceRequest(t, owner, "GET", server.URL, "/link-targets", a.ID, a.ID, "99", nil, 409, nil)
	workspaceFinanceRequest(t, owner, "GET", server.URL, "/expenses/"+expense.ID, b.ID, "", "", nil, 404, nil)
	workspaceFinanceRequest(t, owner, "PUT", server.URL, "/settings", b.ID, "", "", map[string]any{"sourceWorkspaceId": a.ID, "expectedRevision": 0}, 200, nil)
	for _, write := range writes {
		workspaceFinanceRequest(t, owner, write.method, server.URL, write.path, b.ID, a.ID, "1", write.input, 403, nil)
	}
	// A removed or demoted administrator immediately loses write access.
	if _, err := store.db.Exec(`UPDATE workspace_members SET role='admin' WHERE workspace_id=? AND user_id=?`, a.ID, memberUser.ID); err != nil {
		t.Fatal(err)
	}
	workspaceFinanceRequest(t, member, "POST", server.URL, "/buckets", a.ID, a.ID, "0", map[string]any{"name": "Allowed"}, 201, nil)
	if _, err := store.db.Exec(`UPDATE workspace_members SET role='member' WHERE workspace_id=? AND user_id=?`, a.ID, memberUser.ID); err != nil {
		t.Fatal(err)
	}
	workspaceFinanceRequest(t, member, "POST", server.URL, "/buckets", a.ID, a.ID, "0", map[string]any{"name": "Denied"}, 403, nil)
	if _, err := store.db.Exec(`UPDATE workspace_members SET status='suspended' WHERE workspace_id=? AND user_id=?`, a.ID, memberUser.ID); err != nil {
		t.Fatal(err)
	}
	workspaceFinanceRequest(t, member, "GET", server.URL, "", a.ID, "", "", nil, 403, nil)
	workspaceFinanceRequest(t, member, "GET", server.URL, "/link-targets", a.ID, a.ID, "0", nil, 403, nil)
}

func TestWorkspaceFinanceCrossScopeReferencesAndLedgerIdempotency(t *testing.T) {
	store, server, owner, _ := financeTestServer(t)
	a := workspaceFinanceProject(t, owner, server.URL, "First")
	b := workspaceFinanceProject(t, owner, server.URL, "Second")
	bucket, source, entry, expense := workspaceFinanceFixture(t, owner, server.URL, a.ID)
	bucketB, sourceB, _, _ := workspaceFinanceFixture(t, owner, server.URL, b.ID)
	var payer financeCounterparty
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/counterparties", a.ID, a.ID, "0", map[string]any{"name": "First payer"}, 201, &payer)
	input := financeInput(sourceB.ID, 300, 0)
	input.ClientRequestID = "new-other-payer"
	input.PayerID = &payer.ID
	input.ExpectedPayerRevision = 1
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/entries", b.ID, b.ID, "0", input, 404, nil)
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/expenses", b.ID, b.ID, "0", financeExpenseInput{ClientRequestID: "new-other-bucket", BucketID: bucket.ID, ExpectedBucketRevision: 1, Date: "2026-09-15", AmountMinor: 100}, 404, nil)
	workspaceFinanceRequest(t, owner, "PUT", server.URL, "/buckets/"+bucket.ID, b.ID, b.ID, "0", map[string]any{"name": "No", "expectedRevision": 1}, 404, nil)
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/sources", b.ID, b.ID, "0", map[string]any{"name": "No", "allocations": []financeRule{{bucket.ID, 10000}}}, 400, nil)
	// Composite database constraints also reject cross-workspace identities.
	if _, err := store.db.Exec(`UPDATE workspace_finance_entries SET payer_id=? WHERE id=?`, payer.ID, func() string {
		var id string
		_ = store.db.QueryRow(`SELECT id FROM workspace_finance_entries WHERE workspace_id=?`, b.ID).Scan(&id)
		return id
	}()); err == nil {
		t.Fatal("cross-workspace payer accepted by DB")
	}
	if _, err := store.db.Exec(`UPDATE workspace_finance_expenses SET bucket_id=? WHERE id=?`, bucketB.ID, expense.ID); err == nil {
		t.Fatal("cross-workspace expense accepted by DB")
	}
	if _, err := store.db.Exec(`UPDATE workspace_finance_entries SET source_id=? WHERE id=?`, sourceB.ID, entry.ID); err == nil {
		t.Fatal("cross-workspace source accepted by DB")
	}
	// A retry is shared by administrators of one team but independent of another.
	var repeated financeEntry
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/entries", a.ID, a.ID, "0", financeInput(source.ID, 25000, 0), 200, &repeated)
	if repeated.ID != entry.ID {
		t.Fatal("retry duplicated")
	}
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			workspaceFinanceRequest(t, owner, "POST", server.URL, "/entries", a.ID, a.ID, "0", financeInput(source.ID, 25000, 0), 200, nil)
		}()
	}
	wg.Wait()
	var count int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM workspace_finance_entries WHERE workspace_id=?`, a.ID).Scan(&count); err != nil || count != 1 {
		t.Fatal("concurrent retry duplicated", count, err)
	}
	workspaceFinanceRequest(t, owner, "PATCH", server.URL, "/entries/"+entry.ID+"/void", a.ID, a.ID, "0", map[string]any{"voided": true, "expectedRevision": 1}, 200, nil)
	workspaceFinanceRequest(t, owner, "PATCH", server.URL, "/entries/"+entry.ID+"/void", a.ID, a.ID, "0", map[string]any{"voided": false, "expectedRevision": 1}, 409, nil)
	var raw json.RawMessage
	for _, path := range []string{"/api/export", "/api/search?q=Продажи", "/api/graph"} {
		requestWorkspaceJSON(t, owner, "GET", server.URL+path, a.ID, nil, 200, &raw)
		if strings.Contains(string(raw), entry.ID) || strings.Contains(string(raw), expense.ID) {
			t.Fatal("finance added to generic shared export")
		}
	}
}

func TestWorkspaceFinanceLinkPermissionsAndNoChains(t *testing.T) {
	store, server, owner, user := financeTestServer(t)
	a := workspaceFinanceProject(t, owner, server.URL, "A")
	b := workspaceFinanceProject(t, owner, server.URL, "B")
	c := workspaceFinanceProject(t, owner, server.URL, "C")
	workspaceFinanceRequest(t, owner, "PUT", server.URL, "/settings", b.ID, "", "", map[string]any{"sourceWorkspaceId": fmt.Sprintf("personal-%d", user.ID)}, 403, nil)
	workspaceFinanceRequest(t, owner, "PUT", server.URL, "/settings", b.ID, "", "", map[string]any{"sourceWorkspaceId": "unknown"}, 403, nil)
	if _, err := store.db.Exec(`UPDATE workspace_members SET role='member' WHERE workspace_id=? AND user_id=?`, a.ID, user.ID); err != nil {
		t.Fatal(err)
	}
	workspaceFinanceRequest(t, owner, "PUT", server.URL, "/settings", b.ID, "", "", map[string]any{"sourceWorkspaceId": a.ID}, 403, nil)
	if _, err := store.db.Exec(`UPDATE workspace_members SET role='owner' WHERE workspace_id=? AND user_id=?`, a.ID, user.ID); err != nil {
		t.Fatal(err)
	}
	workspaceFinanceRequest(t, owner, "PUT", server.URL, "/settings", b.ID, "", "", map[string]any{"sourceWorkspaceId": a.ID}, 200, nil)
	var options workspaceFinanceSettings
	workspaceFinanceRequest(t, owner, "GET", server.URL, "/settings", c.ID, "", "", nil, 200, &options)
	for _, option := range options.Options {
		if option.WorkspaceID == b.ID {
			t.Fatal("source with another connection is offered but cannot be selected")
		}
	}
	workspaceFinanceRequest(t, owner, "PUT", server.URL, "/settings", c.ID, "", "", map[string]any{"sourceWorkspaceId": b.ID}, 400, nil)
	workspaceFinanceRequest(t, owner, "PUT", server.URL, "/settings", a.ID, "", "", map[string]any{"sourceWorkspaceId": b.ID}, 400, nil)
	// A form opened before link+reset cannot write after the apparent scope
	// returns to the same ID: revision still records the intervening change.
	workspaceFinanceRequest(t, owner, "PUT", server.URL, "/settings", b.ID, "", "", map[string]any{"sourceWorkspaceId": b.ID, "expectedRevision": 1}, 200, nil)
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/buckets", b.ID, b.ID, "0", map[string]any{"name": "Stale"}, 409, nil)
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/buckets", b.ID, b.ID, "2", map[string]any{"name": "Fresh"}, 201, nil)
}

func TestWorkspaceFinanceMigration073PreservesEveryExistingTable(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "before073.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(`PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,applied_at TEXT NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	files, err := migrationFiles.ReadDir("migrations")
	if err != nil {
		t.Fatal(err)
	}
	for _, file := range files {
		if file.IsDir() || !strings.HasSuffix(file.Name(), ".sql") || file.Name() >= "073" {
			continue
		}
		body, err := migrationFiles.ReadFile("migrations/" + file.Name())
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(string(body)); err != nil {
			t.Fatalf("apply %s: %v", file.Name(), err)
		}
		if _, err := db.Exec(`INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)`, file.Name(), nowText()); err != nil {
			t.Fatal(err)
		}
	}
	store := &Store{db: db}
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	client := testClient(t)
	registerVerifiedWithoutFixture(t, client, server.URL, "before073@example.test", "before073")
	bucket := financeCreateBucket(t, client, server.URL, "Private original bucket")
	source := financeCreateSource(t, client, server.URL, "Private original source", false, []financeRule{{bucket.ID, 10000}})
	entry := financeCreateEntry(t, client, server.URL, financeInput(source.ID, 10000, 0))
	financeCreateExpense(t, client, server.URL, financeExpenseTestInput(bucket, "2026-09-14", 1300, "prior073-expense"))
	workspaceFinanceProject(t, client, server.URL, "Existing team before migration")
	rows, err := db.Query(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
	if err != nil {
		t.Fatal(err)
	}
	tables := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatal(err)
		}
		tables = append(tables, name)
	}
	if err := rows.Close(); err != nil {
		t.Fatal(err)
	}
	before := map[string][]map[string]any{}
	for _, name := range tables {
		values, err := exportRows(t.Context(), db, `SELECT * FROM "`+name+`"`, nil)
		if err != nil {
			t.Fatal(err)
		}
		before[name] = values
	}
	schemaBefore, err := exportRows(t.Context(), db, `SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name`, nil)
	if err != nil {
		t.Fatal(err)
	}
	body, err := migrationFiles.ReadFile("migrations/073_workspace_finance.sql")
	if err != nil {
		t.Fatal(err)
	}
	tx, err := db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(string(body)); err != nil {
		tx.Rollback()
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	for _, name := range tables {
		values, err := exportRows(t.Context(), db, `SELECT * FROM "`+name+`"`, nil)
		if err != nil || !reflect.DeepEqual(before[name], values) {
			t.Fatalf("old table changed: %s %v", name, err)
		}
	}
	schemaAfter, err := exportRows(t.Context(), db, `SELECT type,name,tbl_name,sql FROM sqlite_master WHERE tbl_name NOT LIKE 'workspace_finance_%' ORDER BY type,name`, nil)
	if err != nil || !reflect.DeepEqual(schemaBefore, schemaAfter) {
		t.Fatalf("old schema changed %v", err)
	}
	for _, suffix := range []string{"buckets", "sources", "entries", "requests", "counterparties", "expenses", "expense_requests", "settings"} {
		var count int
		if err := db.QueryRow(`SELECT COUNT(*) FROM workspace_finance_` + suffix).Scan(&count); err != nil || count != 0 {
			t.Fatalf("seeded %s %d %v", suffix, count, err)
		}
	}
	// The preservation assertions above isolate migration 073. HTTP handlers
	// below use the current application, so bring the fixture to its full schema
	// before checking that the historical request receipt still replays.
	if _, err := db.Exec(`INSERT INTO schema_migrations(version,applied_at) VALUES('073_workspace_finance.sql',?)`, nowText()); err != nil {
		t.Fatal(err)
	}
	if err := store.migrate(t.Context()); err != nil {
		t.Fatal(err)
	}
	var repeated financeEntry
	requestJSON(t, client, "POST", server.URL+"/api/personal/finance/entries", financeInput(source.ID, 10000, 0), 200, &repeated)
	if repeated.ID != entry.ID {
		t.Fatal("migration invalidated original receipt")
	}
}
