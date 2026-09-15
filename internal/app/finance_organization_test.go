package app

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func financeTestPersonalTarget(t *testing.T, store *Store, owner int64, kind, id, title string) financeLinkInput {
	t.Helper()
	var err error
	if kind == "personal_goal" {
		_, err = store.db.Exec(`INSERT INTO personal_goals(id,owner_id,title,start_date,end_date,created_at,updated_at) VALUES(?,?,?,'2026-09-01','2026-12-31',?,?)`, id, owner, title, nowText(), nowText())
	} else {
		_, err = store.db.Exec(`INSERT INTO personal_plans(id,owner_id,title,notes,status,created_at,updated_at) VALUES(?,?,?,'','planned',?,?)`, id, owner, title, nowText(), nowText())
	}
	if err != nil {
		t.Fatal(err)
	}
	return financeLinkInput{kind, id}
}
func financeCreateCategory(t *testing.T, client *http.Client, base, name string) financeCategory {
	t.Helper()
	var value financeCategory
	requestJSON(t, client, "POST", base+"/api/personal/finance/categories", map[string]any{"name": name}, 201, &value)
	return value
}
func TestFinanceOrganizationPersonalGroupingPreservesAmountsAndOptionalEdits(t *testing.T) {
	store, server, client, user := financeTestServer(t)
	bucket := financeCreateBucket(t, client, server.URL, "Available money")
	source := financeCreateSource(t, client, server.URL, "Income", false, []financeRule{{bucket.ID, 10000}})
	category := financeCreateCategory(t, client, server.URL, "Разработка логотипа")
	goal := financeTestPersonalTarget(t, store, user.ID, "personal_goal", "my-goal", "Моя цель")
	links := []financeLinkInput{goal}
	input := financeInput(source.ID, 10000, 0)
	input.CategoryID, input.ExpectedCategoryRevision, input.Links = &category.ID, category.Revision, &links
	entry := financeCreateEntry(t, client, server.URL, input)
	if entry.CategoryID != category.ID || entry.CategoryName != category.Name || len(entry.Links) != 1 || entry.Links[0].Title != "Моя цель" {
		t.Fatalf("missing organization %#v", entry)
	}
	expenseInput := financeExpenseTestInput(bucket, "2026-09-15", 1200, "org-expense-001")
	expenseInput.CategoryID, expenseInput.ExpectedCategoryRevision, expenseInput.Links = &category.ID, category.Revision, &links
	expense := financeCreateExpense(t, client, server.URL, expenseInput)
	before := financeReadOverview(t, client, server.URL, "2026-09-01", "2026-09-30")
	if len(before.Categories) != 1 || before.Balances[0].BalanceMinor != 8800 || before.Expenses[0].CategoryID != category.ID || len(before.Entries[0].Links) != 1 {
		t.Fatalf("bad report %#v", before)
	}
	requestJSON(t, client, "PUT", server.URL+"/api/personal/finance/categories/"+category.ID, map[string]any{"name": "Дизайн", "archived": true, "expectedRevision": 1}, 200, &category)
	// An old editor omitting the newly introduced fields preserves metadata.
	edit := financeInput(source.ID, 10000, 0)
	edit.ClientRequestID = ""
	edit.ExpectedRevision = entry.Revision
	requestJSON(t, client, "PUT", server.URL+"/api/personal/finance/entries/"+entry.ID, edit, 200, &entry)
	if entry.CategoryID != category.ID || entry.CategoryName != "Дизайн" || len(entry.Links) != 1 {
		t.Fatal("legacy edit lost grouping")
	}
	// Keeping a selected archived group remains valid, new attachment does not.
	edit.ExpectedRevision = entry.Revision
	edit.CategoryID = &category.ID
	edit.Links = &links
	requestJSON(t, client, "PUT", server.URL+"/api/personal/finance/entries/"+entry.ID, edit, 200, &entry)
	create := financeInput(source.ID, 100, 0)
	create.ClientRequestID = "new-archived-group"
	create.CategoryID = &category.ID
	create.ExpectedCategoryRevision = category.Revision
	requestJSON(t, client, "POST", server.URL+"/api/personal/finance/entries", create, 400, nil)
	// Explicit removal affects only organization, never balances or allocations.
	empty := ""
	none := []financeLinkInput{}
	edit.ExpectedRevision = entry.Revision
	edit.CategoryID = &empty
	edit.Links = &none
	entryID := entry.ID
	// Empty optional response fields are omitted; decode into a fresh value as
	// fetch().json() does instead of retaining the preceding Go struct's fields.
	entry = financeEntry{}
	requestJSON(t, client, "PUT", server.URL+"/api/personal/finance/entries/"+entryID, edit, 200, &entry)
	if entry.CategoryID != "" || len(entry.Links) != 0 {
		t.Fatal("explicit removal ignored")
	}
	var latest financeExpense
	requestJSON(t, client, "GET", server.URL+"/api/personal/finance/expenses/"+expense.ID, nil, 200, &latest)
	if latest.CategoryID != category.ID || len(latest.Links) != 1 || latest.AmountMinor != 1200 {
		t.Fatal("income grouping altered another expense")
	}
	after := financeReadOverview(t, client, server.URL, "2026-09-01", "2026-09-30")
	if !reflect.DeepEqual(before.Balances, after.Balances) || !reflect.DeepEqual(before.Entries[0].Allocations, after.Entries[0].Allocations) {
		t.Fatal("grouping changed amounts")
	}
}

func TestFinanceOrganizationPrivateLinksRedactMovedOwnersAndKeepOldReferences(t *testing.T) {
	store, server, client, user := financeTestServer(t)
	other := testClient(t)
	foreign := registerVerifiedWithoutFixture(t, other, server.URL, "org-foreign@example.test", "org_foreign")
	bucket := financeCreateBucket(t, client, server.URL, "Own")
	source := financeCreateSource(t, client, server.URL, "Own", false, []financeRule{{bucket.ID, 10000}})
	goal := financeTestPersonalTarget(t, store, user.ID, "personal_goal", "own-linked-goal", "Private original title")
	foreignGoal := financeTestPersonalTarget(t, store, foreign.ID, "personal_goal", "foreign-goal", "Never disclose foreign title")
	plan := financeTestPersonalTarget(t, store, user.ID, "personal_plan", "own-linked-plan", "СОЗДАТЬ логотип")
	links := []financeLinkInput{goal, plan}
	input := financeExpenseTestInput(bucket, "2026-09-15", 400, "private-org-expense")
	input.Links = &links
	expense := financeCreateExpense(t, client, server.URL, input)
	if _, err := store.db.Exec(`UPDATE personal_goals SET owner_id=?,title='Renamed private foreign title' WHERE id=?`, foreign.ID, goal.ID); err != nil {
		t.Fatal(err)
	}
	var fresh financeExpense
	requestJSON(t, client, "GET", server.URL+"/api/personal/finance/expenses/"+expense.ID, nil, 200, &fresh)
	if fresh.Links[0].Available || fresh.Links[0].Title != "Связь недоступна" || fresh.Links[0].WorkspaceID != "" {
		t.Fatalf("old title leaked %#v", fresh.Links[0])
	}
	input.ClientRequestID = ""
	input.ExpectedRevision = fresh.Revision
	input.Note = "Unrelated change"
	requestJSON(t, client, "PUT", server.URL+"/api/personal/finance/expenses/"+expense.ID, input, 200, &fresh)
	if fresh.Links[0].Available || len(fresh.Links) != 2 {
		t.Fatal("preservation resurrected revoked target")
	}
	for _, refs := range [][]financeLinkInput{{foreignGoal}, {goal}, {{Kind: "record", ID: "team-record"}}, {{Kind: "personal_goal", ID: ""}}, {plan, plan}} {
		create := financeInput(source.ID, 100, 0)
		create.ClientRequestID = "invalid-refs-" + fmt.Sprint(len(refs))
		create.Links = &refs
		requestJSON(t, client, "POST", server.URL+"/api/personal/finance/entries", create, 400, nil)
	}
	tooMany := make([]financeLinkInput, 11)
	input.Links = &tooMany
	input.ExpectedRevision = fresh.Revision
	requestJSON(t, client, "PUT", server.URL+"/api/personal/finance/expenses/"+expense.ID, input, 400, nil)
	var choices struct {
		Items   []financeLink `json:"items"`
		HasMore bool          `json:"hasMore"`
	}
	requestJSON(t, client, "GET", server.URL+"/api/personal/finance/link-targets?q="+url.QueryEscape("создать")+"&kind=personal_plan&limit=1", nil, 200, &choices)
	if len(choices.Items) != 1 || choices.Items[0].ID != plan.ID {
		t.Fatalf("Russian search broken %#v", choices)
	}
	requestJSON(t, client, "GET", server.URL+"/api/personal/finance/link-targets", nil, 200, &choices)
	for _, item := range choices.Items {
		if item.ID == goal.ID || item.ID == foreignGoal.ID {
			t.Fatal("foreign target appears in options")
		}
	}
	if _, err := store.db.Exec(`UPDATE personal_plans SET status='archived' WHERE id=?`, plan.ID); err != nil {
		t.Fatal(err)
	}
	// Existing history stays understandable when its target is archived. A new
	// operation cannot attach that archived target, even for the same owner.
	input.Links = &links
	input.ExpectedRevision = fresh.Revision
	fresh = financeExpense{}
	requestJSON(t, client, "PUT", server.URL+"/api/personal/finance/expenses/"+expense.ID, input, 200, &fresh)
	if !fresh.Links[1].Available || !fresh.Links[1].Archived || fresh.Links[1].Title != "СОЗДАТЬ логотип" {
		t.Fatal("archiving destroyed existing reference history")
	}
	newInput := financeInput(source.ID, 100, 0)
	newInput.ClientRequestID = "new-archived-reference"
	archivedLinks := []financeLinkInput{plan}
	newInput.Links = &archivedLinks
	requestJSON(t, client, "POST", server.URL+"/api/personal/finance/entries", newInput, 400, nil)
	choices.Items = nil
	requestJSON(t, client, "GET", server.URL+"/api/personal/finance/link-targets", nil, 200, &choices)
	if len(choices.Items) != 0 {
		t.Fatal("archived targets remain in new-link choices")
	}
}

func financeTestRecord(t *testing.T, store *Store, workspace string, owner int64, id, title, kind string) financeLinkInput {
	t.Helper()
	_, err := store.db.Exec(`INSERT INTO records(id,type,title,description,status,priority,owner_id,author_id,edit_policy,created_at,updated_at,workspace_id) VALUES(?,?,?,'','planned','normal',?,?,'shared',?,?,?)`, id, kind, title, owner, owner, nowText(), nowText(), workspace)
	if err != nil {
		t.Fatal(err)
	}
	return financeLinkInput{Kind: "record", ID: id}
}
func TestFinanceOrganizationTeamCategoriesReferencesAndReadOnlyConnection(t *testing.T) {
	store, server, owner, user := financeTestServer(t)
	a := workspaceFinanceProject(t, owner, server.URL, "Source team")
	b := workspaceFinanceProject(t, owner, server.URL, "Viewing team")
	bucket, _, entry, _ := workspaceFinanceFixture(t, owner, server.URL, a.ID)
	member := testClient(t)
	registerVerifiedWithoutFixture(t, member, server.URL, "org-member@example.test", "org_member")
	workspaceFinanceMember(t, owner, server.URL, a, "org_member", "member")
	workspaceFinanceMember(t, owner, server.URL, b, "org_member", "member")
	var category financeCategory
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/categories", a.ID, a.ID, "0", map[string]any{"name": "Разработка"}, 201, &category)
	workspaceFinanceRequest(t, member, "POST", server.URL, "/categories", a.ID, a.ID, "0", map[string]any{"name": "Forbidden"}, 403, nil)
	workspaceFinanceRequest(t, owner, "PUT", server.URL, "/categories/"+category.ID, b.ID, b.ID, "0", map[string]any{"name": "Foreign", "expectedRevision": 1}, 404, nil)
	goal := financeTestRecord(t, store, a.ID, user.ID, "team-linked-goal", "Цель: логотип", "goal")
	foreign := financeTestRecord(t, store, b.ID, user.ID, "other-team-task", "Other private team task", "task")
	links := []financeLinkInput{goal}
	input := financeExpenseTestInput(bucket, "2026-09-15", 2500, "team-organized-expense")
	input.CategoryID, input.ExpectedCategoryRevision, input.Links = &category.ID, category.Revision, &links
	var expense financeExpense
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/expenses", a.ID, a.ID, "0", input, 201, &expense)
	bad := input
	bad.ClientRequestID = "foreign-team-record"
	badRefs := []financeLinkInput{foreign}
	bad.Links = &badRefs
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/expenses", a.ID, a.ID, "0", bad, 400, nil)
	var targets struct {
		Items []financeLink `json:"items"`
	}
	workspaceFinanceRequest(t, member, "GET", server.URL, "/link-targets?kind=record", a.ID, a.ID, "0", nil, 200, &targets)
	if len(targets.Items) != 1 || targets.Items[0].ID != goal.ID || targets.Items[0].RecordType != "goal" {
		t.Fatal("team choices mix scopes")
	}
	workspaceFinanceRequest(t, owner, "PUT", server.URL, "/settings", b.ID, "", "", map[string]any{"sourceWorkspaceId": a.ID, "expectedRevision": 0}, 200, nil)
	workspaceFinanceRequest(t, owner, "POST", server.URL, "/categories", b.ID, a.ID, "1", map[string]any{"name": "Linked forbidden"}, 403, nil)
	workspaceFinanceRequest(t, member, "GET", server.URL, "/link-targets", b.ID, a.ID, "1", nil, 200, &targets)
	if len(targets.Items) != 1 || targets.Items[0].WorkspaceID != a.ID {
		t.Fatal("linked choices use destination instead of source")
	}
	var report financeOverview
	workspaceFinanceRequest(t, member, "GET", server.URL, "?from=2026-09-01&to=2026-09-30", b.ID, "", "", nil, 200, &report)
	if len(report.Categories) != 1 || report.Categories[0].ID != category.ID || report.Entries[0].ID != entry.ID {
		t.Fatal("linked report lost groups")
	}
	if _, err := store.db.Exec(`UPDATE records SET workspace_id=? WHERE id=?`, b.ID, goal.ID); err != nil {
		t.Fatal(err)
	}
	workspaceFinanceRequest(t, owner, "GET", server.URL, "/expenses/"+expense.ID, a.ID, a.ID, "0", nil, 200, &expense)
	if expense.Links[0].Available || expense.Links[0].Title != "Связь недоступна" {
		t.Fatal("moved record title leaked")
	}
}

func TestFinanceOrganizationCategoryConflictIsolationAndDatabaseGuards(t *testing.T) {
	store, server, client, _ := financeTestServer(t)
	other := testClient(t)
	foreign := registerVerifiedWithoutFixture(t, other, server.URL, "org-cat-foreign@example.test", "org_cat_foreign")
	bucket := financeCreateBucket(t, client, server.URL, "Own")
	source := financeCreateSource(t, client, server.URL, "Own", false, []financeRule{{bucket.ID, 10000}})
	category := financeCreateCategory(t, client, server.URL, "Group")
	foreignCategory := financeCreateCategory(t, other, server.URL, "Foreign")
	input := financeInput(source.ID, 1000, 0)
	input.CategoryID = &category.ID
	input.ExpectedCategoryRevision = 99
	requestJSON(t, client, "POST", server.URL+"/api/personal/finance/entries", input, 409, nil)
	input.CategoryID = &foreignCategory.ID
	input.ExpectedCategoryRevision = 1
	requestJSON(t, client, "POST", server.URL+"/api/personal/finance/entries", input, 404, nil)
	input.CategoryID = &category.ID
	entry := financeCreateEntry(t, client, server.URL, input)
	requestJSON(t, client, "PUT", server.URL+"/api/personal/finance/categories/"+category.ID, map[string]any{"name": "One change", "expectedRevision": 1}, 200, nil)
	requestJSON(t, client, "PUT", server.URL+"/api/personal/finance/categories/"+category.ID, map[string]any{"name": "Stale change", "expectedRevision": 1}, 409, nil)
	if _, err := store.db.Exec(`UPDATE personal_finance_organization SET category_id=? WHERE operation_id=?`, foreignCategory.ID, entry.ID); err == nil {
		t.Fatal("DB allowed cross-owner category")
	}
	if _, err := store.db.Exec(`UPDATE personal_finance_organization SET owner_id=? WHERE operation_id=?`, foreign.ID, entry.ID); err == nil {
		t.Fatal("DB allowed cross-owner operation metadata")
	}
	if _, err := store.db.Exec(`UPDATE personal_finance_organization SET operation_kind='expense' WHERE operation_id=?`, entry.ID); err == nil {
		t.Fatal("DB allowed wrong operation kind")
	}
	if _, err := store.db.Exec(`UPDATE personal_finance_organization SET links_json='{}' WHERE operation_id=?`, entry.ID); err == nil {
		t.Fatal("DB accepted non-array links")
	}
	requestJSON(t, client, "POST", server.URL+"/api/personal/finance/categories", map[string]any{"name": strings.Repeat("я", 121)}, 400, nil)
	requestJSON(t, client, "GET", server.URL+"/api/personal/finance/link-targets?limit=101", nil, 400, nil)
	requestJSON(t, testClient(t), "GET", server.URL+"/api/personal/finance/link-targets", nil, 401, nil)
}

func TestFinanceOrganizationMigration075KeepsEvery139TableAndHistoricalRequestHashes(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "before075.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(`PRAGMA foreign_keys=ON;CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,applied_at TEXT NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	files, err := migrationFiles.ReadDir("migrations")
	if err != nil {
		t.Fatal(err)
	}
	for _, file := range files {
		if file.IsDir() || !strings.HasSuffix(file.Name(), ".sql") || file.Name() >= "075" {
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
	user := registerVerifiedWithoutFixture(t, client, server.URL, "prior075@example.test", "prior075")
	bucket := financeCreateBucket(t, client, server.URL, "Private old bucket")
	source := financeCreateSource(t, client, server.URL, "Private old source", false, []financeRule{{bucket.ID, 10000}})
	entry := financeCreateEntry(t, client, server.URL, financeInput(source.ID, 10000, 0))
	expenseInput := financeExpenseTestInput(bucket, "2026-09-15", 7000, "pre075-expense")
	expense := financeCreateExpense(t, client, server.URL, expenseInput)
	team := workspaceFinanceProject(t, client, server.URL, "Pre-existing team")
	_, teamSource, teamEntry, teamExpense := workspaceFinanceFixture(t, client, server.URL, team.ID)
	oldIncomeJSON := fmt.Sprintf(`{"sourceId":%q,"expectedSourceRevision":1,"date":"2026-09-12","payer":"Заказчик","note":"Частный доход","grossMinor":10000,"workerMinor":0}`, source.ID)
	oldExpenseJSON := fmt.Sprintf(`{"bucketId":%q,"expectedBucketRevision":1,"date":"2026-09-15","amountMinor":7000,"payee":"АЗС","note":"Заправка"}`, bucket.ID)
	for _, pair := range []struct{ table, request, payload string }{{"personal_finance_requests", "finance-request-001", oldIncomeJSON}, {"personal_finance_expense_requests", "pre075-expense", oldExpenseJSON}} {
		var actual string
		if err := db.QueryRow(`SELECT payload_hash FROM `+pair.table+` WHERE owner_id=? AND request_id=?`, user.ID, pair.request).Scan(&actual); err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256([]byte(pair.payload))
		if actual != hex.EncodeToString(sum[:]) {
			t.Fatalf("old canonical hash changed for %s", pair.table)
		}
	}
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
	rows.Close()
	var oldApplicationTables int
	if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).Scan(&oldApplicationTables); err != nil || oldApplicationTables != 139 {
		t.Fatalf("wrong pre-075 fixture: %d application tables, %v", oldApplicationTables, err)
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
	body, err := migrationFiles.ReadFile("migrations/075_finance_organization.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(string(body)); err != nil {
		t.Fatal(err)
	}
	for _, name := range tables {
		values, err := exportRows(t.Context(), db, `SELECT * FROM "`+name+`"`, nil)
		if err != nil || !reflect.DeepEqual(before[name], values) {
			t.Fatalf("migration changed old table %s: %v", name, err)
		}
	}
	schemaAfter, err := exportRows(t.Context(), db, `SELECT type,name,tbl_name,sql FROM sqlite_master WHERE tbl_name NOT IN ('personal_finance_categories','workspace_finance_categories','personal_finance_organization','workspace_finance_organization') ORDER BY type,name`, nil)
	if err != nil || !reflect.DeepEqual(schemaBefore, schemaAfter) {
		t.Fatal("old schema changed", err)
	}
	for _, prefix := range []string{"personal", "workspace"} {
		for _, suffix := range []string{"categories", "organization"} {
			var count int
			if err := db.QueryRow(`SELECT COUNT(*) FROM ` + prefix + `_finance_` + suffix).Scan(&count); err != nil || count != 0 {
				t.Fatal("migration seeded new organization rows")
			}
		}
	}
	var repeated financeEntry
	requestJSON(t, client, "POST", server.URL+"/api/personal/finance/entries", financeInput(source.ID, 10000, 0), 200, &repeated)
	if repeated.ID != entry.ID {
		t.Fatal("old income receipt invalidated")
	}
	var repeatedExpense financeExpense
	requestJSON(t, client, "POST", server.URL+"/api/personal/finance/expenses", expenseInput, 200, &repeatedExpense)
	if repeatedExpense.ID != expense.ID {
		t.Fatal("old expense receipt invalidated")
	}
	workspaceFinanceRequest(t, client, "POST", server.URL, "/entries", team.ID, team.ID, "0", financeInput(teamSource.ID, 25000, 0), 200, &repeated)
	if repeated.ID != teamEntry.ID {
		t.Fatal("old team income receipt invalidated")
	}
	workspaceFinanceRequest(t, client, "POST", server.URL, "/expenses", team.ID, team.ID, "0", financeExpenseInput{ClientRequestID: "expense-team-001", BucketID: teamExpense.BucketID, ExpectedBucketRevision: 1, Date: "2026-09-15", AmountMinor: 7000, Note: "Общий расход"}, 200, &repeatedExpense)
	if repeatedExpense.ID != teamExpense.ID {
		t.Fatal("old team expense receipt invalidated")
	}
}
