package app

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
)

func cashbookInput(key, kind string, amount int64) workspaceReceiptInput {
	return workspaceReceiptInput{ClientRequestID: key, ReceiptKind: kind, Date: "2026-09-15", GrossMinor: amount, Payer: "Участник", Note: "Общий проект"}
}

func cashbookTableCount(t *testing.T, store *Store, table, workspace string) int {
	t.Helper()
	var count int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM `+table+` WHERE workspace_id=?`, workspace).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}

func TestWorkspaceCashbookAtomicFirstReceiptRetryAndInvalidRollback(t *testing.T) {
	store, server, owner, _ := financeTestServer(t)
	team := workspaceFinanceProject(t, owner, server.URL, "First budget")
	var report financeOverview
	workspaceFinanceRequest(t, owner, "GET", server.URL, "", team.ID, "", "", nil, 200, &report)
	if report.TeamSummary == nil || *report.TeamSummary != (workspaceCashbookSummary{}) || len(report.Buckets) != 0 {
		t.Fatal("GET seeded or lost empty cashbook")
	}
	bad := cashbookInput("first-invalid-01", "contribution", 0)
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/receipts", team.ID, team.ID, "0", bad, 400, nil)
	for _, table := range []string{"workspace_finance_buckets", "workspace_finance_sources", "workspace_finance_entries", "workspace_finance_requests", "workspace_finance_receipts", "workspace_finance_cashbook_sources"} {
		if cashbookTableCount(t, store, table, team.ID) != 0 {
			t.Fatalf("invalid receipt left %s", table)
		}
	}
	input := cashbookInput("first-valid-0001", "contribution", 12345)
	var entry, repeated financeEntry
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/receipts", team.ID, team.ID, "0", input, 201, &entry)
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/receipts", team.ID, team.ID, "0", input, 200, &repeated)
	if entry.ID != repeated.ID || entry.ReceiptKind != "contribution" || entry.GrossMinor != 12345 || entry.BaseMinor != 12345 || entry.WorkerMinor != 0 || len(entry.Allocations) != 1 || entry.Allocations[0].AmountMinor != 12345 || entry.Allocations[0].PaidMinor != 0 {
		t.Fatalf("wrong simple receipt %#v", entry)
	}
	input.GrossMinor++
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/receipts", team.ID, team.ID, "0", input, 409, nil)
	workspaceFinanceRequest(t, owner, "GET", server.URL, "?from=2026-08-01&to=2026-08-31", team.ID, "", "", nil, 200, &report)
	if len(report.Entries) != 0 || report.TeamSummary.ContributionMinor != 12345 || report.TeamSummary.BalanceMinor != 12345 || len(report.Buckets) != 1 || report.Buckets[0].Name != "Бюджет проекта" || len(report.Sources) != 1 || report.Sources[0].ReceiptKind != "contribution" {
		t.Fatalf("wrong all-time summary %#v", report)
	}
	workspaceFinanceRequest(t, owner, "GET", server.URL, "/receipts/"+entry.ID, team.ID, "", "", nil, 200, &repeated)
	if repeated.ReceiptKind != "contribution" {
		t.Fatal("receipt read lost kind")
	}
}

func TestWorkspaceCashbookExpenseFirstAndExplicitAccountChoice(t *testing.T) {
	store, server, owner, _ := financeTestServer(t)
	team := workspaceFinanceProject(t, owner, server.URL, "Expense first")
	input := financeExpenseInput{ClientRequestID: "first-expense-001", Date: "2026-09-15", AmountMinor: 7000, Note: "Материалы"}
	var expense, repeated financeExpense
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/expenses", team.ID, team.ID, "0", input, 201, &expense)
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/expenses", team.ID, team.ID, "0", input, 200, &repeated)
	if expense.ID != repeated.ID || expense.BucketID == "" || expense.BucketName != "Бюджет проекта" {
		t.Fatalf("expense retry %#v", repeated)
	}
	var report financeOverview
	workspaceFinanceRequest(t, owner, "GET", server.URL, "", team.ID, "", "", nil, 200, &report)
	if report.TeamSummary.SpentMinor != 7000 || report.TeamSummary.BalanceMinor != -7000 || len(report.Sources) != 0 {
		t.Fatal("expense invented income or source")
	}
	var second financeBucket
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/buckets", team.ID, team.ID, "0", map[string]any{"name": "Отдельный счёт"}, 201, &second)
	receipt := cashbookInput("ambiguous-receipt", "other", 20000)
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/receipts", team.ID, team.ID, "0", receipt, 400, nil)
	input.ClientRequestID = "ambiguous-expense"
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/expenses", team.ID, team.ID, "0", input, 400, nil)
	receipt.BucketID = second.ID
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/receipts", team.ID, team.ID, "0", receipt, 409, nil)
	receipt.ExpectedBucketRevision = second.Revision
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/receipts", team.ID, team.ID, "0", receipt, 201, nil)
	if cashbookTableCount(t, store, "workspace_finance_buckets", team.ID) != 2 {
		t.Fatal("created another account instead of choosing")
	}
	// Personal expenses still require the owner's explicit account.
	requestJSON(t, owner, "POST", server.URL+"/api/personal/finance/expenses", input, 404, nil)
}

func TestWorkspaceCashbookTotalsLegacyWorkersVersionsAndVoids(t *testing.T) {
	_, server, owner, _ := financeTestServer(t)
	team := workspaceFinanceProject(t, owner, server.URL, "Funding and revenue")
	first := cashbookInput("funding-00000001", "contribution", 100000)
	var funding, revenue financeEntry
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/receipts", team.ID, team.ID, "0", first, 201, &funding)
	second := cashbookInput("revenue-00000001", "revenue", 25000)
	second.Date = "2026-10-20" // Complete ledger includes future recorded operations.
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/receipts", team.ID, team.ID, "0", second, 201, &revenue)
	var legacySource financeSource
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/sources", team.ID, team.ID, "0", map[string]any{"name": "Вложения", "deductWorkers": true, "allocations": []financeRule{{funding.Allocations[0].BucketID, 10000}}}, 201, &legacySource)
	legacyInput := financeInput(legacySource.ID, 20000, 3000)
	legacyInput.ClientRequestID = "legacy-cashbook-01"
	var legacy financeEntry
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/entries", team.ID, team.ID, "0", legacyInput, 201, &legacy)
	expenseInput := financeExpenseInput{ClientRequestID: "cashbook-spend-01", Date: "2026-09-15", AmountMinor: 12000}
	var expense financeExpense
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/expenses", team.ID, team.ID, "0", expenseInput, 201, &expense)
	var report financeOverview
	workspaceFinanceRequest(t, owner, "GET", server.URL, "?from=2026-09-01&to=2026-09-30", team.ID, "", "", nil, 200, &report)
	want := workspaceCashbookSummary{ContributionMinor: 100000, RevenueMinor: 25000, UnclassifiedMinor: 20000, WorkerMinor: 3000, SpentMinor: 12000, BalanceMinor: 130000}
	if *report.TeamSummary != want || len(report.Entries) != 2 {
		t.Fatalf("wrong totals %#v", report)
	}
	for _, source := range report.Sources {
		if source.ID == legacySource.ID && source.ReceiptKind != "" {
			t.Fatal("classified user source by its name")
		}
	}
	edit := first
	edit.ClientRequestID, edit.ExpectedRevision, edit.GrossMinor, edit.ReceiptKind = "", funding.Revision, 120000, "other"
	edit.BucketID, edit.ExpectedBucketRevision = funding.Allocations[0].BucketID, 1
	workspaceFinanceRequest(t, owner, "PUT", server.URL, "/receipts/"+funding.ID, team.ID, team.ID, "0", edit, 200, &funding)
	workspaceFinanceRequest(t, owner, "PUT", server.URL, "/receipts/"+funding.ID, team.ID, team.ID, "0", edit, 409, nil)
	workspaceFinanceRequest(t, owner, "PUT", server.URL, "/receipts/"+legacy.ID, team.ID, team.ID, "0", edit, 409, nil)
	legacyEdit := financeInput(funding.SourceID, 120000, 0)
	legacyEdit.ClientRequestID, legacyEdit.ExpectedRevision = "", funding.Revision
	workspaceFinanceRequest(t, owner, "PUT", server.URL, "/entries/"+funding.ID, team.ID, team.ID, "0", legacyEdit, 409, nil)
	workspaceFinanceRequest(t, owner, "PATCH", server.URL, "/entries/"+revenue.ID+"/void", team.ID, team.ID, "0", map[string]any{"expectedRevision": 1, "voided": true}, 200, &revenue)
	if revenue.ReceiptKind != "revenue" {
		t.Fatal("void lost original classification")
	}
	workspaceFinanceRequest(t, owner, "PATCH", server.URL, "/expenses/"+expense.ID+"/void", team.ID, team.ID, "0", map[string]any{"expectedRevision": 1, "voided": true}, 200, nil)
	workspaceFinanceRequest(t, owner, "GET", server.URL, "", team.ID, "", "", nil, 200, &report)
	want = workspaceCashbookSummary{OtherMinor: 120000, UnclassifiedMinor: 20000, WorkerMinor: 3000, BalanceMinor: 137000}
	if *report.TeamSummary != want {
		t.Fatalf("void/edit totals %#v", report.TeamSummary)
	}
}

func TestWorkspaceCashbookRelationsCategoriesAndScopedPermissions(t *testing.T) {
	store, server, owner, user := financeTestServer(t)
	a := workspaceFinanceProject(t, owner, server.URL, "A")
	b := workspaceFinanceProject(t, owner, server.URL, "B")
	goal := financeTestRecord(t, store, a.ID, user.ID, "cashbook-goal", "Логотип", "goal")
	task := financeTestRecord(t, store, a.ID, user.ID, "cashbook-task", "Оплатить эскизы", "task")
	foreign := financeTestRecord(t, store, b.ID, user.ID, "cashbook-foreign", "Чужое", "task")
	var group financeCategory
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/categories", a.ID, a.ID, "0", map[string]any{"name": "Дизайн"}, 201, &group)
	input := cashbookInput("scope-receipt-01", "contribution", 20000)
	refs := []financeLinkInput{foreign}
	input.Links = &refs
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/receipts", a.ID, a.ID, "0", input, 400, nil)
	if cashbookTableCount(t, store, "workspace_finance_buckets", a.ID) != 0 {
		t.Fatal("foreign link left bootstrap account")
	}
	refs = []financeLinkInput{goal, task}
	input.CategoryID, input.ExpectedCategoryRevision = &group.ID, group.Revision
	var receipt financeEntry
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/receipts", a.ID, a.ID, "0", input, 201, &receipt)
	if receipt.CategoryName != "Дизайн" || len(receipt.Links) != 2 || receipt.Links[0].RecordType != "goal" {
		t.Fatalf("lost context %#v", receipt)
	}
	member := testClient(t)
	registerVerifiedWithoutFixture(t, member, server.URL, "cashbook-member@example.test", "cashbook_member")
	workspaceFinanceMember(t, owner, server.URL, a, "cashbook_member", "member")
	workspaceFinanceRequest(t, member, "GET", server.URL, "/receipts/"+receipt.ID, a.ID, "", "", nil, 200, nil)
	input.ClientRequestID = "member-receipt-01"
	workspaceFinanceRequest(t, member, "POST", server.URL, "/receipts", a.ID, a.ID, "0", input, 403, nil)
	workspaceFinanceRequest(t, owner, "GET", server.URL, "/receipts/"+receipt.ID, b.ID, "", "", nil, 404, nil)
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/receipts", "", "", "", input, 400, nil)
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/receipts", fmt.Sprintf("personal-%d", user.ID), "", "", input, 403, nil)
	workspaceFinanceRequest(t, owner, "PUT", server.URL, "/settings", b.ID, "", "", map[string]any{"sourceWorkspaceId": a.ID, "expectedRevision": 0}, 200, nil)
	workspaceFinanceRequest(t, owner, "GET", server.URL, "/receipts/"+receipt.ID, b.ID, "", "", nil, 200, nil)
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/receipts", b.ID, a.ID, "1", input, 403, nil)
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/receipts", b.ID, b.ID, "0", input, 409, nil)
}

func TestWorkspaceCashbookConcurrentFirstWritesKeepOneAccountAndSource(t *testing.T) {
	store, server, owner, _ := financeTestServer(t)
	team := workspaceFinanceProject(t, owner, server.URL, "Concurrent funding")
	var wg sync.WaitGroup
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			workspaceFinanceRequest(t, owner, "POST", server.URL, "/receipts", team.ID, team.ID, "0", cashbookInput(fmt.Sprintf("parallel-receipt-%d", i), "contribution", 1000), 201, nil)
		}(i)
	}
	wg.Wait()
	if cashbookTableCount(t, store, "workspace_finance_buckets", team.ID) != 1 || cashbookTableCount(t, store, "workspace_finance_sources", team.ID) != 1 || cashbookTableCount(t, store, "workspace_finance_entries", team.ID) != 4 {
		t.Fatal("concurrent first use duplicated dictionaries")
	}
}

func TestWorkspaceCashbookDictionaryChangesKeepHistoricalSnapshot(t *testing.T) {
	_, server, owner, _ := financeTestServer(t)
	team := workspaceFinanceProject(t, owner, server.URL, "Historical account")
	input := cashbookInput("snapshot-receipt1", "contribution", 10000)
	var entry financeEntry
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/receipts", team.ID, team.ID, "0", input, 201, &entry)
	bucketID := entry.Allocations[0].BucketID
	workspaceFinanceRequest(t, owner, "PUT", server.URL, "/buckets/"+bucketID, team.ID, team.ID, "0", map[string]any{"name": "Закрытый счёт", "archived": true, "expectedRevision": 1}, 200, nil)
	workspaceFinanceRequest(t, owner, "PUT", server.URL, "/sources/"+entry.SourceID, team.ID, team.ID, "0", map[string]any{"name": "Историческое вложение", "archived": true, "allocations": []financeRule{{bucketID, 10000}}, "expectedRevision": 1}, 200, nil)
	input.ClientRequestID, input.ExpectedRevision, input.BucketID, input.Note = "", entry.Revision, bucketID, "Исправленная пометка"
	workspaceFinanceRequest(t, owner, "PUT", server.URL, "/receipts/"+entry.ID, team.ID, team.ID, "0", input, 200, &entry)
	if entry.SourceName != "Вложения" || entry.Allocations[0].BucketName != "Бюджет проекта" || entry.Note != "Исправленная пометка" {
		t.Fatal("editing note rewrote historical snapshots")
	}
	input.ClientRequestID, input.ExpectedRevision = "archived-account", 0
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/receipts", team.ID, team.ID, "0", input, 400, nil)
	input.BucketID, input.ReceiptKind = "", "revenue"
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/receipts", team.ID, team.ID, "0", input, 201, &entry)
	if entry.Allocations[0].BucketID == bucketID {
		t.Fatal("new receipt silently restored archived account")
	}
}

func TestWorkspaceCashbookAllTimeTotalsRejectUnsafeRangeOutsideJournal(t *testing.T) {
	store, server, owner, _ := financeTestServer(t)
	team := workspaceFinanceProject(t, owner, server.URL, "Exact totals")
	var seed financeEntry
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/receipts", team.ID, team.ID, "0", cashbookInput("overflow-seed-01", "contribution", 100), 201, &seed)
	allocations, _ := json.Marshal([]financeAllocation{{BucketID: seed.Allocations[0].BucketID, BucketName: "Бюджет проекта", BasisPoints: 10000, AmountMinor: personalFinanceMaxMinor}})
	_, err := store.db.Exec(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<9008)
INSERT INTO workspace_finance_entries(id,workspace_id,source_id,source_name,deduct_workers,date,payer,note,gross_minor,worker_minor,base_minor,allocations_json,revision,voided,created_at,updated_at)
SELECT 'cashbook-overflow-'||x,?,?,?,0,'2099-01-01','','',?,0,?,?,1,0,?,? FROM n`, team.ID, seed.SourceID, seed.SourceName, personalFinanceMaxMinor, personalFinanceMaxMinor, string(allocations), nowText(), nowText())
	if err != nil {
		t.Fatal(err)
	}
	// These rows are outside the journal and dated account balances. The new
	// complete-ledger summary must reject imprecise totals rather than round them.
	workspaceFinanceRequest(t, owner, "GET", server.URL, "?from=2026-09-01&to=2026-09-30", team.ID, "", "", nil, 422, nil)
}

func TestWorkspaceCashbookTransferCompatibilityAndRecovery(t *testing.T) {
	store, server, owner, _ := financeTestServer(t)
	team := workspaceFinanceProject(t, owner, server.URL, "Simple receipt transfers")
	var entry financeEntry
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/receipts", team.ID, team.ID, "0", cashbookInput("transfer-guard-001", "contribution", 10000), 201, &entry)
	transfer := map[string]any{"expectedRevision": entry.Revision, "bucketId": entry.Allocations[0].BucketID, "paidMinor": 350}
	workspaceFinanceRequest(t, owner, "PATCH", server.URL, "/entries/"+entry.ID+"/transfers", team.ID, team.ID, "0", transfer, 409, nil)
	workspaceFinanceRequest(t, owner, "GET", server.URL, "/receipts/"+entry.ID, team.ID, "", "", nil, 200, &entry)
	if entry.Revision != 1 || entry.Allocations[0].PaidMinor != 0 {
		t.Fatal("rejected legacy UI transfer changed receipt")
	}
	workspaceFinanceRequest(t, owner, "PATCH", server.URL, "/entries/"+entry.ID+"/void", team.ID, team.ID, "0", map[string]any{"expectedRevision": entry.Revision, "voided": true}, 200, &entry)
	workspaceFinanceRequest(t, owner, "PATCH", server.URL, "/entries/"+entry.ID+"/void", team.ID, team.ID, "0", map[string]any{"expectedRevision": entry.Revision, "voided": false}, 200, &entry)
	// Simulate bytes saved by the previous runtime before the compatibility
	// guard existed. The user must retain an API route to remove that mark.
	allocations := append([]financeAllocation(nil), entry.Allocations...)
	allocations[0].PaidMinor = 350
	encoded, _ := json.Marshal(allocations)
	if _, err := store.db.Exec(`UPDATE workspace_finance_entries SET allocations_json=?,revision=revision+1 WHERE workspace_id=? AND id=?`, string(encoded), team.ID, entry.ID); err != nil {
		t.Fatal(err)
	}
	workspaceFinanceRequest(t, owner, "GET", server.URL, "/receipts/"+entry.ID, team.ID, "", "", nil, 200, &entry)
	workspaceFinanceRequest(t, owner, "PATCH", server.URL, "/entries/"+entry.ID+"/void", team.ID, team.ID, "0", map[string]any{"expectedRevision": entry.Revision, "voided": true}, 409, nil)
	transfer["expectedRevision"], transfer["paidMinor"] = entry.Revision, 0
	workspaceFinanceRequest(t, owner, "PATCH", server.URL, "/entries/"+entry.ID+"/transfers", team.ID, team.ID, "0", transfer, 200, &entry)
	if entry.Allocations[0].PaidMinor != 0 || entry.ReceiptKind != "contribution" || entry.GrossMinor != 10000 {
		t.Fatal("zero correction changed receipt identity or amount")
	}
	workspaceFinanceRequest(t, owner, "PATCH", server.URL, "/entries/"+entry.ID+"/void", team.ID, team.ID, "0", map[string]any{"expectedRevision": entry.Revision, "voided": true}, 200, &entry)
	var report financeOverview
	workspaceFinanceRequest(t, owner, "GET", server.URL, "", team.ID, "", "", nil, 200, &report)
	if !entry.Voided || report.TeamSummary.BalanceMinor != 0 || report.TeamSummary.ContributionMinor != 0 {
		t.Fatal("recovered receipt cannot be cancelled consistently")
	}
}

func TestWorkspaceCashbookMigration077PreservesAll148Tables(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "before077.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(`PRAGMA foreign_keys=ON;CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,applied_at TEXT NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	files, _ := migrationFiles.ReadDir("migrations")
	for _, file := range files {
		if file.IsDir() || !strings.HasSuffix(file.Name(), ".sql") || file.Name() >= "077" {
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
	owner := testClient(t)
	registerVerifiedWithoutFixture(t, owner, server.URL, "before077@example.test", "before077")
	team := workspaceFinanceProject(t, owner, server.URL, "Existing budget")
	_, source, entry, _ := workspaceFinanceFixture(t, owner, server.URL, team.ID)
	personalBucket := financeCreateBucket(t, owner, server.URL, "Personal preserved")
	personalSource := financeCreateSource(t, owner, server.URL, "Private preserved", false, []financeRule{{personalBucket.ID, 10000}})
	financeCreateEntry(t, owner, server.URL, financeInput(personalSource.ID, 10000, 0))
	rows, err := db.Query(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
	if err != nil {
		t.Fatal(err)
	}
	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatal(err)
		}
		tables = append(tables, name)
	}
	rows.Close()
	if len(tables) != 148 {
		t.Fatalf("expected 148 old tables, got %d", len(tables))
	}
	before := map[string][]map[string]any{}
	for _, table := range tables {
		before[table], err = exportRows(t.Context(), db, `SELECT * FROM "`+table+`"`, nil)
		if err != nil {
			t.Fatal(err)
		}
	}
	schema, err := exportRows(t.Context(), db, `SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name`, nil)
	if err != nil {
		t.Fatal(err)
	}
	body, err := migrationFiles.ReadFile("migrations/077_workspace_cashbook.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(string(body)); err != nil {
		t.Fatal(err)
	}
	for _, table := range tables {
		after, err := exportRows(t.Context(), db, `SELECT * FROM "`+table+`"`, nil)
		if err != nil || !reflect.DeepEqual(before[table], after) {
			t.Fatalf("modified %s: %v", table, err)
		}
	}
	afterSchema, err := exportRows(t.Context(), db, `SELECT type,name,tbl_name,sql FROM sqlite_master WHERE tbl_name NOT IN ('workspace_finance_receipts','workspace_finance_cashbook_sources') ORDER BY type,name`, nil)
	if err != nil || !reflect.DeepEqual(schema, afterSchema) {
		t.Fatal("old schema changed", err)
	}
	for _, table := range []string{"workspace_finance_receipts", "workspace_finance_cashbook_sources"} {
		if cashbookTableCount(t, store, table, team.ID) != 0 {
			t.Fatal("migration invented cashbook metadata")
		}
	}
	var repeated financeEntry
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/entries", team.ID, team.ID, "0", financeInput(source.ID, 25000, 0), 200, &repeated)
	if repeated.ID != entry.ID || repeated.ReceiptKind != "" {
		t.Fatal("legacy receipt changed")
	}
	var report financeOverview
	workspaceFinanceRequest(t, owner, "GET", server.URL, "", team.ID, "", "", nil, 200, &report)
	if report.TeamSummary.UnclassifiedMinor != 25000 || report.TeamSummary.BalanceMinor != 18000 {
		t.Fatal("legacy migration report changed sums")
	}
}
