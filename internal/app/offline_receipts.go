package app

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
)

var createRequestKeyPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{16,100}$`)
var errCreateRequestConflict = errors.New("request key already has different content")

func validateCreateRequestKey(w http.ResponseWriter, r *http.Request, key *string) bool {
	*key = strings.TrimSpace(*key)
	if *key == "" && r.Header.Get("X-Outbox-Owner") == "" {
		return true // Existing clients remain compatible; the outbox always supplies a key.
	}
	if !createRequestKeyPattern.MatchString(*key) {
		writeError(w, 400, "Некорректный идентификатор отправки")
		return false
	}
	return true
}

func createPayloadHash(value any) (string, error) {
	payload, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	digest := sha256.Sum256(payload)
	return hex.EncodeToString(digest[:]), nil
}

func lookupPersonalCreate(ctx context.Context, tx *sql.Tx, ownerID int64, kind, key, hash string) (string, error) {
	if key == "" {
		return "", nil
	}
	var previousKind, previousHash, id string
	err := tx.QueryRowContext(ctx, `SELECT entity_kind,payload_hash,entity_id FROM personal_create_requests WHERE owner_id=? AND request_key=?`, ownerID, key).Scan(&previousKind, &previousHash, &id)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if previousKind != kind || previousHash != hash {
		return "", errCreateRequestConflict
	}
	return id, nil
}

func recordPersonalCreate(ctx context.Context, tx *sql.Tx, ownerID int64, kind, key, hash, id, now string) error {
	if key == "" {
		return nil
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO personal_create_requests(owner_id,request_key,entity_kind,payload_hash,entity_id,created_at) VALUES(?,?,?,?,?,?)`, ownerID, key, kind, hash, id, now)
	return err
}

// Replay reads the current entity: editing or archiving it never restores old content.
func writePersonalCreateReplay(w http.ResponseWriter, r *http.Request, tx *sql.Tx, kind, id string) {
	owner := currentUser(r).ID
	var result any
	var err error
	if kind == "note" {
		var note PersonalNote
		note, err = scanPersonalNote(tx.QueryRowContext(r.Context(), personalNoteSelect+` WHERE n.id=? AND n.owner_id=? AND n.archived_at IS NULL`, id, owner))
		result = note
	} else {
		var plan PersonalPlan
		plan, err = loadPersonalPlan(r.Context(), tx, owner, id)
		if err == nil && plan.SeriesID != "" {
			var rule PersonalRecurrenceRule
			var active int
			if ruleErr := tx.QueryRowContext(r.Context(), `SELECT series_id,cadence,interval_count,timezone,start_date,until_date,active,updated_at FROM personal_recurrence_rules WHERE series_id=? AND owner_id=?`, plan.SeriesID, owner).Scan(&rule.SeriesID, &rule.Cadence, &rule.Interval, &rule.Timezone, &rule.StartDate, &rule.UntilDate, &active, &rule.UpdatedAt); ruleErr == nil {
				rule.Active = active == 1
				plan.Recurrence = &rule
			}
		}
		result = plan
	}
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, 409, "Эта отправка уже сохранена, но запись перенесена в архив или недоступна")
		return
	}
	if err != nil {
		writeError(w, 500, "Не удалось прочитать результат прежней отправки")
		return
	}
	writeJSON(w, 200, result)
}

func writeCreateReceiptError(w http.ResponseWriter, err error) {
	if errors.Is(err, errCreateRequestConflict) {
		writeError(w, 409, "Идентификатор отправки уже сохранён с другим содержимым. Ваш текст не заменён")
	} else {
		writeError(w, 500, "Не удалось проверить прежнюю отправку")
	}
}
