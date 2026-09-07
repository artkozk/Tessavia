package app

import (
	"strings"
	"testing"
)

func TestCollectionTemplatesCreateIndependentEditableSchemas(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(role, method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[role], method, f.url+"/api"+path, f.project.ID, body, status, out)
	}
	var templates []collectionTemplate
	call("owner", "GET", "/collection-templates", nil, 200, &templates)
	if len(templates) != 5 {
		t.Fatal("missing process choices")
	}
	call("member", "POST", "/collections", map[string]any{"name": "Denied template", "templateId": "sales"}, 403, nil)
	call("owner", "POST", "/collections", map[string]any{"name": "Unknown template", "templateId": "missing"}, 400, nil)
	seen := map[string]bool{}
	for _, template := range templates {
		for copyIndex := 0; copyIndex < 2; copyIndex++ {
			name := template.ID + strings.Repeat(" copy", copyIndex)
			var board WorkspaceCollection
			call("owner", "POST", "/collections", map[string]any{"name": name, "templateId": template.ID, "cardLabel": template.CardLabel}, 201, &board)
			if len(board.Stages) != len(template.Stages) || len(board.Fields) != len(template.Fields) {
				t.Fatal("incomplete schema")
			}
			var schema schemaResponse
			call("owner", "GET", "/collections/"+board.ID+"/schema", nil, 200, &schema)
			for _, stage := range schema.Stages {
				if stage.ID == "" || seen[stage.ID] {
					t.Fatal("shared stage identity")
				}
				seen[stage.ID] = true
			}
			for _, field := range schema.Fields {
				if field.ID == "" || seen[field.ID] {
					t.Fatal("shared field identity")
				}
				seen[field.ID] = true
				for _, option := range field.Options {
					if option.ID == "" || seen[option.ID] {
						t.Fatal("shared option identity")
					}
					seen[option.ID] = true
				}
				call("owner", "PATCH", "/collections/"+board.ID+"/fields/"+field.ID, map[string]any{"name": field.Name + " настроено", "showOnCard": false, "expectedUpdatedAt": field.UpdatedAt}, 200, nil)
			}
			var record Record
			call("owner", "POST", "/records", map[string]any{"type": "idea", "title": "User content " + name, "collectionId": board.ID, "stageId": board.Stages[0].ID}, 201, &record)
		}
	}
	var count int
	if err := f.store.db.QueryRow(`SELECT COUNT(*) FROM workspace_collections WHERE name='Unknown template'`).Scan(&count); err != nil || count != 0 {
		t.Fatal("invalid template created a board")
	}
	if _, err := f.store.db.Exec(`CREATE TRIGGER reject_template_field BEFORE INSERT ON collection_fields BEGIN SELECT RAISE(ABORT,'test failure'); END`); err != nil {
		t.Fatal(err)
	}
	call("owner", "POST", "/collections", map[string]any{"name": "Atomic template failure", "templateId": "sales"}, 500, nil)
	if err := f.store.db.QueryRow(`SELECT COUNT(*) FROM workspace_collections WHERE name='Atomic template failure'`).Scan(&count); err != nil || count != 0 {
		t.Fatal("failed template left a board")
	}
}

func TestCollectionChoiceCreationRejectsInvalidOptionsWithoutPartialField(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients["owner"], method, f.url+"/api"+path, f.project.ID, body, status, out)
	}
	var board WorkspaceCollection
	call("POST", "/collections", map[string]any{"name": "Strict options"}, 201, &board)
	path := "/collections/" + board.ID + "/fields"
	for _, options := range [][]string{{}, {" "}, {"One", " one "}, {strings.Repeat("я", 81)}, make([]string, 1001)} {
		call("POST", path, map[string]any{"name": "Must not exist", "fieldType": "select", "required": true, "options": options}, 400, nil)
	}
	var schema schemaResponse
	call("GET", "/collections/"+board.ID+"/schema", nil, 200, &schema)
	if len(schema.Fields) != 0 {
		t.Fatal("invalid options left a field")
	}
	var field CollectionField
	call("POST", path, map[string]any{"name": "Valid", "fieldType": "multi_select", "options": []string{"  One  ", strings.Repeat("я", 80)}}, 201, &field)
	if len(field.Options) != 2 || field.Options[0].Name != "One" {
		t.Fatal("valid options lost")
	}
	call("POST", path, map[string]any{"name": "Switched type", "fieldType": "text", "options": []string{"Hidden stale editor"}}, 201, &field)
	if len(field.Options) != 0 {
		t.Fatal("hidden choices applied to text")
	}
}
