package app

import "net/http"

func (s *Server) handleChatPersonalPin(w http.ResponseWriter, r *http.Request) {
	threadID := r.PathValue("id")
	if !s.requireChatMember(w, r, threadID) {
		return
	}
	var input struct {
		Pinned *bool `json:"pinned"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.Pinned == nil {
		writeError(w, 400, "Укажите, нужно ли закрепить разговор")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось изменить закрепление")
		return
	}
	defer tx.Rollback()
	// Recheck membership inside the write transaction to avoid resurrecting a pin after leaving.
	var allowed int
	if err = tx.QueryRowContext(r.Context(), `SELECT count(*) FROM chat_members m JOIN chat_threads t ON t.id=m.thread_id WHERE m.thread_id=? AND m.user_id=? AND t.workspace_id=?`, threadID, currentUser(r).ID, currentWorkspace(r).ID).Scan(&allowed); err != nil {
		writeError(w, 500, "Не удалось проверить доступ")
		return
	}
	if allowed == 0 {
		writeError(w, 403, "Нет доступа к этому диалогу")
		return
	}
	if *input.Pinned {
		_, err = tx.ExecContext(r.Context(), `INSERT INTO chat_personal_pins(thread_id,user_id,pinned_at) VALUES(?,?,?) ON CONFLICT(thread_id,user_id) DO NOTHING`, threadID, currentUser(r).ID, nowText())
	} else {
		_, err = tx.ExecContext(r.Context(), `DELETE FROM chat_personal_pins WHERE thread_id=? AND user_id=?`, threadID, currentUser(r).ID)
	}
	if err != nil {
		writeError(w, 500, "Не удалось изменить закрепление")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, 500, "Не удалось сохранить закрепление")
		return
	}
	writeJSON(w, 200, map[string]bool{"pinned": *input.Pinned})
}
