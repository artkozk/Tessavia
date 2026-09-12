package app

import (
	"bytes"
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

func financeTestServer(t *testing.T) (*Store, *httptest.Server, *http.Client, User) {
	t.Helper()
	store, err := OpenStore(filepath.Join(t.TempDir(), "finance.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	t.Cleanup(server.Close)
	client := testClient(t)
	user := registerVerifiedWithoutFixture(t, client, server.URL, "finance@example.test", "finance_owner")
	return store, server, client, user
}
func financeCreateBucket(t *testing.T, client *http.Client, base, name string) financeBucket {
	t.Helper()
	var result financeBucket
	requestJSON(t, client, "POST", base+"/api/personal/finance/buckets", map[string]any{"name": name, "destination": "Свой банк"}, 201, &result)
	return result
}
func financeCreateSource(t *testing.T, client *http.Client, base, name string, workers bool, rules []financeRule) financeSource {
	t.Helper()
	var result financeSource
	requestJSON(t, client, "POST", base+"/api/personal/finance/sources", map[string]any{"name": name, "deductWorkers": workers, "allocations": rules}, 201, &result)
	return result
}
func financeCreateEntry(t *testing.T, client *http.Client, base string, input financeEntryInput) financeEntry {
	t.Helper()
	var result financeEntry
	requestJSON(t, client, "POST", base+"/api/personal/finance/entries", input, 201, &result)
	return result
}
func financeInput(source string, gross, workers int64) financeEntryInput {
	return financeEntryInput{ClientRequestID: "finance-request-001", SourceID: source, ExpectedSourceRevision: 1, Date: "2026-09-12", Payer: "Заказчик", Note: "Частный доход", GrossMinor: gross, WorkerMinor: workers}
}

func TestPersonalFinanceAllocationExactAndBounded(t *testing.T) {
	rules := []financeAllocation{{BucketID: "a", BasisPoints: 2300}, {BucketID: "b", BasisPoints: 3100}, {BucketID: "c", BasisPoints: 1900}, {BucketID: "d", BasisPoints: 1100}, {BucketID: "e", BasisPoints: 900}, {BucketID: "f", BasisPoints: 700}}
	for _, base := range []int64{0, 1, 2, 3, 7, 19, 100, 123457, personalFinanceMaxMinor} {
		a, err := financeAllocate(base, rules)
		if err != nil {
			t.Fatal(err)
		}
		b, err := financeAllocate(base, rules)
		if err != nil || !reflect.DeepEqual(a, b) {
			t.Fatal("allocation unstable")
		}
		var sum int64
		for _, item := range a {
			sum += item.AmountMinor
			floor := base * item.BasisPoints / 10000
			if item.AmountMinor < floor || item.AmountMinor > floor+1 {
				t.Fatalf("bad remainder %#v", item)
			}
		}
		if sum != base {
			t.Fatalf("base=%d allocated=%d", base, sum)
		}
	}
	a, _ := financeAllocate(10000, rules)
	want := []int64{2300, 3100, 1900, 1100, 900, 700}
	for i, v := range a {
		if v.AmountMinor != want[i] {
			t.Fatalf("allocation %d=%d", i, v.AmountMinor)
		}
	}
	for _, base := range []int64{-1, personalFinanceMaxMinor + 1, 9223372036854775807} {
		if _, err := financeAllocate(base, rules); err == nil {
			t.Fatalf("accepted overflowing base %d", base)
		}
	}
	invalid := [][]financeRule{nil, {{BucketID: "x", BasisPoints: 10001}}, {{BucketID: "x", BasisPoints: -1}}, {{BucketID: "x", BasisPoints: 0}}, {{BucketID: "x", BasisPoints: 4000}, {BucketID: "x", BasisPoints: 6000}}, {{BucketID: "x", BasisPoints: 9999}}}
	for _, v := range invalid {
		if financeValidateRules(v) == nil {
			t.Fatalf("accepted %#v", v)
		}
	}
	paid := append([]financeAllocation(nil), rules...)
	paid[0].PaidMinor = 24
	if _, err := financeAllocate(100, paid); err == nil {
		t.Fatal("reduced below marked transfer")
	}
}

func TestPersonalFinanceEmptyWithoutTeamAndPrivateAcrossAccounts(t *testing.T) {
	store, server, owner, user := financeTestServer(t)
	base := server.URL
	var overview financeOverview
	requestWorkspaceJSON(t, owner, "GET", base+"/api/personal/finance?from=2026-09-01&to=2026-09-30", "deleted-or-foreign-workspace", nil, 200, &overview)
	if overview.Currency != "RUB" || len(overview.Buckets) != 0 || len(overview.Sources) != 0 || len(overview.Entries) != 0 {
		t.Fatalf("GET seeded defaults %#v", overview)
	}
	var teams int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM team_members WHERE user_id=?`, user.ID).Scan(&teams); err != nil || teams != 0 {
		t.Fatalf("finance needs team %d %v", teams, err)
	}
	bucket := financeCreateBucket(t, owner, base, "Личные накопления")
	source := financeCreateSource(t, owner, base, "Частный источник", false, []financeRule{{bucket.ID, 10000}})
	entry := financeCreateEntry(t, owner, base, financeInput(source.ID, 10000, 0))
	partner := testClient(t)
	registerVerifiedWithoutFixture(t, partner, base, "partner-finance@example.test", "finance_partner")
	var project Workspace
	requestJSON(t, owner, "POST", base+"/api/workspaces", map[string]any{"name": "Общая команда"}, 201, &project)
	requestWorkspaceJSON(t, owner, "POST", base+"/api/teams/"+project.TeamID+"/members", project.ID, map[string]any{"username": "finance_partner", "role": "admin", "projectIds": []string{project.ID}}, 200, nil)
	requestWorkspaceJSON(t, partner, "GET", base+"/api/personal/finance?from=2026-09-01&to=2026-09-30&ownerId="+fmt.Sprint(user.ID), "foreign-id", nil, 200, &overview)
	if len(overview.Buckets)+len(overview.Sources)+len(overview.Entries) != 0 {
		t.Fatalf("finance leaks %#v", overview)
	}
	for _, path := range []string{"/api/export", "/api/search?q=finance", "/api/graph", "/api/team/capacity", "/api/users/" + fmt.Sprint(user.ID) + "/profile"} {
		var body json.RawMessage
		requestWorkspaceJSON(t, partner, "GET", base+path, project.ID, nil, 200, &body)
		for _, private := range []string{entry.ID, source.ID, bucket.ID, entry.Note, bucket.Name, source.Name} {
			if strings.Contains(string(body), private) {
				t.Fatalf("private finance leaks in %s", path)
			}
		}
	}
	requestJSON(t, partner, "PUT", base+"/api/personal/finance/buckets/"+bucket.ID, map[string]any{"name": "Взлом", "expectedRevision": 1}, 404, nil)
	requestJSON(t, partner, "PUT", base+"/api/personal/finance/sources/"+source.ID, map[string]any{"name": "Взлом", "allocations": source.Allocations, "expectedRevision": 1}, 404, nil)
	in := financeInput(source.ID, 10000, 0)
	in.ClientRequestID = ""
	in.ExpectedRevision = entry.Revision
	requestJSON(t, partner, "PUT", base+"/api/personal/finance/entries/"+entry.ID, in, 404, nil)
	requestJSON(t, partner, "PATCH", base+"/api/personal/finance/entries/"+entry.ID+"/transfers", map[string]any{"bucketId": bucket.ID, "paidMinor": 1, "expectedRevision": 1}, 404, nil)
	requestJSON(t, partner, "PATCH", base+"/api/personal/finance/entries/"+entry.ID+"/void", map[string]any{"voided": true, "expectedRevision": 1}, 404, nil)
	requestJSON(t, partner, "POST", base+"/api/personal/finance/entries", financeInput(source.ID, 10000, 0), 404, nil)
	requestJSON(t, partner, "POST", base+"/api/personal/finance/sources", map[string]any{"name": "Взлом", "allocations": source.Allocations}, 400, nil)
	requestJSON(t, testClient(t), "GET", base+"/api/personal/finance", nil, 401, nil)
	var activity int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM activity WHERE entity_id=?`, entry.ID).Scan(&activity); err != nil || activity != 0 {
		t.Fatalf("finance in shared activity: count=%d err=%v", activity, err)
	}
}

func TestPersonalFinanceSharedBaseSnapshotsAndIdempotency(t *testing.T) {
	_, server, client, _ := financeTestServer(t)
	base := server.URL
	names := []string{"Направление А", "Направление Б", "Направление В", "Направление Г", "Направление Д", "Направление Е"}
	bps := []int64{2300, 3100, 1900, 1100, 900, 700}
	rules := []financeRule{}
	for i, name := range names {
		bucket := financeCreateBucket(t, client, base, name)
		rules = append(rules, financeRule{bucket.ID, bps[i]})
	}
	source := financeCreateSource(t, client, base, "Услуги", true, rules)
	input := financeInput(source.ID, 120000, 20000)
	entry := financeCreateEntry(t, client, base, input)
	if entry.BaseMinor != 100000 || !entry.DeductWorkers || entry.Allocations[5].AmountMinor != 7000 || entry.Allocations[0].AmountMinor != 23000 {
		t.Fatalf("wrong shared basis %#v", entry)
	}
	var repeated financeEntry
	requestJSON(t, client, "POST", base+"/api/personal/finance/entries", input, 200, &repeated)
	if repeated.ID != entry.ID {
		t.Fatal("duplicate income")
	}
	zeroInput := financeInput(source.ID, 100, 100)
	zeroInput.ClientRequestID = "zero-base-request"
	zero := financeCreateEntry(t, client, base, zeroInput)
	if zero.BaseMinor != 0 {
		t.Fatal("worker cost equal to income must give zero base")
	}
	for _, item := range zero.Allocations {
		if item.AmountMinor != 0 {
			t.Fatal("zero base allocated money")
		}
	}
	input.GrossMinor++
	requestJSON(t, client, "POST", base+"/api/personal/finance/entries", input, 409, nil)
	input.GrossMinor--
	requestJSON(t, client, "PUT", base+"/api/personal/finance/sources/"+source.ID, map[string]any{"name": "Новая схема", "deductWorkers": false, "allocations": []financeRule{{rules[1].BucketID, 10000}}, "expectedRevision": 1}, 200, nil)
	requestJSON(t, client, "PUT", base+"/api/personal/finance/buckets/"+rules[5].BucketID, map[string]any{"name": "Переименован", "archived": true, "expectedRevision": 1}, 200, nil)
	input.ClientRequestID = ""
	input.ExpectedRevision = entry.Revision
	input.GrossMinor = 220000
	requestJSON(t, client, "PUT", base+"/api/personal/finance/entries/"+entry.ID, input, 200, &entry)
	if entry.SourceName != "Услуги" || !entry.DeductWorkers || entry.Allocations[5].BucketName != "Направление Е" || entry.Allocations[5].AmountMinor != 14000 || len(entry.Allocations) != 6 {
		t.Fatalf("retroactive rewrite %#v", entry)
	}
	requestJSON(t, client, "PUT", base+"/api/personal/finance/entries/"+entry.ID, input, 409, nil)
	input.ClientRequestID = "finance-request-002"
	input.ExpectedRevision = 0
	requestJSON(t, client, "POST", base+"/api/personal/finance/entries", input, 409, nil)
	input.ExpectedSourceRevision = 2
	requestJSON(t, client, "POST", base+"/api/personal/finance/entries", input, 400, nil)
	input.WorkerMinor = 0
	next := financeCreateEntry(t, client, base, input)
	if next.DeductWorkers || len(next.Allocations) != 1 || next.Allocations[0].AmountMinor != 220000 {
		t.Fatal("new entry ignored new source")
	}
}

func TestPersonalFinanceTransferCorrectionVoidAndSourceChange(t *testing.T) {
	_, server, client, _ := financeTestServer(t)
	base := server.URL
	bucket := financeCreateBucket(t, client, base, "Счёт")
	source := financeCreateSource(t, client, base, "Доход", false, []financeRule{{bucket.ID, 10000}})
	second := financeCreateSource(t, client, base, "Другой", false, []financeRule{{bucket.ID, 10000}})
	input := financeInput(source.ID, 10000, 0)
	entry := financeCreateEntry(t, client, base, input)
	path := base + "/api/personal/finance/entries/" + entry.ID
	requestJSON(t, client, "PATCH", path+"/transfers", map[string]any{"bucketId": bucket.ID, "expectedRevision": entry.Revision}, 400, nil)
	requestJSON(t, client, "PATCH", path+"/transfers", map[string]any{"bucketId": bucket.ID, "paidMinor": 10001, "expectedRevision": entry.Revision}, 400, nil)
	requestJSON(t, client, "PATCH", path+"/transfers", map[string]any{"bucketId": bucket.ID, "paidMinor": 8000, "expectedRevision": entry.Revision}, 200, &entry)
	requestJSON(t, client, "PATCH", path+"/transfers", map[string]any{"bucketId": bucket.ID, "paidMinor": 8000, "expectedRevision": 1}, 409, nil)
	requestJSON(t, client, "PATCH", path+"/void", map[string]any{"voided": true, "expectedRevision": entry.Revision}, 409, nil)
	input.ClientRequestID = ""
	input.ExpectedRevision = entry.Revision
	input.GrossMinor = 7000
	requestJSON(t, client, "PUT", path, input, 409, nil)
	input.GrossMinor = 10000
	input.SourceID = second.ID
	requestJSON(t, client, "PUT", path, input, 409, nil)
	requestJSON(t, client, "PATCH", path+"/transfers", map[string]any{"bucketId": bucket.ID, "paidMinor": 0, "expectedRevision": entry.Revision}, 200, &entry)
	requestJSON(t, client, "PATCH", path+"/void", map[string]any{"voided": true, "expectedRevision": entry.Revision}, 200, &entry)
	if !entry.Voided {
		t.Fatal("not voided")
	}
	input.ExpectedRevision = entry.Revision
	requestJSON(t, client, "PUT", path, input, 409, nil)
	requestJSON(t, client, "PATCH", path+"/transfers", map[string]any{"bucketId": bucket.ID, "paidMinor": 0, "expectedRevision": entry.Revision}, 409, nil)
	var overview financeOverview
	requestJSON(t, client, "GET", base+"/api/personal/finance?from=2026-09-12&to=2026-09-12", nil, 200, &overview)
	if len(overview.Entries) != 1 || !overview.Entries[0].Voided {
		t.Fatal("void loses history")
	}
	requestJSON(t, client, "PATCH", path+"/void", map[string]any{"voided": false, "expectedRevision": entry.Revision}, 200, &entry)
	input.ExpectedRevision = entry.Revision
	requestJSON(t, client, "PUT", path, input, 200, &entry)
	if entry.SourceID != second.ID || entry.Voided {
		t.Fatal("restore/source change failed")
	}
}

func TestPersonalFinanceValidationArchiveAndRange(t *testing.T) {
	_, server, client, _ := financeTestServer(t)
	base := server.URL
	bucket := financeCreateBucket(t, client, base, "Счёт")
	source := financeCreateSource(t, client, base, "Доход", false, []financeRule{{bucket.ID, 10000}})
	for _, in := range []financeEntryInput{financeInput(source.ID, 0, 0), financeInput(source.ID, -1, 0), financeInput(source.ID, personalFinanceMaxMinor+1, 0), financeInput(source.ID, 1, 2), financeInput(source.ID, 100, 1), financeInput(source.ID, 100, -1)} {
		requestJSON(t, client, "POST", base+"/api/personal/finance/entries", in, 400, nil)
	}
	for _, date := range []string{"", "2026-02-29", "2026-9-12", "2026-09-12T00:00:00Z"} {
		in := financeInput(source.ID, 100, 0)
		in.Date = date
		requestJSON(t, client, "POST", base+"/api/personal/finance/entries", in, 400, nil)
	}
	requestJSON(t, client, "POST", base+"/api/personal/finance/entries", map[string]any{"clientRequestId": "fraction-request", "sourceId": source.ID, "date": "2026-09-12", "grossMinor": 1.2, "workerMinor": 0}, 400, nil)
	requestJSON(t, client, "POST", base+"/api/personal/finance/entries", map[string]any{"clientRequestId": "owner-override-key", "sourceId": source.ID, "date": "2026-09-12", "grossMinor": 100, "ownerId": 3}, 400, nil)
	entry := financeCreateEntry(t, client, base, financeInput(source.ID, personalFinanceMaxMinor, 0))
	if entry.Allocations[0].AmountMinor != personalFinanceMaxMinor {
		t.Fatal("maximum lost precision")
	}
	requestJSON(t, client, "PUT", base+"/api/personal/finance/buckets/"+bucket.ID, map[string]any{"name": "Счёт", "expectedRevision": 99}, 409, nil)
	requestJSON(t, client, "PUT", base+"/api/personal/finance/sources/"+source.ID, map[string]any{"name": "Доход", "allocations": source.Allocations, "archived": true, "expectedRevision": 1}, 200, nil)
	in := financeInput(source.ID, 100, 0)
	in.ClientRequestID = "finance-request-002"
	in.ExpectedSourceRevision = 2
	requestJSON(t, client, "POST", base+"/api/personal/finance/entries", in, 400, nil)
	in.ClientRequestID = ""
	in.ExpectedRevision = entry.Revision
	requestJSON(t, client, "PUT", base+"/api/personal/finance/entries/"+entry.ID, in, 200, &entry)
	for _, period := range []string{"from=2026-01-01", "from=2026-02-30&to=2026-03-01", "from=2026-09-20&to=2026-09-01", "from=2024-01-01&to=2025-01-01"} {
		requestJSON(t, client, "GET", base+"/api/personal/finance?"+period, nil, 400, nil)
	}
	requestJSON(t, client, "GET", base+"/api/personal/finance?from=2024-01-01&to=2024-12-31", nil, 200, nil)
	var overview financeOverview
	requestJSON(t, client, "GET", base+"/api/personal/finance?from=2026-09-13&to=2026-09-30", nil, 200, &overview)
	if len(overview.Entries) != 0 || !overview.Sources[0].Archived {
		t.Fatal("range/archive filter wrong")
	}
}

func TestPersonalFinanceExplicitReportLimitAndNoDoubleGetSeeding(t *testing.T) {
	store, server, client, user := financeTestServer(t)
	base := server.URL
	bucket := financeCreateBucket(t, client, base, "Счёт")
	source := financeCreateSource(t, client, base, "Доход", false, []financeRule{{bucket.ID, 10000}})
	entry := financeCreateEntry(t, client, base, financeInput(source.ID, 1, 0))
	tx, err := store.db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	for i := 0; i < personalFinanceMaxEntries; i++ {
		_, err = tx.Exec(`INSERT INTO personal_finance_entries(id,owner_id,source_id,source_name,deduct_workers,date,payer,note,gross_minor,worker_minor,base_minor,allocations_json,revision,voided,created_at,updated_at) SELECT ?,owner_id,source_id,source_name,deduct_workers,date,payer,note,gross_minor,worker_minor,base_minor,allocations_json,revision,voided,created_at,updated_at FROM personal_finance_entries WHERE owner_id=? AND id=?`, fmt.Sprintf("limit-%d", i), user.ID, entry.ID)
		if err != nil {
			t.Fatal(err)
		}
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	var reportError map[string]string
	requestJSON(t, client, "GET", base+"/api/personal/finance?from=2026-09-01&to=2026-09-30", nil, 422, &reportError)
	if !strings.Contains(reportError["error"], "5000") {
		t.Fatalf("silent truncation %#v", reportError)
	}
	var count int
	store.db.QueryRow(`SELECT COUNT(*) FROM personal_finance_entries WHERE owner_id=?`, user.ID).Scan(&count)
	if count != personalFinanceMaxEntries+1 {
		t.Fatalf("mutating GET count=%d", count)
	}
}

func TestPersonalFinanceArchiveBucketThenSourcePreservesHistory(t *testing.T) {
	_, server, client, _ := financeTestServer(t)
	base := server.URL
	bucket := financeCreateBucket(t, client, base, "Старый счёт")
	source := financeCreateSource(t, client, base, "Старый источник", true, []financeRule{{bucket.ID, 10000}})
	input := financeInput(source.ID, 1000, 100)
	entry := financeCreateEntry(t, client, base, input)
	requestJSON(t, client, "PUT", base+"/api/personal/finance/buckets/"+bucket.ID, map[string]any{"name": bucket.Name, "archived": true, "expectedRevision": bucket.Revision}, 200, &bucket)
	var saved financeSource
	requestJSON(t, client, "PUT", base+"/api/personal/finance/sources/"+source.ID, map[string]any{"name": source.Name, "deductWorkers": true, "allocations": source.Allocations, "archived": true, "expectedRevision": source.Revision}, 200, &saved)
	input.ClientRequestID = ""
	input.ExpectedRevision = entry.Revision
	input.GrossMinor = 2000
	requestJSON(t, client, "PUT", base+"/api/personal/finance/entries/"+entry.ID, input, 200, &entry)
	if entry.Allocations[0].AmountMinor != 1900 || entry.Allocations[0].BucketName != bucket.Name || !entry.DeductWorkers {
		t.Fatalf("archival breaks snapshot %#v", entry)
	}
	requestJSON(t, client, "PUT", base+"/api/personal/finance/sources/"+source.ID, map[string]any{"name": source.Name, "deductWorkers": true, "allocations": source.Allocations, "archived": false, "expectedRevision": saved.Revision}, 400, nil)
	requestJSON(t, client, "PUT", base+"/api/personal/finance/buckets/"+bucket.ID, map[string]any{"name": bucket.Name, "archived": false, "expectedRevision": bucket.Revision}, 200, nil)
	requestJSON(t, client, "PUT", base+"/api/personal/finance/sources/"+source.ID, map[string]any{"name": source.Name, "deductWorkers": true, "allocations": source.Allocations, "archived": false, "expectedRevision": saved.Revision}, 200, nil)
}

func TestPersonalFinanceConcurrentCreateAndTransfer(t *testing.T) {
	store, server, client, user := financeTestServer(t)
	base := server.URL
	bucket := financeCreateBucket(t, client, base, "Счёт")
	source := financeCreateSource(t, client, base, "Услуги", false, []financeRule{{bucket.ID, 10000}})
	payload, _ := json.Marshal(financeInput(source.ID, 10000, 0))
	type response struct {
		status int
		body   []byte
		err    error
	}
	results := make(chan response, 12)
	var wg sync.WaitGroup
	call := func(method, path string, body []byte) {
		defer wg.Done()
		request, err := http.NewRequest(method, path, bytes.NewReader(body))
		if err != nil {
			results <- response{err: err}
			return
		}
		request.Header.Set("Content-Type", "application/json")
		res, err := client.Do(request)
		if err != nil {
			results <- response{err: err}
			return
		}
		defer res.Body.Close()
		data, err := io.ReadAll(res.Body)
		results <- response{res.StatusCode, data, err}
	}
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go call("POST", base+"/api/personal/finance/entries", payload)
	}
	wg.Wait()
	created := 0
	var entry financeEntry
	for i := 0; i < 12; i++ {
		res := <-results
		if res.err != nil || (res.status != 200 && res.status != 201) {
			t.Fatalf("concurrent create: %d %s %v", res.status, res.body, res.err)
		}
		if res.status == 201 {
			created++
		}
		var value financeEntry
		if err := json.Unmarshal(res.body, &value); err != nil {
			t.Fatal(err)
		}
		if entry.ID != "" && entry.ID != value.ID {
			t.Fatal("idempotency created several IDs")
		}
		entry = value
	}
	if created != 1 {
		t.Fatalf("created=%d", created)
	}
	var entries, receipts int
	store.db.QueryRow(`SELECT COUNT(*) FROM personal_finance_entries WHERE owner_id=?`, user.ID).Scan(&entries)
	store.db.QueryRow(`SELECT COUNT(*) FROM personal_finance_requests WHERE owner_id=?`, user.ID).Scan(&receipts)
	if entries != 1 || receipts != 1 {
		t.Fatalf("entries=%d receipts=%d", entries, receipts)
	}
	for _, paid := range []int64{100, 200} {
		body, _ := json.Marshal(map[string]any{"bucketId": bucket.ID, "paidMinor": paid, "expectedRevision": entry.Revision})
		wg.Add(1)
		go call("PATCH", base+"/api/personal/finance/entries/"+entry.ID+"/transfers", body)
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
		t.Fatalf("lost update statuses=%v", statuses)
	}
}

func TestPersonalFinanceDateBoundsMatchReportNavigation(t *testing.T) {
	store, server, client, user := financeTestServer(t)
	base := server.URL
	bucket := financeCreateBucket(t, client, base, "Счёт")
	source := financeCreateSource(t, client, base, "Доход", false, []financeRule{{bucket.ID, 10000}})
	for _, date := range []string{"0000-01-01", "1899-12-31", "9999-01-01", "9999-12-31"} {
		input := financeInput(source.ID, 100, 0)
		input.Date = date
		input.ClientRequestID = "invalid-date-" + date
		requestJSON(t, client, "POST", base+"/api/personal/finance/entries", input, 400, nil)
		requestJSON(t, client, "GET", base+"/api/personal/finance?from="+date+"&to="+date, nil, 400, nil)
	}
	for _, table := range []string{"personal_finance_entries", "personal_finance_requests"} {
		var count int
		if err := store.db.QueryRow(`SELECT COUNT(*) FROM `+table+` WHERE owner_id=?`, user.ID).Scan(&count); err != nil || count != 0 {
			t.Fatalf("invalid date wrote %s count=%d err=%v", table, count, err)
		}
	}
	for _, date := range []string{"1900-01-01", "9998-12-31"} {
		input := financeInput(source.ID, 100, 0)
		input.Date = date
		input.ClientRequestID = "valid-date-" + date
		entry := financeCreateEntry(t, client, base, input)
		var report financeOverview
		requestJSON(t, client, "GET", base+"/api/personal/finance?from="+date+"&to="+date, nil, 200, &report)
		if len(report.Entries) != 1 || report.Entries[0].ID != entry.ID || report.Entries[0].Date != date {
			t.Fatalf("boundary not reportable %#v", report)
		}
		input.ClientRequestID = ""
		input.ExpectedRevision = entry.Revision
		for _, invalid := range []string{"1899-12-31", "9999-01-01"} {
			input.Date = invalid
			requestJSON(t, client, "PUT", base+"/api/personal/finance/entries/"+entry.ID, input, 400, nil)
		}
		requestJSON(t, client, "GET", base+"/api/personal/finance?from="+date+"&to="+date, nil, 200, &report)
		if len(report.Entries) != 1 || report.Entries[0].Revision != entry.Revision || report.Entries[0].Date != date {
			t.Fatal("rejected date edit changed persisted income")
		}
	}
}
