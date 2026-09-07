package app

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

func TestChatGroupLifecycleRolesPrivacyAndConcurrency(t *testing.T) {
	f := newLifecycleFixture(t)
	var created map[string]string
	requestWorkspaceJSON(t, f.clients["member"], "POST", f.url+"/api/chat/threads", f.project.ID, map[string]any{"kind": "group", "title": "Закрытая группа", "memberIds": []int64{f.users["admin"].ID}}, 201, &created)
	base := f.url + "/api/chat/threads/" + created["id"]
	get := func(actor string) chatGroupDetail {
		var d chatGroupDetail
		requestWorkspaceJSON(t, f.clients[actor], "GET", base+"/group", f.project.ID, nil, 200, &d)
		return d
	}
	patch := func(actor, action string, target int64, extra map[string]any, status int) {
		payload := map[string]any{"action": action, "userId": target, "expectedVersion": get(actor).Version}
		for key, value := range extra {
			payload[key] = value
		}
		requestWorkspaceJSON(t, f.clients[actor], "PATCH", base+"/group", f.project.ID, payload, status, nil)
	}
	if d := get("member"); d.Role != "owner" || d.Version != 1 || d.CanRecoverOwner || len(d.Members) != 2 {
		t.Fatalf("wrong initial group: %+v", d)
	}
	if get("admin").Role != "member" {
		t.Fatal("project admin inherited private group management")
	}
	requestWorkspaceJSON(t, f.clients["owner"], "GET", base+"/group", f.project.ID, nil, 403, nil)
	requestWorkspaceJSON(t, f.clients["owner"], "PATCH", base+"/group", f.project.ID, map[string]any{"action": "add", "userId": f.users["owner"].ID, "expectedVersion": 1}, 403, nil)
	patch("admin", "rename", 0, map[string]any{"title": "Forbidden"}, 403)
	patch("admin", "transfer", f.users["admin"].ID, nil, 403)
	patch("member", "add", f.users["outsider"].ID, nil, 400)
	patch("member", "leave", 0, nil, 409)
	patch("member", "rename", 0, map[string]any{"title": strings.Repeat("я", 101)}, 400)
	patch("member", "rename", 0, map[string]any{"title": "Группа с понятным названием"}, 204)
	patch("member", "rename", 0, map[string]any{"title": "Старое окно", "expectedVersion": 1}, 409)
	if get("member").Title != "Группа с понятным названием" {
		t.Fatal("stale window overwrote title")
	}
	var page chatHistoryPage
	requestWorkspaceJSON(t, f.clients["member"], "GET", base+"/history", f.project.ID, nil, 200, &page)
	if len(page.Messages) != 1 || page.Messages[0].MessageType != "system" {
		t.Fatal("missing group event")
	}
	event := f.url + "/api/chat/messages/" + page.Messages[0].ID
	requestWorkspaceJSON(t, f.clients["member"], "PATCH", event, f.project.ID, map[string]any{"body": "erase history"}, 403, nil)
	requestWorkspaceJSON(t, f.clients["member"], "DELETE", event, f.project.ID, map[string]any{"reason": "erase history"}, 403, nil)
	// A normal message must not invalidate an open settings form.
	version := get("member").Version
	requestWorkspaceJSON(t, f.clients["admin"], "POST", base+"/messages", f.project.ID, map[string]any{"body": "SC group private text"}, 201, &ChatMessage{})
	patch("member", "role", f.users["admin"].ID, map[string]any{"role": "admin", "expectedVersion": version}, 204)
	patch("admin", "add", f.users["owner"].ID, nil, 204)
	if get("owner").Role != "member" {
		t.Fatal("invited project owner inherited group role")
	}
	patch("admin", "remove", f.users["member"].ID, nil, 409)
	patch("admin", "role", f.users["owner"].ID, map[string]any{"role": "admin"}, 403)
	patch("member", "role", f.users["owner"].ID, map[string]any{"role": "admin"}, 204)
	patch("admin", "remove", f.users["owner"].ID, nil, 403)
	patch("member", "role", f.users["owner"].ID, map[string]any{"role": "member"}, 204)
	// Old attachment URLs must be denied after removal, before touching storage.
	_, err := f.store.db.Exec(`INSERT INTO chat_attachments(id,uploader_id,original_name,stored_name,content_type,size_bytes,sha256,created_at) VALUES('group-file',?,'private.txt','group-private-file','text/plain',4,'test',?)`, f.users["owner"].ID, nowText())
	if err != nil {
		t.Fatal(err)
	}
	_, err = f.store.db.Exec(`INSERT INTO chat_messages(id,thread_id,author_id,attachment_id,message_type,body,created_at) VALUES('group-file-message',?,?,'group-file','file','SC group attachment',?)`, created["id"], f.users["owner"].ID, nowText())
	if err != nil {
		t.Fatal(err)
	}
	_, err = f.store.db.Exec(`INSERT INTO chat_calls(id,thread_id,started_by,status,offer_sdp,started_at) VALUES('group-active-call',?,?,'active','synthetic offer',?)`, created["id"], f.users["owner"].ID, nowText())
	if err != nil {
		t.Fatal(err)
	}
	patch("admin", "remove", f.users["owner"].ID, nil, 204)
	requestWorkspaceJSON(t, f.clients["admin"], "GET", base+"/calls/active", f.project.ID, nil, 204, nil)
	var callStatus string
	f.store.db.QueryRow(`SELECT status FROM chat_calls WHERE id='group-active-call'`).Scan(&callStatus)
	if callStatus != "ended" {
		t.Fatal("membership removal left peer call active")
	}
	for _, route := range []string{"/group", "/history", "/history?q=SC", "/messages", "/pins", "/calls/active"} {
		requestWorkspaceJSON(t, f.clients["owner"], "GET", base+route, f.project.ID, nil, 403, nil)
	}
	requestWorkspaceJSON(t, f.clients["owner"], "GET", f.url+"/api/chat/attachments/group-file", f.project.ID, nil, 403, nil)
	requestWorkspaceJSON(t, f.clients["owner"], "POST", base+"/messages", f.project.ID, map[string]any{"body": "still here"}, 403, nil)
	var threads []ChatThread
	requestWorkspaceJSON(t, f.clients["owner"], "GET", f.url+"/api/chat/threads", f.project.ID, nil, 200, &threads)
	for _, thread := range threads {
		if thread.ID == created["id"] {
			t.Fatal("removed group remains listed")
		}
	}
	patch("member", "transfer", f.users["admin"].ID, nil, 204)
	if get("admin").Role != "owner" || get("member").Role != "admin" {
		t.Fatal("ownership transfer failed")
	}
	patch("member", "leave", 0, nil, 204)
	requestWorkspaceJSON(t, f.clients["member"], "GET", base+"/group", f.project.ID, nil, 403, nil)
	patch("admin", "leave", 0, nil, 409)
	for _, role := range []string{"owner", "admin", "member"} {
		var got string
		if err := f.store.db.QueryRow(`SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=? AND status='active'`, f.project.ID, f.users[role].ID).Scan(&got); err != nil || got != role {
			t.Fatalf("group changed project %s: %s %v", role, got, err)
		}
	}
}

func TestChatGroupRecoveryAndAtomicEvents(t *testing.T) {
	f := newLifecycleFixture(t)
	var created map[string]string
	requestWorkspaceJSON(t, f.clients["member"], "POST", f.url+"/api/chat/threads", f.project.ID, map[string]any{"kind": "group", "title": "Orphan recovery", "memberIds": []int64{f.users["admin"].ID}}, 201, &created)
	base := f.url + "/api/chat/threads/" + created["id"] + "/group"
	_, err := f.store.db.Exec(`UPDATE workspace_members SET status='suspended' WHERE workspace_id=? AND user_id=?`, f.project.ID, f.users["member"].ID)
	if err != nil {
		t.Fatal(err)
	}
	var group chatGroupDetail
	requestWorkspaceJSON(t, f.clients["admin"], "GET", base, f.project.ID, nil, 200, &group)
	if !group.CanRecoverOwner {
		t.Fatal("member project admin cannot recover orphaned group")
	}
	requestWorkspaceJSON(t, f.clients["owner"], "PATCH", base, f.project.ID, map[string]any{"action": "transfer", "userId": f.users["owner"].ID, "expectedVersion": group.Version}, 403, nil)
	requestWorkspaceJSON(t, f.clients["admin"], "PATCH", base, f.project.ID, map[string]any{"action": "transfer", "userId": f.users["admin"].ID, "expectedVersion": group.Version}, 204, nil)
	requestWorkspaceJSON(t, f.clients["admin"], "GET", base, f.project.ID, nil, 200, &group)
	if group.Role != "owner" || group.CanRecoverOwner {
		t.Fatal("recovery did not settle owner")
	}
	_, err = f.store.db.Exec(`CREATE TRIGGER fail_group_event BEFORE INSERT ON chat_messages WHEN NEW.message_type='system' BEGIN SELECT RAISE(ABORT,'synthetic event failure'); END;`)
	if err != nil {
		t.Fatal(err)
	}
	requestWorkspaceJSON(t, f.clients["admin"], "PATCH", base, f.project.ID, map[string]any{"action": "rename", "title": "must roll back", "expectedVersion": group.Version}, 500, nil)
	var after chatGroupDetail
	requestWorkspaceJSON(t, f.clients["admin"], "GET", base, f.project.ID, nil, 200, &after)
	if after.Title != group.Title || after.Version != group.Version {
		t.Fatal("failed event left partial settings update")
	}
}

func TestChatGroupMigrationSeedsExistingOwnersOnly(t *testing.T) {
	f := newLifecycleFixture(t)
	var group, direct map[string]string
	requestWorkspaceJSON(t, f.clients["member"], "POST", f.url+"/api/chat/threads", f.project.ID, map[string]any{"kind": "group", "title": "Existing group", "memberIds": []int64{f.users["admin"].ID}}, 201, &group)
	requestWorkspaceJSON(t, f.clients["member"], "POST", f.url+"/api/chat/threads", f.project.ID, map[string]any{"kind": "direct", "partnerId": f.users["admin"].ID}, 201, &direct)
	for _, query := range []string{`DROP TABLE chat_group_roles`, `DROP TABLE chat_group_settings`, `DELETE FROM schema_migrations WHERE version='058_chat_group_lifecycle.sql'`} {
		if _, err := f.store.db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	if err := f.store.migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	var count int
	f.store.db.QueryRow(`SELECT COUNT(*) FROM chat_group_settings`).Scan(&count)
	if count != 1 {
		t.Fatal("migration changed non-group conversations")
	}
	var role string
	if err := f.store.db.QueryRow(`SELECT role FROM chat_group_roles WHERE thread_id=? AND user_id=?`, group["id"], f.users["member"].ID).Scan(&role); err != nil || role != "owner" {
		t.Fatal(fmt.Sprint("existing owner not seeded: ", err))
	}
}
