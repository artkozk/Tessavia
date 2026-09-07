package app

import "testing"

func TestPersonalChatArchivePreservesContentUnreadPinsAndAccess(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(actor, method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[actor], method, f.url+"/api"+path, f.project.ID, body, status, out)
	}
	var group map[string]string
	call("owner", "POST", "/chat/threads", map[string]any{"kind": "group", "title": "Archive", "memberIds": []int64{f.users["member"].ID}}, 201, &group)
	id := group["id"]
	base := "/chat/threads/" + id
	list := func(actor string) ChatThread {
		var items []ChatThread
		call(actor, "GET", "/chat/threads", nil, 200, &items)
		for _, item := range items {
			if item.ID == id {
				return item
			}
		}
		t.Fatal("conversation missing")
		return ChatThread{}
	}
	archive := func(actor string, value any, status int) {
		call(actor, "PUT", base+"/personal-archive", map[string]any{"archived": value}, status, nil)
	}
	call("owner", "PUT", base+"/personal-pin", map[string]any{"pinned": true}, 200, nil)
	call("member", "POST", base+"/messages", map[string]any{"body": "Keep this history", "clientNonce": "archive-original"}, 201, nil)
	before := list("owner")
	archive("admin", true, 403)
	archive("owner", nil, 400)
	archive("owner", "true", 400)
	archive("owner", true, 200)
	after := list("owner")
	if !after.Archived || !after.Pinned || after.UnreadCount != before.UnreadCount || after.LastMessage != before.LastMessage || after.UpdatedAt != before.UpdatedAt {
		t.Fatal("archive changed shared state", before, after)
	}
	if list("member").Archived {
		t.Fatal("archive leaked to another member")
	}
	var first, again string
	f.store.db.QueryRow(`SELECT archived_at FROM chat_personal_archives WHERE thread_id=? AND user_id=?`, id, f.users["owner"].ID).Scan(&first)
	archive("owner", true, 200)
	f.store.db.QueryRow(`SELECT archived_at FROM chat_personal_archives WHERE thread_id=? AND user_id=?`, id, f.users["owner"].ID).Scan(&again)
	if first == "" || first != again {
		t.Fatal("archive not idempotent")
	}
	call("member", "POST", base+"/messages", map[string]any{"body": "A new message while archived", "clientNonce": "archive-new"}, 201, nil)
	if item := list("owner"); !item.Archived || item.UnreadCount != before.UnreadCount+1 {
		t.Fatal("new message restored or marked archive read", item)
	}
	var history chatHistoryPage
	call("owner", "GET", base+"/history", nil, 200, &history)
	if len(history.Messages) != 2 {
		t.Fatal("archive lost history")
	}
	var other Workspace
	requestJSON(t, f.clients["owner"], "POST", f.url+"/api/teams", map[string]any{"name": "Other archive project"}, 201, &other)
	requestWorkspaceJSON(t, f.clients["owner"], "PUT", f.url+"/api"+base+"/personal-archive", other.ID, map[string]any{"archived": false}, 403, nil)
	archive("owner", false, 200)
	archive("owner", false, 200)
	if item := list("owner"); item.Archived || !item.Pinned || item.UnreadCount != before.UnreadCount+1 {
		t.Fatal("restore lost preferences or read history", item)
	}
	archive("member", true, 200)
	var g chatGroupDetail
	call("member", "GET", base+"/group", nil, 200, &g)
	call("member", "PATCH", base+"/group", map[string]any{"action": "leave", "expectedVersion": g.Version}, 204, nil)
	archive("member", false, 403)
	var count int
	f.store.db.QueryRow(`SELECT count(*) FROM chat_personal_archives WHERE thread_id=? AND user_id=?`, id, f.users["member"].ID).Scan(&count)
	if count != 0 {
		t.Fatal("leave kept archive preference")
	}
	call("owner", "GET", base+"/group", nil, 200, &g)
	call("owner", "PATCH", base+"/group", map[string]any{"action": "add", "userId": f.users["member"].ID, "expectedVersion": g.Version}, 204, nil)
	if list("member").Archived {
		t.Fatal("rejoining resurrected archive")
	}
}
