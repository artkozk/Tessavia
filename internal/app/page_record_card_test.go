package app

import "testing"

func TestPageRecordCardValidation(t *testing.T) {
	base := func() *PageRecordCard {
		return &PageRecordCard{Enabled: true, Columns: 2, Parts: []PageRecordPart{{ID: "part", Kind: "field", FieldID: "n", Width: 6}}}
	}
	for name, change := range map[string]func(*PageRecordCard){"columns": func(c *PageRecordCard) { c.Columns = 5 }, "width": func(c *PageRecordCard) { c.Parts[0].Width = 13 }, "duplicate": func(c *PageRecordCard) { c.Parts = append(c.Parts, c.Parts[0]) }, "kind": func(c *PageRecordCard) { c.Parts[0].Kind = "script" }, "foreign-kind-source": func(c *PageRecordCard) { c.Parts[0].Kind = "title" }, "missing-field": func(c *PageRecordCard) { c.Parts[0].FieldID = "" }, "gap": func(c *PageRecordCard) { v := -1; c.Gap = &v }} {
		t.Run(name, func(t *testing.T) {
			c := base()
			change(c)
			if validatePageRecordCard(PageAppBlock{RecordCard: c}) == nil {
				t.Fatal("invalid card accepted")
			}
		})
	}
	c := base()
	c.Parts = make([]PageRecordPart, 49)
	if validatePageRecordCard(PageAppBlock{RecordCard: c}) == nil {
		t.Fatal("too many parts accepted")
	}
	c = base()
	zero := 0
	c.Gap = &zero
	if err := validatePageRecordCard(PageAppBlock{RecordCard: c}); err != nil {
		t.Fatal(err)
	}
	c.Enabled = false
	c.Parts[0].Hidden = true
	if validatePageRecordCardSource(PageAppBlock{RecordCard: c}, nil) == nil {
		t.Fatal("hidden or inactive source unchecked")
	}
	if err := validatePageRecordCardSource(PageAppBlock{RecordCard: c}, []CollectionField{{ID: "n", FieldType: "number"}}); err != nil {
		t.Fatal(err)
	}
}

func TestPageRecordCardKitPreservesPartsAndRemapsHiddenFields(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(role, ws, method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[role], method, f.url+"/api"+path, ws, body, status, out)
	}
	var board WorkspaceCollection
	call("owner", f.project.ID, "POST", "/collections", map[string]any{"name": "Card layout", "defaultRecordType": "idea"}, 201, &board)
	var field CollectionField
	call("owner", f.project.ID, "POST", "/collections/"+board.ID+"/fields", map[string]any{"name": "Amount", "fieldType": "number"}, 201, &field)
	call("owner", f.project.ID, "POST", "/records", map[string]any{"type": "idea", "title": "Original data", "collectionId": board.ID, "customFields": map[string]any{field.ID: 7}}, 201, nil)
	var page WorkspacePage
	call("owner", f.project.ID, "POST", "/workspace/pages", map[string]any{"name": "Composed cards"}, 201, &page)
	path := "/workspace/pages/" + page.ID + "/app"
	zero := 0
	size := 23
	b := PageAppBlock{ID: "list", Kind: "records", CollectionID: board.ID, RecordCard: &PageRecordCard{Enabled: true, Columns: 2, Gap: &zero, Parts: []PageRecordPart{{ID: "text", Kind: "text", Text: "Own label", Width: 12}, {ID: "field", Kind: "field", FieldID: field.ID, Label: "Custom", Width: 6, Hidden: true}}}, ElementStyles: map[string]PageElementStyle{"recordPart:field": {FontSize: &size}}}
	def := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{b}}
	call("owner", f.project.ID, "PUT", path, map[string]any{"definition": def, "expectedRevision": 0}, 200, nil)
	def.Blocks[0].Kind = "text"
	def.Blocks[0].RecordCard.Enabled = false
	call("owner", f.project.ID, "PUT", path, map[string]any{"definition": def, "expectedRevision": 1}, 200, nil)
	var kit PageAppTemplate
	call("owner", f.project.ID, "POST", path+"/template", map[string]any{"name": "Cards kit", "visibility": "public", "expectedRevision": 2}, 201, &kit)
	var ws Workspace
	requestJSON(t, f.clients["member"], "POST", f.url+"/api/workspaces", map[string]any{"name": "Cards recipient"}, 201, &ws)
	var copy WorkspacePage
	call("member", ws.ID, "POST", "/page-app/templates/"+kit.ID+"/install", map[string]any{}, 201, &copy)
	cp := "/workspace/pages/" + copy.ID + "/app"
	var state PageAppState
	call("member", ws.ID, "GET", cp, nil, 200, &state)
	b = state.Definition.Blocks[0]
	if b.RecordCard.Parts[1].FieldID == field.ID || b.RecordCard.Parts[1].FieldID == "" || !b.RecordCard.Parts[1].Hidden || b.RecordCard.Gap == nil || *b.RecordCard.Gap != 0 || *b.ElementStyles["recordPart:field"].FontSize != 23 {
		t.Fatal("lost card structure or field mapping", b)
	}
	var count int
	f.store.db.QueryRow("SELECT count(*) FROM records WHERE collection_id=?", b.CollectionID).Scan(&count)
	if count != 0 {
		t.Fatal("records copied")
	}
	state.Definition.Blocks[0].RecordCard.Enabled = true
	state.Definition.Blocks[0].RecordCard.Parts[1].Hidden = false
	state.Definition.Blocks[0].Kind = "records"
	call("member", ws.ID, "PUT", cp, map[string]any{"definition": state.Definition, "expectedRevision": 1}, 200, nil)
	call("member", ws.ID, "PUT", cp, map[string]any{"definition": state.Definition, "expectedRevision": 1}, 409, nil)
	call("member", f.project.ID, "PUT", path, map[string]any{"definition": def, "expectedRevision": 2}, 403, nil)
	state = PageAppState{}
	call("owner", f.project.ID, "GET", path, nil, 200, &state)
	if state.Definition.Blocks[0].RecordCard.Enabled || !state.Definition.Blocks[0].RecordCard.Parts[1].Hidden {
		t.Fatal("copy changed original")
	}
	f.store.db.Exec("UPDATE collection_fields SET archived_at=updated_at WHERE id=?", field.ID)
	call("owner", f.project.ID, "POST", path+"/template", map[string]any{"name": "Stale", "expectedRevision": 2}, 400, nil)
}
