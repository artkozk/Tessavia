package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

type personalConstructorFixture struct {
	store      *Store
	url        string
	clients    [2]*http.Client
	users      [2]User
	workspaces [2]Workspace
}

func newPersonalConstructorFixture(t *testing.T) personalConstructorFixture {
	t.Helper()
	store, err := OpenStore(filepath.Join(t.TempDir(), "personal-constructor.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	t.Cleanup(server.Close)
	f := personalConstructorFixture{store: store, url: server.URL}
	for i, username := range []string{"personal_builder_one", "personal_builder_two"} {
		f.clients[i] = testClient(t)
		f.users[i] = registerVerifiedWithoutFixture(t, f.clients[i], f.url, username+"@example.test", username)
		var workspaces []Workspace
		requestJSON(t, f.clients[i], "GET", f.url+"/api/workspaces", nil, 200, &workspaces)
		if len(workspaces) != 1 || workspaces[0].Kind != "personal" || workspaces[0].Role != "owner" {
			t.Fatalf("personal-only account: %#v", workspaces)
		}
		f.workspaces[i] = workspaces[0]
	}
	return f
}

func TestPersonalConstructorWithoutTeamPreservesPrivateDataAndTemplateIsolation(t *testing.T) {
	f := newPersonalConstructorFixture(t)
	call := func(actor int, workspace, method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[actor], method, f.url+path, workspace, body, status, out)
	}
	own, other := f.workspaces[0].ID, f.workspaces[1].ID
	var page WorkspacePage
	call(0, own, "POST", "/api/workspace/pages", map[string]any{"name": "Personal composed page", "fields": []string{}}, 201, &page)
	path := "/api/workspace/pages/" + page.ID + "/app"
	var board WorkspaceCollection
	call(0, own, "POST", "/api/collections", map[string]any{"name": "Personal source", "defaultRecordType": "idea"}, 201, &board)
	var record Record
	call(0, own, "POST", "/api/records", map[string]any{"type": "idea", "title": "PRIVATE RECORD SENTINEL", "collectionId": board.ID}, 201, &record)
	var plan PersonalPlan
	call(0, own, "POST", "/api/personal/plans", map[string]any{"title": "PRIVATE PLAN SENTINEL"}, 201, &plan)
	def := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{
		{ID: "heading", Kind: "heading", Title: "A personal page"},
		{ID: "tracker", Kind: "tracker", Items: []PageAppItem{{ID: "one", Label: "First"}}},
		{ID: "plans", Kind: "data", Data: &PageDataConfig{Source: "plans", Fields: []string{"title"}}},
		{ID: "entries", Kind: "records", CollectionID: board.ID, Fields: []string{}},
		sheetTestBlock(),
	}}
	call(0, own, "PUT", path, map[string]any{"definition": def, "expectedRevision": 0}, 200, nil)
	call(0, own, "PUT", path+"/marks", map[string]any{"blockId": "tracker", "itemId": "one", "checked": true, "expectedRevision": 1}, 200, nil)
	call(0, own, "PUT", path+"/sheets/estimate", map[string]any{"values": map[string]string{"units": "987654.123456"}, "expectedRevision": 1, "expectedValuesRevision": 0}, 200, nil)
	var app PageAppState
	call(0, own, "GET", path, nil, 200, &app)
	if !app.Marks["tracker:one"] || app.Sheets["estimate"].Values["units"] != "987654.123456" {
		t.Fatal("personal values not restored")
	}
	for _, endpoint := range []string{"/api/workspace/pages", path, "/api/collections", "/api/records/" + record.ID} {
		call(1, own, "GET", endpoint, nil, 403, nil)
	}
	call(1, other, "GET", path, nil, 404, nil)
	call(1, other, "PUT", path, map[string]any{"definition": def, "expectedRevision": 1}, 404, nil)
	call(1, other, "PUT", path+"/marks", map[string]any{"blockId": "tracker", "itemId": "one", "checked": false, "expectedRevision": 1}, 404, nil)
	call(1, other, "PUT", path+"/sheets/estimate", map[string]any{"values": map[string]string{}, "expectedRevision": 1, "expectedValuesRevision": 1}, 404, nil)
	var foreignPage WorkspacePage
	call(1, other, "POST", "/api/workspace/pages", map[string]any{"name": "Other personal page"}, 201, &foreignPage)
	call(1, other, "PUT", "/api/workspace/pages/"+foreignPage.ID+"/app", map[string]any{"definition": def, "expectedRevision": 0}, 400, nil)
	var kit PageAppTemplate
	call(0, own, "POST", path+"/template", map[string]any{"name": "Personal kit", "visibility": "private", "expectedRevision": 1}, 201, &kit)
	raw, _ := json.Marshal(kit)
	for _, secret := range []string{record.Title, record.ID, plan.Title, plan.ID, "987654.123456", `"marks"`, `"checked"`, own} {
		if strings.Contains(string(raw), secret) {
			t.Fatalf("template includes private content %q", secret)
		}
	}
	call(1, other, "GET", "/api/page-app/templates/"+kit.ID, nil, 404, nil)
	call(1, other, "POST", "/api/page-app/templates/"+kit.ID+"/install", map[string]any{}, 404, nil)
	call(0, own, "PATCH", "/api/page-app/templates/"+kit.ID, map[string]any{"visibility": "public"}, 200, nil)
	var installed WorkspacePage
	call(1, other, "POST", "/api/page-app/templates/"+kit.ID+"/install", map[string]any{}, 201, &installed)
	app = PageAppState{}
	call(1, other, "GET", "/api/workspace/pages/"+installed.ID+"/app", nil, 200, &app)
	if len(app.Marks) != 0 || len(app.Sheets["estimate"].Values) != 0 || len(app.Definition.Blocks) != len(def.Blocks) {
		t.Fatal("template copy lost structure or copied inputs")
	}
	copiedSource := app.Definition.Blocks[3].CollectionID
	if copiedSource == "" || copiedSource == board.ID {
		t.Fatal("personal template did not remap its source")
	}
	var count int
	if err := f.store.db.QueryRow(`SELECT COUNT(*) FROM records WHERE collection_id=?`, copiedSource).Scan(&count); err != nil || count != 0 {
		t.Fatal("copy includes records", count, err)
	}
	page.Archived = true
	call(0, own, "PATCH", "/api/workspace/pages/"+page.ID, page, 200, nil)
	call(0, own, "GET", path, nil, 404, nil)
	page.Archived = false
	call(0, own, "PATCH", "/api/workspace/pages/"+page.ID, page, 200, nil)
	app = PageAppState{}
	call(0, own, "GET", path, nil, 200, &app)
	if !app.Marks["tracker:one"] || app.Sheets["estimate"].Values["units"] != "987654.123456" {
		t.Fatal("archiving erased private inputs")
	}
	// Joining the same team does not grant access to either personal workspace.
	var team Workspace
	requestJSON(t, f.clients[0], "POST", f.url+"/api/teams", map[string]any{"name": "Shared team"}, 201, &team)
	requestJSON(t, f.clients[0], "POST", f.url+"/api/teams/"+team.TeamID+"/members", map[string]any{"username": f.users[1].Username, "role": "admin", "projectIds": []string{team.ID}}, 200, nil)
	call(1, own, "GET", path, nil, 403, nil)
	call(1, team.ID, "GET", path, nil, 404, nil)
	var pages []WorkspacePage
	call(1, team.ID, "GET", "/api/workspace/pages", nil, 200, &pages)
	if len(pages) != 0 {
		t.Fatal("team list includes personal pages")
	}
}

func TestPersonalNavigationPreferencesRoundTripByWorkspaceDeviceAndPreset(t *testing.T) {
	f := newPersonalConstructorFixture(t)
	own, other := f.workspaces[0].ID, f.workspaces[1].ID
	call := func(actor int, workspace, method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[actor], method, f.url+path, workspace, body, status, out)
	}
	var page, foreign WorkspacePage
	call(0, own, "POST", "/api/workspace/pages", map[string]any{"name": "Own page"}, 201, &page)
	call(1, other, "POST", "/api/workspace/pages", map[string]any{"name": "Foreign page"}, 201, &foreign)
	order := []string{"personal:finance", "personal:notes", "personal:plans", "personal:habits", "personal:inbox", "personal:projects", "personal:goals", "personal:life", "personal:review", "personal:waiting", "personal", "calendar", "page:" + page.ID}
	hidden := []string{"personal:life", "personal:waiting"}
	input := InterfacePreferences{NavOrder: append(append([]string{}, order...), "personal:unknown", "page:"+foreign.ID, "personal:notes"), HiddenNavItems: append(append([]string{}, hidden...), "page:"+foreign.ID, "personal:unknown")}
	input.Layout.Pages = map[string]PageLayout{
		"personal":         {ContentWidth: 1700, Texts: map[string]string{"heading": "Private today heading"}},
		"personal:notes":   {ContentWidth: 1300, Density: "compact", Texts: map[string]string{"heading": "Private notes heading"}},
		"personal:finance": {ContentWidth: 1500, HiddenBlocks: []string{"summary"}},
		"page:" + page.ID:  {ContentWidth: 1900},
	}
	var result InterfacePreferences
	call(0, own, "PUT", "/api/interface/preferences?device=desktop", input, 200, &result)
	if !reflect.DeepEqual(result.NavOrder, order) || !reflect.DeepEqual(result.HiddenNavItems, hidden) {
		t.Fatalf("personal keys lost or foreign keys retained: %#v", result)
	}
	result = InterfacePreferences{}
	call(0, own, "GET", "/api/interface/preferences?device=desktop", nil, 200, &result)
	if !reflect.DeepEqual(result.NavOrder, order) || !reflect.DeepEqual(result.HiddenNavItems, hidden) {
		t.Fatal("round trip changed personal menu")
	}
	if result.Layout.Pages["personal"].ContentWidth != 1700 || result.Layout.Pages["personal:notes"].ContentWidth != 1300 || result.Layout.Pages["personal:finance"].ContentWidth != 1500 || result.Layout.Pages["personal:notes"].Texts["heading"] != "Private notes heading" {
		t.Fatal("independent personal layouts lost", result.Layout.Pages)
	}
	call(0, own, "PUT", "/api/interface/preferences?device=mobile", InterfacePreferences{NavOrder: []string{"personal:habits", "personal:plans"}, HiddenNavItems: []string{"personal:finance"}}, 200, nil)
	result = InterfacePreferences{}
	call(0, own, "GET", "/api/interface/preferences?device=desktop", nil, 200, &result)
	if !reflect.DeepEqual(result.NavOrder, order) {
		t.Fatal("mobile settings replaced desktop menu")
	}
	if result.Layout.Pages["personal:notes"].ContentWidth != 1300 || result.Layout.Pages["personal:finance"].ContentWidth != 1500 {
		t.Fatal("mobile settings replaced independent page layouts")
	}
	call(1, own, "PUT", "/api/interface/preferences", input, 403, nil)
	result = InterfacePreferences{}
	call(1, other, "GET", "/api/interface/preferences", nil, 200, &result)
	if len(result.NavOrder) != 0 || len(result.HiddenNavItems) != 0 {
		t.Fatal("other account preferences changed")
	}
	var preset InterfacePreset
	call(0, own, "POST", "/api/interface/presets", map[string]any{"name": "Personal navigation", "visibility": "public"}, 201, &preset)
	var application interfacePresetApplicationResponse
	call(1, other, "POST", "/api/interface/presets/"+preset.ID+"/apply", map[string]any{"devices": []string{"desktop"}}, 200, &application)
	expected := order[:len(order)-1]
	if !reflect.DeepEqual(application.Profiles["desktop"].NavOrder, expected) || !reflect.DeepEqual(application.Profiles["desktop"].HiddenNavItems, hidden) {
		t.Fatal("personal preset lost menu or copied private page ID", application)
	}
	installedPages := application.Profiles["desktop"].Layout.Pages
	if installedPages["personal"].ContentWidth != 1700 || installedPages["personal:notes"].ContentWidth != 1300 || installedPages["personal:finance"].ContentWidth != 1500 {
		t.Fatal("preset dropped independent personal page layouts", installedPages)
	}
	for _, page := range installedPages {
		if len(page.Texts) != 0 {
			t.Fatal("preset leaked private page wording")
		}
	}
	if _, exists := installedPages["page:"+page.ID]; exists {
		t.Fatal("preset copied private page ID")
	}
	call(1, other, "POST", "/api/interface/preset-applications/"+application.ApplicationID+"/undo", map[string]any{}, 200, &application)
	if len(application.Profiles["desktop"].NavOrder) != 0 {
		t.Fatal("undo did not restore previous personal menu")
	}
	if len(application.Profiles["desktop"].Layout.Pages) != 0 {
		t.Fatal("undo did not restore personal layouts")
	}
	var team Workspace
	requestJSON(t, f.clients[0], "POST", f.url+"/api/teams", map[string]any{"name": "Menu isolation"}, 201, &team)
	call(0, team.ID, "PUT", "/api/interface/preferences", input, 200, &result)
	if !reflect.DeepEqual(result.NavOrder, []string{"personal", "calendar"}) || len(result.HiddenNavItems) != 0 {
		t.Fatal("personal-specific menu accepted in team", result)
	}
	call(0, team.ID, "POST", "/api/interface/presets/"+preset.ID+"/apply", map[string]any{"devices": []string{"desktop"}}, 200, &application)
	if !reflect.DeepEqual(application.Profiles["desktop"].NavOrder, []string{"personal", "calendar"}) {
		t.Fatal("personal preset inserted personal sections in team")
	}
}
