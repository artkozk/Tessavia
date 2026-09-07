package app

import (
	"context"
	"strings"
)

// The page is already authorized and bounded by listChatMessages. Load metadata
// once per page rather than issuing two queries for every message.
func (s *Server) loadChatPageMetadata(ctx context.Context, threadID string, userID int64, messages []ChatMessage) error {
	if len(messages) == 0 {
		return nil
	}
	indices := make(map[string]int, len(messages))
	args := []any{userID}
	marks := make([]string, len(messages))
	for i, m := range messages {
		indices[m.ID] = i
		args = append(args, m.ID)
		marks[i] = "?"
	}
	rows, err := s.store.db.QueryContext(ctx, `SELECT cr.message_id,cr.emoji,COUNT(*),MAX(CASE WHEN cr.user_id=? THEN 1 ELSE 0 END),GROUP_CONCAT(u.username, ', ') FROM chat_reactions cr JOIN users u ON u.id=cr.user_id WHERE cr.message_id IN (`+strings.Join(marks, ",")+`) GROUP BY cr.message_id,cr.emoji ORDER BY cr.message_id,MIN(cr.created_at),cr.emoji`, args...)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id, names string
		var reaction ChatReaction
		var mine int
		if err = rows.Scan(&id, &reaction.Emoji, &reaction.Count, &mine, &names); err != nil {
			rows.Close()
			return err
		}
		reaction.Mine = mine == 1
		if names != "" {
			reaction.Usernames = strings.Split(names, ", ")
		}
		if index, ok := indices[id]; ok {
			messages[index].Reactions = append(messages[index].Reactions, reaction)
		}
	}
	err = rows.Err()
	closeErr := rows.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	rows, err = s.store.db.QueryContext(ctx, `SELECT cm.user_id,u.username,cm.last_read_at FROM chat_members cm JOIN users u ON u.id=cm.user_id WHERE cm.thread_id=? ORDER BY cm.user_id`, threadID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var reader int64
		var receipt ChatReadReceipt
		if err = rows.Scan(&reader, &receipt.Username, &receipt.ReadAt); err != nil {
			return err
		}
		for i := range messages {
			if reader != messages[i].AuthorID && receipt.ReadAt >= messages[i].CreatedAt {
				messages[i].ReadBy = append(messages[i].ReadBy, receipt)
			}
		}
	}
	return rows.Err()
}
