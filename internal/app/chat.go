package app

import (
	"business-control/internal/emoji"
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const chatMessageSelect = `SELECT m.id, m.thread_id, m.author_id, u.username, COALESCE(m.reply_to_id, ''), COALESCE(ru.username, ''), COALESCE(rm.body, ''), COALESCE(m.linked_record_id, ''), COALESCE(CASE WHEN lr.business_kind <> '' THEN lr.business_kind WHEN lr.subtype = 'question_set' THEN 'question_set' WHEN lr.record_kind = 'meeting' THEN 'meeting' ELSE lr.type END, ''), COALESCE(lr.title, ''), COALESCE(m.attachment_id, ''), COALESCE(a.original_name, ''), COALESCE(a.content_type, ''), COALESCE(a.size_bytes, 0), m.message_type, m.body, EXISTS(SELECT 1 FROM chat_favorites f WHERE f.message_id = m.id AND f.user_id = ?), m.created_at, m.edited_at FROM chat_messages m JOIN users u ON u.id = m.author_id LEFT JOIN chat_messages rm ON rm.id = m.reply_to_id AND rm.thread_id=m.thread_id AND rm.archived_at IS NULL LEFT JOIN users ru ON ru.id = rm.author_id LEFT JOIN records lr ON lr.id = m.linked_record_id LEFT JOIN chat_attachments a ON a.id = m.attachment_id`

type ChatThread struct {
	ID              string  `json:"id"`
	Kind            string  `json:"kind"`
	Title           string  `json:"title"`
	RecordID        *string `json:"recordId"`
	RecordTitle     string  `json:"recordTitle"`
	LastMessage     string  `json:"lastMessage"`
	LastMessageAt   string  `json:"lastMessageAt"`
	UnreadCount     int     `json:"unreadCount"`
	PartnerUsername string  `json:"partnerUsername"`
	PartnerLastSeen string  `json:"partnerLastSeen"`
	PartnerOnline   bool    `json:"partnerOnline"`
	UpdatedAt       string  `json:"updatedAt"`
	MemberCount     int     `json:"memberCount"`
}

type ChatAttachment struct {
	ID           string `json:"id"`
	OriginalName string `json:"originalName"`
	ContentType  string `json:"contentType"`
	SizeBytes    int64  `json:"sizeBytes"`
}

type ChatMessage struct {
	ID                string            `json:"id"`
	ThreadID          string            `json:"threadId"`
	AuthorID          int64             `json:"authorId"`
	AuthorUsername    string            `json:"authorUsername"`
	ReplyToID         string            `json:"replyToId"`
	ReplyAuthor       string            `json:"replyAuthor"`
	ReplyBody         string            `json:"replyBody"`
	LinkedRecordID    string            `json:"linkedRecordId"`
	LinkedRecordType  string            `json:"linkedRecordType"`
	LinkedRecordTitle string            `json:"linkedRecordTitle"`
	Attachment        *ChatAttachment   `json:"attachment"`
	MessageType       string            `json:"messageType"`
	Body              string            `json:"body"`
	Reactions         []ChatReaction    `json:"reactions"`
	Favorite          bool              `json:"favorite"`
	ReadBy            []ChatReadReceipt `json:"readBy"`
	CreatedAt         string            `json:"createdAt"`
	EditedAt          *string           `json:"editedAt"`
}

type ChatReaction struct {
	Emoji     string   `json:"emoji"`
	Count     int      `json:"count"`
	Mine      bool     `json:"mine"`
	Usernames []string `json:"usernames"`
}

type ChatReadReceipt struct {
	Username string `json:"username"`
	ReadAt   string `json:"readAt"`
}

type ChatCall struct {
	ID              string  `json:"id"`
	ThreadID        string  `json:"threadId"`
	StartedBy       int64   `json:"startedBy"`
	StartedUsername string  `json:"startedUsername"`
	Status          string  `json:"status"`
	OfferSDP        string  `json:"offerSdp"`
	AnswerSDP       string  `json:"answerSdp"`
	StartedAt       string  `json:"startedAt"`
	AnsweredAt      *string `json:"answeredAt"`
	EndedAt         *string `json:"endedAt"`
	DurationSeconds int     `json:"durationSeconds"`
}

type AIChatDigest struct {
	Summary          string              `json:"summary"`
	Decisions        []string            `json:"decisions"`
	OpenQuestions    []string            `json:"openQuestions"`
	SuggestedOutputs []AISuggestedOutput `json:"suggestedOutputs"`
	Source           string              `json:"source"`
}

func (s *Server) ensureTeamChat(ctx context.Context, actorID int64) (string, error) {
	workspaceID := workspaceIDFromContext(ctx)
	teamID := "team-chat-" + workspaceID
	now := nowText()
	tx, err := s.store.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	var existingID string
	if queryErr := tx.QueryRowContext(ctx, `SELECT id FROM chat_threads WHERE workspace_id = ? AND kind = 'team'`, workspaceID).Scan(&existingID); queryErr == nil {
		teamID = existingID
	} else if !errors.Is(queryErr, sql.ErrNoRows) {
		return "", queryErr
	} else if _, err = tx.ExecContext(ctx, `INSERT INTO chat_threads(id, workspace_id, kind, title, created_by, created_at, updated_at) VALUES(?, ?, 'team', 'Команда', ?, ?, ?)`, teamID, workspaceID, actorID, now, now); err != nil {
		return "", err
	}
	if _, err = tx.ExecContext(ctx, `INSERT OR IGNORE INTO chat_members(thread_id, user_id, last_read_at, joined_at) SELECT ?, user_id, '', ? FROM workspace_members WHERE workspace_id = ? AND status = 'active'`, teamID, now, workspaceID); err != nil {
		return "", err
	}
	return teamID, tx.Commit()
}

func (s *Server) requireChatMember(w http.ResponseWriter, r *http.Request, threadID string) bool {
	var exists int
	err := s.store.db.QueryRowContext(r.Context(), `SELECT 1 FROM chat_members member JOIN chat_threads thread ON thread.id = member.thread_id WHERE member.thread_id = ? AND member.user_id = ? AND thread.workspace_id = ?`, threadID, currentUser(r).ID, currentWorkspace(r).ID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusForbidden, "Нет доступа к этому диалогу")
		return false
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось проверить доступ к диалогу")
		return false
	}
	return true
}

func (s *Server) handleListChatThreads(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	if _, err := s.ensureTeamChat(r.Context(), user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось подготовить командный чат")
		return
	}
	rows, err := s.store.db.QueryContext(r.Context(), `
		SELECT t.id, CASE WHEN t.conversation_kind<>'' THEN t.conversation_kind ELSE t.kind END, t.title, t.record_id, COALESCE(rec.title, ''),
			COALESCE((SELECT CASE WHEN m.message_type = 'voice' THEN 'Голосовое сообщение' WHEN m.message_type = 'file' THEN 'Файл' WHEN m.message_type = 'call' THEN 'Звонок' ELSE m.body END FROM chat_messages m WHERE m.thread_id = t.id AND m.archived_at IS NULL ORDER BY m.created_at DESC LIMIT 1), ''),
			COALESCE((SELECT m.created_at FROM chat_messages m WHERE m.thread_id = t.id AND m.archived_at IS NULL ORDER BY m.created_at DESC LIMIT 1), t.updated_at),
			(SELECT COUNT(*) FROM chat_messages m WHERE m.thread_id = t.id AND m.author_id <> ? AND m.archived_at IS NULL AND m.created_at > cm.last_read_at),
			CASE WHEN t.conversation_kind='direct' THEN COALESCE((SELECT u.username FROM chat_members peer JOIN users u ON u.id=peer.user_id WHERE peer.thread_id=t.id AND peer.user_id<>? ORDER BY u.id LIMIT 1),'') ELSE '' END,
			CASE WHEN t.conversation_kind='direct' THEN COALESCE((SELECT MAX(last_seen_at) FROM user_activity_daily WHERE user_id=(SELECT peer.user_id FROM chat_members peer WHERE peer.thread_id=t.id AND peer.user_id<>? ORDER BY peer.user_id LIMIT 1)),'') ELSE '' END,
			t.updated_at, (SELECT COUNT(*) FROM chat_members peers JOIN workspace_members wm ON wm.user_id=peers.user_id AND wm.workspace_id=t.workspace_id AND wm.status='active' WHERE peers.thread_id=t.id)
		FROM chat_threads t
		JOIN chat_members cm ON cm.thread_id = t.id AND cm.user_id = ?
		LEFT JOIN records rec ON rec.id = t.record_id
		WHERE t.workspace_id = ?
		ORDER BY COALESCE((SELECT MAX(created_at) FROM chat_messages WHERE thread_id = t.id), t.updated_at) DESC`, user.ID, user.ID, user.ID, user.ID, currentWorkspace(r).ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить диалоги")
		return
	}
	defer rows.Close()
	threads := make([]ChatThread, 0)
	for rows.Next() {
		var item ChatThread
		var recordID sql.NullString
		if err := rows.Scan(&item.ID, &item.Kind, &item.Title, &recordID, &item.RecordTitle, &item.LastMessage, &item.LastMessageAt, &item.UnreadCount, &item.PartnerUsername, &item.PartnerLastSeen, &item.UpdatedAt, &item.MemberCount); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось прочитать диалоги")
			return
		}
		if recordID.Valid {
			item.RecordID = &recordID.String
		}
		if seen, parseErr := time.Parse(time.RFC3339Nano, item.PartnerLastSeen); parseErr == nil {
			item.PartnerOnline = time.Since(seen) < 75*time.Second
		}
		threads = append(threads, item)
	}
	writeJSON(w, http.StatusOK, threads)
}

func (s *Server) handleCreateChatThread(w http.ResponseWriter, r *http.Request) {
	var input struct {
		RecordID string `json:"recordId"`
		chatConversationInput
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.Kind != "" {
		s.createChatConversation(w, r, input.chatConversationInput)
		return
	}
	input.RecordID = strings.TrimSpace(input.RecordID)
	input.Title = strings.TrimSpace(input.Title)
	if input.RecordID == "" {
		writeError(w, http.StatusBadRequest, "Выберите карточку для ветки")
		return
	}
	record, err := s.getRecord(r.Context(), input.RecordID)
	if err != nil {
		writeError(w, http.StatusNotFound, "Карточка не найдена")
		return
	}
	var existing string
	if s.store.db.QueryRowContext(r.Context(), `SELECT id FROM chat_threads WHERE record_id = ?`, record.ID).Scan(&existing) == nil {
		writeJSON(w, http.StatusOK, map[string]string{"id": existing})
		return
	}
	id, _ := newID()
	now := nowText()
	if input.Title == "" {
		input.Title = record.Title
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось создать ветку")
		return
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO chat_threads(id, workspace_id, kind, title, record_id, created_by, created_at, updated_at) VALUES(?, ?, 'record', ?, ?, ?, ?, ?)`, id, currentWorkspace(r).ID, input.Title, record.ID, currentUser(r).ID, now, now); err != nil {
		writeError(w, 500, "Не удалось создать ветку")
		return
	}
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO chat_members(thread_id, user_id, last_read_at, joined_at) SELECT ?, user_id, '', ? FROM workspace_members WHERE workspace_id = ? AND status = 'active'`, id, now, currentWorkspace(r).ID); err != nil {
		writeError(w, 500, "Не удалось добавить участников")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, 500, "Не удалось создать ветку")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

func (s *Server) listChatMessages(ctx context.Context, threadID string, userID int64, favoriteOnly bool, options ...chatHistoryOptions) ([]ChatMessage, error) {
	where := "m.thread_id = ? AND m.archived_at IS NULL"
	args := []any{userID, threadID}
	if favoriteOnly {
		where += " AND EXISTS(SELECT 1 FROM chat_favorites f WHERE f.message_id = m.id AND f.user_id = ?)"
		args = append(args, userID)
	}
	limit, query, ascending := 200, "", false
	if len(options) > 0 {
		limit, query = options[0].Limit, strings.ToLower(options[0].Query)
		if options[0].After != "" {
			ascending = true
			where += " AND (m.created_at,m.id) > (SELECT created_at,id FROM chat_messages WHERE id=? AND thread_id=?)"
			args = append(args, options[0].After, threadID)
		}
		if options[0].Through != "" {
			where += " AND (m.created_at,m.id) <= (SELECT created_at,id FROM chat_messages WHERE id=? AND thread_id=?)"
			args = append(args, options[0].Through, threadID)
		}
		if options[0].Before != "" {
			where += " AND (m.created_at,m.id) < (SELECT created_at,id FROM chat_messages WHERE id=? AND thread_id=?)"
			args = append(args, options[0].Before, threadID)
		}
	}
	suffix := " ORDER BY m.created_at DESC,m.id DESC"
	if ascending {
		suffix = " ORDER BY m.created_at ASC,m.id ASC"
	}
	if query == "" {
		suffix += " LIMIT " + strconv.Itoa(limit)
	}
	rows, err := s.store.db.QueryContext(ctx, chatMessageSelect+` WHERE `+where+suffix, args...)
	if err != nil {
		return nil, err
	}
	messages := make([]ChatMessage, 0)
	for rows.Next() {
		var item ChatMessage
		var attachmentID, attachmentName, attachmentType string
		var attachmentSize int64
		var edited sql.NullString
		if err := rows.Scan(&item.ID, &item.ThreadID, &item.AuthorID, &item.AuthorUsername, &item.ReplyToID, &item.ReplyAuthor, &item.ReplyBody, &item.LinkedRecordID, &item.LinkedRecordType, &item.LinkedRecordTitle, &attachmentID, &attachmentName, &attachmentType, &attachmentSize, &item.MessageType, &item.Body, &item.Favorite, &item.CreatedAt, &edited); err != nil {
			return nil, err
		}
		if attachmentID != "" {
			item.Attachment = &ChatAttachment{ID: attachmentID, OriginalName: attachmentName, ContentType: attachmentType, SizeBytes: attachmentSize}
		}
		if edited.Valid {
			item.EditedAt = &edited.String
		}
		item.Reactions = make([]ChatReaction, 0)
		item.ReadBy = make([]ChatReadReceipt, 0)
		if query != "" && !strings.Contains(strings.ToLower(item.Body+" "+item.AuthorUsername+" "+item.LinkedRecordTitle+" "+attachmentName), query) {
			continue
		}
		messages = append(messages, item)
		if len(messages) >= limit {
			break
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	for index := range messages {
		item := &messages[index]
		reactionRows, _ := s.store.db.QueryContext(ctx, `SELECT emoji, COUNT(*), MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END), GROUP_CONCAT(u.username, ', ') FROM chat_reactions cr JOIN users u ON u.id = cr.user_id WHERE message_id = ? GROUP BY emoji ORDER BY MIN(cr.created_at)`, userID, item.ID)
		if reactionRows != nil {
			for reactionRows.Next() {
				var reaction ChatReaction
				var mine int
				var names string
				if reactionRows.Scan(&reaction.Emoji, &reaction.Count, &mine, &names) == nil {
					reaction.Mine = mine == 1
					if names != "" {
						reaction.Usernames = strings.Split(names, ", ")
					}
					item.Reactions = append(item.Reactions, reaction)
				}
			}
			reactionRows.Close()
		}
		readRows, _ := s.store.db.QueryContext(ctx, `SELECT u.username, cm.last_read_at FROM chat_members cm JOIN users u ON u.id = cm.user_id WHERE cm.thread_id = ? AND cm.user_id <> ? AND cm.last_read_at >= ?`, threadID, item.AuthorID, item.CreatedAt)
		if readRows != nil {
			for readRows.Next() {
				var receipt ChatReadReceipt
				if readRows.Scan(&receipt.Username, &receipt.ReadAt) == nil {
					item.ReadBy = append(item.ReadBy, receipt)
				}
			}
			readRows.Close()
		}
	}
	for left, right := 0, len(messages)-1; !ascending && left < right; left, right = left+1, right-1 {
		messages[left], messages[right] = messages[right], messages[left]
	}
	return messages, nil
}

func (s *Server) handleListChatMessages(w http.ResponseWriter, r *http.Request) {
	threadID := r.PathValue("id")
	if !s.requireChatMember(w, r, threadID) {
		return
	}
	messages, err := s.listChatMessages(r.Context(), threadID, currentUser(r).ID, r.URL.Query().Get("favorites") == "true")
	if err != nil {
		writeError(w, 500, "Не удалось загрузить сообщения")
		return
	}
	writeJSON(w, http.StatusOK, messages)
}

// A receipt is read before commit, so a failed response cannot undo a stored file.
func (s *Server) createChatMessage(ctx context.Context, threadID string, user User, messageType, body, replyToID, linkedRecordID, attachmentID, clientNonce string) (ChatMessage, error) {
	body = strings.TrimSpace(body)
	replyToID = strings.TrimSpace(replyToID)
	linkedRecordID = strings.TrimSpace(linkedRecordID)
	clientNonce = strings.TrimSpace(clientNonce)
	if body == "" && linkedRecordID == "" && attachmentID == "" {
		return ChatMessage{}, errChatContent
	}
	if len([]rune(body)) > 50000 || len(clientNonce) > 100 {
		return ChatMessage{}, errChatContent
	}
	tx, err := s.store.db.BeginTx(ctx, nil)
	if err != nil {
		return ChatMessage{}, err
	}
	defer tx.Rollback()
	var exists int
	if err = tx.QueryRowContext(ctx, `SELECT 1 FROM chat_threads t JOIN chat_members cm ON cm.thread_id=t.id JOIN workspace_members wm ON wm.workspace_id=t.workspace_id AND wm.user_id=cm.user_id WHERE t.id=? AND cm.user_id=? AND t.workspace_id=? AND wm.status='active'`, threadID, user.ID, workspaceIDFromContext(ctx)).Scan(&exists); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ChatMessage{}, errChatAccess
		}
		return ChatMessage{}, err
	}
	var fileHash, fileName, fileType string
	var fileSize int64
	if attachmentID != "" {
		if err = tx.QueryRowContext(ctx, `SELECT sha256,original_name,content_type,size_bytes FROM chat_attachments WHERE id=? AND uploader_id=?`, attachmentID, user.ID).Scan(&fileHash, &fileName, &fileType, &fileSize); err != nil {
			return ChatMessage{}, err
		}
	}
	fingerprint, err := createPayloadHash([]any{messageType, body, replyToID, linkedRecordID, fileHash, fileName, fileType, fileSize})
	if err != nil {
		return ChatMessage{}, err
	}
	if clientNonce != "" {
		var previousID, previousHash string
		var archived sql.NullString
		err = tx.QueryRowContext(ctx, `SELECT id,client_payload_hash,archived_at FROM chat_messages WHERE thread_id=? AND author_id=? AND client_nonce=?`, threadID, user.ID, clientNonce).Scan(&previousID, &previousHash, &archived)
		if err == nil {
			if archived.Valid {
				return ChatMessage{}, errChatArchived
			}
			if previousHash != "" && previousHash != fingerprint {
				return ChatMessage{}, errCreateRequestConflict
			}
			return readChatCreateReceipt(ctx, tx, previousID, user.ID)
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return ChatMessage{}, err
		}
	}
	if replyToID != "" {
		if err = tx.QueryRowContext(ctx, `SELECT 1 FROM chat_messages WHERE id=? AND thread_id=? AND archived_at IS NULL`, replyToID, threadID).Scan(&exists); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ChatMessage{}, errChatReference
			}
			return ChatMessage{}, err
		}
	}
	if linkedRecordID != "" {
		if err = tx.QueryRowContext(ctx, `SELECT 1 FROM records WHERE id=? AND workspace_id=?`, linkedRecordID, workspaceIDFromContext(ctx)).Scan(&exists); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ChatMessage{}, errChatReference
			}
			return ChatMessage{}, err
		}
	}
	id, err := newID()
	if err != nil {
		return ChatMessage{}, err
	}
	now := nowText()
	nullable := func(value string) any {
		if value == "" {
			return nil
		}
		return value
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO chat_messages(id,thread_id,author_id,reply_to_id,linked_record_id,attachment_id,message_type,body,client_nonce,client_payload_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`, id, threadID, user.ID, nullable(replyToID), nullable(linkedRecordID), nullable(attachmentID), messageType, body, clientNonce, fingerprint, now); err != nil {
		return ChatMessage{}, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE chat_threads SET updated_at=? WHERE id=?`, now, threadID); err != nil {
		return ChatMessage{}, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE chat_members SET last_read_at=? WHERE thread_id=? AND user_id=?`, now, threadID, user.ID); err != nil {
		return ChatMessage{}, err
	}
	message, err := readChatCreateReceipt(ctx, tx, id, user.ID)
	if err != nil {
		return ChatMessage{}, err
	}
	if err = tx.Commit(); err != nil {
		return ChatMessage{}, err
	}
	return message, nil
}

func (s *Server) handleCreateChatMessage(w http.ResponseWriter, r *http.Request) {
	threadID := r.PathValue("id")
	if !s.requireChatMember(w, r, threadID) {
		return
	}
	var input struct {
		Body           string `json:"body"`
		ReplyToID      string `json:"replyToId"`
		LinkedRecordID string `json:"linkedRecordId"`
		ClientNonce    string `json:"clientNonce"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if r.Header.Get("X-Outbox-Owner") != "" && !validateCreateRequestKey(w, r, &input.ClientNonce) {
		return
	}
	message, err := s.createChatMessage(r.Context(), threadID, currentUser(r), "text", input.Body, input.ReplyToID, input.LinkedRecordID, "", input.ClientNonce)
	if err != nil {
		writeChatCreateError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, message)
}

func (s *Server) handleEditChatMessage(w http.ResponseWriter, r *http.Request) {
	messageID := r.PathValue("messageId")
	var input struct {
		Body string `json:"body"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Body = strings.TrimSpace(input.Body)
	if input.Body == "" || len([]rune(input.Body)) > 50000 {
		writeError(w, http.StatusBadRequest, "Сообщение должно содержать от 1 до 50 000 символов")
		return
	}
	var threadID, oldBody, messageType string
	var authorID int64
	err := s.store.db.QueryRowContext(r.Context(), `SELECT thread_id, author_id, message_type, body FROM chat_messages WHERE id = ? AND archived_at IS NULL`, messageID).Scan(&threadID, &authorID, &messageType, &oldBody)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Сообщение не найдено")
		return
	}
	if err != nil || !s.requireChatMember(w, r, threadID) {
		return
	}
	if authorID != currentUser(r).ID || messageType != "text" {
		writeError(w, http.StatusForbidden, "Можно редактировать только своё текстовое сообщение")
		return
	}
	if input.Body == oldBody {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	revisionID, _ := newID()
	now := nowText()
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось изменить сообщение")
		return
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO chat_message_revisions(id, message_id, editor_id, action, previous_body, new_body, created_at) VALUES(?, ?, ?, 'edit', ?, ?, ?)`, revisionID, messageID, currentUser(r).ID, oldBody, input.Body, now); err == nil {
		_, err = tx.ExecContext(r.Context(), `UPDATE chat_messages SET body = ?, edited_at = ? WHERE id = ?`, input.Body, now, messageID)
	}
	if err == nil {
		_, err = tx.ExecContext(r.Context(), `UPDATE chat_threads SET updated_at = ? WHERE id = ?`, now, threadID)
	}
	if err != nil || tx.Commit() != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось изменить сообщение")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleArchiveChatMessage(w http.ResponseWriter, r *http.Request) {
	messageID := r.PathValue("messageId")
	var input struct {
		Reason string `json:"reason"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Reason = strings.TrimSpace(input.Reason)
	if input.Reason == "" || len([]rune(input.Reason)) > 1000 {
		writeError(w, http.StatusBadRequest, "Укажите причину удаления сообщения")
		return
	}
	var threadID, oldBody string
	var authorID int64
	err := s.store.db.QueryRowContext(r.Context(), `SELECT thread_id, author_id, body FROM chat_messages WHERE id = ? AND archived_at IS NULL`, messageID).Scan(&threadID, &authorID, &oldBody)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Сообщение не найдено")
		return
	}
	if err != nil || !s.requireChatMember(w, r, threadID) {
		return
	}
	if authorID != currentUser(r).ID {
		writeError(w, http.StatusForbidden, "Можно убрать только своё сообщение")
		return
	}
	revisionID, _ := newID()
	now := nowText()
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось убрать сообщение")
		return
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO chat_message_revisions(id, message_id, editor_id, action, previous_body, reason, created_at) VALUES(?, ?, ?, 'archive', ?, ?, ?)`, revisionID, messageID, currentUser(r).ID, oldBody, input.Reason, now); err == nil {
		_, err = tx.ExecContext(r.Context(), `UPDATE chat_messages SET archived_at = ? WHERE id = ?`, now, messageID)
	}
	if err != nil || tx.Commit() != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось убрать сообщение")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleReadChatThread(w http.ResponseWriter, r *http.Request) {
	threadID := r.PathValue("id")
	if !s.requireChatMember(w, r, threadID) {
		return
	}
	_, err := s.store.db.ExecContext(r.Context(), `UPDATE chat_members SET last_read_at = ? WHERE thread_id = ? AND user_id = ?`, nowText(), threadID, currentUser(r).ID)
	if err != nil {
		writeError(w, 500, "Не удалось сохранить прочтение")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleToggleChatReaction(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Emoji  string `json:"emoji"`
		Active *bool  `json:"active"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Emoji = strings.TrimSpace(input.Emoji)
	if input.Emoji == "" || len(input.Emoji) > 128 || (r.Method == http.MethodPut && input.Active == nil) {
		writeError(w, 400, "Некорректная реакция")
		return
	}
	canonical, valid := emoji.Normalize(input.Emoji)
	if !valid {
		canonical = input.Emoji
	} // Legacy arbitrary reactions can only be removed by their owner.
	ctx, messageID, userID := r.Context(), r.PathValue("messageId"), currentUser(r).ID
	tx, err := s.store.db.BeginTx(ctx, nil)
	if err != nil {
		writeError(w, 500, "Не удалось сохранить реакцию")
		return
	}
	defer tx.Rollback()
	var allowed bool
	err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM chat_members cm WHERE cm.thread_id=m.thread_id AND cm.user_id=?) AND t.workspace_id=? FROM chat_messages m JOIN chat_threads t ON t.id=m.thread_id WHERE m.id=? AND m.archived_at IS NULL`, userID, currentWorkspace(r).ID, messageID).Scan(&allowed)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, 404, "Сообщение не найдено")
		return
	}
	if err != nil {
		writeError(w, 500, "Не удалось проверить сообщение")
		return
	}
	if !allowed {
		writeError(w, 403, "Нет доступа к обсуждению")
		return
	}
	rows, err := tx.QueryContext(ctx, `SELECT emoji FROM chat_reactions WHERE message_id=? AND user_id=?`, messageID, userID)
	if err != nil {
		writeError(w, 500, "Не удалось прочитать реакции")
		return
	}
	var aliases []string
	for rows.Next() {
		var value string
		if err = rows.Scan(&value); err != nil {
			break
		}
		normalized, ok := emoji.Normalize(value)
		if value == input.Emoji || (valid && ok && normalized == canonical) {
			aliases = append(aliases, value)
		}
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close() // SQLite uses one connection; never write with this cursor open.
	if err != nil {
		writeError(w, 500, "Не удалось прочитать реакции")
		return
	}
	active := len(aliases) == 0
	if r.Method == http.MethodPut {
		active = *input.Active
	}
	if !valid && (active || len(aliases) == 0) {
		writeError(w, 400, "Выберите один эмодзи из каталога")
		return
	}
	if !active {
		for _, value := range aliases {
			if _, err = tx.ExecContext(ctx, `DELETE FROM chat_reactions WHERE message_id=? AND user_id=? AND emoji=?`, messageID, userID, value); err != nil {
				break
			}
		}
	} else if len(aliases) == 0 {
		_, err = tx.ExecContext(ctx, `INSERT INTO chat_reactions(message_id,user_id,emoji,created_at) VALUES(?,?,?,?)`, messageID, userID, canonical, nowText())
	}
	if err != nil {
		writeError(w, 500, "Не удалось сохранить реакцию")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, 500, "Не удалось сохранить реакцию")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleToggleChatFavorite(w http.ResponseWriter, r *http.Request) {
	var threadID string
	if s.store.db.QueryRowContext(r.Context(), `SELECT thread_id FROM chat_messages WHERE id = ?`, r.PathValue("messageId")).Scan(&threadID) != nil || !s.requireChatMember(w, r, threadID) {
		return
	}
	result, _ := s.store.db.ExecContext(r.Context(), `DELETE FROM chat_favorites WHERE message_id = ? AND user_id = ?`, r.PathValue("messageId"), currentUser(r).ID)
	affected, _ := result.RowsAffected()
	if affected == 0 {
		_, _ = s.store.db.ExecContext(r.Context(), `INSERT INTO chat_favorites(message_id, user_id, created_at) VALUES(?, ?, ?)`, r.PathValue("messageId"), currentUser(r).ID, nowText())
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleUploadChatAttachment(w http.ResponseWriter, r *http.Request) {
	threadID := r.PathValue("id")
	if !s.requireChatMember(w, r, threadID) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxAttachmentBytes+1<<20)
	if err := r.ParseMultipartForm(maxAttachmentBytes); err != nil {
		writeError(w, 413, "Файл должен быть не больше 15 МБ")
		return
	}
	defer r.MultipartForm.RemoveAll()
	clientNonce := r.FormValue("clientNonce")
	if r.Header.Get("X-Outbox-Owner") != "" && !validateCreateRequestKey(w, r, &clientNonce) {
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, 400, "Выберите файл")
		return
	}
	defer file.Close()
	name := filepath.Base(strings.TrimSpace(header.Filename))
	if name == "" || len([]rune(name)) > 240 {
		writeError(w, http.StatusBadRequest, "Некорректное имя файла")
		return
	}
	buffer := make([]byte, 512)
	count, _ := io.ReadFull(file, buffer)
	buffer = buffer[:count]
	contentType := http.DetectContentType(buffer)
	if strings.HasPrefix(header.Header.Get("Content-Type"), "audio/") || strings.HasPrefix(header.Header.Get("Content-Type"), "video/") {
		contentType = header.Header.Get("Content-Type")
	}
	if !allowedAttachment(name, contentType) && !strings.HasPrefix(contentType, "audio/") && !strings.HasPrefix(contentType, "video/") {
		writeError(w, 400, "Этот тип файла не разрешён")
		return
	}
	if err = os.MkdirAll(s.config.UploadPath, 0o750); err != nil {
		writeError(w, 500, "Не удалось подготовить хранилище")
		return
	}
	id, _ := newID()
	extension := strings.ToLower(filepath.Ext(name))
	if extension == "" && strings.HasPrefix(contentType, "audio/") {
		extension = ".webm"
	}
	stored := "chat-" + id + extension
	finalPath := filepath.Join(s.config.UploadPath, stored)
	tempPath := finalPath + ".tmp"
	target, err := os.OpenFile(tempPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o640)
	if err != nil {
		writeError(w, 500, "Не удалось сохранить файл")
		return
	}
	hash := sha256.New()
	written, copyErr := io.Copy(io.MultiWriter(target, hash), io.MultiReader(bytes.NewReader(buffer), file))
	closeErr := target.Close()
	if copyErr != nil || closeErr != nil || written > maxAttachmentBytes {
		os.Remove(tempPath)
		writeError(w, 413, "Файл должен быть не больше 15 МБ")
		return
	}
	if err = os.Rename(tempPath, finalPath); err != nil {
		os.Remove(tempPath)
		writeError(w, 500, "Не удалось сохранить файл")
		return
	}
	now := nowText()
	_, err = s.store.db.ExecContext(r.Context(), `INSERT INTO chat_attachments(id, uploader_id, original_name, stored_name, content_type, size_bytes, sha256, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`, id, currentUser(r).ID, name, stored, contentType, written, hex.EncodeToString(hash.Sum(nil)), now)
	if err != nil {
		os.Remove(finalPath)
		writeError(w, 500, "Не удалось записать файл")
		return
	}
	messageType := "file"
	if strings.HasPrefix(contentType, "audio/") {
		messageType = "voice"
	}
	message, err := s.createChatMessage(r.Context(), threadID, currentUser(r), messageType, r.FormValue("body"), r.FormValue("replyToId"), r.FormValue("linkedRecordId"), id, clientNonce)
	// Also discard a newly uploaded duplicate after a successful replay. A referenced
	// attachment is never deleted, even if commit succeeded but the response was lost.
	if err != nil || message.Attachment == nil || message.Attachment.ID != id {
		s.removeUnusedChatUpload(r.Context(), id, finalPath)
	}
	if err != nil {
		writeChatCreateError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, message)
}

func (s *Server) handleDownloadChatAttachment(w http.ResponseWriter, r *http.Request) {
	var stored, original, contentType string
	var threadID string
	var size int64
	err := s.store.db.QueryRowContext(r.Context(), `SELECT a.stored_name, a.original_name, a.content_type, a.size_bytes, m.thread_id FROM chat_attachments a JOIN chat_messages m ON m.attachment_id = a.id WHERE a.id = ?`, r.PathValue("id")).Scan(&stored, &original, &contentType, &size, &threadID)
	if err != nil {
		writeError(w, 404, "Файл не найден")
		return
	}
	if !s.requireChatMember(w, r, threadID) {
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	w.Header().Set("Content-Disposition", `inline; filename*=UTF-8''`+strings.ReplaceAll(original, " ", "%20"))
	http.ServeFile(w, r, filepath.Join(s.config.UploadPath, stored))
}

func (s *Server) handleChatICEConfig(w http.ResponseWriter, _ *http.Request) {
	servers := make([]map[string]any, 0, 2)
	if stunURL := strings.TrimSpace(s.config.ChatSTUNURL); stunURL != "" {
		servers = append(servers, map[string]any{"urls": []string{stunURL}})
	}
	if turnURL := strings.TrimSpace(s.config.ChatTURNURL); turnURL != "" && s.config.ChatTURNUsername != "" && s.config.ChatTURNCredential != "" {
		servers = append(servers, map[string]any{
			"urls":       []string{turnURL},
			"username":   s.config.ChatTURNUsername,
			"credential": s.config.ChatTURNCredential,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"iceServers": servers})
}

func (s *Server) handleStartChatCall(w http.ResponseWriter, r *http.Request) {
	threadID := r.PathValue("id")
	if !s.requireChatMember(w, r, threadID) {
		return
	}
	var input struct {
		OfferSDP string `json:"offerSdp"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if len(input.OfferSDP) > 200000 || strings.TrimSpace(input.OfferSDP) == "" {
		writeError(w, 400, "Некорректное предложение звонка")
		return
	}
	var participantCount int
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM chat_members WHERE thread_id = ?`, threadID).Scan(&participantCount); err != nil || participantCount < 2 {
		writeError(w, http.StatusConflict, "Для звонка нужен второй участник")
		return
	}
	var activeCount int
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM chat_calls WHERE thread_id = ? AND status IN ('ringing','active')`, threadID).Scan(&activeCount); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось проверить текущий звонок")
		return
	}
	if activeCount > 0 {
		writeError(w, http.StatusConflict, "В этом диалоге уже идёт звонок")
		return
	}
	id, _ := newID()
	now := nowText()
	_, err := s.store.db.ExecContext(r.Context(), `INSERT INTO chat_calls(id, thread_id, started_by, status, offer_sdp, started_at) VALUES(?, ?, ?, 'ringing', ?, ?)`, id, threadID, currentUser(r).ID, input.OfferSDP, now)
	if err != nil {
		writeError(w, 500, "Не удалось начать звонок")
		return
	}
	call, _ := s.getChatCall(r.Context(), id)
	writeJSON(w, 201, call)
}

func (s *Server) getChatCall(ctx context.Context, id string) (ChatCall, error) {
	var call ChatCall
	var answered, ended sql.NullString
	err := s.store.db.QueryRowContext(ctx, `SELECT c.id, c.thread_id, c.started_by, u.username, c.status, c.offer_sdp, c.answer_sdp, c.started_at, c.answered_at, c.ended_at, c.duration_seconds FROM chat_calls c JOIN users u ON u.id = c.started_by WHERE c.id = ?`, id).Scan(&call.ID, &call.ThreadID, &call.StartedBy, &call.StartedUsername, &call.Status, &call.OfferSDP, &call.AnswerSDP, &call.StartedAt, &answered, &ended, &call.DurationSeconds)
	if answered.Valid {
		call.AnsweredAt = &answered.String
	}
	if ended.Valid {
		call.EndedAt = &ended.String
	}
	return call, err
}

func (s *Server) handleActiveChatCall(w http.ResponseWriter, r *http.Request) {
	threadID := r.PathValue("id")
	if !s.requireChatMember(w, r, threadID) {
		return
	}
	var id string
	err := s.store.db.QueryRowContext(r.Context(), `SELECT id FROM chat_calls WHERE thread_id = ? AND status IN ('ringing','active') ORDER BY started_at DESC LIMIT 1`, threadID).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if err != nil {
		writeError(w, 500, "Не удалось проверить звонок")
		return
	}
	call, _ := s.getChatCall(r.Context(), id)
	writeJSON(w, 200, call)
}

func (s *Server) handleAnswerChatCall(w http.ResponseWriter, r *http.Request) {
	call, err := s.getChatCall(r.Context(), r.PathValue("callId"))
	if err != nil || !s.requireChatMember(w, r, call.ThreadID) {
		return
	}
	if call.StartedBy == currentUser(r).ID {
		writeError(w, http.StatusForbidden, "Нельзя ответить на собственный звонок")
		return
	}
	var input struct {
		AnswerSDP string `json:"answerSdp"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if strings.TrimSpace(input.AnswerSDP) == "" || len(input.AnswerSDP) > 200000 {
		writeError(w, 400, "Некорректный ответ звонка")
		return
	}
	now := nowText()
	result, err := s.store.db.ExecContext(r.Context(), `UPDATE chat_calls SET answer_sdp = ?, status = 'active', answered_at = ? WHERE id = ? AND status = 'ringing'`, input.AnswerSDP, now, call.ID)
	if err != nil {
		writeError(w, 500, "Не удалось принять звонок")
		return
	}
	if changed, _ := result.RowsAffected(); changed == 0 {
		writeError(w, http.StatusConflict, "Звонок уже принят или завершён")
		return
	}
	call, _ = s.getChatCall(r.Context(), call.ID)
	writeJSON(w, 200, call)
}

func (s *Server) handleAddChatCallCandidate(w http.ResponseWriter, r *http.Request) {
	call, err := s.getChatCall(r.Context(), r.PathValue("callId"))
	if err != nil || !s.requireChatMember(w, r, call.ThreadID) {
		return
	}
	var input struct {
		Candidate json.RawMessage `json:"candidate"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if len(input.Candidate) == 0 || len(input.Candidate) > 20000 {
		writeError(w, 400, "Некорректный сетевой кандидат")
		return
	}
	id, _ := newID()
	_, err = s.store.db.ExecContext(r.Context(), `INSERT INTO chat_call_candidates(id, call_id, user_id, candidate_json, created_at) VALUES(?, ?, ?, ?, ?)`, id, call.ID, currentUser(r).ID, string(input.Candidate), nowText())
	if err != nil {
		writeError(w, 500, "Не удалось передать данные звонка")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleListChatCallCandidates(w http.ResponseWriter, r *http.Request) {
	call, err := s.getChatCall(r.Context(), r.PathValue("callId"))
	if err != nil || !s.requireChatMember(w, r, call.ThreadID) {
		return
	}
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT id, candidate_json FROM chat_call_candidates WHERE call_id = ? AND user_id <> ? ORDER BY created_at`, call.ID, currentUser(r).ID)
	if err != nil {
		writeError(w, 500, "Не удалось получить данные звонка")
		return
	}
	defer rows.Close()
	items := make([]map[string]any, 0)
	for rows.Next() {
		var id, raw string
		if rows.Scan(&id, &raw) == nil {
			var candidate any
			_ = json.Unmarshal([]byte(raw), &candidate)
			items = append(items, map[string]any{"id": id, "candidate": candidate})
		}
	}
	writeJSON(w, 200, items)
}

func (s *Server) handleEndChatCall(w http.ResponseWriter, r *http.Request) {
	call, err := s.getChatCall(r.Context(), r.PathValue("callId"))
	if err != nil || !s.requireChatMember(w, r, call.ThreadID) {
		return
	}
	now := time.Now().UTC()
	duration := 0
	if call.AnsweredAt != nil {
		if answered, parseErr := time.Parse(time.RFC3339Nano, *call.AnsweredAt); parseErr == nil {
			duration = int(now.Sub(answered).Seconds())
			if duration < 0 {
				duration = 0
			}
		}
	}
	status := "ended"
	if call.Status == "ringing" {
		status = "missed"
	}
	result, err := s.store.db.ExecContext(r.Context(), `UPDATE chat_calls SET status = ?, ended_at = ?, duration_seconds = ? WHERE id = ? AND status IN ('ringing','active')`, status, now.Format(time.RFC3339Nano), duration, call.ID)
	if err != nil {
		writeError(w, 500, "Не удалось завершить звонок")
		return
	}
	if changed, _ := result.RowsAffected(); changed == 0 {
		writeError(w, http.StatusConflict, "Звонок уже завершён")
		return
	}
	body := "Звонок завершён"
	if duration > 0 {
		body += " · " + strconv.Itoa(duration/60) + " мин " + strconv.Itoa(duration%60) + " сек"
	}
	_, _ = s.createChatMessage(r.Context(), call.ThreadID, currentUser(r), "call", body, "", "", "", "")
	call, _ = s.getChatCall(r.Context(), call.ID)
	writeJSON(w, 200, call)
}

func (s *Server) handleAIChatDigest(w http.ResponseWriter, r *http.Request) {
	threadID := r.PathValue("id")
	if !s.requireChatMember(w, r, threadID) {
		return
	}
	messages, err := s.listChatMessages(r.Context(), threadID, currentUser(r).ID, false)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось собрать сообщения для AI")
		return
	}
	contextItems := make([]map[string]any, 0, len(messages))
	totalRunes := 0
	for index := len(messages) - 1; index >= 0 && totalRunes < 120000; index-- {
		message := messages[index]
		text := message.Body
		if message.MessageType == "voice" {
			text = "[Голосовое сообщение: аудио приложено, но в этой выжимке нет автоматической транскрипции]"
		} else if message.MessageType == "file" {
			fileName := "вложение"
			if message.Attachment != nil && strings.TrimSpace(message.Attachment.OriginalName) != "" {
				fileName = message.Attachment.OriginalName
			}
			text = "[Файл: " + fileName + "] " + text
		}
		runes := []rune(text)
		if totalRunes+len(runes) > 120000 {
			runes = runes[:120000-totalRunes]
		}
		totalRunes += len(runes)
		contextItems = append(contextItems, map[string]any{"author": message.AuthorUsername, "type": message.MessageType, "text": string(runes), "linkedRecordId": message.LinkedRecordID, "linkedRecordTitle": message.LinkedRecordTitle, "createdAt": message.CreatedAt})
	}
	for left, right := 0, len(contextItems)-1; left < right; left, right = left+1, right-1 {
		contextItems[left], contextItems[right] = contextItems[right], contextItems[left]
	}
	contextJSON, _ := json.Marshal(contextItems)

	linkedRecordIDs := make([]string, 0, 5)
	seenRecordIDs := make(map[string]bool)
	var threadRecordID sql.NullString
	_ = s.store.db.QueryRowContext(r.Context(), `SELECT record_id FROM chat_threads WHERE id = ?`, threadID).Scan(&threadRecordID)
	if threadRecordID.Valid && strings.TrimSpace(threadRecordID.String) != "" {
		linkedRecordIDs = append(linkedRecordIDs, threadRecordID.String)
		seenRecordIDs[threadRecordID.String] = true
	}
	for _, message := range messages {
		if message.LinkedRecordID == "" || seenRecordIDs[message.LinkedRecordID] || len(linkedRecordIDs) >= 5 {
			continue
		}
		seenRecordIDs[message.LinkedRecordID] = true
		linkedRecordIDs = append(linkedRecordIDs, message.LinkedRecordID)
	}
	recordContexts := make([]map[string]any, 0, len(linkedRecordIDs))
	for _, recordID := range linkedRecordIDs {
		record, loadErr := s.getRecord(r.Context(), recordID)
		if loadErr != nil {
			continue
		}
		dossier, coverage, contextErr := s.buildAIRecordContext(r.Context(), record)
		if contextErr != nil {
			continue
		}
		recordContexts = append(recordContexts, map[string]any{"dossier": dossier, "coverage": coverage})
	}
	recordContextJSON, _ := json.Marshal(recordContexts)
	prompt := `Сделай выжимку командного диалога сооснователей и верни только JSON {"summary":"Markdown","decisions":["..."],"openQuestions":["..."],"suggestedOutputs":[{"type":"task|idea|criterion|research|decision|goal|risk|hypothesis|experiment","kind":"|preference|limitation|rule|insight","title":"...","description":"...","priority":"low|normal|high|critical","estimateMinutes":60,"reason":"..."}]}. Отличай принятое решение от предложения. Учитывай полное досье обсуждаемых и прикреплённых карточек, включая исследования, варианты, критерии, ответы и историю. Не выдавай голосовое без транскрипции за прочитанное. Не создавай ничего автоматически. Не больше 6 решений, 6 вопросов и 5 сущностей. Досье карточек: ` + string(recordContextJSON) + `. Диалог: ` + string(contextJSON)
	content, source, providerErr := s.externalAIJSON(r.Context(), "Ты секретарь закрытого рабочего пространства сооснователей. Фиксируй факты, решения и дальнейшие действия без домыслов.", prompt, 2400)
	if providerErr != nil {
		writeError(w, http.StatusServiceUnavailable, "Внешний AI сейчас недоступен")
		return
	}
	var digest AIChatDigest
	if json.Unmarshal([]byte(content), &digest) != nil || strings.TrimSpace(digest.Summary) == "" {
		writeError(w, http.StatusBadGateway, "AI вернул неполную выжимку")
		return
	}
	digest.Summary = strings.TrimSpace(digest.Summary)
	if len(digest.Decisions) > 6 {
		digest.Decisions = digest.Decisions[:6]
	}
	if len(digest.OpenQuestions) > 6 {
		digest.OpenQuestions = digest.OpenQuestions[:6]
	}
	digest.SuggestedOutputs = validateAIOutputs(digest.SuggestedOutputs)
	digest.Source = source
	writeJSON(w, http.StatusOK, digest)
}
