package app

import (
	"reflect"
	"testing"
)

func TestVisibilityGroupsValidateEveryBranchAndSharedAncestors(t *testing.T) {
	leaf := func(id string) PageBlockVisibility {
		return PageBlockVisibility{Source: id, Metric: "remaining", Operator: "eq", Value: 0}
	}
	d := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "start", Kind: "tracker"}, {ID: "first", Kind: "tracker", Visibility: &PageBlockVisibility{Source: "start", Metric: "checked", Operator: "gte", Value: 1}}, {ID: "second", Kind: "tracker", Visibility: &PageBlockVisibility{Source: "start", Metric: "checked", Operator: "gte", Value: 1}}, {ID: "end", Kind: "tracker", Visibility: &PageBlockVisibility{Mode: "all", Conditions: []PageBlockVisibility{leaf("first"), leaf("second")}}}}}
	if err := validatePageBlockVisibility(&d); err != nil {
		t.Fatal("shared ancestor rejected", err)
	}
	d.Blocks[2].Visibility = &PageBlockVisibility{Source: "end", Metric: "remaining", Operator: "eq", Value: 0}
	if validatePageBlockVisibility(&d) == nil {
		t.Fatal("cycle in second branch accepted")
	}
	d.Blocks[2].Visibility = nil
	for _, bad := range []*PageBlockVisibility{{Mode: "all"}, {Mode: "unknown", Conditions: []PageBlockVisibility{leaf("first")}}, {Mode: "any", Source: "first", Conditions: []PageBlockVisibility{leaf("first")}}, {Mode: "any", Conditions: []PageBlockVisibility{leaf("first"), leaf("end")}}, {Mode: "all", Conditions: []PageBlockVisibility{{Mode: "any", Conditions: []PageBlockVisibility{leaf("first")}}}}, {Mode: "all", Conditions: make([]PageBlockVisibility, 9)}, {Mode: "all", Conditions: []PageBlockVisibility{leaf("first"), {Source: "second", Metric: "percent", Operator: "eq", Value: 101}}}} {
		d.Blocks[3].Visibility = bad
		if validatePageBlockVisibility(&d) == nil {
			t.Fatal("invalid group accepted", bad)
		}
	}
}
func TestVisibilityGroupsKitAndPersonalIsolation(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(actor, method, path string, body any, status int, out any) {
		t.Helper()
		if state, ok := out.(*PageAppState); ok {
			*state = PageAppState{}
		}
		requestWorkspaceJSON(t, f.clients[actor], method, f.url+"/api"+path, f.project.ID, body, status, out)
	}
	var page WorkspacePage
	call("owner", "POST", "/workspace/pages", map[string]any{"name": "Grouped stages"}, 201, &page)
	path := "/workspace/pages/" + page.ID + "/app"
	rule := &PageBlockVisibility{Mode: "any", Conditions: []PageBlockVisibility{{Source: "habits", Metric: "percent", Operator: "eq", Value: 100}, {Source: "reading", Metric: "remaining", Operator: "eq", Value: 0}}}
	d := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "habits", Kind: "tracker", Items: []PageAppItem{{ID: "h", Label: "Habit"}}}, {ID: "reading", Kind: "tracker", Items: []PageAppItem{{ID: "r", Label: "Read"}}}, {ID: "plans", Kind: "text", Text: "Plans", Visibility: rule}}}
	call("owner", "PUT", path, map[string]any{"definition": d, "expectedRevision": 0}, 200, nil)
	call("owner", "PUT", path+"/marks", map[string]any{"blockId": "reading", "itemId": "r", "checked": true, "expectedRevision": 1}, 200, nil)
	var state PageAppState
	call("member", "GET", path, nil, 200, &state)
	if len(state.Marks) != 0 || !reflect.DeepEqual(state.Definition.Blocks[2].Visibility, rule) {
		t.Fatal(state)
	}
	call("member", "PUT", path, map[string]any{"definition": d, "expectedRevision": 1}, 403, nil)
	var kit PageAppTemplate
	call("owner", "POST", path+"/template", map[string]any{"name": "Grouped stages kit", "visibility": "private", "expectedRevision": 1}, 201, &kit)
	var copy WorkspacePage
	call("owner", "POST", "/page-app/templates/"+kit.ID+"/install", map[string]any{}, 201, &copy)
	copyPath := "/workspace/pages/" + copy.ID + "/app"
	call("owner", "GET", copyPath, nil, 200, &state)
	if len(state.Marks) != 0 || !reflect.DeepEqual(state.Definition.Blocks[2].Visibility, rule) {
		t.Fatal(state)
	}
	d.Blocks[2].Visibility = nil
	call("owner", "PUT", copyPath, map[string]any{"definition": d, "expectedRevision": 1}, 200, nil)
	call("owner", "PUT", copyPath, map[string]any{"definition": d, "expectedRevision": 1}, 409, nil)
	call("owner", "GET", path, nil, 200, &state)
	if !state.Marks["reading:r"] || !reflect.DeepEqual(state.Definition.Blocks[2].Visibility, rule) {
		t.Fatal("copy affected source", state)
	}
}
