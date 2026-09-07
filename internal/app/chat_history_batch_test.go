package app

import (
	"context"
	"fmt"
	"sort"
	"testing"
	"time"
)

func TestChatHistoryLargePagePreservesReactionsAndReceipts(t *testing.T) {
	store, server, client, other := newPersonalPlanningFixture(t)
	var owner, peer User
	requestJSON(t, client, "GET", server.URL+"/api/me", nil, 200, &owner)
	requestJSON(t, other, "GET", server.URL+"/api/me", nil, 200, &peer)
	var threads []ChatThread
	requestJSON(t, client, "GET", server.URL+"/api/chat/threads", nil, 200, &threads)
	thread := threads[0].ID
	tx, err := store.db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	start := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)
	for i := 0; i < 5000; i++ {
		id := fmt.Sprintf("scale-%06d", i)
		stamp := start.Add(time.Duration(i) * time.Second).Format(time.RFC3339)
		body := "Повседневная переписка"
		if i == 1234 {
			body = "Точечный поиск"
		}
		author := owner.ID
		if i%2 == 1 {
			author = peer.ID
		}
		if _, err = tx.Exec(`INSERT INTO chat_messages(id,thread_id,author_id,message_type,body,created_at) VALUES(?,?,?,'text',?,?)`, id, thread, author, body, stamp); err != nil {
			t.Fatal(err)
		}
		for _, u := range []int64{owner.ID, peer.ID} {
			if _, err = tx.Exec(`INSERT INTO chat_reactions(message_id,user_id,emoji,created_at) VALUES(?,?,'👍',?)`, id, u, stamp); err != nil {
				t.Fatal(err)
			}
		}
	}
	if _, err = tx.Exec(`UPDATE chat_members SET last_read_at=? WHERE thread_id=?`, start.Add(6000*time.Second).Format(time.RFC3339), thread); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	app := &Server{store: store}
	ctx := context.Background()
	durations := []time.Duration{}
	for i := 0; i < 7; i++ {
		began := time.Now()
		page, e := app.listChatMessages(ctx, thread, owner.ID, false, chatHistoryOptions{Limit: 200})
		durations = append(durations, time.Since(began))
		if e != nil {
			t.Fatal(e)
		}
		if len(page) != 200 || page[0].ID != "scale-004800" || page[199].ID != "scale-004999" {
			t.Fatal("page boundary/order changed")
		}
		for _, m := range page {
			if len(m.Reactions) != 1 || m.Reactions[0].Count != 2 || !m.Reactions[0].Mine || len(m.Reactions[0].Usernames) != 2 {
				t.Fatalf("wrong reactions: %+v", m.Reactions)
			}
			if len(m.ReadBy) != 1 || m.ReadBy[0].Username == m.AuthorUsername {
				t.Fatalf("wrong read receipts: %+v", m.ReadBy)
			}
		}
	}
	sort.Slice(durations, func(i, j int) bool { return durations[i] < durations[j] })
	t.Logf("5000 messages, 10000 reactions, page 200, seven runs: median=%s min=%s max=%s", durations[3], durations[0], durations[6])
	began := time.Now()
	matches, err := app.listChatMessages(ctx, thread, owner.ID, false, chatHistoryOptions{Limit: 20, Query: "ТОЧЕЧНЫЙ"})
	if err != nil || len(matches) != 1 || matches[0].ID != "scale-001234" {
		t.Fatalf("unicode search changed: %v, %+v", err, matches)
	}
	t.Logf("rare Unicode search: %s", time.Since(began))
	forward, err := app.listChatMessages(ctx, thread, owner.ID, false, chatHistoryOptions{Limit: 20, After: "scale-002000"})
	if err != nil || len(forward) != 20 || forward[0].ID != "scale-002001" || forward[19].ID != "scale-002020" {
		t.Fatal("forward page changed")
	}
}

func TestChatPageMetadataPreservesEmptyStateAndReturnsReadFailures(t *testing.T) {
	store, server, client, other := newPersonalPlanningFixture(t)
	var owner, peer User
	requestJSON(t, client, "GET", server.URL+"/api/me", nil, 200, &owner)
	requestJSON(t, other, "GET", server.URL+"/api/me", nil, 200, &peer)
	var threads []ChatThread
	requestJSON(t, client, "GET", server.URL+"/api/chat/threads", nil, 200, &threads)
	thread := threads[0].ID
	var message ChatMessage
	requestJSON(t, client, "POST", server.URL+"/api/chat/threads/"+thread+"/messages", map[string]any{"body": "Metadata check"}, 201, &message)
	app := &Server{store: store}
	if _, err := store.db.Exec(`UPDATE chat_members SET last_read_at='' WHERE thread_id=? AND user_id=?`, thread, peer.ID); err != nil {
		t.Fatal(err)
	}
	page, err := app.listChatMessages(context.Background(), thread, owner.ID, false)
	if err != nil || len(page) != 1 || page[0].Reactions == nil || len(page[0].Reactions) != 0 || page[0].ReadBy == nil || len(page[0].ReadBy) != 0 {
		t.Fatalf("empty metadata changed: %+v, %v", page, err)
	}
	if _, err = store.db.Exec(`UPDATE chat_members SET last_read_at=? WHERE thread_id=? AND user_id=?`, message.CreatedAt, thread, peer.ID); err != nil {
		t.Fatal(err)
	}
	page, err = app.listChatMessages(context.Background(), thread, owner.ID, false)
	if err != nil || len(page[0].ReadBy) != 1 || page[0].ReadBy[0].Username != peer.Username {
		t.Fatal("read boundary lost")
	}
	if _, err = store.db.Exec(`ALTER TABLE chat_reactions RENAME TO unavailable_reactions`); err != nil {
		t.Fatal(err)
	}
	if _, err = app.listChatMessages(context.Background(), thread, owner.ID, false); err == nil {
		t.Fatal("reaction read failure returned false empty data")
	}
}
