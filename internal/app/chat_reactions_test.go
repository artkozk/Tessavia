package app

import (
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func TestChatReactionCatalogIdempotenceAndScope(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "reactions.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := httptest.NewServer(NewServer(store, Config{SessionLifetime: 24 * time.Hour, UploadPath: t.TempDir()}))
	defer server.Close()
	client, other := testClient(t), testClient(t)
	owner := register(t, client, server.URL, "emoji@example.test", "emoji_owner")
	otherUser := register(t, other, server.URL, "other@example.test", "emoji_other")
	var threads []ChatThread
	requestJSON(t, client, "GET", server.URL+"/api/chat/threads", nil, 200, &threads)
	thread := threads[0].ID
	// The legacy registration helper joins the default team. Explicitly remove
	// only this synthetic user's membership to model a nonparticipant.
	if _, err := store.db.Exec(`DELETE FROM chat_members WHERE thread_id=? AND user_id=?`, thread, otherUser.ID); err != nil {
		t.Fatal(err)
	}
	var message ChatMessage
	requestJSON(t, client, "POST", server.URL+"/api/chat/threads/"+thread+"/messages", map[string]any{"body": "Reaction fixture"}, 201, &message)
	endpoint := server.URL + "/api/chat/messages/" + message.ID + "/reaction"
	count := func(want int) {
		t.Helper()
		var got int
		if err := store.db.QueryRow(`SELECT COUNT(*) FROM chat_reactions WHERE message_id=?`, message.ID).Scan(&got); err != nil || got != want {
			t.Fatalf("count=%d want=%d err=%v", got, want, err)
		}
	}
	for _, value := range []string{"👩🏽‍❤️‍💋‍👨🏿", "👨‍👩‍👧‍👦", "🇷🇺", "🏴\U000e0067\U000e0062\U000e0065\U000e006e\U000e0067\U000e007f", "🫱🏽‍🫲🏿"} {
		for range 2 {
			requestJSON(t, client, "PUT", endpoint, map[string]any{"emoji": value, "active": true}, 204, nil)
		}
		count(1)
		for range 2 {
			requestJSON(t, client, "PUT", endpoint, map[string]any{"emoji": value, "active": false}, 204, nil)
		}
		count(0)
	}
	// Presentation aliases cannot become two separate reactions by the same owner.
	requestJSON(t, client, "PUT", endpoint, map[string]any{"emoji": "❤", "active": true}, 204, nil)
	requestJSON(t, client, "PUT", endpoint, map[string]any{"emoji": "❤️", "active": true}, 204, nil)
	count(1)
	requestJSON(t, client, "POST", endpoint, map[string]any{"emoji": "❤"}, 204, nil)
	count(0)
	for _, value := range []string{"", "hello", "😀😀", "😀text", "🏽"} {
		requestJSON(t, client, "PUT", endpoint, map[string]any{"emoji": value, "active": true}, 400, nil)
	}
	requestJSON(t, client, "PUT", endpoint, map[string]any{"emoji": "👍"}, 400, nil)
	requestJSON(t, other, "PUT", endpoint, map[string]any{"emoji": "👍", "active": true}, 403, nil)
	requestOutboxJSON(t, other, "PUT", endpoint, owner.ID, map[string]any{"emoji": "👍", "active": true}, 409)
	requestJSON(t, client, "PUT", server.URL+"/api/chat/messages/missing/reaction", map[string]any{"emoji": "👍", "active": true}, 404, nil)
	// Old arbitrary strings remain removable, but cannot be created again.
	if _, err := store.db.Exec(`INSERT INTO chat_reactions(message_id,user_id,emoji,created_at) VALUES(?,?,?,?), (?,?,?,?)`, message.ID, owner.ID, "legacy", nowText(), message.ID, otherUser.ID, "legacy", nowText()); err != nil {
		t.Fatal(err)
	}
	requestJSON(t, client, "POST", endpoint, map[string]any{"emoji": "legacy"}, 204, nil)
	count(1)
	requestJSON(t, client, "POST", endpoint, map[string]any{"emoji": "legacy"}, 400, nil)
	requestJSON(t, client, "DELETE", server.URL+"/api/chat/messages/"+message.ID, map[string]any{"reason": "Synthetic archive"}, 204, nil)
	requestJSON(t, client, "PUT", endpoint, map[string]any{"emoji": "👍", "active": true}, 404, nil)
}
