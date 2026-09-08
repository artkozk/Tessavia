package app

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestPageDataConfigRejectsUnknownBindings(t *testing.T) {
	for _, d := range []*PageDataConfig{nil, {Source: "other-user"}, {Source: "habits", Fields: []string{"privateUserId"}}, {Source: "plans", Fields: []string{"title", "title"}}, {Source: "plans", Filter: "execute"}, {Source: "work", TextColor: "url(secret)"}, {Source: "reading", Limit: 101}} {
		if validatePageDataConfig(PageAppBlock{Kind: "data", Data: d}) == nil {
			t.Fatalf("accepted invalid config %+v", d)
		}
	}
}
func TestPersonalDataPageTemplateContainsConfigurationOnly(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(actor, method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[actor], method, f.url+"/api"+path, f.project.ID, body, status, out)
	}
	var page WorkspacePage
	call("owner", "POST", "/workspace/pages", map[string]any{"name": "Own morning"}, 201, &page)
	path := "/workspace/pages/" + page.ID + "/app"
	def := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{}}
	for _, source := range []string{"habits", "plans", "work", "reading"} {
		def.Blocks = append(def.Blocks, PageAppBlock{ID: source, Kind: "data", Title: source, Width: 6, Data: &PageDataConfig{Source: source, Filter: "today", Layout: "cards", Fields: []string{"title", "status"}, TextSize: 18, ActionLabel: "My action", ActionColor: "#176b58"}})
	}
	call("member", "PUT", path, map[string]any{"definition": def, "expectedRevision": 0}, 403, nil)
	call("owner", "PUT", path, map[string]any{"definition": def, "expectedRevision": 0}, 200, nil)
	var ownerPlan, memberPlan PersonalPlan
	call("owner", "POST", "/personal/plans", map[string]any{"title": "OWNER ONLY SECRET PLAN"}, 201, &ownerPlan)
	call("member", "POST", "/personal/plans", map[string]any{"title": "MEMBER ONLY SECRET PLAN"}, 201, &memberPlan)
	for _, actor := range []string{"owner", "member"} {
		var state PageAppState
		call(actor, "GET", path, nil, 200, &state)
		raw, _ := json.Marshal(state)
		if strings.Contains(string(raw), "SECRET PLAN") || len(state.Definition.Blocks) != 4 {
			t.Fatal(string(raw))
		}
		var overview map[string]any
		call(actor, "GET", "/personal/overview", nil, 200, &overview)
		raw, _ = json.Marshal(overview)
		excluded := "OWNER ONLY SECRET PLAN"
		if actor == "owner" {
			excluded = "MEMBER ONLY SECRET PLAN"
		}
		if strings.Contains(string(raw), excluded) {
			t.Fatal("personal data leaked")
		}
	}
	var kit PageAppTemplate
	call("owner", "POST", path+"/template", map[string]any{"name": "Config only", "visibility": "private", "expectedRevision": 1}, 201, &kit)
	var copy WorkspacePage
	call("owner", "POST", "/page-app/templates/"+kit.ID+"/install", map[string]any{}, 201, &copy)
	var installed PageAppState
	call("owner", "GET", "/workspace/pages/"+copy.ID+"/app", nil, 200, &installed)
	if len(installed.Definition.Blocks) != 4 || installed.Definition.Blocks[1].Data.Source != "plans" || installed.Definition.Blocks[1].Data.TextSize != 18 {
		t.Fatal(installed)
	}
	def.Blocks[0].Hidden = true
	def.Blocks[1].Data.HideAction = true
	call("owner", "PUT", path, map[string]any{"definition": def, "expectedRevision": 1}, 200, nil)
	call("owner", "PUT", path, map[string]any{"definition": def, "expectedRevision": 1}, 409, nil)
	call("owner", "GET", "/workspace/pages/"+copy.ID+"/app", nil, 200, &installed)
	if installed.Definition.Blocks[0].Hidden || installed.Definition.Blocks[1].Data.HideAction {
		t.Fatal("copy followed original edits")
	}
}
