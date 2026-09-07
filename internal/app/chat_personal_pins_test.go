package app

import "testing"

func TestChatPersonalPinsPrivateStableAndRevoked(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(actor, method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[actor], method, f.url+"/api"+path, f.project.ID, body, status, out)
	}
	var first, second map[string]string
	for i, out := range []*map[string]string{&first, &second} {
		call("owner", "POST", "/chat/threads", map[string]any{"kind": "group", "title": []string{"First", "Second"}[i], "memberIds": []int64{f.users["member"].ID}}, 201, out)
	}
	list := func(actor string) []ChatThread {
		var out []ChatThread
		call(actor, "GET", "/chat/threads", nil, 200, &out)
		return out
	}
	pin := func(actor, id string, value any, status int) {
		call(actor, "PUT", "/chat/threads/"+id+"/personal-pin", map[string]any{"pinned": value}, status, nil)
	}
	var msg ChatMessage
	call("member", "POST", "/chat/threads/"+second["id"]+"/messages", map[string]any{"body": "Still unread", "clientNonce": "pin-unread"}, 201, &msg)
	before := list("owner")
	pin("admin", first["id"], true, 403)
	pin("owner", first["id"], nil, 400)
	pin("owner", first["id"], "true", 400)
	pin("owner", first["id"], true, 200)
	after := list("owner")
	if after[0].ID != first["id"] || !after[0].Pinned {
		t.Fatal("pin did not lead list", after)
	}
	for _, item := range list("member") {
		if item.Pinned {
			t.Fatal("personal pin leaked to peer")
		}
	}
	var timestamp string
	if err := f.store.db.QueryRow(`SELECT pinned_at FROM chat_personal_pins WHERE thread_id=? AND user_id=?`, first["id"], f.users["owner"].ID).Scan(&timestamp); err != nil {
		t.Fatal(err)
	}
	pin("owner", second["id"], true, 200)
	pin("owner", first["id"], true, 200)
	after = list("owner")
	if after[0].ID != second["id"] {
		t.Fatal("idempotent pin reordered list")
	}
	var repeated string
	f.store.db.QueryRow(`SELECT pinned_at FROM chat_personal_pins WHERE thread_id=? AND user_id=?`, first["id"], f.users["owner"].ID).Scan(&repeated)
	if repeated != timestamp {
		t.Fatal("idempotent pin changed timestamp")
	}
	for _, old := range before {
		for _, now := range after {
			if old.ID == now.ID && (old.UnreadCount != now.UnreadCount || old.LastMessage != now.LastMessage || old.UpdatedAt != now.UpdatedAt) {
				t.Fatal("pin modified shared state")
			}
		}
	}
	var other Workspace
	requestJSON(t, f.clients["owner"], "POST", f.url+"/api/teams", map[string]any{"name": "Other project"}, 201, &other)
	requestWorkspaceJSON(t, f.clients["owner"], "PUT", f.url+"/api/chat/threads/"+first["id"]+"/personal-pin", other.ID, map[string]any{"pinned": false}, 403, nil)
	pin("owner", first["id"], false, 200)
	pin("owner", first["id"], false, 200)
	pin("member", first["id"], true, 200)
	var group chatGroupDetail
	call("member", "GET", "/chat/threads/"+first["id"]+"/group", nil, 200, &group)
	call("member", "PATCH", "/chat/threads/"+first["id"]+"/group", map[string]any{"action": "leave", "expectedVersion": group.Version}, 204, nil)
	pin("member", first["id"], true, 403)
	var count int
	if err := f.store.db.QueryRow(`SELECT count(*) FROM chat_personal_pins WHERE thread_id=? AND user_id=?`, first["id"], f.users["member"].ID).Scan(&count); err != nil || count != 0 {
		t.Fatal("leaving retained pin", count, err)
	}
	call("owner", "GET", "/chat/threads/"+first["id"]+"/group", nil, 200, &group)
	call("owner", "PATCH", "/chat/threads/"+first["id"]+"/group", map[string]any{"action": "add", "userId": f.users["member"].ID, "expectedVersion": group.Version}, 204, nil)
	for _, item := range list("member") {
		if item.ID == first["id"] && item.Pinned {
			t.Fatal("rejoining resurrected old pin")
		}
	}
}
