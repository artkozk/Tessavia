package app

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func sheetTestString(value string) *string { return &value }

func sheetTestBlock() PageAppBlock {
	return PageAppBlock{ID: "estimate", Kind: "sheet", Title: "Estimate", Width: 12, Sheet: &PageSheetConfig{Rows: []PageSheetRow{
		{ID: "units", Label: "Units", Kind: "input"},
		{ID: "rate", Label: "Rate", Kind: "constant", Value: sheetTestString("2.5")},
		{ID: "total", Label: "Total", Kind: "formula", Start: &PageSheetOperand{RowID: "units"}, Steps: []PageSheetStep{{Operation: "multiply", RowID: "rate"}}},
	}}}
}

func TestPageSheetSchemaValidationAndStableReferences(t *testing.T) {
	block := sheetTestBlock()
	block.Sheet.Rows[0].Label = "Renamed input"
	block.Sheet.Rows[1].Value = sheetTestString("0002.500000")
	block.Sheet.Rows[0], block.Sheet.Rows[2] = block.Sheet.Rows[2], block.Sheet.Rows[0]
	block.ElementStyles = map[string]PageElementStyle{"sheetLabel": {}, "sheetValue:units": {}, "sheetUnit:total": {}}
	def := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{block}}
	if err := validatePageApp(&def); err != nil {
		t.Fatal(err)
	}
	if value := *def.Blocks[0].Sheet.Rows[1].Value; value != "2.5" {
		t.Fatalf("constant was not canonicalized: %s", value)
	}
	// A type switch retains valid inactive settings, so switching back is safe.
	def.Blocks[0].Kind = "text"
	if err := validatePageApp(&def); err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(def)
	if err != nil || !strings.Contains(string(raw), `"sheet"`) || !strings.Contains(string(raw), `"rowId":"units"`) {
		t.Fatal("inactive sheet or stable reference lost", string(raw), err)
	}
	tests := []struct {
		name string
		edit func(*PageAppBlock)
	}{
		{"missing schema", func(b *PageAppBlock) { b.Sheet = nil }},
		{"empty rows", func(b *PageAppBlock) { b.Sheet.Rows = nil }},
		{"too many rows", func(b *PageAppBlock) {
			for i := 0; i < 40; i++ {
				b.Sheet.Rows = append(b.Sheet.Rows, PageSheetRow{ID: fmt.Sprint("row", i), Label: "Input", Kind: "input"})
			}
		}},
		{"duplicate id", func(b *PageAppBlock) { b.Sheet.Rows[1].ID = "units" }},
		{"invalid id", func(b *PageAppBlock) { b.Sheet.Rows[0].ID = "other/block" }},
		{"empty label", func(b *PageAppBlock) { b.Sheet.Rows[0].Label = " " }},
		{"long unit", func(b *PageAppBlock) { b.Sheet.Rows[0].Unit = strings.Repeat("я", 33) }},
		{"precision", func(b *PageAppBlock) { p := 7; b.Sheet.Rows[0].Precision = &p }},
		{"unknown kind", func(b *PageAppBlock) { b.Sheet.Rows[0].Kind = "javascript" }},
		{"input contains private value", func(b *PageAppBlock) { b.Sheet.Rows[0].Value = sheetTestString("31.17") }},
		{"inactive input contains private value", func(b *PageAppBlock) { b.Kind = "text"; b.Sheet.Rows[0].Value = sheetTestString("31.17") }},
		{"input contains formula", func(b *PageAppBlock) { b.Sheet.Rows[0].Start = &PageSheetOperand{Value: sheetTestString("1")} }},
		{"constant missing value", func(b *PageAppBlock) { b.Sheet.Rows[1].Value = nil }},
		{"constant has steps", func(b *PageAppBlock) {
			b.Sheet.Rows[1].Steps = []PageSheetStep{{Operation: "add", Value: sheetTestString("1")}}
		}},
		{"formula has value", func(b *PageAppBlock) { b.Sheet.Rows[2].Value = sheetTestString("1") }},
		{"formula missing start", func(b *PageAppBlock) { b.Sheet.Rows[2].Start = nil }},
		{"formula empty operand", func(b *PageAppBlock) { b.Sheet.Rows[2].Start = &PageSheetOperand{} }},
		{"formula two operands", func(b *PageAppBlock) { b.Sheet.Rows[2].Start.Value = sheetTestString("1") }},
		{"dangling start", func(b *PageAppBlock) { b.Sheet.Rows[2].Start.RowID = "deleted" }},
		{"dangling step", func(b *PageAppBlock) { b.Sheet.Rows[2].Steps[0].RowID = "otherSheetRow" }},
		{"direct cycle", func(b *PageAppBlock) { b.Sheet.Rows[2].Start.RowID = "total" }},
		{"indirect cycle", func(b *PageAppBlock) {
			b.Sheet.Rows[0].Kind = "formula"
			b.Sheet.Rows[0].Start = &PageSheetOperand{RowID: "total"}
		}},
		{"unsupported operation", func(b *PageAppBlock) { b.Sheet.Rows[2].Steps[0].Operation = "eval" }},
		{"too many steps", func(b *PageAppBlock) {
			for i := 0; i < 12; i++ {
				b.Sheet.Rows[2].Steps = append(b.Sheet.Rows[2].Steps, PageSheetStep{Operation: "add", Value: sheetTestString("1")})
			}
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			b := sheetTestBlock()
			test.edit(&b)
			if err := validatePageSheet(&b); err == nil {
				t.Fatal("invalid sheet accepted")
			}
		})
	}
}

func TestPageSheetDecimalBoundsWithoutFloatingPoint(t *testing.T) {
	for input, expected := range map[string]string{
		"0": "0", "-0.000000": "0", "0012.340000": "12.34", "-0.000001": "-0.000001",
		"999999999999.999999": "999999999999.999999", "1000000000000.000000": "1000000000000", "-1000000000000": "-1000000000000",
	} {
		actual, err := normalizePageSheetDecimal(input)
		if err != nil || actual != expected {
			t.Fatalf("%q = %q, %v; want %q", input, actual, err, expected)
		}
	}
	for _, input := range []string{"", " ", " 1", "1 ", "1,2", "+1", ".1", "1.", "1e2", "NaN", "Infinity", "0.0000001", "1000000000000.000001", "-1000000000000.000001", "1000000000001", "99999999999999"} {
		if _, err := normalizePageSheetDecimal(input); err == nil {
			t.Fatalf("invalid decimal accepted: %q", input)
		}
	}
}

func TestPageSheetPrivateInputsConcurrentRevisionsAndIndependentKits(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(actor, method, path string, body any, status int, out any) {
		t.Helper()
		if state, ok := out.(*PageAppState); ok {
			*state = PageAppState{}
		}
		if state, ok := out.(*PageSheetState); ok {
			*state = PageSheetState{}
		}
		requestWorkspaceJSON(t, f.clients[actor], method, f.url+path, f.project.ID, body, status, out)
	}
	var page WorkspacePage
	call("owner", "POST", "/api/workspace/pages", map[string]any{"name": "Generic estimate"}, 201, &page)
	path := "/api/workspace/pages/" + page.ID + "/app"
	definition := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{sheetTestBlock()}}
	copyBlock := sheetTestBlock()
	copyBlock.ID = "separate"
	definition.Blocks = append(definition.Blocks, copyBlock)
	var state PageAppState
	call("owner", "PUT", path, map[string]any{"definition": definition, "expectedRevision": 0}, 200, &state)
	assertNoSeed := func() {
		t.Helper()
		var count int
		if err := f.store.db.QueryRow(`SELECT count(*) FROM page_app_sheet_values`).Scan(&count); err != nil || count != 0 {
			t.Fatal("read or schema write seeded personal inputs", count, err)
		}
	}
	assertNoSeed()
	call("member", "GET", path, nil, 200, &state)
	if len(state.Sheets) != 2 || state.Sheets["estimate"].Revision != 0 || len(state.Sheets["estimate"].Values) != 0 {
		t.Fatal("missing empty personal sheet state", state.Sheets)
	}
	assertNoSeed()
	sheetPath := path + "/sheets/estimate"
	for _, method := range []string{"GET", "PUT"} {
		target, payload, status := path, "", http.StatusOK
		if method == "PUT" {
			target, payload, status = sheetPath, `{"values":{}}`, http.StatusBadRequest
		}
		request, err := http.NewRequest(method, f.url+target, strings.NewReader(payload))
		if err != nil {
			t.Fatal(err)
		}
		request.Header.Set("X-Workspace-ID", f.project.ID)
		request.Header.Set("Content-Type", "application/json")
		response, err := f.clients["member"].Do(request)
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode != status || response.Header.Get("Cache-Control") != "private, no-store" {
			t.Fatalf("%s private sheet response cache policy missing: status=%d cache=%q", method, response.StatusCode, response.Header.Get("Cache-Control"))
		}
	}
	body := func(values any, definitionRevision, valuesRevision int) map[string]any {
		return map[string]any{"values": values, "expectedRevision": definitionRevision, "expectedValuesRevision": valuesRevision}
	}
	// Members use a shared schema, but inputs are owner-scoped even for an admin.
	var saved PageSheetState
	call("member", "PUT", sheetPath, body(map[string]string{"units": "731.170000"}, 1, 0), 200, &saved)
	if saved.Revision != 1 || saved.Values["units"] != "731.17" {
		t.Fatal(saved)
	}
	call("owner", "GET", path, nil, 200, &state)
	if len(state.Sheets["estimate"].Values) != 0 || state.Sheets["estimate"].Revision != 0 {
		t.Fatal("member inputs exposed to administrator")
	}
	call("admin", "GET", path, nil, 200, &state)
	if len(state.Sheets["estimate"].Values) != 0 {
		t.Fatal("member inputs exposed to team admin")
	}
	call("member", "PUT", sheetPath, body(map[string]string{"units": "999"}, 1, 0), 409, nil)
	call("owner", "PUT", sheetPath, body(map[string]string{"units": "11"}, 1, 0), 200, nil)
	call("member", "PUT", path+"/sheets/separate", body(map[string]string{"units": "13"}, 1, 0), 200, nil)
	call("member", "GET", path, nil, 200, &state)
	if state.Sheets["estimate"].Values["units"] != "731.17" || state.Sheets["separate"].Values["units"] != "13" {
		t.Fatal("different blocks or users overwrote each other", state.Sheets)
	}
	call("outsider", "GET", path, nil, 403, nil)
	call("outsider", "PUT", sheetPath, body(map[string]string{"units": "1"}, 1, 0), 403, nil)
	requestJSON(t, &http.Client{}, "PUT", f.url+sheetPath, body(map[string]string{"units": "1"}, 1, 0), 401, nil)
	// Invalid values and absent revisions cannot silently clear a private block.
	for _, values := range []any{nil, map[string]any{"units": nil}, map[string]any{"units": 5}, map[string]string{"units": "1e2"}, map[string]string{"units": "1000000000000.000001"}, map[string]string{"rate": "3"}, map[string]string{"total": "4"}, map[string]string{"unknown": ""}} {
		call("member", "PUT", sheetPath, body(values, 1, 1), 400, nil)
	}
	call("member", "PUT", sheetPath, map[string]any{"values": map[string]string{}}, 400, nil)
	call("member", "PUT", sheetPath, map[string]any{"values": map[string]string{}, "expectedRevision": 1}, 400, nil)
	call("member", "PUT", sheetPath, body(map[string]string{}, 1, -1), 400, nil)
	call("member", "GET", path, nil, 200, &state)
	if state.Sheets["estimate"].Revision != 1 || state.Sheets["estimate"].Values["units"] != "731.17" {
		t.Fatal("rejected writes changed saved input")
	}
	// Formula edits and renamed rows do not change stored input; stale editors fail.
	definition.Blocks[0].Sheet.Rows[0].Label = "Renamed quantity"
	call("owner", "PUT", path, map[string]any{"definition": definition, "expectedRevision": 1}, 200, nil)
	call("member", "PUT", sheetPath, body(map[string]string{"units": "77"}, 1, 1), 409, nil)
	call("member", "GET", path, nil, 200, &state)
	if state.Sheets["estimate"].Values["units"] != "731.17" {
		t.Fatal("schema rename lost private input")
	}
	// Portable kits carry both active and inactive schemas but no runtime values.
	var kit PageAppTemplate
	call("owner", "POST", path+"/template", map[string]any{"name": "Generic estimate kit", "visibility": "public", "expectedRevision": 2}, 201, &kit)
	payload, err := json.Marshal(kit)
	if err != nil || strings.Contains(string(payload), "731.17") || strings.Contains(string(payload), `"sheets"`) || strings.Contains(string(payload), `"values"`) {
		t.Fatal("private inputs entered template", string(payload), err)
	}
	var installed WorkspacePage
	call("owner", "POST", "/api/page-app/templates/"+kit.ID+"/install", map[string]any{"name": "Estimate copy"}, 201, &installed)
	copyPath := "/api/workspace/pages/" + installed.ID + "/app"
	call("member", "GET", copyPath, nil, 200, &state)
	if len(state.Sheets["estimate"].Values) != 0 || state.Sheets["estimate"].Revision != 0 || state.Definition.Blocks[0].Sheet.Rows[2].Start.RowID != "units" {
		t.Fatal("kit lost schema references or copied personal inputs", state)
	}
	call("member", "PUT", copyPath+"/sheets/estimate", body(map[string]string{"units": "17"}, 1, 0), 200, nil)
	call("member", "GET", path, nil, 200, &state)
	if state.Sheets["estimate"].Values["units"] != "731.17" {
		t.Fatal("installed copy overwrote source input")
	}
	// A type change must not expose the old input as a constant or a formula.
	definition.Blocks[0].Sheet.Rows[0].Kind = "constant"
	definition.Blocks[0].Sheet.Rows[0].Value = sheetTestString("5")
	call("owner", "PUT", path, map[string]any{"definition": definition, "expectedRevision": 2}, 200, nil)
	call("member", "GET", path, nil, 200, &state)
	if _, exists := state.Sheets["estimate"].Values["units"]; exists {
		t.Fatal("inactive input leaked into active state")
	}
	call("member", "PUT", sheetPath, body(map[string]string{"units": "19"}, 3, 1), 400, nil)
	definition.Blocks[0].Sheet.Rows[0].Kind = "input"
	definition.Blocks[0].Sheet.Rows[0].Value = nil
	definition.Blocks[0].Kind = "text"
	call("owner", "PUT", path, map[string]any{"definition": definition, "expectedRevision": 3}, 200, nil)
	call("member", "GET", path, nil, 200, &state)
	if _, exists := state.Sheets["estimate"]; exists || state.Definition.Blocks[0].Sheet == nil {
		t.Fatal("inactive block lost schema or returned its runtime values")
	}
	call("member", "PUT", sheetPath, body(map[string]string{"units": "21"}, 4, 1), 400, nil)
	definition.Blocks[0].Kind = "sheet"
	call("owner", "PUT", path, map[string]any{"definition": definition, "expectedRevision": 4}, 200, nil)
	call("member", "PUT", sheetPath, body(map[string]string{"units": ""}, 5, 1), 200, &saved)
	if saved.Revision != 2 || len(saved.Values) != 0 {
		t.Fatal("explicit clear became zero or kept previous input", saved)
	}
	call("member", "PUT", sheetPath, body(map[string]string{"units": "-0.000001"}, 5, 2), 200, nil)
	call("member", "PUT", sheetPath, body(map[string]string{}, 5, 3), 200, nil)
	call("member", "GET", path, nil, 200, &state)
	if state.Sheets["estimate"].Revision != 4 || len(state.Sheets["estimate"].Values) != 0 || state.Sheets["separate"].Values["units"] != "13" {
		t.Fatal("full snapshot clear changed another block", state.Sheets)
	}
}

func TestPageSheetMigrationPreservesPriorSchemaRowsAndMarks(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "before068.db"))
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
		if file.IsDir() || !strings.HasSuffix(file.Name(), ".sql") || file.Name() >= "068" {
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
	registerVerifiedWithoutFixture(t, client, server.URL, "sheet-migration@example.test", "sheet_migration")
	var page WorkspacePage
	requestJSON(t, client, "POST", server.URL+"/api/workspace/pages", map[string]any{"name": "Existing tracker"}, 201, &page)
	path := server.URL + "/api/workspace/pages/" + page.ID + "/app"
	oldDefinition := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "original", Kind: "tracker", Title: "Existing", Width: 12, Items: []PageAppItem{{ID: "one", Label: "One"}}}}}
	requestJSON(t, client, "PUT", path, map[string]any{"definition": oldDefinition, "expectedRevision": 0}, 200, nil)
	requestJSON(t, client, "PUT", path+"/marks", map[string]any{"blockId": "original", "itemId": "one", "checked": true, "expectedRevision": 1}, 200, nil)
	requestJSON(t, client, "POST", path+"/template", map[string]any{"name": "Original kit", "visibility": "private", "expectedRevision": 1}, 201, nil)
	read := func(query string) []map[string]any {
		t.Helper()
		rows, err := exportRows(t.Context(), db, query)
		if err != nil {
			t.Fatal(err)
		}
		return rows
	}
	oldTables := read(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
	beforeRows := map[string][]map[string]any{}
	for _, row := range oldTables {
		name := row["name"].(string)
		beforeRows[name] = read(fmt.Sprintf(`SELECT * FROM "%s"`, name))
	}
	beforeSchema := read(`SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name`)
	// Run the exact new migration; no future migration can change this fixture.
	newSQL, err := migrationFiles.ReadFile("migrations/068_page_app_sheet_values.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(string(newSQL)); err != nil {
		t.Fatal(err)
	}
	afterSchema := read(`SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND tbl_name!='page_app_sheet_values' ORDER BY type,name`)
	if !reflect.DeepEqual(beforeSchema, afterSchema) {
		t.Fatal("sheet migration changed a prior schema object")
	}
	for name, before := range beforeRows {
		after := read(fmt.Sprintf(`SELECT * FROM "%s"`, name))
		if !reflect.DeepEqual(before, after) {
			t.Fatalf("sheet migration changed old rows in %s", name)
		}
	}
	if rows := read(`SELECT * FROM page_app_sheet_values`); len(rows) != 0 {
		t.Fatal("sheet migration seeded private values")
	}
	var current PageAppState
	requestJSON(t, client, "GET", path, nil, 200, &current)
	if !current.Marks["original:one"] || current.Definition.Blocks[0].Title != "Existing" {
		t.Fatal("original composition or personal mark lost")
	}
}

func TestPageSheetDormantInputSurvivesSavingAnotherActiveInput(t *testing.T) {
	f := newLifecycleFixture(t)
	var page WorkspacePage
	requestWorkspaceJSON(t, f.clients["owner"], "POST", f.url+"/api/workspace/pages", f.project.ID, map[string]any{"name": "Reconfigurable estimate"}, 201, &page)
	path := f.url + "/api/workspace/pages/" + page.ID + "/app"
	block := sheetTestBlock()
	block.Sheet.Rows = []PageSheetRow{{ID: "a", Kind: "input", Label: "A"}, {ID: "b", Kind: "input", Label: "B"}}
	definition := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{block}}
	saveSchema := func(version int) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients["owner"], "PUT", path, f.project.ID, map[string]any{"definition": definition, "expectedRevision": version}, 200, nil)
	}
	saveValues := func(values map[string]string, schemaRevision, valuesRevision int) PageSheetState {
		t.Helper()
		var result PageSheetState
		requestWorkspaceJSON(t, f.clients["member"], "PUT", path+"/sheets/estimate", f.project.ID, map[string]any{"values": values, "expectedRevision": schemaRevision, "expectedValuesRevision": valuesRevision}, 200, &result)
		return result
	}
	read := func() PageAppState {
		t.Helper()
		var result PageAppState
		requestWorkspaceJSON(t, f.clients["member"], "GET", path, f.project.ID, nil, 200, &result)
		return result
	}
	saveSchema(0)
	saveValues(map[string]string{"a": "10", "b": "20"}, 1, 0)
	definition.Blocks[0].Sheet.Rows[0].Kind = "constant"
	definition.Blocks[0].Sheet.Rows[0].Value = sheetTestString("7")
	saveSchema(1)
	if _, visible := read().Sheets["estimate"].Values["a"]; visible {
		t.Fatal("dormant input remains in GET")
	}
	response := saveValues(map[string]string{"b": "30"}, 2, 1)
	if len(response.Values) != 1 || response.Values["b"] != "30" {
		t.Fatal("write response exposed dormant values", response)
	}
	definition.Blocks[0].Sheet.Rows[0].Kind = "input"
	definition.Blocks[0].Sheet.Rows[0].Value = nil
	saveSchema(2)
	if state := read(); state.Sheets["estimate"].Values["a"] != "10" || state.Sheets["estimate"].Values["b"] != "30" {
		t.Fatal("saving an active field erased a dormant input", state.Sheets)
	}
	// The same guarantee applies to removed rows, and clearing active inputs
	// still cannot erase invisible dormant data.
	definition.Blocks[0].Sheet.Rows = definition.Blocks[0].Sheet.Rows[1:]
	saveSchema(3)
	saveValues(map[string]string{}, 4, 2)
	definition.Blocks[0].Sheet.Rows = append(definition.Blocks[0].Sheet.Rows, PageSheetRow{ID: "a", Kind: "input", Label: "Restored A"})
	saveSchema(4)
	if state := read(); state.Sheets["estimate"].Values["a"] != "10" || len(state.Sheets["estimate"].Values) != 1 {
		t.Fatal("active clear erased removed-row input or failed to clear B", state.Sheets)
	}
}
