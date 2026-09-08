package app

import (
	"encoding/json"
	"testing"
)

func TestPageCompositionKitKeepsHierarchyWithIndependentMarks(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(role, ws, method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[role], method, f.url+"/api"+path, ws, body, status, out)
	}
	var page WorkspacePage
	call("owner", f.project.ID, "POST", "/workspace/pages", map[string]any{"name": "Composition"}, 201, &page)
	path := "/workspace/pages/" + page.ID + "/app"
	def := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "group", Kind: "group", Title: "Routine", GroupLayout: "stack"}, {ID: "tracker", Kind: "tracker", ParentID: "group", Items: []PageAppItem{{ID: "one", Label: "Read"}}}, {ID: "progress", Kind: "progress", ParentID: "group", Source: "tracker"}}}
	call("owner", f.project.ID, "PUT", path, map[string]any{"definition": def, "expectedRevision": 0}, 200, nil)
	call("owner", f.project.ID, "PUT", path+"/marks", map[string]any{"blockId": "tracker", "itemId": "one", "checked": true, "expectedRevision": 1}, 200, nil)
	def.Blocks[0].Hidden = true
	call("owner", f.project.ID, "PUT", path, map[string]any{"definition": def, "expectedRevision": 1}, 200, nil)
	def.Blocks[0].Hidden = false
	call("owner", f.project.ID, "PUT", path, map[string]any{"definition": def, "expectedRevision": 2}, 200, nil)
	var state PageAppState
	call("owner", f.project.ID, "GET", path, nil, 200, &state)
	if !state.Marks["tracker:one"] {
		t.Fatal("hiding group erased marks")
	}
	var kit PageAppTemplate
	call("owner", f.project.ID, "POST", path+"/template", map[string]any{"name": "Composition kit", "visibility": "public", "expectedRevision": 3}, 201, &kit)
	var ws Workspace
	requestJSON(t, f.clients["member"], "POST", f.url+"/api/workspaces", map[string]any{"name": "Composition recipient"}, 201, &ws)
	var copy WorkspacePage
	call("member", ws.ID, "POST", "/page-app/templates/"+kit.ID+"/install", map[string]any{}, 201, &copy)
	state = PageAppState{}
	cp := "/workspace/pages/" + copy.ID + "/app"
	call("member", ws.ID, "GET", cp, nil, 200, &state)
	if len(state.Marks) != 0 || state.Definition.Blocks[1].ParentID != "group" || state.Definition.Blocks[2].Source != "tracker" {
		t.Fatal("kit lost hierarchy or leaked marks", state)
	}
	state.Definition.Blocks[0].Title = "Own routine"
	call("member", ws.ID, "PUT", cp, map[string]any{"definition": state.Definition, "expectedRevision": 1}, 200, nil)
	call("member", ws.ID, "PUT", cp, map[string]any{"definition": state.Definition, "expectedRevision": 1}, 409, nil)
	call("member", f.project.ID, "PUT", path, map[string]any{"definition": def, "expectedRevision": 3}, 403, nil)
	state = PageAppState{}
	call("owner", f.project.ID, "GET", path, nil, 200, &state)
	if state.Definition.Blocks[0].Title != "Routine" || !state.Marks["tracker:one"] {
		t.Fatal("copy changed original")
	}
}

func TestPageCompositionValidation(t *testing.T) {
	zero := 0
	valid := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "group", Kind: "group", Gap: &zero}, {ID: "child", Kind: "text", ParentID: "group"}}}
	if err := validatePageComposition(&valid); err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(valid)
	var copy PageAppDefinition
	json.Unmarshal(raw, &copy)
	if copy.Blocks[0].Gap == nil || *copy.Blocks[0].Gap != 0 {
		t.Fatal("explicit zero gap lost")
	}
	for name, blocks := range map[string][]PageAppBlock{
		"self":      {{ID: "g", Kind: "group", ParentID: "g"}},
		"orphan":    {{ID: "a", Kind: "text", ParentID: "missing"}},
		"non-group": {{ID: "a", Kind: "text"}, {ID: "b", Kind: "text", ParentID: "a"}},
		"cycle":     {{ID: "a", Kind: "group", ParentID: "b"}, {ID: "b", Kind: "group", ParentID: "a"}},
		"layout":    {{ID: "a", Kind: "group", GroupLayout: "unknown"}},
	} {
		t.Run(name, func(t *testing.T) {
			d := PageAppDefinition{Blocks: blocks}
			if validatePageComposition(&d) == nil {
				t.Fatal("invalid hierarchy accepted")
			}
		})
	}
	deep := PageAppDefinition{}
	for i, id := range []string{"a", "b", "c", "d", "e", "f"} {
		b := PageAppBlock{ID: id, Kind: "group"}
		if i > 0 {
			b.ParentID = deep.Blocks[i-1].ID
		}
		deep.Blocks = append(deep.Blocks, b)
	}
	if validatePageComposition(&deep) == nil {
		t.Fatal("fifth nesting accepted")
	}
	deep.Blocks = deep.Blocks[:5]
	if err := validatePageComposition(&deep); err != nil {
		t.Fatal(err)
	}
	for _, gap := range []int{-1, 49} {
		valid.Blocks[0].Gap = &gap
		if validatePageComposition(&valid) == nil {
			t.Fatal("invalid gap accepted")
		}
	}
}

func TestPageCompositionVisibilityCannotDependOnEnclosedTracker(t *testing.T) {
	d := PageAppDefinition{Blocks: []PageAppBlock{{ID: "g", Kind: "group", Visibility: &PageBlockVisibility{Source: "t", Metric: "remaining", Operator: "eq", Value: 0}}, {ID: "t", Kind: "tracker", ParentID: "g"}}}
	if validatePageBlockVisibility(&d) == nil {
		t.Fatal("inaccessible circular group accepted")
	}
	d.Blocks[1].ParentID = ""
	if err := validatePageBlockVisibility(&d); err != nil {
		t.Fatal(err)
	}
}
