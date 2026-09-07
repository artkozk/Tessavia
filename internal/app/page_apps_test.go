package app

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestPageAppsComposeTrackAndInstallIndependentTemplates(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(actor, method, path string, body any, status int, out any) {
		t.Helper()
		if target, ok := out.(*PageAppState); ok {
			*target = PageAppState{}
		}
		requestWorkspaceJSON(t, f.clients[actor], method, f.url+path, f.project.ID, body, status, out)
	}
	var page WorkspacePage
	call("owner", "POST", "/api/workspace/pages", map[string]any{"name": "Custom learning", "fields": []string{}}, 201, &page)
	path := "/api/workspace/pages/" + page.ID + "/app"
	def := PageAppDefinition{Version: 1, Blocks: []PageAppBlock{{ID: "intro", Kind: "heading", Title: "My reading", Width: 12}, {ID: "chapters", Kind: "tracker", Title: "Chapters", Width: 6, Format: "circles", Items: []PageAppItem{{ID: "one", Label: "Chapter 1"}, {ID: "two", Label: "Chapter 2"}}}, {ID: "progress", Kind: "progress", Title: "Read", Source: "chapters", Width: 6}, {ID: "go", Kind: "button", Title: "Start", Source: "chapters", Width: 12}}}
	save := func(revision int) map[string]any {
		return map[string]any{"definition": def, "expectedRevision": revision}
	}
	call("member", "PUT", path, save(0), 403, nil)
	var app PageAppState
	call("owner", "PUT", path, save(0), 200, &app)
	if app.Revision != 1 || len(app.Definition.Blocks) != 4 {
		t.Fatal(app)
	}
	call("owner", "PUT", path, save(0), 409, nil)
	var pages []WorkspacePage
	call("owner", "GET", "/api/workspace/pages", nil, 200, &pages)
	if len(pages) != 1 || !pages[0].App {
		t.Fatal(pages)
	}
	mark := map[string]any{"blockId": "chapters", "itemId": "one", "checked": true, "expectedRevision": 1}
	call("member", "PUT", path+"/marks", mark, 200, nil)
	call("member", "GET", path, nil, 200, &app)
	if !app.Marks["chapters:one"] {
		t.Fatal("mark missing")
	}
	call("owner", "GET", path, nil, 200, &app)
	if len(app.Marks) != 0 {
		t.Fatal("personal marks leaked")
	}
	mark["checked"] = "true"
	call("member", "PUT", path+"/marks", mark, 400, nil)
	mark["checked"] = true
	def.Blocks[1].Hidden = true
	call("owner", "PUT", path, save(1), 200, nil)
	mark["expectedRevision"] = 1
	call("member", "PUT", path+"/marks", mark, 409, nil)
	mark["expectedRevision"] = 2
	call("member", "PUT", path+"/marks", mark, 400, nil)
	def.Blocks[1].Hidden = false
	def.Blocks[1].Items[0].Label = "Renamed chapter"
	call("owner", "PUT", path, save(2), 200, nil)
	call("member", "GET", path, nil, 200, &app)
	if !app.Marks["chapters:one"] {
		t.Fatal("restore erased mark")
	}
	def.Blocks[0].Color = "url(https://invalid.test)"
	call("owner", "PUT", path, save(3), 400, nil)
	def.Blocks[0].Color = ""
	// Name and composition share the revision transaction: stale edits cannot rename the page.
	rename := save(3)
	rename["pageName"] = "Renamed app"
	call("owner", "PUT", path, rename, 200, nil)
	rename["pageName"] = "Stale overwrite"
	call("owner", "PUT", path, rename, 409, nil)
	call("owner", "GET", "/api/workspace/pages", nil, 200, &pages)
	if pages[0].Name != "Renamed app" {
		t.Fatal("stale save renamed page")
	}
	def.Blocks[1].Items[0].Hidden = true
	call("owner", "PUT", path, save(4), 200, nil)
	mark["expectedRevision"] = 5
	call("member", "PUT", path+"/marks", mark, 400, nil)
	def.Blocks[1].Items[0].Hidden = false
	call("owner", "PUT", path, save(5), 200, nil)
	call("member", "GET", path, nil, 200, &app)
	if !app.Marks["chapters:one"] {
		t.Fatal("item restoration lost personal mark")
	}
	var template PageAppTemplate
	call("owner", "POST", path+"/template", map[string]any{"name": "Learning kit", "visibility": "private", "expectedRevision": 6}, 201, &template)
	payload, _ := json.Marshal(template)
	if strings.Contains(string(payload), "checked") || strings.Contains(string(payload), "marks") {
		t.Fatal("template contains personal progress")
	}
	call("member", "GET", "/api/page-app/templates/"+template.ID, nil, 404, nil)
	call("owner", "POST", path+"/template", map[string]any{"name": "Public kit", "visibility": "public", "expectedRevision": 6}, 201, &template)
	call("member", "GET", "/api/page-app/templates/"+template.ID, nil, 200, nil)
	call("member", "POST", "/api/page-app/templates/"+template.ID+"/install", map[string]any{}, 403, nil)
	var installed WorkspacePage
	call("owner", "POST", "/api/page-app/templates/"+template.ID+"/install", map[string]any{"name": "Independent copy"}, 201, &installed)
	if installed.ID == page.ID || !installed.App {
		t.Fatal(installed)
	}
	copyPath := "/api/workspace/pages/" + installed.ID + "/app"
	call("member", "GET", copyPath, nil, 200, &app)
	if len(app.Marks) != 0 || len(app.Definition.Blocks) != 4 {
		t.Fatal("installation copied marks or lost definition", app)
	}
	def.Blocks[0].Title = "Changed only in copy"
	call("owner", "PUT", copyPath, save(1), 200, nil)
	call("owner", "GET", path, nil, 200, &app)
	if app.Definition.Blocks[0].Title != "My reading" {
		t.Fatal("copy changed source")
	}
	var other Workspace
	requestJSON(t, f.clients["owner"], "POST", f.url+"/api/workspaces", map[string]any{"name": "Other app workspace"}, 201, &other)
	requestWorkspaceJSON(t, f.clients["owner"], "GET", f.url+path, other.ID, nil, 404, nil)
	requestWorkspaceJSON(t, f.clients["owner"], "POST", f.url+"/api/page-app/templates/"+template.ID+"/install", other.ID, map[string]any{}, 201, &installed)
	app = PageAppState{}
	requestWorkspaceJSON(t, f.clients["owner"], "GET", f.url+"/api/workspace/pages/"+installed.ID+"/app", other.ID, nil, 200, &app)
	if len(app.Marks) != 0 {
		t.Fatal("cross-project marks copied")
	}
}

func TestPageAppTemplatePublicationOwnerOnly(t *testing.T) {
	f := newLifecycleFixture(t)
	var page WorkspacePage
	requestWorkspaceJSON(t, f.clients["owner"], "POST", f.url+"/api/workspace/pages", f.project.ID, map[string]any{"name": "Kit"}, 201, &page)
	path := f.url + "/api/workspace/pages/" + page.ID + "/app"
	requestWorkspaceJSON(t, f.clients["owner"], "PUT", path, f.project.ID, map[string]any{"expectedRevision": 0, "definition": PageAppDefinition{Version: 1, Blocks: []PageAppBlock{}}}, 200, nil)
	var kit PageAppTemplate
	requestWorkspaceJSON(t, f.clients["owner"], "POST", path+"/template", f.project.ID, map[string]any{"name": "Kit", "visibility": "public", "expectedRevision": 1}, 201, &kit)
	path = f.url + "/api/page-app/templates/" + kit.ID
	requestWorkspaceJSON(t, f.clients["member"], "PATCH", path, f.project.ID, map[string]any{"visibility": "private"}, 404, nil)
	var installed WorkspacePage
	requestWorkspaceJSON(t, f.clients["owner"], "POST", path+"/install", f.project.ID, map[string]any{}, 201, &installed)
	requestWorkspaceJSON(t, f.clients["owner"], "PATCH", path, f.project.ID, map[string]any{"visibility": "private"}, 200, nil)
	requestWorkspaceJSON(t, f.clients["member"], "GET", path, f.project.ID, nil, 404, nil)
	requestWorkspaceJSON(t, f.clients["member"], "GET", f.url+"/api/workspace/pages/"+installed.ID+"/app", f.project.ID, nil, 200, nil)
	requestWorkspaceJSON(t, f.clients["owner"], "PATCH", path, f.project.ID, map[string]any{"visibility": "public"}, 200, nil)
	requestWorkspaceJSON(t, f.clients["member"], "GET", path, f.project.ID, nil, 200, nil)
}
