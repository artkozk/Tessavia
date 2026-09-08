package app

import "testing"

func TestPageBlockVisibilityRejectsInvalidDependencies(t *testing.T) {
	valid := func() PageAppDefinition {
		return PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "source", Kind: "tracker", Items: []PageAppItem{{ID: "one", Label: "One"}}}, {ID: "target", Kind: "text", Visibility: &PageBlockVisibility{Source: "source", Metric: "remaining", Operator: "eq", Value: 0}}}}
	}
	for name, change := range map[string]func(*PageAppDefinition){
		"self":        func(d *PageAppDefinition) { d.Blocks[1].Visibility.Source = "target" },
		"unknown":     func(d *PageAppDefinition) { d.Blocks[1].Visibility.Source = "missing" },
		"not tracker": func(d *PageAppDefinition) { d.Blocks[0].Kind = "text" },
		"metric":      func(d *PageAppDefinition) { d.Blocks[1].Visibility.Metric = "execute" },
		"operator":    func(d *PageAppDefinition) { d.Blocks[1].Visibility.Operator = "js" },
		"percent bound": func(d *PageAppDefinition) {
			d.Blocks[1].Visibility.Metric = "percent"
			d.Blocks[1].Visibility.Value = 101
		},
		"negative": func(d *PageAppDefinition) { d.Blocks[1].Visibility.Value = -1 },
		"cycle": func(d *PageAppDefinition) {
			d.Blocks[1].Kind = "tracker"
			d.Blocks[0].Visibility = &PageBlockVisibility{Source: "target", Metric: "checked", Operator: "eq", Value: 0}
		},
	} {
		t.Run(name, func(t *testing.T) {
			d := valid()
			change(&d)
			if validatePageApp(&d) == nil {
				t.Fatal("accepted invalid presentation condition")
			}
		})
	}
	d := valid()
	if err := validatePageApp(&d); err != nil {
		t.Fatal(err)
	}
	d.Blocks[1].Visibility = nil
	if err := validatePageApp(&d); err != nil {
		t.Fatal(err)
	}
}

func TestPageVisibilityKitKeepsRuleButNotPersonalState(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(actor, method, path string, body any, status int, out any) {
		t.Helper()
		if state, ok := out.(*PageAppState); ok {
			*state = PageAppState{}
		}
		requestWorkspaceJSON(t, f.clients[actor], method, f.url+"/api"+path, f.project.ID, body, status, out)
	}
	var page WorkspacePage
	call("owner", "POST", "/workspace/pages", map[string]any{"name": "Steps"}, 201, &page)
	path := "/workspace/pages/" + page.ID + "/app"
	def := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "steps", Kind: "tracker", Items: []PageAppItem{{ID: "one", Label: "First"}, {ID: "two", Label: "Second"}}}, {ID: "next", Kind: "text", Text: "Next step", Visibility: &PageBlockVisibility{Source: "steps", Metric: "remaining", Operator: "eq", Value: 0}}}}
	call("owner", "PUT", path, map[string]any{"definition": def, "expectedRevision": 0}, 200, nil)
	call("member", "PUT", path, map[string]any{"definition": def, "expectedRevision": 1}, 403, nil)
	for _, id := range []string{"one", "two"} {
		call("owner", "PUT", path+"/marks", map[string]any{"blockId": "steps", "itemId": id, "checked": true, "expectedRevision": 1}, 200, nil)
	}
	var state PageAppState
	call("member", "GET", path, nil, 200, &state)
	if len(state.Marks) != 0 || state.Definition.Blocks[1].Visibility == nil {
		t.Fatal("marks leaked or rule missing")
	}
	var kit PageAppTemplate
	call("owner", "POST", path+"/template", map[string]any{"name": "Steps kit", "visibility": "private", "expectedRevision": 1}, 201, &kit)
	var copy WorkspacePage
	call("owner", "POST", "/page-app/templates/"+kit.ID+"/install", map[string]any{}, 201, &copy)
	copyPath := "/workspace/pages/" + copy.ID + "/app"
	call("owner", "GET", copyPath, nil, 200, &state)
	if len(state.Marks) != 0 || *state.Definition.Blocks[1].Visibility != *def.Blocks[1].Visibility {
		t.Fatal("copy lost rule or copied personal completion")
	}
	def.Blocks[1].Visibility = nil
	call("owner", "PUT", path, map[string]any{"definition": def, "expectedRevision": 1}, 200, nil)
	call("owner", "PUT", path, map[string]any{"definition": def, "expectedRevision": 1}, 409, nil)
	call("owner", "GET", copyPath, nil, 200, &state)
	if state.Definition.Blocks[1].Visibility == nil {
		t.Fatal("original edit changed installed copy")
	}
}
