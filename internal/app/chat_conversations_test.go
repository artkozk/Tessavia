package app

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"testing"
	"time"
)

func TestChatConversationsPrivateGroupsHistorySearchAndPins(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "conversations.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: time.Hour, UploadPath: t.TempDir()}))
	defer server.Close()
	alice, bob, carol := testClient(t), testClient(t), testClient(t)
	a := register(t, alice, server.URL, "alice@example.test", "alice")
	b := register(t, bob, server.URL, "bob@example.test", "bob")
	c := register(t, carol, server.URL, "carol@example.test", "carol")
	var direct, again map[string]string
	requestJSON(t, alice, "POST", server.URL+"/api/chat/threads", map[string]any{"kind": "direct", "partnerId": b.ID}, 201, &direct)
	requestJSON(t, bob, "POST", server.URL+"/api/chat/threads", map[string]any{"kind": "direct", "partnerId": a.ID}, 200, &again)
	if direct["id"] != again["id"] {
		t.Fatal("pair created a duplicate conversation")
	}
	requestJSON(t, alice, "POST", server.URL+"/api/chat/threads", map[string]any{"kind": "direct", "partnerId": 99999}, 400, nil)
	requestJSON(t, alice, "POST", server.URL+"/api/chat/threads", map[string]any{"kind": "direct", "partnerId": a.ID}, 400, nil)
	var threads []ChatThread
	requestJSON(t, bob, "GET", server.URL+"/api/chat/threads", nil, 200, &threads)
	found := false
	for _, thread := range threads {
		if thread.ID == direct["id"] {
			found = true
			if thread.Kind != "direct" || thread.PartnerUsername != "alice" || thread.MemberCount != 2 {
				t.Fatalf("wrong direct identity: %+v", thread)
			}
		}
		if thread.Kind == "team" && thread.PartnerUsername != "" {
			t.Fatal("team impersonates a colleague")
		}
	}
	if !found {
		t.Fatal("recipient cannot find direct chat")
	}
	requestJSON(t, carol, "GET", server.URL+"/api/chat/threads", nil, 200, &threads)
	for _, thread := range threads {
		if thread.ID == direct["id"] {
			t.Fatal("private chat exposed to a third project member")
		}
	}
	requestJSON(t, carol, "GET", server.URL+"/api/chat/threads/"+direct["id"]+"/history", nil, 403, nil)
	var group map[string]string
	requestJSON(t, alice, "POST", server.URL+"/api/chat/threads", map[string]any{"kind": "group", "title": "Обсуждение макета", "memberIds": []int64{a.ID, c.ID, c.ID}}, 201, &group)
	requestJSON(t, bob, "POST", server.URL+"/api/chat/threads/"+group["id"]+"/messages", map[string]any{"body": "not a member"}, 403, nil)
	var message ChatMessage
	requestJSON(t, carol, "POST", server.URL+"/api/chat/threads/"+group["id"]+"/messages", map[string]any{"body": "ПРОВЕРЯЕМ длинную историю", "clientNonce": "source"}, 201, &message)
	for i := 0; i < 235; i++ {
		_, err = store.db.Exec(`INSERT INTO chat_messages(id,thread_id,author_id,message_type,body,created_at) VALUES(?,?,?,'text',?,?)`, fmt.Sprintf("history-%04d", i), group["id"], a.ID, fmt.Sprintf("Сообщение %d", i), time.Now().Add(time.Duration(i+1)*time.Second).UTC().Format(time.RFC3339Nano))
		if err != nil {
			t.Fatal(err)
		}
	}
	seen := map[string]bool{}
	before := ""
	for {
		var page chatHistoryPage
		requestJSON(t, alice, "GET", server.URL+"/api/chat/threads/"+group["id"]+"/history?before="+url.QueryEscape(before), nil, 200, &page)
		if len(page.Messages) > 50 {
			t.Fatal("unbounded page")
		}
		for _, item := range page.Messages {
			if seen[item.ID] {
				t.Fatal("duplicate across history pages")
			}
			seen[item.ID] = true
		}
		if !page.HasMore {
			break
		}
		if page.NextBefore == before || page.NextBefore == "" {
			t.Fatal("cursor did not advance")
		}
		before = page.NextBefore
	}
	if len(seen) != 236 || !seen[message.ID] {
		t.Fatalf("history lost messages: %d", len(seen))
	}
	var search chatHistoryPage
	requestJSON(t, alice, "GET", server.URL+"/api/chat/threads/"+group["id"]+"/history?q="+url.QueryEscape("проверяем"), nil, 200, &search)
	if len(search.Messages) != 1 || search.Messages[0].ID != message.ID {
		t.Fatal("search misses old Cyrillic message")
	}
	requestJSON(t, alice, "GET", server.URL+"/api/chat/threads/"+group["id"]+"/history?around="+message.ID, nil, 200, &search)
	if len(search.Messages) != 1 || search.Messages[0].ID != message.ID || search.HasMore {
		t.Fatal("jump to oldest message lost its position")
	}
	requestJSON(t, alice, "GET", server.URL+"/api/chat/threads/"+direct["id"]+"/history?before="+message.ID, nil, 400, nil)
	requestJSON(t, alice, "PUT", server.URL+"/api/chat/threads/"+group["id"]+"/pins", map[string]any{"messageId": message.ID, "pinned": true}, 200, nil)
	requestJSON(t, bob, "GET", server.URL+"/api/chat/threads/"+group["id"]+"/pins", nil, 403, nil)
	var pins []map[string]string
	requestJSON(t, carol, "GET", server.URL+"/api/chat/threads/"+group["id"]+"/pins", nil, 200, &pins)
	if len(pins) != 1 || pins[0]["id"] != message.ID {
		t.Fatal("pin not shared with group")
	}
	requestJSON(t, alice, "PUT", server.URL+"/api/chat/threads/"+group["id"]+"/pins", map[string]any{"messageId": message.ID, "pinned": false}, 200, nil)
	requestJSON(t, carol, http.MethodGet, server.URL+"/api/chat/threads/"+group["id"]+"/pins", nil, 200, &pins)
	if len(pins) != 0 {
		t.Fatal("unpin did not persist")
	}
}
