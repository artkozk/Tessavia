package app

import (
	"math"
	"testing"
)

func TestPageCalculationValidation(t *testing.T) {
	val := func(v float64) *float64 { return &v }
	for _, step := range []PageCalculationStep{{Operation: "eval", Value: val(1)}, {Operation: "add"}, {Operation: "add", FieldID: "n", Value: val(1)}, {Operation: "add", Value: val(math.Inf(1))}, {Operation: "add", Value: val(math.NaN())}, {Operation: "add", Value: val(1e16)}} {
		b := PageAppBlock{RecordBindings: map[string]PageTextBinding{"title": {FieldID: "n", Calculation: []PageCalculationStep{step}}}}
		if validatePageRecordBindings(b) == nil {
			t.Fatal("invalid calculation accepted", step)
		}
	}
	b := PageAppBlock{RecordBindings: map[string]PageTextBinding{"title": {FieldID: "n", Calculation: []PageCalculationStep{{Operation: "divide", Value: val(0)}}}}}
	if err := validatePageRecordBindings(b); err != nil {
		t.Fatal(err)
	} // Runtime zero is a visible fallback, not a schema failure.
	for _, fields := range [][]CollectionField{{{ID: "n", FieldType: "text"}}, {{ID: "wrong", FieldType: "number"}}} {
		if validatePageRecordBindingSource(b, fields) == nil {
			t.Fatal("invalid first field accepted")
		}
	}
	b.RecordBindings["title"] = PageTextBinding{FieldID: "n", Calculation: []PageCalculationStep{{Operation: "add", FieldID: "other"}}}
	if validatePageRecordBindingSource(b, []CollectionField{{ID: "n", FieldType: "number"}, {ID: "other", FieldType: "checkbox"}}) == nil {
		t.Fatal("non-numeric operand accepted")
	}
	if err := validatePageRecordBindingSource(b, []CollectionField{{ID: "n", FieldType: "number"}, {ID: "other", FieldType: "money"}}); err != nil {
		t.Fatal(err)
	}
	for _, precision := range []int{-1, 7} {
		binding := b.RecordBindings["title"]
		binding.Precision = &precision
		b.RecordBindings["title"] = binding
		if validatePageRecordBindings(b) == nil {
			t.Fatal("bad precision")
		}
	}
	binding := b.RecordBindings["title"]
	binding.Precision = nil
	binding.Calculation = make([]PageCalculationStep, 9)
	b.RecordBindings["title"] = binding
	if validatePageRecordBindings(b) == nil {
		t.Fatal("too many steps")
	}
}

func TestPageCalculationsRemapEveryOperandAndIsolateKit(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(role, ws, method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[role], method, f.url+"/api"+path, ws, body, status, out)
	}
	var board WorkspaceCollection
	call("owner", f.project.ID, "POST", "/collections", map[string]any{"name": "Calculation", "defaultRecordType": "idea"}, 201, &board)
	var left, right CollectionField
	call("owner", f.project.ID, "POST", "/collections/"+board.ID+"/fields", map[string]any{"name": "Quantity", "fieldType": "number"}, 201, &left)
	call("owner", f.project.ID, "POST", "/collections/"+board.ID+"/fields", map[string]any{"name": "Price", "fieldType": "money"}, 201, &right)
	call("owner", f.project.ID, "POST", "/records", map[string]any{"type": "idea", "title": "Private original", "collectionId": board.ID, "customFields": map[string]any{left.ID: 10, right.ID: 2.5}}, 201, nil)
	var page WorkspacePage
	call("owner", f.project.ID, "POST", "/workspace/pages", map[string]any{"name": "Calculated list"}, 201, &page)
	path := "/workspace/pages/" + page.ID + "/app"
	zero := 0
	one := 1.0
	b := PageAppBlock{ID: "list", Kind: "records", CollectionID: board.ID, RecordBindings: map[string]PageTextBinding{"title": {FieldID: left.ID, Precision: &zero, Calculation: []PageCalculationStep{{Operation: "multiply", FieldID: right.ID}, {Operation: "subtract", Value: &one}}}}}
	def := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{b}}
	call("owner", f.project.ID, "PUT", path, map[string]any{"definition": def, "expectedRevision": 0}, 200, nil)
	def.Blocks[0].Kind = "text"
	call("owner", f.project.ID, "PUT", path, map[string]any{"definition": def, "expectedRevision": 1}, 200, nil)
	var kit PageAppTemplate
	call("owner", f.project.ID, "POST", path+"/template", map[string]any{"name": "Calculation kit", "visibility": "public", "expectedRevision": 2}, 201, &kit)
	var ws Workspace
	requestJSON(t, f.clients["member"], "POST", f.url+"/api/workspaces", map[string]any{"name": "Calculation recipient"}, 201, &ws)
	var copy WorkspacePage
	call("member", ws.ID, "POST", "/page-app/templates/"+kit.ID+"/install", map[string]any{}, 201, &copy)
	cp := "/workspace/pages/" + copy.ID + "/app"
	var state PageAppState
	call("member", ws.ID, "GET", cp, nil, 200, &state)
	binding := state.Definition.Blocks[0].RecordBindings["title"]
	if binding.FieldID == left.ID || binding.Calculation[0].FieldID == right.ID || binding.Calculation[0].FieldID == "" || binding.Precision == nil || *binding.Precision != 0 || *binding.Calculation[1].Value != 1 {
		t.Fatal("calculation not remapped", binding)
	}
	var count int
	f.store.db.QueryRow("SELECT count(*) FROM records WHERE collection_id=?", state.Definition.Blocks[0].CollectionID).Scan(&count)
	if count != 0 {
		t.Fatal("records leaked")
	}
	state.Definition.Blocks[0].Kind = "records"
	call("member", ws.ID, "PUT", cp, map[string]any{"definition": state.Definition, "expectedRevision": 1}, 200, nil)
	binding.Calculation = nil
	state.Definition.Blocks[0].RecordBindings["title"] = binding
	call("member", ws.ID, "PUT", cp, map[string]any{"definition": state.Definition, "expectedRevision": 2}, 200, nil)
	call("member", ws.ID, "PUT", cp, map[string]any{"definition": state.Definition, "expectedRevision": 2}, 409, nil)
	call("member", f.project.ID, "PUT", path, map[string]any{"definition": def, "expectedRevision": 2}, 403, nil)
	state = PageAppState{}
	call("owner", f.project.ID, "GET", path, nil, 200, &state)
	if len(state.Definition.Blocks[0].RecordBindings["title"].Calculation) != 2 {
		t.Fatal("copy changed original")
	}
	binding = def.Blocks[0].RecordBindings["title"]
	binding.Calculation[0].FieldID = "missing"
	def.Blocks[0].RecordBindings["title"] = binding
	call("owner", f.project.ID, "PUT", path, map[string]any{"definition": def, "expectedRevision": 2}, 400, nil)
	f.store.db.Exec("UPDATE collection_fields SET archived_at=updated_at WHERE id=?", right.ID)
	call("owner", f.project.ID, "POST", path+"/template", map[string]any{"name": "Stale", "expectedRevision": 2}, 400, nil)
}
