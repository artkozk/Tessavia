package app

import (
	"net/http"
	"strings"
)

// A note and an action are different private entities. Triage preserves the note
// and creates an explicit link instead of replacing or publishing its content.
func (s *Server) handlePersonalNoteToPlan(w http.ResponseWriter, r *http.Request) {
	var input struct {
		RequestKey        string `json:"requestKey"`
		ExpectedUpdatedAt string `json:"expectedUpdatedAt"`
		Title             string `json:"title"`
		Notes             string `json:"notes"`
		Date              string `json:"date"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Title = strings.TrimSpace(input.Title)
	input.Notes = strings.TrimSpace(input.Notes)
	if !createRequestKeyPattern.MatchString(input.RequestKey) || input.ExpectedUpdatedAt == "" || input.Title == "" || len([]rune(input.Title)) > 240 || len(input.Notes) > 100000 || (input.Date != "" && !validDate(input.Date)) {
		writeError(w, 400, "Укажите название дела, актуальную версию и корректную дату, если она нужна")
		return
	}
	owner, ctx := currentUser(r).ID, r.Context()
	noteID := r.PathValue("id")
	hash, _ := createPayloadHash(struct {
		Kind, Source string
		Input        any
	}{"note-to-plan", noteID, input})
	tx, err := s.store.db.BeginTx(ctx, nil)
	if err != nil {
		writeError(w, 500, "Не удалось начать разбор записи")
		return
	}
	defer tx.Rollback()
	existing, err := lookupPersonalCreate(ctx, tx, owner, "plan", input.RequestKey, hash)
	if err != nil {
		writeCreateReceiptError(w, err)
		return
	}
	if existing != "" {
		writePersonalCreateReplay(w, r, tx, "plan", existing)
		return
	}
	var version string
	if tx.QueryRowContext(ctx, `SELECT updated_at FROM personal_notes WHERE id=? AND owner_id=? AND archived_at IS NULL`, noteID, owner).Scan(&version) != nil {
		writeError(w, 404, "Исходная личная запись недоступна")
		return
	}
	if version != input.ExpectedUpdatedAt {
		writeError(w, 409, "Исходная запись изменилась. Откройте её заново перед разбором")
		return
	}
	id, ok := newPersonalID(w)
	if !ok {
		return
	}
	linkID, ok := newPersonalID(w)
	if !ok {
		return
	}
	now := nowText()
	_, err = tx.ExecContext(ctx, `INSERT INTO personal_plans(id,owner_id,title,notes,status,created_at,updated_at,start_date,end_date,item_kind) VALUES(?,?,?,?,'planned',?,?,?,?,'task')`, id, owner, input.Title, input.Notes, now, now, input.Date, input.Date)
	if err == nil {
		_, err = tx.ExecContext(ctx, `INSERT INTO personal_links(id,owner_id,source_type,source_id,target_type,target_id,relation_type,created_at) VALUES(?,?,'note',?,'plan',?,'prepares_for',?)`, linkID, owner, noteID, id, now)
	}
	if err == nil {
		_, err = tx.ExecContext(ctx, `UPDATE personal_notes SET in_inbox=0,updated_at=? WHERE id=? AND owner_id=?`, now, noteID, owner)
	}
	if err == nil {
		err = recordPersonalCreate(ctx, tx, owner, "plan", input.RequestKey, hash, id, now)
	}
	if err != nil {
		writeError(w, 500, "Не удалось создать связанное дело. Исходная запись сохранена")
		return
	}
	plan, err := loadPersonalPlan(ctx, tx, owner, id)
	if err != nil {
		writeError(w, 500, "Не удалось прочитать созданное дело")
		return
	}
	if tx.Commit() != nil {
		writeError(w, 500, "Не удалось подтвердить разбор записи. Повторите с тем же выбором")
		return
	}
	writeJSON(w, 201, plan)
}
