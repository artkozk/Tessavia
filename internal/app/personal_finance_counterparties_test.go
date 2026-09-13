package app

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
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

func financeCreateCounterparty(t *testing.T, client *http.Client, base, name, note string) financeCounterparty {
	t.Helper()
	var value financeCounterparty
	requestJSON(t, client, "POST", base+"/api/personal/finance/counterparties", map[string]any{"name": name, "note": note}, 201, &value)
	return value
}
func financeSelectedPayer(input financeEntryInput, payer financeCounterparty) financeEntryInput {
	input.PayerID = &payer.ID
	input.ExpectedPayerRevision = payer.Revision
	return input
}

func TestPersonalFinanceCounterpartyPrivacyAndOwnerReferences(t *testing.T) {
	store, server, client, user := financeTestServer(t)
	base := server.URL
	bucket := financeCreateBucket(t, client, base, "Направление")
	source := financeCreateSource(t, client, base, "Услуги", false, []financeRule{{bucket.ID, 10000}})
	payer := financeCreateCounterparty(t, client, base, "Закрытый плательщик", "Приватная пометка о сотрудничестве")
	input := financeSelectedPayer(financeInput(source.ID, 10003, 0), payer)
	input.Payer = "Недоверенная подпись клиента"
	entry := financeCreateEntry(t, client, base, input)
	if entry.PayerID != payer.ID || entry.Payer != payer.Name || entry.Allocations[0].AmountMinor != 10003 {
		t.Fatalf("payer selection changed data %#v", entry)
	}
	partner := testClient(t)
	registerVerifiedWithoutFixture(t, partner, base, "counterparty-partner@example.test", "counterparty_partner")
	var project Workspace
	requestJSON(t, client, "POST", base+"/api/workspaces", map[string]any{"name": "Синтетическая команда"}, 201, &project)
	requestWorkspaceJSON(t, client, "POST", base+"/api/teams/"+project.TeamID+"/members", project.ID, map[string]any{"username": "counterparty_partner", "role": "admin", "projectIds": []string{project.ID}}, 200, nil)
	var overview financeOverview
	requestWorkspaceJSON(t, partner, "GET", base+"/api/personal/finance?from=2026-09-01&to=2026-09-30", "unavailable-or-foreign-workspace", nil, 200, &overview)
	if len(overview.Counterparties) != 0 || len(overview.Entries) != 0 {
		t.Fatal("private counterparties leaked to team administrator")
	}
	requestJSON(t, partner, "PUT", base+"/api/personal/finance/counterparties/"+payer.ID, map[string]any{"name": "Изменение", "note": "Чужое", "expectedRevision": payer.Revision}, 404, nil)
	requestJSON(t, partner, "PUT", base+"/api/personal/finance/counterparties/missing", map[string]any{"name": "Изменение", "expectedRevision": 1}, 404, nil)
	otherPayer := financeCreateCounterparty(t, partner, base, "Другой плательщик", "Не передавать команде")
	foreign := financeSelectedPayer(financeInput(source.ID, 10003, 0), otherPayer)
	foreign.ClientRequestID = "foreign-payer-request"
	requestJSON(t, client, "POST", base+"/api/personal/finance/entries", foreign, 404, nil)
	foreign.ClientRequestID = ""
	foreign.ExpectedRevision = entry.Revision
	requestJSON(t, client, "PUT", base+"/api/personal/finance/entries/"+entry.ID, foreign, 404, nil)
	for _, path := range []string{"/api/export", "/api/search?q=counterparty", "/api/graph", "/api/team/capacity", "/api/users/" + fmt.Sprint(user.ID) + "/profile"} {
		var body json.RawMessage
		requestWorkspaceJSON(t, partner, "GET", base+path, project.ID, nil, 200, &body)
		for _, private := range []string{payer.ID, payer.Name, payer.Note, entry.ID} {
			if strings.Contains(string(body), private) {
				t.Fatalf("counterparty leaks through %s", path)
			}
		}
	}
	if _, err := store.db.Exec(`UPDATE personal_finance_entries SET payer_id=? WHERE owner_id=? AND id=?`, otherPayer.ID, user.ID, entry.ID); err == nil {
		t.Fatal("database permits foreign owner payer reference")
	}
	if _, err := store.db.Exec(`INSERT INTO personal_finance_entries(id,owner_id,source_id,source_name,deduct_workers,date,payer,note,gross_minor,worker_minor,base_minor,allocations_json,revision,voided,created_at,updated_at,payer_id) SELECT 'foreign-insert',owner_id,source_id,source_name,deduct_workers,date,payer,note,gross_minor,worker_minor,base_minor,allocations_json,revision,voided,created_at,updated_at,? FROM personal_finance_entries WHERE owner_id=? AND id=?`, otherPayer.ID, user.ID, entry.ID); err == nil {
		t.Fatal("database permits cross-owner insert")
	}
	requestJSON(t, testClient(t), "POST", base+"/api/personal/finance/counterparties", map[string]any{"name": "Имя"}, 401, nil)
	requestJSON(t, client, "DELETE", base+"/api/personal/finance/counterparties/"+payer.ID, nil, 405, nil)
}

func TestPersonalFinanceCounterpartySnapshotsArchiveAndLegacyEdit(t *testing.T) {
	_, server, client, _ := financeTestServer(t)
	base := server.URL
	bucket := financeCreateBucket(t, client, base, "Направление")
	source := financeCreateSource(t, client, base, "Услуги", false, []financeRule{{bucket.ID, 10000}})
	payer := financeCreateCounterparty(t, client, base, "Имя в момент поступления", "Первая пометка")
	input := financeSelectedPayer(financeInput(source.ID, 10003, 0), payer)
	entry := financeCreateEntry(t, client, base, input)
	initialAllocations := entry.Allocations
	var repeated financeEntry
	requestJSON(t, client, "POST", base+"/api/personal/finance/entries", input, 200, &repeated)
	if repeated.ID != entry.ID {
		t.Fatal("linked income duplicated")
	}
	input.PayerID = nil
	requestJSON(t, client, "POST", base+"/api/personal/finance/entries", input, 409, nil)
	input.PayerID = &payer.ID
	requestJSON(t, client, "PUT", base+"/api/personal/finance/counterparties/"+payer.ID, map[string]any{"name": "Новое имя", "note": "Новая пометка", "expectedRevision": payer.Revision}, 200, &payer)
	stale := input
	stale.ClientRequestID = "stale-payer-request"
	requestJSON(t, client, "POST", base+"/api/personal/finance/entries", stale, 409, nil)
	stale.ExpectedPayerRevision = payer.Revision
	fresh := financeCreateEntry(t, client, base, stale)
	if fresh.Payer != payer.Name {
		t.Fatal("new income did not snapshot new name")
	}
	requestJSON(t, client, "PUT", base+"/api/personal/finance/counterparties/"+payer.ID, map[string]any{"name": payer.Name, "note": payer.Note, "archived": true, "expectedRevision": payer.Revision}, 200, &payer)
	archived := financeSelectedPayer(financeInput(source.ID, 10003, 0), payer)
	archived.ClientRequestID = "archived-payer-request"
	requestJSON(t, client, "POST", base+"/api/personal/finance/entries", archived, 400, nil)
	input.ClientRequestID = ""
	input.ExpectedRevision = entry.Revision
	input.Note = "Пометка о самом доходе"
	input.Payer = "Не переписывать историческое имя"
	input.ExpectedPayerRevision = 0
	requestJSON(t, client, "PUT", base+"/api/personal/finance/entries/"+entry.ID, input, 200, &entry)
	if entry.Payer != "Имя в момент поступления" || entry.PayerID != payer.ID || !reflect.DeepEqual(entry.Allocations, initialAllocations) {
		t.Fatalf("historical snapshot changed %#v", entry)
	}
	input.PayerID = nil
	input.ExpectedRevision = entry.Revision
	input.Payer = "Старый клиент прислал свой текст"
	requestJSON(t, client, "PUT", base+"/api/personal/finance/entries/"+entry.ID, input, 200, &entry)
	if entry.PayerID != payer.ID || entry.Payer != "Имя в момент поступления" {
		t.Fatal("old client silently unlinked historical payer")
	}
	unlinked := ""
	input.PayerID = &unlinked
	input.ExpectedRevision = entry.Revision
	input.Payer = "Свободное имя"
	requestJSON(t, client, "PUT", base+"/api/personal/finance/entries/"+entry.ID, input, 200, &entry)
	if entry.PayerID != "" || entry.Payer != "Свободное имя" {
		t.Fatal("explicit unlink failed")
	}
	requestJSON(t, client, "PUT", base+"/api/personal/finance/counterparties/"+payer.ID, map[string]any{"name": payer.Name, "note": payer.Note, "archived": false, "expectedRevision": payer.Revision}, 200, &payer)
	input = financeSelectedPayer(input, payer)
	input.ExpectedRevision = entry.Revision
	requestJSON(t, client, "PUT", base+"/api/personal/finance/entries/"+entry.ID, input, 200, &entry)
	if entry.PayerID != payer.ID || entry.Payer != payer.Name {
		t.Fatal("relink to restored payer failed")
	}
}

func TestPersonalFinanceCounterpartyValidationDuplicateNamesAndNoAutoLink(t *testing.T) {
	_, server, client, _ := financeTestServer(t)
	base := server.URL
	for _, input := range []map[string]any{{"name": " "}, {"name": strings.Repeat("Я", 161)}, {"name": "Имя", "note": strings.Repeat("Я", 2001)}, {"name": "Имя", "ownerId": 1}, {"name": "Имя", "kind": "company"}} {
		requestJSON(t, client, "POST", base+"/api/personal/finance/counterparties", input, 400, nil)
	}
	first := financeCreateCounterparty(t, client, base, "Одинаковое имя", "Первая запись")
	second := financeCreateCounterparty(t, client, base, "Одинаковое имя", "Вторая запись")
	if first.ID == second.ID {
		t.Fatal("distinct counterparties merged by name")
	}
	bucket := financeCreateBucket(t, client, base, "Направление")
	source := financeCreateSource(t, client, base, "Услуги", false, []financeRule{{bucket.ID, 10000}})
	input := financeInput(source.ID, 101, 0)
	input.Payer = first.Name
	legacy := financeCreateEntry(t, client, base, input)
	if legacy.PayerID != "" || legacy.Payer != first.Name {
		t.Fatal("free text linked automatically")
	}
	input.ClientRequestID = "first-linked-income"
	input = financeSelectedPayer(input, first)
	linked := financeCreateEntry(t, client, base, input)
	input.ClientRequestID = "second-linked-income"
	input = financeSelectedPayer(input, second)
	linkedSecond := financeCreateEntry(t, client, base, input)
	var overview financeOverview
	requestJSON(t, client, "GET", base+"/api/personal/finance?from=2026-09-01&to=2026-09-30", nil, 200, &overview)
	if len(overview.Counterparties) != 2 || len(overview.Entries) != 3 || linked.PayerID == linkedSecond.PayerID {
		t.Fatalf("report identities lost %#v", overview)
	}
	input.ClientRequestID = "missing-payer-revision"
	input.ExpectedPayerRevision = 0
	requestJSON(t, client, "POST", base+"/api/personal/finance/entries", input, 409, nil)
	requestJSON(t, client, "PUT", base+"/api/personal/finance/counterparties/"+first.ID, map[string]any{"name": first.Name, "expectedRevision": 999}, 409, nil)
}

func TestPersonalFinanceCounterpartyConcurrentRevision(t *testing.T) {
	_, server, client, _ := financeTestServer(t)
	payer := financeCreateCounterparty(t, client, server.URL, "Исходное имя", "Исходная пометка")
	type response struct {
		status int
		body   []byte
		err    error
	}
	results := make(chan response, 8)
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			body, _ := json.Marshal(map[string]any{"name": fmt.Sprintf("Редактор %d", index), "note": fmt.Sprintf("Правка %d", index), "expectedRevision": payer.Revision})
			request, err := http.NewRequest("PUT", server.URL+"/api/personal/finance/counterparties/"+payer.ID, bytes.NewReader(body))
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
		}(i)
	}
	wg.Wait()
	success, conflicts := 0, 0
	for i := 0; i < 8; i++ {
		res := <-results
		if res.err != nil {
			t.Fatal(res.err)
		}
		switch res.status {
		case 200:
			success++
			var updated financeCounterparty
			if err := json.Unmarshal(res.body, &updated); err != nil {
				t.Fatal(err)
			}
			if updated.Revision != 2 {
				t.Fatal("incorrect counterparty revision")
			}
		case 409:
			conflicts++
		default:
			t.Fatalf("unexpected mutation %d %s", res.status, res.body)
		}
	}
	if success != 1 || conflicts != 7 {
		t.Fatalf("lost updates: success=%d conflict=%d", success, conflicts)
	}
}

func TestPersonalFinanceCounterpartyMigrationKeepsOldDataAndRequestHashes(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "before067.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	if _, err = db.Exec(`PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,applied_at TEXT NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	files, err := migrationFiles.ReadDir("migrations")
	if err != nil {
		t.Fatal(err)
	}
	for _, file := range files {
		if file.IsDir() || !strings.HasSuffix(file.Name(), ".sql") || file.Name() >= "067" {
			continue
		}
		body, err := migrationFiles.ReadFile("migrations/" + file.Name())
		if err != nil {
			t.Fatal(err)
		}
		if _, err = db.Exec(string(body)); err != nil {
			t.Fatalf("apply %s: %v", file.Name(), err)
		}
		if _, err = db.Exec(`INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)`, file.Name(), nowText()); err != nil {
			t.Fatal(err)
		}
	}
	store := &Store{db: db}
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	defer server.Close()
	client := testClient(t)
	user := registerVerifiedWithoutFixture(t, client, server.URL, "legacy-payer@example.test", "legacy_payer")
	bucket := financeCreateBucket(t, client, server.URL, "Направление")
	source := financeCreateSource(t, client, server.URL, "Услуги", false, []financeRule{{bucket.ID, 10000}})
	allocations, _ := json.Marshal([]financeAllocation{{BucketID: bucket.ID, BucketName: bucket.Name, BasisPoints: 10000, AmountMinor: 10003}})
	now := nowText()
	_, err = db.Exec(`INSERT INTO personal_finance_entries(id,owner_id,source_id,source_name,deduct_workers,date,payer,note,gross_minor,worker_minor,base_minor,allocations_json,revision,voided,created_at,updated_at) VALUES('legacy-income',?,?,?,0,'2026-09-12','Заказчик','Частный доход',10003,0,10003,?,1,0,?,?)`, user.ID, source.ID, source.Name, string(allocations), now, now)
	if err != nil {
		t.Fatal(err)
	}
	// The exact pre-067 canonical field order; new optional fields must not
	// invalidate a receipt created by the released client/server version.
	legacyPayload := fmt.Sprintf(`{"sourceId":%q,"expectedSourceRevision":1,"date":"2026-09-12","payer":"Заказчик","note":"Частный доход","grossMinor":10003,"workerMinor":0}`, source.ID)
	hash := sha256.Sum256([]byte(legacyPayload))
	_, err = db.Exec(`INSERT INTO personal_finance_requests(owner_id,request_id,payload_hash,entry_id,created_at) VALUES(?,?,?,?,?)`, user.ID, "finance-request-001", hex.EncodeToString(hash[:]), "legacy-income", now)
	if err != nil {
		t.Fatal(err)
	}
	before, err := exportRows(t.Context(), db, `SELECT * FROM personal_finance_entries`, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err = store.migrate(t.Context()); err != nil {
		t.Fatal(err)
	}
	after, err := exportRows(t.Context(), db, `SELECT id,owner_id,source_id,source_name,deduct_workers,date,payer,note,gross_minor,worker_minor,base_minor,allocations_json,revision,voided,created_at,updated_at FROM personal_finance_entries`, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(before, after) {
		t.Fatal("migration rewrote existing income")
	}
	var linked, contacts int
	db.QueryRow(`SELECT COUNT(*) FROM personal_finance_entries WHERE payer_id IS NOT NULL`).Scan(&linked)
	db.QueryRow(`SELECT COUNT(*) FROM personal_finance_counterparties`).Scan(&contacts)
	if linked != 0 || contacts != 0 {
		t.Fatal("migration generated or linked counterparties")
	}
	var repeated financeEntry
	requestJSON(t, client, "POST", server.URL+"/api/personal/finance/entries", financeInput(source.ID, 10003, 0), 200, &repeated)
	if repeated.ID != "legacy-income" || repeated.PayerID != "" || repeated.Payer != "Заказчик" {
		t.Fatalf("legacy request changed result %#v", repeated)
	}
	var overview financeOverview
	requestJSON(t, client, "GET", server.URL+"/api/personal/finance?from=2026-09-01&to=2026-09-30", nil, 200, &overview)
	if len(overview.Counterparties) != 0 || len(overview.Entries) != 1 {
		t.Fatal("GET silently linked old data")
	}
}
