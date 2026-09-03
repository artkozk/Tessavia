package app

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"
)

var errChatContent = errors.New("invalid chat content")
var errChatAccess = errors.New("chat access revoked")
var errChatReference = errors.New("chat reference unavailable")
var errChatArchived = errors.New("chat receipt archived")

func writeChatCreateError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errCreateRequestConflict):
		writeCreateReceiptError(w, err)
	case errors.Is(err, errChatArchived):
		writeError(w, 409, "Сообщение уже было отправлено и удалено. Повтор не восстановит его")
	case errors.Is(err, errChatAccess):
		writeError(w, 403, "Нет доступа к исходному диалогу. Текст остался в очереди")
	case errors.Is(err, errChatReference):
		writeError(w, 409, "Исходное сообщение или связанная карточка недоступны. Текст остался в очереди")
	case errors.Is(err, errChatContent):
		writeError(w, 400, "Сообщение должно содержать текст до 50 000 символов или связанную карточку")
	default:
		writeError(w, 500, "Не удалось подтвердить отправку сообщения")
	}
}

// This lookup has no history page limit. Everything needed for the acknowledgment
// is read in the same transaction, before committing a new message.
func readChatCreateReceipt(ctx context.Context, tx *sql.Tx, id string, userID int64) (ChatMessage, error) {
	var item ChatMessage
	var attachmentID, attachmentName, attachmentType string
	var attachmentSize int64
	var edited sql.NullString
	err := tx.QueryRowContext(ctx, chatMessageSelect+` WHERE m.id=? AND m.archived_at IS NULL`, userID, id).Scan(&item.ID, &item.ThreadID, &item.AuthorID, &item.AuthorUsername, &item.ReplyToID, &item.ReplyAuthor, &item.ReplyBody, &item.LinkedRecordID, &item.LinkedRecordType, &item.LinkedRecordTitle, &attachmentID, &attachmentName, &attachmentType, &attachmentSize, &item.MessageType, &item.Body, &item.Favorite, &item.CreatedAt, &edited)
	if err != nil {
		return ChatMessage{}, err
	}
	if attachmentID != "" {
		item.Attachment = &ChatAttachment{ID: attachmentID, OriginalName: attachmentName, ContentType: attachmentType, SizeBytes: attachmentSize}
	}
	if edited.Valid {
		item.EditedAt = &edited.String
	}
	item.Reactions = make([]ChatReaction, 0)
	item.ReadBy = make([]ChatReadReceipt, 0)
	rows, err := tx.QueryContext(ctx, `SELECT emoji,COUNT(*),MAX(CASE WHEN user_id=? THEN 1 ELSE 0 END),GROUP_CONCAT(u.username, ', ') FROM chat_reactions cr JOIN users u ON u.id=cr.user_id WHERE message_id=? GROUP BY emoji ORDER BY MIN(cr.created_at)`, userID, id)
	if err != nil {
		return ChatMessage{}, err
	}
	for rows.Next() {
		var reaction ChatReaction
		var names string
		if err = rows.Scan(&reaction.Emoji, &reaction.Count, &reaction.Mine, &names); err != nil {
			rows.Close()
			return ChatMessage{}, err
		}
		reaction.Usernames = strings.Split(names, ", ")
		item.Reactions = append(item.Reactions, reaction)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return ChatMessage{}, err
	}
	rows, err = tx.QueryContext(ctx, `SELECT u.username,cm.last_read_at FROM chat_members cm JOIN users u ON u.id=cm.user_id WHERE cm.thread_id=? AND cm.user_id<>? AND cm.last_read_at>=?`, item.ThreadID, item.AuthorID, item.CreatedAt)
	if err != nil {
		return ChatMessage{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var receipt ChatReadReceipt
		if err = rows.Scan(&receipt.Username, &receipt.ReadAt); err != nil {
			return ChatMessage{}, err
		}
		item.ReadBy = append(item.ReadBy, receipt)
	}
	return item, rows.Err()
}

func (s *Server) removeUnusedChatUpload(ctx context.Context, id, path string) {
	// A disconnected HTTP request must not skip cleanup. Failure is conservative:
	// leave the file in place until its DB reference can be checked reliably.
	cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	result, err := s.store.db.ExecContext(cleanup, `DELETE FROM chat_attachments WHERE id=? AND NOT EXISTS(SELECT 1 FROM chat_messages WHERE attachment_id=?)`, id, id)
	if err != nil {
		return
	}
	if count, err := result.RowsAffected(); err == nil && count == 1 {
		_ = os.Remove(path)
	}
}
