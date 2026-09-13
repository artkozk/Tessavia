package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
)

func financeExpenseTestInput(bucket financeBucket, date string, amount int64, request string) financeExpenseInput {
	return financeExpenseInput{ClientRequestID: request, BucketID: bucket.ID, ExpectedBucketRevision: bucket.Revision, Date: date, AmountMinor: amount, Payee: "АЗС", Note: "Заправка"}
}

func financeCreateExpense(t *testing.T, client *http.Client, base string, input financeExpenseInput) financeExpense {
	t.Helper()
	var expense financeExpense
	requestJSON(t, client, "POST", base+"/api/personal/finance/expenses", input, 201, &expense)
	return expense
}

func financeReadOverview(t *testing.T, client *http.Client, base, from, to string) financeOverview {
	t.Helper()
	var overview financeOverview
	requestJSON(t, client, "GET", base+"/api/personal/finance?from="+from+"&to="+to, nil, 200, &overview)
	return overview
}

func financeFindBalance(t *testing.T, overview financeOverview, bucket string) financeBalance {
	t.Helper()
	for _, balance := range overview.Balances {
		if balance.BucketID == bucket {
			return balance
		}
	}
	t.Fatalf("missing bucket balance %s", bucket)
	return financeBalance{}
}

func TestPersonalFinanceExpenseBalancesCarryAndTransfers(t *testing.T) {
	_, server, client, _ := financeTestServer(t)
	base := server.URL
	car := financeCreateBucket(t, client, base, "Машина")
	tithe := financeCreateBucket(t, client, base, "Десятина")
	empty := financeCreateBucket(t, client, base, "Пока без операций")
	source := financeCreateSource(t, client, base, "Покос", true, []financeRule{{car.ID, 9000}, {tithe.ID, 1000}})
	input := financeInput(source.ID, 120000, 20000)
	input.Date, input.ClientRequestID = "2026-08-31", "income-prior-month"
	entry := financeCreateEntry(t, client, base, input)
	requestJSON(t, client, "PATCH", base+"/api/personal/finance/entries/"+entry.ID+"/transfers", map[string]any{"bucketId": car.ID, "paidMinor": 90000, "expectedRevision": entry.Revision}, 200, &entry)
	input.Date, input.ClientRequestID, input.GrossMinor, input.WorkerMinor = "2026-09-13", "income-current-month", 50000, 0
	financeCreateEntry(t, client, base, input)
	input.Date, input.ClientRequestID = "2026-10-01", "income-future-month"
	financeCreateEntry(t, client, base, input)
	financeCreateExpense(t, client, base, financeExpenseTestInput(car, "2026-08-31", 20000, "expense-prior-month"))
	financeCreateExpense(t, client, base, financeExpenseTestInput(car, "2026-09-13", 15000, "expense-current-month"))
	financeCreateExpense(t, client, base, financeExpenseTestInput(car, "2026-10-01", 12300, "expense-future-month"))
	financeCreateExpense(t, client, base, financeExpenseTestInput(tithe, "2026-09-13", 10000, "expense-weekly-tithe"))
	report := financeReadOverview(t, client, base, "2026-09-01", "2026-09-30")
	if report.BalanceThrough != "2026-09-30" || len(report.Entries) != 1 || len(report.Expenses) != 2 {
		t.Fatalf("wrong period boundary %#v", report)
	}
	want := financeBalance{BucketID: car.ID, AllocatedMinor: 135000, SpentMinor: 35000, BalanceMinor: 100000, PeriodAllocatedMinor: 45000, PeriodSpentMinor: 15000, OpeningMinor: 70000}
	if got := financeFindBalance(t, report, car.ID); got != want {
		t.Fatalf("car balance got %#v want %#v", got, want)
	}
	if got := financeFindBalance(t, report, tithe.ID); got.BalanceMinor != 5000 || got.OpeningMinor != 10000 {
		t.Fatalf("tithe payment not reflected %#v", got)
	}
	if got := financeFindBalance(t, report, empty.ID); got != (financeBalance{BucketID: empty.ID}) {
		t.Fatalf("empty envelope not retained %#v", got)
	}
	day := financeReadOverview(t, client, base, "2026-09-14", "2026-09-14")
	if len(day.Entries)+len(day.Expenses) != 0 || financeFindBalance(t, day, car.ID).BalanceMinor != 100000 || financeFindBalance(t, day, car.ID).OpeningMinor != 100000 {
		t.Fatal("empty day lost previous balance")
	}
}

func TestPersonalFinanceExpenseEditVoidRestoreNegativeAndSnapshots(t *testing.T) {
	_, server, client, _ := financeTestServer(t)
	base := server.URL
	bucket := financeCreateBucket(t, client, base, "Старое имя")
	other := financeCreateBucket(t, client, base, "Другой счёт")
	input := financeExpenseTestInput(bucket, "2026-09-13", 12345, "expense-snapshot-test")
	expense := financeCreateExpense(t, client, base, input)
	path := base + "/api/personal/finance/expenses/" + expense.ID
	requestJSON(t, client, "PUT", base+"/api/personal/finance/buckets/"+bucket.ID, map[string]any{"name": "Архивное новое имя", "archived": true, "expectedRevision": bucket.Revision}, 200, &bucket)
	var retry financeExpense
	requestJSON(t, client, "POST", base+"/api/personal/finance/expenses", input, 200, &retry)
	if retry.ID != expense.ID {
		t.Fatal("retry after archive created duplicate")
	}
	input.ClientRequestID, input.ExpectedRevision, input.AmountMinor = "", expense.Revision, 20000
	requestJSON(t, client, "PUT", path, input, 200, &expense)
	if expense.BucketName != "Старое имя" {
		t.Fatal("archived rename rewrote expense snapshot")
	}
	requestJSON(t, client, "PUT", path, input, 409, nil)
	report := financeReadOverview(t, client, base, "2026-09-01", "2026-09-30")
	if financeFindBalance(t, report, bucket.ID).BalanceMinor != -20000 {
		t.Fatal("expense without income should produce explicit negative balance")
	}
	requestJSON(t, client, "PATCH", path+"/void", map[string]any{"expectedRevision": expense.Revision, "voided": true}, 200, &expense)
	report = financeReadOverview(t, client, base, "2026-09-01", "2026-09-30")
	if len(report.Expenses) != 1 || !report.Expenses[0].Voided || financeFindBalance(t, report, bucket.ID).BalanceMinor != 0 {
		t.Fatal("void must preserve history but remove spending")
	}
	input.ExpectedRevision = expense.Revision
	requestJSON(t, client, "PUT", path, input, 409, nil)
	requestJSON(t, client, "PATCH", path+"/void", map[string]any{"expectedRevision": 1, "voided": false}, 409, nil)
	requestJSON(t, client, "PATCH", path+"/void", map[string]any{"expectedRevision": expense.Revision, "voided": false}, 200, &expense)
	input.ExpectedRevision, input.BucketID, input.ExpectedBucketRevision = expense.Revision, other.ID, other.Revision
	requestJSON(t, client, "PUT", path, input, 200, &expense)
	if expense.BucketName != other.Name || expense.BucketID != other.ID || expense.Voided {
		t.Fatalf("switch bucket failed %#v", expense)
	}
	report = financeReadOverview(t, client, base, "2026-09-01", "2026-09-30")
	if financeFindBalance(t, report, bucket.ID).BalanceMinor != 0 || financeFindBalance(t, report, other.ID).BalanceMinor != -20000 {
		t.Fatal("expense bucket change failed to move balance")
	}
}

func TestPersonalFinanceExpensePrivacyAndInputValidation(t *testing.T) {
	store, server, client, user := financeTestServer(t)
	base := server.URL
	bucket := financeCreateBucket(t, client, base, "Приватный счёт")
	input := financeExpenseTestInput(bucket, "2026-09-13", 100, "expense-private-request")
	expense := financeCreateExpense(t, client, base, input)
	partner := testClient(t)
	registerVerifiedWithoutFixture(t, partner, base, "expense-partner@example.test", "expense_partner")
	requestWorkspaceJSON(t, partner, "GET", base+"/api/personal/finance?from=2026-09-01&to=2026-09-30&ownerId="+fmt.Sprint(user.ID), "irrelevant-team", nil, 200, nil)
	privateReport := financeReadOverview(t, partner, base, "2026-09-01", "2026-09-30")
	if len(privateReport.Expenses)+len(privateReport.Balances) != 0 {
		t.Fatal("another account saw expenses/balances")
	}
	requestJSON(t, partner, "POST", base+"/api/personal/finance/expenses", input, 404, nil)
	requestJSON(t, partner, "GET", base+"/api/personal/finance/expenses/"+expense.ID, nil, 404, nil)
	requestJSON(t, testClient(t), "GET", base+"/api/personal/finance/expenses/"+expense.ID, nil, 401, nil)
	edit := input
	edit.ClientRequestID, edit.ExpectedRevision = "", expense.Revision
	requestJSON(t, partner, "PUT", base+"/api/personal/finance/expenses/"+expense.ID, edit, 404, nil)
	requestJSON(t, partner, "PATCH", base+"/api/personal/finance/expenses/"+expense.ID+"/void", map[string]any{"expectedRevision": expense.Revision, "voided": true}, 404, nil)
	requestJSON(t, testClient(t), "POST", base+"/api/personal/finance/expenses", input, 401, nil)
	requestJSON(t, client, "PATCH", base+"/api/personal/finance/expenses/"+expense.ID+"/void", map[string]any{"expectedRevision": expense.Revision}, 400, nil)
	bad := []func(*financeExpenseInput){
		func(v *financeExpenseInput) { v.AmountMinor = 0 },
		func(v *financeExpenseInput) { v.AmountMinor = -1 },
		func(v *financeExpenseInput) { v.AmountMinor = personalFinanceMaxMinor + 1 },
		func(v *financeExpenseInput) { v.Date = "2026-02-30" },
		func(v *financeExpenseInput) { v.Date = "1899-12-31" },
		func(v *financeExpenseInput) { v.Date = "9999-01-01" },
		func(v *financeExpenseInput) { v.Payee = strings.Repeat("я", 121) },
		func(v *financeExpenseInput) { v.Note = strings.Repeat("я", 2001) },
		func(v *financeExpenseInput) { v.ClientRequestID = "short" },
		func(v *financeExpenseInput) { v.ClientRequestID = " padded-request " },
		func(v *financeExpenseInput) { v.ExpectedRevision = 1 },
	}
	for i, change := range bad {
		invalid := input
		invalid.ClientRequestID = fmt.Sprintf("invalid-expense-%d", i)
		change(&invalid)
		requestJSON(t, client, "POST", base+"/api/personal/finance/expenses", invalid, 400, nil)
	}
	input.ClientRequestID = "new-expense-stale-bucket"
	input.ExpectedBucketRevision = 99
	requestJSON(t, client, "POST", base+"/api/personal/finance/expenses", input, 409, nil)
	var count int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM personal_finance_expenses`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("rejected writes persisted %d %v", count, err)
	}
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM activity WHERE entity_id=?`, expense.ID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("expense leaked into shared activity %d %v", count, err)
	}
}

func TestPersonalFinanceExpenseConcurrentIdempotencyAndRevision(t *testing.T) {
	store, server, client, user := financeTestServer(t)
	base := server.URL
	bucket := financeCreateBucket(t, client, base, "Счёт")
	input := financeExpenseTestInput(bucket, "2026-09-13", 765, "expense-concurrent-request")
	payload, _ := json.Marshal(input)
	type response struct {
		status int
		body   []byte
		err    error
	}
	results := make(chan response, 10)
	var wg sync.WaitGroup
	call := func(method, path string, body []byte) {
		defer wg.Done()
		req, err := http.NewRequest(method, base+path, bytes.NewReader(body))
		if err != nil {
			results <- response{err: err}
			return
		}
		req.Header.Set("Content-Type", "application/json")
		res, err := client.Do(req)
		if err != nil {
			results <- response{err: err}
			return
		}
		defer res.Body.Close()
		data, err := io.ReadAll(res.Body)
		results <- response{res.StatusCode, data, err}
	}
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go call("POST", "/api/personal/finance/expenses", payload)
	}
	wg.Wait()
	created := 0
	var expense financeExpense
	for i := 0; i < 10; i++ {
		res := <-results
		if res.err != nil || (res.status != 201 && res.status != 200) {
			t.Fatalf("create %d %s %v", res.status, res.body, res.err)
		}
		if res.status == 201 {
			created++
		}
		var value financeExpense
		if err := json.Unmarshal(res.body, &value); err != nil {
			t.Fatal(err)
		}
		if expense.ID != "" && value.ID != expense.ID {
			t.Fatal("duplicate expense IDs")
		}
		expense = value
	}
	if created != 1 {
		t.Fatalf("created %d expenses", created)
	}
	for _, table := range []string{"personal_finance_expenses", "personal_finance_expense_requests"} {
		var count int
		if err := store.db.QueryRow(`SELECT COUNT(*) FROM `+table+` WHERE owner_id=?`, user.ID).Scan(&count); err != nil || count != 1 {
			t.Fatalf("%s %d %v", table, count, err)
		}
	}
	input.AmountMinor++
	requestJSON(t, client, "POST", base+"/api/personal/finance/expenses", input, 409, nil)
	input.ClientRequestID, input.ExpectedRevision = "", expense.Revision
	for _, amount := range []int64{1000, 2000} {
		input.AmountMinor = amount
		payload, _ := json.Marshal(input)
		wg.Add(1)
		go call("PUT", "/api/personal/finance/expenses/"+expense.ID, payload)
	}
	wg.Wait()
	statuses := map[int]int{}
	for i := 0; i < 2; i++ {
		res := <-results
		if res.err != nil {
			t.Fatal(res.err)
		}
		statuses[res.status]++
	}
	if statuses[200] != 1 || statuses[409] != 1 {
		t.Fatalf("lost update %#v", statuses)
	}
}

func TestPersonalFinanceExpenseHistoricalTotalsNotJournalCap(t *testing.T) {
	store, server, client, user := financeTestServer(t)
	base := server.URL
	bucket := financeCreateBucket(t, client, base, "Счёт")
	source := financeCreateSource(t, client, base, "Доход", false, []financeRule{{bucket.ID, 10000}})
	entry := financeCreateEntry(t, client, base, financeInput(source.ID, 100, 0))
	expense := financeCreateExpense(t, client, base, financeExpenseTestInput(bucket, "2026-09-12", 10, "expense-many-history"))
	// More rows than a journal page permits, but all before the requested day.
	_, err := store.db.Exec(`WITH RECURSIVE seq(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM seq WHERE x<5000) INSERT INTO personal_finance_entries(id,owner_id,source_id,source_name,deduct_workers,date,payer,note,gross_minor,worker_minor,base_minor,allocations_json,created_at,updated_at) SELECT 'historical-income-'||x,owner_id,source_id,source_name,deduct_workers,'2026-09-12',payer,note,gross_minor,worker_minor,base_minor,allocations_json,created_at,updated_at FROM seq,personal_finance_entries WHERE id=? AND owner_id=?`, entry.ID, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = store.db.Exec(`WITH RECURSIVE seq(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM seq WHERE x<5000) INSERT INTO personal_finance_expenses(id,owner_id,bucket_id,bucket_name,date,amount_minor,payee,note,created_at,updated_at) SELECT 'historical-expense-'||x,owner_id,bucket_id,bucket_name,'2026-09-12',amount_minor,payee,note,created_at,updated_at FROM seq,personal_finance_expenses WHERE id=? AND owner_id=?`, expense.ID, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	report := financeReadOverview(t, client, base, "2026-09-13", "2026-09-13")
	got := financeFindBalance(t, report, bucket.ID)
	if got.AllocatedMinor != 500100 || got.SpentMinor != 50010 || got.OpeningMinor != 450090 || len(report.Expenses)+len(report.Entries) != 0 {
		t.Fatalf("history clipped %#v", report)
	}
	requestJSON(t, client, "GET", base+"/api/personal/finance?from=2026-09-12&to=2026-09-12", nil, 422, nil)
	if _, err = store.db.Exec(`UPDATE personal_finance_entries SET date='2026-08-31' WHERE owner_id=?`, user.ID); err != nil {
		t.Fatal(err)
	}
	requestJSON(t, client, "GET", base+"/api/personal/finance?from=2026-09-12&to=2026-09-12", nil, 422, nil)
}

func TestPersonalFinanceExpenseTotalPrecisionGuard(t *testing.T) {
	total := personalFinanceMaxTotalMinor - 1
	if err := financeAddTotal(&total, 1); err != nil || total != personalFinanceMaxTotalMinor {
		t.Fatalf("exact boundary %d %v", total, err)
	}
	for _, amount := range []int64{1, -1, 9223372036854775807} {
		prior := total
		if err := financeAddTotal(&total, amount); err == nil || total != prior {
			t.Fatalf("overflow mutated total %d", amount)
		}
	}
}

func TestPersonalFinanceExpenseMigrationPreservesTransfersAndEnforcesOwner(t *testing.T) {
	store, server, client, user := financeTestServer(t)
	base := server.URL
	bucket := financeCreateBucket(t, client, base, "Свой счёт")
	source := financeCreateSource(t, client, base, "Источник", false, []financeRule{{bucket.ID, 10000}})
	entry := financeCreateEntry(t, client, base, financeInput(source.ID, 10000, 0))
	requestJSON(t, client, "PATCH", base+"/api/personal/finance/entries/"+entry.ID+"/transfers", map[string]any{"bucketId": bucket.ID, "paidMinor": 8000, "expectedRevision": entry.Revision}, 200, &entry)
	var priorAllocations, priorHash string
	if err := store.db.QueryRow(`SELECT allocations_json FROM personal_finance_entries WHERE id=?`, entry.ID).Scan(&priorAllocations); err != nil {
		t.Fatal(err)
	}
	if err := store.db.QueryRow(`SELECT payload_hash FROM personal_finance_requests WHERE entry_id=?`, entry.ID).Scan(&priorHash); err != nil {
		t.Fatal(err)
	}
	// Recreate the exact pre-069 schema state; these two new tables are empty.
	if _, err := store.db.Exec(`DROP TABLE personal_finance_expense_requests; DROP TABLE personal_finance_expenses; DELETE FROM schema_migrations WHERE version='069_personal_finance_expenses.sql'`); err != nil {
		t.Fatal(err)
	}
	if err := store.migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	var afterAllocations, afterHash string
	if err := store.db.QueryRow(`SELECT allocations_json FROM personal_finance_entries WHERE id=?`, entry.ID).Scan(&afterAllocations); err != nil {
		t.Fatal(err)
	}
	if err := store.db.QueryRow(`SELECT payload_hash FROM personal_finance_requests WHERE entry_id=?`, entry.ID).Scan(&afterHash); err != nil {
		t.Fatal(err)
	}
	if priorAllocations != afterAllocations || priorHash != afterHash {
		t.Fatal("expense migration rewrote prior income or receipts")
	}
	report := financeReadOverview(t, client, base, "2026-09-01", "2026-09-30")
	if len(report.Expenses) != 0 || financeFindBalance(t, report, bucket.ID).SpentMinor != 0 || financeFindBalance(t, report, bucket.ID).BalanceMinor != 10000 {
		t.Fatal("historic transfer was guessed as spending")
	}
	partner := testClient(t)
	otherUser := registerVerifiedWithoutFixture(t, partner, base, "migration-expenses@example.test", "expense_migration")
	if _, err := store.db.Exec(`INSERT INTO personal_finance_expenses(id,owner_id,bucket_id,bucket_name,date,amount_minor,created_at,updated_at) VALUES('foreign-bucket',?,?,?,'2026-09-13',1,?,?)`, otherUser.ID, bucket.ID, bucket.Name, nowText(), nowText()); err == nil {
		t.Fatal("database accepted cross-account expense bucket")
	}
	expense := financeCreateExpense(t, client, base, financeExpenseTestInput(bucket, "2026-09-13", 100, "expense-migration-owner"))
	if _, err := store.db.Exec(`INSERT INTO personal_finance_expense_requests(owner_id,request_id,payload_hash,expense_id,created_at) VALUES(?,'foreign-receipt','test',?,?)`, otherUser.ID, expense.ID, nowText()); err == nil {
		t.Fatal("database accepted cross-account expense receipt")
	}
	if _, err := store.db.Exec(`UPDATE personal_finance_expenses SET owner_id=? WHERE id=? AND owner_id=?`, otherUser.ID, expense.ID, user.ID); err == nil {
		t.Fatal("database allowed moving expense to another owner")
	}
}

func TestPersonalFinanceExpenseReadAcrossPeriodForConflictRecovery(t *testing.T) {
	_, server, client, _ := financeTestServer(t)
	base := server.URL
	bucket := financeCreateBucket(t, client, base, "Счёт")
	input := financeExpenseTestInput(bucket, "2026-09-13", 100, "expense-read-conflict")
	expense := financeCreateExpense(t, client, base, input)
	path := base + "/api/personal/finance/expenses/" + expense.ID
	input.ClientRequestID, input.ExpectedRevision, input.Date = "", expense.Revision, "2026-10-01"
	requestJSON(t, client, "PUT", path, input, 200, &expense)
	if report := financeReadOverview(t, client, base, "2026-09-01", "2026-09-30"); len(report.Expenses) != 0 {
		t.Fatal("moved expense remained in original month")
	}
	var fresh financeExpense
	requestJSON(t, client, "GET", path, nil, 200, &fresh)
	if fresh != expense || fresh.Date != "2026-10-01" {
		t.Fatal("read lost latest revision outside current period")
	}
}

func TestPersonalFinanceExpenseSharedSurfacesExcludePrivateSpending(t *testing.T) {
	_, server, client, _ := financeTestServer(t)
	base := server.URL
	bucket := financeCreateBucket(t, client, base, "Личный закрытый счёт")
	expense := financeCreateExpense(t, client, base, financeExpenseTestInput(bucket, "2026-09-13", 1777, "expense-shared-surfaces"))
	partner := testClient(t)
	registerVerifiedWithoutFixture(t, partner, base, "shared-expenses@example.test", "expense_shared")
	var workspace Workspace
	requestJSON(t, client, "POST", base+"/api/workspaces", map[string]any{"name": "Общая команда"}, 201, &workspace)
	requestWorkspaceJSON(t, client, "POST", base+"/api/teams/"+workspace.TeamID+"/members", workspace.ID, map[string]any{"username": "expense_shared", "role": "admin", "projectIds": []string{workspace.ID}}, 200, nil)
	for _, path := range []string{"/api/export", "/api/search?q=expense", "/api/graph", "/api/team/capacity"} {
		var body json.RawMessage
		requestWorkspaceJSON(t, partner, "GET", base+path, workspace.ID, nil, 200, &body)
		for _, private := range []string{expense.ID, bucket.ID, bucket.Name, expense.Note} {
			if strings.Contains(string(body), private) {
				t.Fatalf("private expense leaked in %s", path)
			}
		}
	}
	requestJSON(t, partner, "PATCH", base+"/api/personal/finance/expenses/"+expense.ID+"/void", map[string]any{"expectedRevision": expense.Revision, "voided": true}, 404, nil)
}
