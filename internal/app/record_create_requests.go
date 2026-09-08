package app

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
)

var recordRequestKey = regexp.MustCompile(`^[A-Za-z0-9_-]{16,128}$`)

type recordCreateIntent struct{ key, hash string }

func (s *Server) prepareRecordCreate(w http.ResponseWriter, r *http.Request, input createRecordRequest) (recordCreateIntent, bool) {
	intent := recordCreateIntent{key: r.Header.Get("Idempotency-Key")}
	if intent.key == "" {
		return intent, false
	}
	if !recordRequestKey.MatchString(intent.key) {
		writeError(w, 400, "Некорректный ключ отправки")
		return intent, true
	}
	raw, err := json.Marshal(input)
	if err != nil {
		writeError(w, 400, "Не удалось проверить отправку")
		return intent, true
	}
	digest := sha256.Sum256(raw)
	intent.hash = hex.EncodeToString(digest[:])
	var hash, id string
	err = s.store.db.QueryRowContext(r.Context(), `SELECT payload_hash,record_id FROM record_create_requests WHERE workspace_id=? AND user_id=? AND request_key=?`, currentWorkspace(r).ID, currentUser(r).ID, intent.key).Scan(&hash, &id)
	if errors.Is(err, sql.ErrNoRows) {
		return intent, false
	}
	if err != nil {
		writeError(w, 500, "Не удалось проверить предыдущую отправку")
		return intent, true
	}
	s.replayRecordCreate(w, r, intent.hash, hash, id)
	return intent, true
}

func (s *Server) replayRecordCreate(w http.ResponseWriter, r *http.Request, wanted, stored, id string) {
	if wanted != stored {
		writeJSON(w, 409, map[string]string{"error": "Этим ключом уже отправлены другие данные. Сначала проверьте результат предыдущей отправки", "code": "record_request_payload_changed"})
		return
	}
	record, err := s.getRecord(r.Context(), id)
	if err != nil {
		writeError(w, 409, "Предыдущая отправка сохранена, но запись сейчас недоступна. Новая запись не создана")
		return
	}
	w.Header().Set("Idempotency-Replayed", "true")
	writeJSON(w, 200, record)
}

// This insert is the first statement in the write transaction. Its FK is deferred until the record exists.
func (s *Server) claimRecordCreate(w http.ResponseWriter, r *http.Request, tx *sql.Tx, intent recordCreateIntent, id string) bool {
	if intent.key == "" {
		return false
	}
	result, err := tx.ExecContext(r.Context(), `INSERT INTO record_create_requests(workspace_id,user_id,request_key,payload_hash,record_id,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(workspace_id,user_id,request_key) DO NOTHING`, currentWorkspace(r).ID, currentUser(r).ID, intent.key, intent.hash, id, nowText())
	if err != nil {
		writeError(w, 500, "Не удалось зарегистрировать отправку. Повторите с тем же ключом")
		return true
	}
	count, _ := result.RowsAffected()
	if count == 1 {
		return false
	}
	var hash, previous string
	err = tx.QueryRowContext(r.Context(), `SELECT payload_hash,record_id FROM record_create_requests WHERE workspace_id=? AND user_id=? AND request_key=?`, currentWorkspace(r).ID, currentUser(r).ID, intent.key).Scan(&hash, &previous)
	tx.Rollback() // Release the single connection before reading the existing record.
	if err != nil {
		writeError(w, 500, "Не удалось прочитать результат отправки")
		return true
	}
	s.replayRecordCreate(w, r, intent.hash, hash, previous)
	return true
}
