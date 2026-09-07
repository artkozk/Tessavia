package app

import (
	"fmt"
	"testing"
)

func TestChatAttachmentsAcrossHistoryPermissionsAndSearch(t *testing.T) {
	f := newLifecycleFixture(t)
	call := func(actor, method, path string, body any, status int, out any) {
		t.Helper()
		requestWorkspaceJSON(t, f.clients[actor], method, f.url+"/api"+path, f.project.ID, body, status, out)
	}
	var group map[string]string
	call("owner", "POST", "/chat/threads", map[string]any{"kind": "group", "title": "Files", "memberIds": []int64{f.users["member"].ID}}, 201, &group)
	thread := group["id"]
	base := "/chat/threads/" + thread + "/history"
	for i := 0; i < 60; i++ {
		id := fmt.Sprintf("attachment-%03d", i)
		name := fmt.Sprintf("file-%d.txt", i)
		if i == 0 {
			name = "ОТЧЁТ.txt"
		}
		_, err := f.store.db.Exec(`INSERT INTO chat_attachments(id,uploader_id,original_name,stored_name,content_type,size_bytes,sha256,created_at) VALUES(?,?,?,?,'text/plain',1,'hash','2026-01-01T00:00:00Z')`, id, f.users["owner"].ID, name, id)
		if err != nil {
			t.Fatal(err)
		}
		_, err = f.store.db.Exec(`INSERT INTO chat_messages(id,thread_id,author_id,attachment_id,message_type,body,created_at) VALUES(?,?,?,?,'file','','2026-01-01T00:00:00Z')`, id, thread, f.users["owner"].ID, id)
		if err != nil {
			t.Fatal(err)
		}
	}
	for i := 0; i < 240; i++ {
		_, err := f.store.db.Exec(`INSERT INTO chat_messages(id,thread_id,author_id,message_type,body,created_at) VALUES(?,?,?,'text','later text','2026-01-02T00:00:00Z')`, fmt.Sprintf("text-%03d", i), thread, f.users["owner"].ID)
		if err != nil {
			t.Fatal(err)
		}
	}
	var page chatHistoryPage
	call("member", "GET", base+"?attachments=true", nil, 200, &page)
	if len(page.Messages) != 50 || !page.HasMore || page.HasNewer || page.Messages[0].ID != "attachment-010" {
		t.Fatal("attachments hidden behind text or wrong boundary", page)
	}
	for _, m := range page.Messages {
		if m.Attachment == nil {
			t.Fatal("plain text in attachments")
		}
	}
	call("member", "GET", base+"?attachments=true&before="+page.NextBefore, nil, 200, &page)
	if len(page.Messages) != 10 || page.HasMore {
		t.Fatal("lost earlier attachments")
	}
	call("member", "GET", base+"?attachments=true&q=%D0%BE%D1%82%D1%87%D1%91%D1%82", nil, 200, &page)
	if len(page.Messages) != 1 || page.Messages[0].ID != "attachment-000" {
		t.Fatal("filename search failed")
	}
	var read string
	f.store.db.QueryRow(`SELECT last_read_at FROM chat_members WHERE thread_id=? AND user_id=?`, thread, f.users["member"].ID).Scan(&read)
	if read != "" {
		t.Fatal("attachment query read the conversation")
	}
	call("admin", "GET", base+"?attachments=true", nil, 403, nil)
	call("member", "GET", base+"?attachments=unknown", nil, 400, nil)
	call("member", "GET", base+"?attachments=true&after=attachment-000", nil, 400, nil)
	call("member", "GET", base+"?attachments=true&before=foreign", nil, 400, nil)
	f.store.db.Exec(`UPDATE chat_messages SET archived_at='2026-02-01T00:00:00Z' WHERE id='attachment-000'`)
	call("member", "GET", base+"?attachments=true&q=%D0%BE%D1%82%D1%87%D1%91%D1%82", nil, 200, &page)
	if len(page.Messages) != 0 {
		t.Fatal("archived attachment returned")
	}
	call("member", "GET", base, nil, 200, &page)
	if len(page.Messages) != 50 || page.Messages[0].Attachment != nil {
		t.Fatal("ordinary history changed")
	}
}
