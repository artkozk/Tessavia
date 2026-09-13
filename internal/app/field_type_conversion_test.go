package app

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func TestCollectionFieldTypeConversionIsLossless(t *testing.T) {
	for _, item := range []struct{ from, to, value, want string }{
		{"text", "long_text", `"short"`, `"short"`},
		{"long_text", "text", `"long"`, `"long"`},
		{"number", "money", `12.5`, `12.5`},
		{"money", "number", `0`, `0`},
		{"select", "multi_select", `"one"`, `["one"]`},
		{"select", "multi_select", `""`, `[]`},
		{"multi_select", "select", `["one"]`, `"one"`},
		{"multi_select", "select", `[]`, `""`},
		{"select", "multi_select", `null`, `null`},
		{"multi_select", "select", `null`, `null`},
		{"number", "money", `9007199254740993`, `9007199254740993`},
		{"number", "money", `1.2300e+2`, `1.2300e+2`},
	} {
		got, _, err := convertCollectionFieldRaw(item.from, item.to, item.value)
		if err != nil || got != item.want {
			t.Fatalf("%s→%s %s: got=%s err=%v", item.from, item.to, item.value, got, err)
		}
	}
	if _, _, err := convertCollectionFieldRaw("multi_select", "select", `["one","two"]`); err == nil {
		t.Fatal("multiple selections must block conversion")
	}
	if fieldTypeConversion("date", "datetime") || fieldTypeConversion("text", "number") {
		t.Fatal("lossy conversion allowed")
	}
	for _, item := range []struct{ from, to, raw string }{
		{"text", "long_text", `123`}, {"long_text", "text", `{}`},
		{"number", "money", `"3"`}, {"money", "number", `true`},
		{"number", "money", `1e999`}, {"text", "long_text", `"a" "b"`},
		{"multi_select", "select", `[null]`}, {"multi_select", "select", `[1]`},
		{"select", "multi_select", `["one"]`}, {"multi_select", "select", `"one"`},
	} {
		if _, _, err := convertCollectionFieldRaw(item.from, item.to, item.raw); err == nil {
			t.Errorf("accepted damaged %s %s", item.from, item.raw)
		}
	}
}

type fieldConversionFixture struct {
	t *testing.T
	lifecycleFixture
	board WorkspaceCollection
	field CollectionField
}

func newFieldConversionFixture(t *testing.T, kind string) *fieldConversionFixture {
	t.Helper()
	f := &fieldConversionFixture{t: t, lifecycleFixture: newLifecycleFixture(t)}
	f.call("owner", "POST", "/collections", map[string]any{"name": "Conversion"}, 201, &f.board)
	f.call("owner", "POST", f.path()+"/fields", map[string]any{"name": "Value", "fieldType": kind, "options": []string{"First", "Second"}}, 201, &f.field)
	f.reload()
	return f
}

func (f *fieldConversionFixture) path() string      { return "/collections/" + f.board.ID }
func (f *fieldConversionFixture) fieldPath() string { return f.path() + "/fields/" + f.field.ID }
func (f *fieldConversionFixture) call(role, method, path string, body any, status int, out any) {
	f.t.Helper()
	requestWorkspaceJSON(f.t, f.clients[role], method, f.url+"/api"+path, f.project.ID, body, status, out)
}
func (f *fieldConversionFixture) reload() {
	f.t.Helper()
	var schema schemaResponse
	f.call("owner", "GET", f.path()+"/schema", nil, 200, &schema)
	for _, field := range schema.Fields {
		if field.ID == f.field.ID {
			f.field = field
			return
		}
	}
	f.t.Fatal("missing field")
}
func (f *fieldConversionFixture) create(title string, values map[string]any) Record {
	f.t.Helper()
	var record Record
	f.call("owner", "POST", "/records", map[string]any{"type": "idea", "title": title, "collectionId": f.board.ID, "customFields": values}, 201, &record)
	return record
}
func (f *fieldConversionFixture) preview(to string, status int) fieldTypeConversionPreview {
	f.t.Helper()
	var out fieldTypeConversionPreview
	f.call("owner", "POST", f.fieldPath()+"/conversion-preview", map[string]any{"fieldType": to}, status, &out)
	return out
}
func (f *fieldConversionFixture) payload(p fieldTypeConversionPreview) map[string]any {
	return map[string]any{"name": f.field.Name, "required": f.field.Required, "showOnCard": f.field.ShowOnCard, "expectedUpdatedAt": f.field.UpdatedAt, "fieldType": p.To, "conversionHash": p.ConversionHash}
}
func (f *fieldConversionFixture) apply(p fieldTypeConversionPreview, status int) {
	f.t.Helper()
	f.call("owner", "PATCH", f.fieldPath(), f.payload(p), status, nil)
}
func (f *fieldConversionFixture) raw(recordID string) string {
	f.t.Helper()
	var raw string
	if err := f.store.db.QueryRow(`SELECT value_json FROM record_field_values WHERE record_id=? AND field_id=?`, recordID, f.field.ID).Scan(&raw); err != nil {
		f.t.Fatal(err)
	}
	return raw
}
func (f *fieldConversionFixture) sql(query string, args ...any) {
	f.t.Helper()
	if _, err := f.store.db.Exec(query, args...); err != nil {
		f.t.Fatal(err)
	}
}

func TestFieldConversionHTTPPreservesValuesDefaultsAndHistory(t *testing.T) {
	f := newFieldConversionFixture(t, "select")
	id := f.field.Options[0].ID
	live := f.create("Visible choice", map[string]any{f.field.ID: id})
	archived := f.create("Archived choice", map[string]any{f.field.ID: id})
	detached := f.create("Detached choice", map[string]any{f.field.ID: id})
	empty := f.create("Empty old draft", nil)
	f.sql(`UPDATE records SET status='archived' WHERE id=?`, archived.ID)
	f.sql(`UPDATE records SET collection_id=NULL,stage_id=NULL WHERE id=?`, detached.ID)
	f.call("owner", "PATCH", f.fieldPath(), map[string]any{"name": f.field.Name, "expectedUpdatedAt": f.field.UpdatedAt, "defaultValue": id}, 200, nil)
	f.reload()
	p := f.preview("multi_select", 200)
	if p.Affected != 3 || p.Changed != 3 || p.Archived != 1 || p.Detached != 1 || !p.DefaultChanged || string(p.DefaultBefore) != `"`+id+`"` || string(p.DefaultAfter) != `["`+id+`"]` {
		t.Fatalf("wrong preview: %#v", p)
	}
	if f.raw(live.ID) != `"`+id+`"` {
		t.Fatal("preview wrote values")
	}
	f.apply(p, 200)
	f.reload()
	if f.field.FieldType != "multi_select" || string(f.field.DefaultValue) != `["`+id+`"]` || f.field.Options[0].ID != id {
		t.Fatalf("schema/default/options changed incorrectly: %#v", f.field)
	}
	for _, record := range []Record{live, archived, detached} {
		if f.raw(record.ID) != `["`+id+`"]` {
			t.Fatal("not all stored rows converted", record.Title)
		}
		var raw, workspace string
		if err := f.store.db.QueryRow(`SELECT details_json,workspace_id FROM activity WHERE entity_id=? AND action='field_type_converted'`, record.ID).Scan(&raw, &workspace); err != nil {
			t.Fatal(err)
		}
		var history map[string]any
		json.Unmarshal([]byte(raw), &history)
		if history["beforeRaw"] != `"`+id+`"` || history["afterRaw"] != `["`+id+`"]` || workspace != f.project.ID {
			t.Fatal("original history missing", raw)
		}
	}
	// Empty cards have a schema-bound new revision too. A stale record editor
	// cannot silently save an old-format value after conversion.
	f.call("owner", "PUT", "/records/"+empty.ID+"/custom-fields", map[string]any{"expectedUpdatedAt": empty.UpdatedAt, "values": map[string]any{f.field.ID: id}}, 409, nil)
	f.call("owner", "PUT", "/records/"+live.ID+"/custom-fields", map[string]any{"expectedUpdatedAt": live.UpdatedAt, "values": map[string]any{f.field.ID: id}}, 409, nil)
	p = f.preview("select", 200)
	f.apply(p, 200)
	f.reload()
	if f.raw(live.ID) != `"`+id+`"` || f.field.FieldType != "select" || string(f.field.DefaultValue) != `"`+id+`"` {
		t.Fatal("round trip lost values")
	}
	var count int
	f.store.db.QueryRow(`SELECT COUNT(*) FROM activity WHERE entity_id=? AND action='field_type_converted'`, live.ID).Scan(&count)
	if count != 2 {
		t.Fatal("prior history overwritten", count)
	}
}

func TestFieldConversionHTTPRejectsStaleSnapshotsAndRollback(t *testing.T) {
	f := newFieldConversionFixture(t, "select")
	id := f.field.Options[0].ID
	record := f.create("Concurrent choice", map[string]any{f.field.ID: id})
	for _, change := range []string{"value_same_version", "insert", "delete", "default", "option", "schema"} {
		t.Run(change, func(t *testing.T) {
			p := f.preview("multi_select", 200)
			switch change {
			case "value_same_version":
				f.sql(`UPDATE record_field_values SET value_json=? WHERE record_id=? AND field_id=?`, `"`+f.field.Options[1].ID+`"`, record.ID, f.field.ID)
			case "insert":
				f.create("New value after preview", map[string]any{f.field.ID: id})
			case "delete":
				f.sql(`DELETE FROM record_field_values WHERE record_id=? AND field_id=?`, record.ID, f.field.ID)
			case "default":
				f.sql(`INSERT INTO collection_field_defaults(field_id,value_json,updated_at) VALUES(?,?,?)`, f.field.ID, `"`+id+`"`, nowText())
			case "option":
				f.sql(`UPDATE collection_field_options SET name=name || ' changed' WHERE id=?`, id)
			case "schema":
				f.sql(`UPDATE collection_fields SET name=name || ' changed',updated_at=? WHERE id=?`, nowText(), f.field.ID)
			}
			f.apply(p, 409)
			f.reload()
			if f.field.FieldType != "select" {
				t.Fatal("stale conversion applied")
			}
		})
	}
	// A trigger simulates a guarded value write affecting zero rows. Every
	// earlier update, including the field type and history, must roll back.
	f.sql(`CREATE TRIGGER conversion_ignore BEFORE UPDATE ON record_field_values BEGIN SELECT RAISE(IGNORE); END`)
	p := f.preview("multi_select", 200)
	f.apply(p, 409)
	f.reload()
	if f.field.FieldType != "select" {
		t.Fatal("zero-row update committed type")
	}
	f.sql(`DROP TRIGGER conversion_ignore`)
	f.sql(`CREATE TRIGGER conversion_history_failure BEFORE INSERT ON activity WHEN NEW.action='field_type_converted' BEGIN SELECT RAISE(ABORT,'synthetic history failure'); END`)
	p = f.preview("multi_select", 200)
	f.apply(p, 500)
	f.reload()
	if f.field.FieldType != "select" || string(f.field.DefaultValue) != `"`+id+`"` {
		t.Fatal("history failure partially committed")
	}
	f.sql(`DROP TRIGGER conversion_history_failure`)
	f.apply(p, 200)
}

func TestFieldConversionHTTPValidatesDefaultsDataAndAccess(t *testing.T) {
	f := newFieldConversionFixture(t, "multi_select")
	id := f.field.Options[0].ID
	record := f.create("Several choices", map[string]any{f.field.ID: []string{id, f.field.Options[1].ID}})
	f.preview("select", 400)
	f.sql(`UPDATE record_field_values SET value_json='[null]' WHERE record_id=? AND field_id=?`, record.ID, f.field.ID)
	f.preview("select", 400)
	f.sql(`UPDATE record_field_values SET value_json='null' WHERE record_id=? AND field_id=?`, record.ID, f.field.ID)
	f.sql(`INSERT INTO collection_field_defaults(field_id,value_json,updated_at) VALUES(?,?,?)`, f.field.ID, `["`+id+`","`+f.field.Options[1].ID+`"]`, nowText())
	f.preview("select", 400)
	f.sql(`UPDATE collection_field_defaults SET value_json='null' WHERE field_id=?`, f.field.ID)
	p := f.preview("select", 200)
	if p.DefaultChanged || string(p.DefaultAfter) != "null" {
		t.Fatal("explicit null default changed")
	}
	for _, role := range []string{"member", "outsider"} {
		f.call(role, "POST", f.fieldPath()+"/conversion-preview", map[string]any{"fieldType": "select"}, 403, nil)
		f.call(role, "PATCH", f.fieldPath(), f.payload(p), 403, nil)
	}
	var other WorkspaceCollection
	f.call("owner", "POST", "/collections", map[string]any{"name": "Other"}, 201, &other)
	f.call("owner", "POST", "/collections/"+other.ID+"/fields/"+f.field.ID+"/conversion-preview", map[string]any{"fieldType": "select"}, 404, nil)
	f.call("owner", "PATCH", "/collections/"+other.ID+"/fields/"+f.field.ID, f.payload(p), 404, nil)
	for _, key := range []string{"conversionHash", "expectedUpdatedAt"} {
		body := f.payload(p)
		delete(body, key)
		f.call("owner", "PATCH", f.fieldPath(), body, 409, nil)
	}
	body := f.payload(p)
	body["fieldType"] = "multi_select"
	f.call("owner", "PATCH", f.fieldPath(), body, 400, nil)
	for _, key := range []string{"options", "defaultValue"} {
		body := f.payload(p)
		if key == "options" {
			body[key] = []any{}
		} else {
			body[key] = nil
		}
		f.call("owner", "PATCH", f.fieldPath(), body, 400, nil)
	}
	// Admins can convert schema. Null stays null, never the misleading empty
	// array/string produced by unmarshalling JSON null into scalar zero values.
	f.call("admin", "PATCH", f.fieldPath(), f.payload(p), 200, nil)
	f.reload()
	if f.raw(record.ID) != "null" || string(f.field.DefaultValue) != "null" {
		t.Fatal("null changed")
	}
	// Personal workspaces remain outside another workspace's preview boundary.
	var workspaces []Workspace
	requestJSON(t, f.clients["outsider"], "GET", f.url+"/api/workspaces", nil, 200, &workspaces)
	var foreignID string
	for _, w := range workspaces {
		if w.Kind == "personal" {
			foreignID = w.ID
		}
	}
	if foreignID == "" {
		t.Fatal("missing personal workspace")
	}
	var personal Record
	requestWorkspaceJSON(t, f.clients["outsider"], "POST", f.url+"/api/records", foreignID, map[string]any{"type": "idea", "title": "Secret title"}, 201, &personal)
	f.sql(`INSERT INTO record_field_values(record_id,field_id,value_json,updated_by,updated_at) VALUES(?,?,?,?,?)`, personal.ID, f.field.ID, `"secret"`, f.users["outsider"].ID, nowText())
	var failure map[string]any
	f.call("owner", "POST", f.fieldPath()+"/conversion-preview", map[string]any{"fieldType": "multi_select"}, 400, &failure)
	if strings.Contains(fmt.Sprint(failure), "secret") || strings.Contains(fmt.Sprint(failure), personal.ID) {
		t.Fatal("cross-workspace details leaked", failure)
	}
}

func TestFieldConversionHTTPNumberAndTextRawPreservation(t *testing.T) {
	for _, pair := range [][2]string{{"number", "money"}, {"text", "long_text"}} {
		t.Run(pair[0], func(t *testing.T) {
			f := newFieldConversionFixture(t, pair[0])
			value := any("line\ntext")
			raw := `"line\u000atext"`
			if pair[0] == "number" {
				value = 1
				raw = `9007199254740993`
			}
			record := f.create("Exact raw", map[string]any{f.field.ID: value})
			f.sql(`UPDATE record_field_values SET value_json=? WHERE record_id=? AND field_id=?`, raw, record.ID, f.field.ID)
			f.sql(`INSERT INTO collection_field_defaults(field_id,value_json,updated_at) VALUES(?,?,?)`, f.field.ID, raw, nowText())
			p := f.preview(pair[1], 200)
			if p.Changed != 0 || p.DefaultChanged {
				t.Fatal("representation unnecessarily rewritten")
			}
			if len(p.Examples) != 1 || p.Examples[0].ValueRaw != raw || p.Examples[0].ConvertedRaw != raw || p.DefaultBeforeRaw != raw || p.DefaultAfterRaw != raw {
				t.Fatal("preview must expose exact strings for browsers without precise JSON numbers", p)
			}
			f.apply(p, 200)
			f.reload()
			if f.raw(record.ID) != raw || string(f.field.DefaultValue) != raw {
				t.Fatal("raw bytes rounded/normalized")
			}
			p = f.preview(pair[0], 200)
			f.apply(p, 200)
			f.sql(`UPDATE record_field_values SET value_json='{}' WHERE record_id=? AND field_id=?`, record.ID, f.field.ID)
			f.preview(pair[1], 400)
		})
	}
}

func TestFieldConversionHTTPEmptyAndArchivedFieldBoundaries(t *testing.T) {
	f := newFieldConversionFixture(t, "text")
	p := f.preview("long_text", 200)
	if p.Affected != 0 || p.Changed != 0 || p.DefaultBeforeRaw != "" || p.DefaultAfterRaw != "" {
		t.Fatal("empty preview invented data", p)
	}
	var historyBefore, historyAfter int
	f.store.db.QueryRow(`SELECT COUNT(*) FROM activity`).Scan(&historyBefore)
	f.preview("long_text", 200)
	f.store.db.QueryRow(`SELECT COUNT(*) FROM activity`).Scan(&historyAfter)
	if historyBefore != historyAfter {
		t.Fatal("preview wrote history")
	}
	f.apply(p, 200)
	f.reload()
	var defaults int
	f.store.db.QueryRow(`SELECT COUNT(*) FROM collection_field_defaults WHERE field_id=?`, f.field.ID).Scan(&defaults)
	if defaults != 0 {
		t.Fatal("conversion materialized absent default")
	}
	p = f.preview("text", 200)
	f.call("owner", "DELETE", f.fieldPath(), map[string]any{"expectedUpdatedAt": f.field.UpdatedAt}, 204, nil)
	f.preview("text", 404)
	f.apply(p, 404)
	f.reload()
	if f.field.FieldType != "long_text" || f.field.ArchivedAt == "" {
		t.Fatal("archived field changed")
	}
	f.call("owner", "POST", f.fieldPath()+"/restore", map[string]any{"expectedUpdatedAt": f.field.UpdatedAt}, 204, nil)
	f.reload()
	f.apply(p, 409)
	p = f.preview("text", 200)
	f.apply(p, 200)
}

func TestFieldConversionGuardsWritersPreparedBeforeSchemaChange(t *testing.T) {
	f := newFieldConversionFixture(t, "select")
	id := f.field.Options[0].ID
	oldFields := []CollectionField{f.field}
	check := func(fields []CollectionField, want bool) {
		t.Helper()
		tx, err := f.store.db.BeginTx(context.Background(), nil)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback()
		if got := collectionFieldSnapshotMatches(context.Background(), tx, f.board.ID, fields); got != want {
			t.Fatalf("schema guard got %v want %v", got, want)
		}
	}
	check(oldFields, true)
	p := f.preview("multi_select", 200)
	f.apply(p, 200)
	f.reload()
	// These are the field definitions an in-flight create/attach request had
	// already used to normalize input. Its write transaction must reject them.
	check(oldFields, false)
	check([]CollectionField{f.field}, true)
	// A stale browser request arriving after conversion is validated against
	// the current type, and cannot default away the explicit wrong-format value.
	f.call("owner", "POST", "/records", map[string]any{"type": "idea", "title": "Old create form", "collectionId": f.board.ID, "customFields": map[string]any{f.field.ID: id}}, 400, nil)
	var record Record
	f.call("owner", "POST", "/records", map[string]any{"type": "idea", "title": "Attach target"}, 201, &record)
	attach := map[string]any{"collectionId": f.board.ID, "expectedUpdatedAt": record.UpdatedAt, "values": map[string]any{f.field.ID: id}}
	f.call("owner", "PUT", "/records/"+record.ID+"/collection", attach, 400, nil)
	attach["values"] = map[string]any{f.field.ID: []string{id}}
	f.call("owner", "PUT", "/records/"+record.ID+"/collection", attach, 200, nil)
	if f.raw(record.ID) != `["`+id+`"]` {
		t.Fatal("fresh attach did not preserve value")
	}
	var added CollectionField
	f.call("owner", "POST", f.path()+"/fields", map[string]any{"name": "Required after snapshot", "fieldType": "text", "required": true}, 201, &added)
	check([]CollectionField{f.field}, false)
}
