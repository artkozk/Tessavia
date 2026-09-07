package app

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
)

type chatConversationInput struct {
	Kind      string  `json:"kind"`
	Title     string  `json:"title"`
	PartnerID int64   `json:"partnerId"`
	MemberIDs []int64 `json:"memberIds"`
}

func (s *Server) createChatConversation(w http.ResponseWriter, r *http.Request, input chatConversationInput) {
	actor, workspace := currentUser(r), currentWorkspace(r)
	input.Title = strings.TrimSpace(input.Title)
	if input.Kind != "direct" && input.Kind != "group" || len([]rune(input.Title)) > 100 {
		writeError(w, 400, "Выберите личный диалог или группу; название — до 100 символов")
		return
	}
	members := map[int64]bool{actor.ID: true}
	if input.Kind == "direct" {
		if input.PartnerID <= 0 || input.PartnerID == actor.ID {
			writeError(w, 400, "Выберите другого участника проекта")
			return
		}
		members[input.PartnerID] = true
	} else {
		for _, id := range input.MemberIDs {
			members[id] = true
		}
		if input.Title == "" || len(members) < 2 || len(members) > 100 {
			writeError(w, 400, "Укажите название и от 2 до 100 участников группы")
			return
		}
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось создать диалог")
		return
	}
	defer tx.Rollback()
	ids := make([]int64, 0, len(members))
	for id := range members {
		var username string
		err = tx.QueryRowContext(r.Context(), `SELECT u.username FROM workspace_members wm JOIN users u ON u.id=wm.user_id WHERE wm.workspace_id=? AND wm.user_id=? AND wm.status='active'`, workspace.ID, id).Scan(&username)
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, 400, "Участник недоступен в этом проекте")
			return
		}
		if err != nil {
			writeError(w, 500, "Не удалось проверить участников")
			return
		}
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	var pair any
	if input.Kind == "direct" {
		pair = fmt.Sprintf("%d:%d", ids[0], ids[1])
		var existing string
		err = tx.QueryRowContext(r.Context(), `SELECT id FROM chat_threads WHERE workspace_id=? AND direct_key=?`, workspace.ID, pair).Scan(&existing)
		if err == nil {
			writeJSON(w, 200, map[string]string{"id": existing})
			return
		}
		if !errors.Is(err, sql.ErrNoRows) {
			writeError(w, 500, "Не удалось проверить диалог")
			return
		}
		input.Title = "Личный диалог"
	}
	id, err := newID()
	if err != nil {
		writeError(w, 500, "Не удалось создать диалог")
		return
	}
	now := nowText()
	_, err = tx.ExecContext(r.Context(), `INSERT INTO chat_threads(id,workspace_id,kind,conversation_kind,direct_key,title,created_by,created_at,updated_at) VALUES(?,?,'record',?,?,?,?,?,?)`, id, workspace.ID, input.Kind, pair, input.Title, actor.ID, now, now)
	if err == nil {
		for _, member := range ids {
			_, err = tx.ExecContext(r.Context(), `INSERT INTO chat_members(thread_id,user_id,last_read_at,joined_at) VALUES(?,?,'',?)`, id, member, now)
			if err != nil {
				break
			}
		}
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, 500, "Не удалось сохранить диалог")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

type chatHistoryOptions struct {
	Before, Query, Through, After string
	Limit                         int
}
type chatHistoryPage struct {
	Messages   []ChatMessage `json:"messages"`
	HasMore    bool          `json:"hasMore"`
	NextBefore string        `json:"nextBefore"`
	HasNewer   bool          `json:"hasNewer"`
	NextAfter  string        `json:"nextAfter"`
}

func (s *Server) handleChatHistory(w http.ResponseWriter, r *http.Request) {
	thread := r.PathValue("id")
	if !s.requireChatMember(w, r, thread) {
		return
	}
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	before := r.URL.Query().Get("before")
	through := r.URL.Query().Get("around")
	after := r.URL.Query().Get("after")
	if len([]rune(query)) > 200 || len(before) > 64 || len(through) > 64 || len(after) > 64 {
		writeError(w, 400, "Слишком длинный поисковый запрос")
		return
	}
	if after != "" && (before != "" || through != "" || query != "" || r.URL.Query().Get("favorites") == "true") {
		writeError(w, 400, "Продолжение вперёд нельзя совмещать с поиском и другими границами")
		return
	}
	for _, cursor := range []string{before, through, after} {
		if cursor == "" {
			continue
		}
		var exists int
		if err := s.store.db.QueryRowContext(r.Context(), `SELECT 1 FROM chat_messages WHERE id=? AND thread_id=?`, cursor, thread).Scan(&exists); err != nil {
			writeError(w, 400, "Сообщение продолжения не найдено в этом диалоге")
			return
		}
	}
	messages, err := s.listChatMessages(r.Context(), thread, currentUser(r).ID, r.URL.Query().Get("favorites") == "true", chatHistoryOptions{Before: before, Query: query, Through: through, After: after, Limit: 51})
	if err != nil {
		writeError(w, 500, "Не удалось загрузить историю")
		return
	}
	page := chatHistoryPage{Messages: messages, HasMore: len(messages) > 50}
	if page.HasMore {
		if after != "" {
			page.Messages = messages[:50]
		} else {
			page.Messages = messages[1:]
		}
	}
	if after != "" {
		page.HasNewer, page.HasMore = page.HasMore, false
	}
	if len(page.Messages) > 0 {
		page.NextBefore = page.Messages[0].ID
		page.NextAfter = page.Messages[len(page.Messages)-1].ID
		if after == "" && query == "" && r.URL.Query().Get("favorites") != "true" {
			err = s.store.db.QueryRowContext(r.Context(), `SELECT EXISTS(SELECT 1 FROM chat_messages WHERE thread_id=? AND archived_at IS NULL AND (created_at,id) > (SELECT created_at,id FROM chat_messages WHERE id=? AND thread_id=?))`, thread, page.NextAfter, thread).Scan(&page.HasNewer)
			if err != nil {
				writeError(w, 500, "Не удалось проверить продолжение истории")
				return
			}
		}
	}
	writeJSON(w, 200, page)
}

func (s *Server) handleChatPins(w http.ResponseWriter, r *http.Request) {
	thread := r.PathValue("id")
	if !s.requireChatMember(w, r, thread) {
		return
	}
	if r.Method == http.MethodGet {
		rows, err := s.store.db.QueryContext(r.Context(), `SELECT m.id,m.body,u.username FROM chat_pins p JOIN chat_messages m ON m.id=p.message_id JOIN users u ON u.id=m.author_id WHERE p.thread_id=? AND m.archived_at IS NULL ORDER BY p.created_at DESC,m.id DESC`, thread)
		if err != nil {
			writeError(w, 500, "Не удалось прочитать закреплённые сообщения")
			return
		}
		defer rows.Close()
		items := []map[string]string{}
		for rows.Next() {
			var id, body, author string
			if err = rows.Scan(&id, &body, &author); err != nil {
				writeError(w, 500, "Не удалось прочитать закреплённое")
				return
			}
			items = append(items, map[string]string{"id": id, "body": body, "author": author})
		}
		if rows.Err() != nil {
			writeError(w, 500, "Не удалось прочитать закреплённое")
			return
		}
		writeJSON(w, 200, items)
		return
	}
	var input struct {
		MessageID string `json:"messageId"`
		Pinned    bool   `json:"pinned"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	var exists int
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT 1 FROM chat_messages WHERE id=? AND thread_id=? AND archived_at IS NULL`, input.MessageID, thread).Scan(&exists); err != nil {
		writeError(w, 404, "Сообщение не найдено")
		return
	}
	var err error
	if input.Pinned {
		_, err = s.store.db.ExecContext(r.Context(), `INSERT OR IGNORE INTO chat_pins(thread_id,message_id,created_by,created_at) VALUES(?,?,?,?)`, thread, input.MessageID, currentUser(r).ID, nowText())
	} else {
		_, err = s.store.db.ExecContext(r.Context(), `DELETE FROM chat_pins WHERE thread_id=? AND message_id=?`, thread, input.MessageID)
	}
	if err != nil {
		writeError(w, 500, "Не удалось изменить закрепление")
		return
	}
	writeJSON(w, 200, map[string]bool{"pinned": input.Pinned})
}
