package app

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

type lifecycleFixture struct {
	store   *Store
	url     string
	clients map[string]*http.Client
	users   map[string]User
	project Workspace
}

func newLifecycleFixture(t *testing.T) lifecycleFixture {
	t.Helper()
	store, err := OpenStore(filepath.Join(t.TempDir(), "lifecycle.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour}))
	t.Cleanup(server.Close)
	f := lifecycleFixture{store: store, url: server.URL, clients: map[string]*http.Client{}, users: map[string]User{}}
	for _, role := range []string{"owner", "admin", "member", "outsider"} {
		f.clients[role] = testClient(t)
		f.users[role] = registerVerifiedWithoutFixture(t, f.clients[role], f.url, role+"@example.test", "cycle_"+role)
	}
	requestJSON(t, f.clients["owner"], "POST", f.url+"/api/teams", map[string]any{"name": "Lifecycle team"}, 201, &f.project)
	for _, role := range []string{"admin", "member"} {
		requestJSON(t, f.clients["owner"], "POST", f.url+"/api/teams/"+f.project.TeamID+"/members", map[string]any{"username": "cycle_" + role, "role": role, "projectIds": []string{f.project.ID}}, 200, nil)
	}
	return f
}

func TestTeamDeletionRestoreAndAccountIndependence(t *testing.T) {
	f := newLifecycleFixture(t)
	path := f.url + "/api/teams/" + f.project.TeamID
	var note PersonalNote
	requestJSON(t, f.clients["member"], "POST", f.url+"/api/personal/notes", map[string]any{"title": "Private survives"}, 201, &note)
	var record Record
	requestWorkspaceJSON(t, f.clients["member"], "POST", f.url+"/api/records", f.project.ID, map[string]any{"type": "task", "title": "Project survives", "ownerId": f.users["member"].ID}, 201, &record)
	var invite struct {
		Code string `json:"code"`
	}
	requestJSON(t, f.clients["owner"], "POST", path+"/invitations", map[string]any{"role": "member", "projectIds": []string{f.project.ID}}, 201, &invite)
	for role, status := range map[string]int{"outsider": 404, "member": 403, "admin": 403} {
		requestJSON(t, f.clients[role], "DELETE", path, map[string]any{"name": "Lifecycle team"}, status, nil)
	}
	requestJSON(t, f.clients["owner"], "DELETE", path, map[string]any{"name": "Wrong confirmation"}, 409, nil)
	requestJSON(t, f.clients["owner"], "DELETE", path, map[string]any{"name": "Lifecycle team"}, 204, nil)
	for _, role := range []string{"owner", "admin", "member"} {
		var teams []TeamSummary
		requestWorkspaceJSON(t, f.clients[role], "GET", f.url+"/api/teams", f.project.ID, nil, 200, &teams)
		if len(teams) != 0 {
			t.Fatalf("deleted team visible to %s", role)
		}
		for _, route := range []string{"/api/records", "/api/records/" + record.ID, "/api/search?q=Project", "/api/graph", "/api/activity", "/api/export", "/api/chat/threads", "/api/collections"} {
			requestWorkspaceJSON(t, f.clients[role], "GET", f.url+route, f.project.ID, nil, 403, nil)
		}
		requestWorkspaceJSON(t, f.clients[role], "GET", f.url+"/api/me", f.project.ID, nil, 200, &User{})
		requestWorkspaceJSON(t, f.clients[role], "GET", f.url+"/api/workspaces", f.project.ID, nil, 200, &[]Workspace{})
	}
	var overview PersonalOverview
	requestWorkspaceJSON(t, f.clients["member"], "GET", f.url+"/api/personal/overview", f.project.ID, nil, 200, &overview)
	if len(overview.Notes) != 1 || overview.Notes[0].ID != note.ID {
		t.Fatal("personal note lost")
	}
	for _, role := range []string{"admin", "member", "outsider"} {
		requestJSON(t, f.clients[role], "POST", path+"/restore", nil, 404, nil)
		var teams []TeamSummary
		requestJSON(t, f.clients[role], "GET", f.url+"/api/teams?includeDeleted=true", nil, 200, &teams)
		if len(teams) != 0 {
			t.Fatal("deleted team leaked")
		}
	}
	var deleted []TeamSummary
	requestJSON(t, f.clients["owner"], "GET", f.url+"/api/teams?includeDeleted=true", nil, 200, &deleted)
	if len(deleted) != 1 || deleted[0].DeletedAt == nil {
		t.Fatal("owner cannot find deleted team")
	}
	requestJSON(t, f.clients["outsider"], "POST", f.url+"/api/invitations/accept", map[string]any{"code": invite.Code}, 404, nil)
	requestJSON(t, f.clients["owner"], "POST", path+"/restore", nil, 204, nil)
	requestJSON(t, f.clients["outsider"], "POST", f.url+"/api/invitations/accept", map[string]any{"code": invite.Code}, 404, nil)
	var detail struct {
		Record Record `json:"record"`
	}
	requestWorkspaceJSON(t, f.clients["member"], "GET", f.url+"/api/records/"+record.ID, f.project.ID, nil, 200, &detail)
	if detail.Record.OwnerID != record.OwnerID || detail.Record.Title != record.Title {
		t.Fatal("restore changed content or responsibility")
	}
}

func TestMemberWithoutProjectsCanSeeTeamAndLeave(t *testing.T) {
	f := newLifecycleFixture(t)
	path := f.url + "/api/teams/" + f.project.TeamID
	requestJSON(t, f.clients["owner"], "PATCH", path+"/members/"+strconv.FormatInt(f.users["member"].ID, 10), map[string]any{"role": "member", "projectIds": []string{}}, 200, nil)
	var detail TeamDetail
	requestWorkspaceJSON(t, f.clients["member"], "GET", path, f.project.ID, nil, 200, &detail)
	if len(detail.Projects) != 0 || detail.ProjectCount != 0 || len(detail.Invitations) != 0 {
		t.Fatal("restricted project metadata leaked")
	}
	for _, member := range detail.Members {
		if len(member.ProjectRoles) != 0 {
			t.Fatal("hidden project IDs leaked through members")
		}
	}
	var teams []TeamSummary
	requestJSON(t, f.clients["member"], "GET", f.url+"/api/teams", nil, 200, &teams)
	if len(teams) != 1 || teams[0].ProjectCount != 0 {
		t.Fatal("team without project disappeared")
	}
	requestJSON(t, f.clients["outsider"], "GET", path, nil, 404, nil)
	requestWorkspaceJSON(t, f.clients["member"], "POST", path+"/leave", f.project.ID, nil, 204, nil)
	requestJSON(t, f.clients["member"], "GET", path, nil, 404, nil)
	requestJSON(t, f.clients["member"], "POST", path+"/leave", nil, 404, nil)
}

func TestLeaveHandsOffWorkAndReinviteDoesNotRestoreAdmin(t *testing.T) {
	f := newLifecycleFixture(t)
	path := f.url + "/api/teams/" + f.project.TeamID
	adminID, ownerID := f.users["admin"].ID, f.users["owner"].ID
	var active, completed Record
	for _, item := range []*Record{&active, &completed} {
		requestWorkspaceJSON(t, f.clients["admin"], "POST", f.url+"/api/records", f.project.ID, map[string]any{"type": "task", "title": "Preserve authorship", "ownerId": adminID, "decisionMakerId": adminID, "editPolicy": "owner_only"}, 201, item)
	}
	if _, err := f.store.db.Exec(`UPDATE records SET status='completed', progress=100, result='Finished' WHERE id=?`, completed.ID); err != nil {
		t.Fatal(err)
	}
	var oldInvite, newInvite struct {
		Code string `json:"code"`
	}
	requestJSON(t, f.clients["admin"], "POST", path+"/invitations", map[string]any{"role": "admin"}, 201, &oldInvite)
	requestWorkspaceJSON(t, f.clients["admin"], "POST", path+"/leave", f.project.ID, nil, 204, nil)
	requestWorkspaceJSON(t, f.clients["admin"], "GET", f.url+"/api/records", f.project.ID, nil, 403, nil)
	var detail struct {
		Record Record `json:"record"`
	}
	requestWorkspaceJSON(t, f.clients["owner"], "GET", f.url+"/api/records/"+active.ID, f.project.ID, nil, 200, &detail)
	if detail.Record.OwnerID != ownerID || detail.Record.AuthorID != adminID || detail.Record.DecisionMakerID == nil || *detail.Record.DecisionMakerID != ownerID {
		t.Fatal("unfinished work not handed off or author changed")
	}
	requestWorkspaceJSON(t, f.clients["owner"], "PATCH", f.url+"/api/records/"+active.ID, f.project.ID, map[string]any{"title": "Owner can continue"}, 200, nil)
	requestWorkspaceJSON(t, f.clients["owner"], "GET", f.url+"/api/records/"+completed.ID, f.project.ID, nil, 200, &detail)
	if detail.Record.OwnerID != adminID || detail.Record.Result != "Finished" {
		t.Fatal("historical work changed")
	}
	requestJSON(t, f.clients["outsider"], "POST", f.url+"/api/invitations/accept", map[string]any{"code": oldInvite.Code}, 404, nil)
	requestJSON(t, f.clients["owner"], "POST", path+"/invitations", map[string]any{"role": "member", "projectIds": []string{f.project.ID}}, 201, &newInvite)
	requestJSON(t, f.clients["admin"], "POST", f.url+"/api/invitations/accept", map[string]any{"code": newInvite.Code}, 200, nil)
	var team TeamDetail
	requestJSON(t, f.clients["admin"], "GET", path, nil, 200, &team)
	if team.Role != "member" || team.Projects[0].Role != "member" {
		t.Fatal("reinvite restored elevated privileges")
	}
}

func TestOwnershipAndRemovalPermissions(t *testing.T) {
	f := newLifecycleFixture(t)
	path := f.url + "/api/teams/" + f.project.TeamID
	uid := func(role string) string { return strconv.FormatInt(f.users[role].ID, 10) }
	requestJSON(t, f.clients["owner"], "POST", path+"/leave", nil, 409, nil)
	requestJSON(t, f.clients["admin"], "DELETE", path+"/members/"+uid("owner"), nil, 409, nil)
	requestJSON(t, f.clients["member"], "DELETE", path+"/members/"+uid("admin"), nil, 403, nil)
	requestJSON(t, f.clients["outsider"], "DELETE", path+"/members/"+uid("member"), nil, 404, nil)
	requestJSON(t, f.clients["admin"], "POST", path+"/ownership", map[string]any{"userId": f.users["member"].ID}, 403, nil)
	requestJSON(t, f.clients["owner"], "POST", path+"/ownership", map[string]any{"userId": f.users["outsider"].ID}, 403, nil)
	requestJSON(t, f.clients["owner"], "POST", path+"/ownership", map[string]any{"userId": f.users["member"].ID}, 204, nil)
	var team TeamDetail
	requestJSON(t, f.clients["member"], "GET", path, nil, 200, &team)
	if team.Role != "owner" || team.Projects[0].Role != "owner" {
		t.Fatal("new owner lacks projects")
	}
	requestJSON(t, f.clients["admin"], "DELETE", path+"/members/"+uid("owner"), nil, 403, nil)
	requestJSON(t, f.clients["owner"], "POST", path+"/leave", nil, 204, nil)
	requestJSON(t, f.clients["member"], "DELETE", path+"/members/"+uid("admin"), nil, 204, nil)
	requestJSON(t, f.clients["member"], "PATCH", path, map[string]any{"name": "Renamed team", "description": "Changed"}, 204, nil)
	requestJSON(t, f.clients["member"], "GET", path, nil, 200, &team)
	if team.Name != "Renamed team" || team.Projects[0].Name != team.Name || team.Projects[0].Description != "Changed" {
		t.Fatal("team and workspace names diverged")
	}
	requestJSON(t, f.clients["member"], "DELETE", path, map[string]any{"name": "Renamed team"}, 204, nil)
}

func TestDeletedTeamDoesNotLeakThroughPersonalLinksAndNotifications(t *testing.T) {
	f := newLifecycleFixture(t)
	var record Record
	requestWorkspaceJSON(t, f.clients["member"], "POST", f.url+"/api/records", f.project.ID, map[string]any{"type": "task", "title": "Private project content"}, 201, &record)
	var note PersonalNote
	requestJSON(t, f.clients["member"], "POST", f.url+"/api/personal/notes", map[string]any{"body": "My private text"}, 201, &note)
	requestJSON(t, f.clients["member"], "POST", f.url+"/api/personal/links", map[string]any{"sourceType": "note", "sourceId": note.ID, "targetType": "record", "targetId": record.ID, "relationType": "related"}, 201, nil)
	_, err := f.store.db.Exec(`INSERT INTO notifications(id,user_id,type,title,body,entity_type,entity_id,created_at) VALUES('deleted-team-notice',?,'record_update','Hidden','Hidden','task',?,?)`, f.users["member"].ID, record.ID, nowText())
	if err != nil {
		t.Fatal(err)
	}
	requestJSON(t, f.clients["owner"], "DELETE", f.url+"/api/teams/"+f.project.TeamID, map[string]any{"name": "Lifecycle team"}, 204, nil)
	var overview PersonalOverview
	requestJSON(t, f.clients["member"], "GET", f.url+"/api/personal/overview", nil, 200, &overview)
	if len(overview.Links) != 0 || len(overview.Notes) != 1 {
		t.Fatal("deleted project leaked, or personal text lost")
	}
	var notices notificationInbox
	requestJSON(t, f.clients["member"], "GET", f.url+"/api/notifications/inbox", nil, 200, &notices)
	if len(notices.Items) != 0 || notices.UnreadCount != 0 {
		t.Fatal("deleted project notification leaked")
	}
	requestJSON(t, f.clients["member"], "POST", f.url+"/api/personal/links", map[string]any{"sourceType": "note", "sourceId": note.ID, "targetType": "record", "targetId": record.ID, "relationType": "related"}, 404, nil)
}
