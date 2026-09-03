package app

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
)

func (s *Server) handlePersonalCapture(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Body       string `json:"body"`
		RequestKey string `json:"requestKey"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	key, err := hex.DecodeString(input.RequestKey)
	if err != nil || len(key) != 16 {
		writeError(w, http.StatusBadRequest, "Некорректный идентификатор отправки")
		return
	}
	input.RequestKey = strings.ToLower(input.RequestKey)
	input.Body = strings.TrimSpace(input.Body)
	title := ""
	if !validatePersonalText(w, &title, input.Body) {
		return
	}
	hash := sha256.Sum256([]byte(input.Body))
	bodyHash := hex.EncodeToString(hash[:])
	user := currentUser(r)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить входящее")
		return
	}
	defer tx.Rollback()
	var oldHash string
	var archived sql.NullString
	var note PersonalNote
	err = tx.QueryRowContext(r.Context(), `
		SELECT c.body_hash, n.id, n.title, n.body, n.pinned, n.created_at, n.updated_at, n.scheduled_date, n.in_inbox, n.archived_at, n.title_generated
		FROM personal_capture_requests c JOIN personal_notes n ON n.id = c.note_id AND n.owner_id = c.owner_id
		WHERE c.owner_id = ? AND c.request_key = ?`, user.ID, input.RequestKey).
		Scan(&oldHash, &note.ID, &note.Title, &note.Body, &note.Pinned, &note.CreatedAt, &note.UpdatedAt, &note.ScheduledDate, &note.InInbox, &archived, &note.TitleGenerated)
	if err == nil {
		if oldHash != bodyHash || archived.Valid {
			writeError(w, http.StatusConflict, "Эта отправка уже сохранена с другим текстом или перенесена в архив")
			return
		}
		writeJSON(w, http.StatusOK, note)
		return
	}
	if !errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "Не удалось проверить сохранение входящего")
		return
	}
	id, ok := newPersonalID(w)
	if !ok {
		return
	}
	now := nowText()
	// The request and its note commit together; retrying a lost response cannot duplicate it.
	_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_notes(id, owner_id, title, body, created_at, updated_at, in_inbox, title_generated) VALUES(?, ?, ?, ?, ?, ?, 1, 1)`, id, user.ID, title, input.Body, now, now)
	if err == nil {
		_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_capture_requests(owner_id, request_key, body_hash, note_id) VALUES(?, ?, ?, ?)`, user.ID, input.RequestKey, bodyHash, id)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить входящее. Текст остаётся в черновике")
		return
	}
	writeJSON(w, http.StatusCreated, PersonalNote{ID: id, Title: title, Body: input.Body, InInbox: true, TitleGenerated: true, CreatedAt: now, UpdatedAt: now})
}

func (s *Server) handlePersonalInboxState(w http.ResponseWriter, r *http.Request) {
	var input struct {
		InInbox           *bool  `json:"inInbox"`
		ExpectedUpdatedAt string `json:"expectedUpdatedAt"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.InInbox == nil || input.ExpectedUpdatedAt == "" {
		writeError(w, http.StatusBadRequest, "Укажите состояние и актуальную версию заметки")
		return
	}
	user := currentUser(r)
	result, err := s.store.db.ExecContext(r.Context(), `UPDATE personal_notes SET in_inbox = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND archived_at IS NULL AND updated_at = ?`, boolInt(*input.InInbox), nowText(), r.PathValue("id"), user.ID, input.ExpectedUpdatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось обновить входящие")
		return
	}
	if affectedRows(result) == 0 {
		var found int
		if s.store.db.QueryRowContext(r.Context(), `SELECT 1 FROM personal_notes WHERE id = ? AND owner_id = ? AND archived_at IS NULL`, r.PathValue("id"), user.ID).Scan(&found) != nil {
			writeError(w, http.StatusNotFound, "Заметка не найдена")
			return
		}
		writeError(w, http.StatusConflict, "Заметка изменилась. Обновите входящие и повторите действие")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
