package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

func TestOfflineChatReceiptsAndUploads(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "chat-outbox.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	uploads := t.TempDir()
	app := NewServer(store, Config{SessionLifetime: 24 * time.Hour, UploadPath: uploads})
	server := httptest.NewServer(app)
	defer server.Close()
	client, other := testClient(t), testClient(t)
	owner := register(t, client, server.URL, "owner@example.test", "outbox_chat_owner")
	register(t, other, server.URL, "other@example.test", "outbox_chat_other")
	var threads []ChatThread
	requestJSON(t, client, "GET", server.URL+"/api/chat/threads", nil, 200, &threads)
	threadID := threads[0].ID
	endpoint := server.URL + "/api/chat/threads/" + threadID
	body := map[string]any{"body": "Immutable original", "clientNonce": "outbox-chat-original"}
	results := make(chan outboxHTTPResult, 2)
	for range 2 {
		go func() { results <- sendOutboxRequest(client, "POST", endpoint+"/messages", owner.ID, body) }()
	}
	first, second := <-results, <-results
	if first.err != nil || second.err != nil || first.status != 201 || second.status != 201 || first.data["id"] != second.data["id"] {
		t.Fatalf("concurrent messages: %#v %#v", first, second)
	}
	id := first.data["id"].(string)
	if first.data["clientNonce"] != "outbox-chat-original" {
		t.Fatal("receipt lost client nonce")
	}
	var ownHistory, otherHistory []ChatMessage
	requestJSON(t, client, "GET", endpoint+"/messages", nil, 200, &ownHistory)
	requestJSON(t, other, "GET", endpoint+"/messages", nil, 200, &otherHistory)
	if len(ownHistory) != 1 || ownHistory[0].ClientNonce != "outbox-chat-original" {
		t.Fatal("author cannot reconcile uncertain delivery")
	}
	if len(otherHistory) != 1 || otherHistory[0].ClientNonce != "" {
		t.Fatal("another member received author nonce")
	}
	// Move the receipt out of the latest page without paying for 205 HTTP sessions.
	tx, err := store.db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	for i := range 205 {
		_, err = tx.Exec(`INSERT INTO chat_messages(id,thread_id,author_id,message_type,body,created_at) VALUES(?,?,?,'text','later',?)`, fmt.Sprintf("later-%03d", i), threadID, owner.ID, nowText())
		if err != nil {
			t.Fatal(err)
		}
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	requestJSON(t, client, "PATCH", server.URL+"/api/chat/messages/"+id, map[string]any{"body": "Edited after acknowledgment"}, 204, nil)
	replay := requestOutboxJSON(t, client, "POST", endpoint+"/messages", owner.ID, body, 201)
	if replay["id"] != id || replay["body"] != "Edited after acknowledgment" || replay["editedAt"] == nil {
		t.Fatal("old receipt not read correctly", replay)
	}
	requestOutboxJSON(t, client, "POST", endpoint+"/messages", owner.ID, map[string]any{"body": "Changed original", "clientNonce": "outbox-chat-original"}, 409)
	requestOutboxJSON(t, other, "POST", endpoint+"/messages", owner.ID, body, 409)
	requestJSON(t, client, "DELETE", server.URL+"/api/chat/messages/"+id, map[string]any{"reason": "test archive"}, 204, nil)
	requestOutboxJSON(t, client, "POST", endpoint+"/messages", owner.ID, body, 409)
	requestOutboxJSON(t, client, "POST", endpoint+"/messages", owner.ID, map[string]any{"body": "No key"}, 400)

	upload := func(key, text, reply string) (int, ChatMessage, error) {
		var data bytes.Buffer
		writer := multipart.NewWriter(&data)
		_ = writer.WriteField("clientNonce", key)
		_ = writer.WriteField("replyToId", reply)
		part, err := writer.CreateFormFile("file", "queued.txt")
		if err != nil {
			return 0, ChatMessage{}, err
		}
		_, _ = io.WriteString(part, text)
		_ = writer.Close()
		req, err := http.NewRequest("POST", endpoint+"/attachments", &data)
		if err != nil {
			return 0, ChatMessage{}, err
		}
		req.Header.Set("Content-Type", writer.FormDataContentType())
		req.Header.Set("X-Outbox-Owner", strconv.FormatInt(owner.ID, 10))
		response, err := client.Do(req)
		if err != nil {
			return 0, ChatMessage{}, err
		}
		defer response.Body.Close()
		var message ChatMessage
		if response.StatusCode == 201 {
			err = json.NewDecoder(response.Body).Decode(&message)
		} else {
			_, _ = io.Copy(io.Discard, response.Body)
		}
		return response.StatusCode, message, err
	}
	type uploadResult struct {
		status  int
		message ChatMessage
		err     error
	}
	fileResults := make(chan uploadResult, 2)
	for range 2 {
		go func() {
			status, message, err := upload("outbox-file-original", "file body", "")
			fileResults <- uploadResult{status, message, err}
		}()
	}
	a, b := <-fileResults, <-fileResults
	if a.err != nil || b.err != nil || a.status != 201 || b.status != 201 || a.message.ID != b.message.ID || a.message.Attachment == nil || b.message.Attachment == nil || a.message.Attachment.ID != b.message.Attachment.ID {
		t.Fatalf("concurrent files: %#v %#v", a, b)
	}
	// This is also the request repeated after a lost response: same file, same key.
	status, confirmed, err := upload("outbox-file-original", "file body", "")
	if err != nil || status != 201 || confirmed.ID != a.message.ID {
		t.Fatal("upload replay", status, err, confirmed)
	}
	if status, _, err = upload("outbox-file-original", "different bytes", ""); err != nil || status != 409 {
		t.Fatal("file content conflict", status, err)
	}
	if status, _, err = upload("outbox-file-bad-reply", "will fail", "missing-message"); err != nil || status != 409 {
		t.Fatal("file reference conflict", status, err)
	}
	// A second file can succeed after a partial batch without repeating the first.
	if status, _, err = upload("outbox-file-second", "second file", ""); err != nil || status != 201 {
		t.Fatal("partial batch resume", status, err)
	}
	var stored string
	if err = store.db.QueryRow(`SELECT stored_name FROM chat_attachments WHERE id=?`, a.message.Attachment.ID).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	(&Server{store: store}).removeUnusedChatUpload(context.Background(), a.message.Attachment.ID, filepath.Join(uploads, stored))
	data, err := os.ReadFile(filepath.Join(uploads, stored))
	if err != nil || string(data) != "file body" {
		t.Fatal("committed file removed", err)
	}
	files, err := os.ReadDir(uploads)
	if err != nil || len(files) != 2 {
		t.Fatal("duplicate/orphan files", len(files), err)
	}
	var count int
	if err = store.db.QueryRow(`SELECT COUNT(*) FROM chat_attachments`).Scan(&count); err != nil || count != 2 {
		t.Fatal("duplicate/orphan file rows", count, err)
	}
	if _, err = store.db.Exec(`DELETE FROM chat_members WHERE thread_id=? AND user_id=?`, threadID, owner.ID); err != nil {
		t.Fatal(err)
	}
	requestOutboxJSON(t, client, "POST", endpoint+"/messages", owner.ID, map[string]any{"body": "Revoked", "clientNonce": "outbox-chat-revoked"}, 403)
	if status, _, err = upload("outbox-file-original", "file body", ""); err != nil || status != 403 {
		t.Fatal("revoked upload replay", status, err)
	}
}
