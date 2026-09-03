package app

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"
)

func (s *Server) listScores(ctx context.Context, recordID string) ([]CriterionScore, error) {
	rows, err := s.store.db.QueryContext(ctx, `SELECT cs.id, cs.record_id, cs.criterion_id, c.title, cs.score, cs.note, cs.evaluated_by, u.username, cs.updated_at, c.criterion_weight
		FROM criterion_scores cs JOIN records c ON c.id = cs.criterion_id JOIN records r ON r.id = cs.record_id JOIN users u ON u.id = cs.evaluated_by
		WHERE cs.record_id = ? AND c.workspace_id = r.workspace_id ORDER BY c.title, u.username, cs.id`, recordID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	scores := make([]CriterionScore, 0)
	for rows.Next() {
		var score CriterionScore
		if err := rows.Scan(&score.ID, &score.RecordID, &score.CriterionID, &score.CriterionTitle, &score.Score, &score.Note, &score.EvaluatedBy, &score.EvaluatorUsername, &score.UpdatedAt, &score.CriterionWeight); err != nil {
			return nil, err
		}
		scores = append(scores, score)
	}
	return scores, rows.Err()
}

func (s *Server) listCriterionDecisions(ctx context.Context, recordID string) ([]CriterionDecision, error) {
	rows, err := s.store.db.QueryContext(ctx, `SELECT d.record_id, d.criterion_id, d.score, d.reason, d.decided_by, u.username, d.updated_at,
		d.needs_review, c.updated_at
		FROM criterion_decisions d JOIN users u ON u.id = d.decided_by JOIN records c ON c.id = d.criterion_id
		JOIN records r ON r.id = d.record_id WHERE d.record_id = ? AND c.workspace_id = r.workspace_id ORDER BY c.title, d.criterion_id`, recordID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	decisions := make([]CriterionDecision, 0)
	for rows.Next() {
		var d CriterionDecision
		var criterionVersion string
		if err := rows.Scan(&d.RecordID, &d.CriterionID, &d.Score, &d.Reason, &d.DecidedBy, &d.DeciderUsername, &d.UpdatedAt, &d.NeedsReview, &criterionVersion); err != nil {
			return nil, err
		}
		criterionTime, _ := time.Parse(time.RFC3339Nano, criterionVersion)
		decisionTime, _ := time.Parse(time.RFC3339Nano, d.UpdatedAt)
		d.NeedsReview = d.NeedsReview || criterionTime.After(decisionTime)
		decisions = append(decisions, d)
	}
	return decisions, rows.Err()
}

// Resolve both objects through workspace membership before starting a transaction.
func (s *Server) editableCriterionPair(w http.ResponseWriter, r *http.Request) (Record, Record, bool) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "Карточка не найдена")
		return Record{}, Record{}, false
	}
	if !s.requireRecordEdit(w, r, record) {
		return Record{}, Record{}, false
	}
	criterion, err := s.getRecord(r.Context(), r.PathValue("criterionId"))
	if err != nil || criterion.Type != "criterion" || criterion.ID == record.ID || criterion.WorkspaceID != record.WorkspaceID {
		writeError(w, http.StatusBadRequest, "Критерий не найден в этом проекте")
		return Record{}, Record{}, false
	}
	return record, criterion, true
}

type criterionScoreInput struct {
	Score             *int    `json:"score"`
	Note              string  `json:"note"`
	Reason            string  `json:"reason"`
	ExpectedUpdatedAt *string `json:"expectedUpdatedAt"`
}

func (s *Server) handleScoreCriterion(w http.ResponseWriter, r *http.Request) {
	s.writePersonalCriterionScore(w, r, false)
}
func (s *Server) handleWithdrawCriterionScore(w http.ResponseWriter, r *http.Request) {
	s.writePersonalCriterionScore(w, r, true)
}

func (s *Server) writePersonalCriterionScore(w http.ResponseWriter, r *http.Request, withdraw bool) {
	record, criterion, ok := s.editableCriterionPair(w, r)
	if !ok {
		return
	}
	var input criterionScoreInput
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Note, input.Reason = strings.TrimSpace(input.Note), strings.TrimSpace(input.Reason)
	if !withdraw && (input.Score == nil || *input.Score < 0 || *input.Score > 10) {
		writeError(w, http.StatusBadRequest, "Укажите оценку от 0 до 10; пустое поле означает, что оценки нет")
		return
	}
	if !withdraw && (input.Note == "" || len(input.Note) > 20000) {
		writeError(w, http.StatusBadRequest, "Обоснуйте личную оценку (до 20000 символов)")
		return
	}
	if withdraw && (input.Reason == "" || len(input.Reason) > 20000) {
		writeError(w, http.StatusBadRequest, "Укажите причину снятия оценки (до 20000 символов)")
		return
	}
	user := currentUser(r)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать оценку")
		return
	}
	defer tx.Rollback()
	var before CriterionScore
	err = tx.QueryRowContext(r.Context(), `SELECT id, score, note, updated_at FROM criterion_scores WHERE record_id = ? AND criterion_id = ? AND evaluated_by = ?`, record.ID, criterion.ID, user.ID).Scan(&before.ID, &before.Score, &before.Note, &before.UpdatedAt)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "Не удалось проверить личную оценку")
		return
	}
	// Legacy clients may create their first vote, but cannot overwrite an existing vote without its version.
	if (before.ID != "" && input.ExpectedUpdatedAt == nil) || (input.ExpectedUpdatedAt != nil && *input.ExpectedUpdatedAt != before.UpdatedAt) {
		writeError(w, http.StatusConflict, "Ваша оценка уже изменилась. Обновите карточку и повторите правку")
		return
	}
	if withdraw && before.ID == "" {
		writeError(w, http.StatusNotFound, "У вас нет оценки по этому критерию")
		return
	}
	now := nowText()
	action := "criterion_scored"
	details := map[string]any{"criterionId": criterion.ID, "criterion": criterion.Title, "evaluatedBy": user.ID}
	if before.ID != "" {
		details["before"] = map[string]any{"score": before.Score, "note": before.Note, "updatedAt": before.UpdatedAt}
	}
	if withdraw {
		action = "criterion_score_withdrawn"
		_, err = tx.ExecContext(r.Context(), `DELETE FROM criterion_scores WHERE id = ? AND evaluated_by = ?`, before.ID, user.ID)
	} else {
		id, idErr := newID()
		if idErr != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось создать оценку")
			return
		}
		_, err = tx.ExecContext(r.Context(), `INSERT INTO criterion_scores(id, record_id, criterion_id, score, note, evaluated_by, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(record_id, criterion_id, evaluated_by) DO UPDATE SET score = excluded.score, note = excluded.note, updated_at = excluded.updated_at`, id, record.ID, criterion.ID, *input.Score, input.Note, user.ID, now, now)
		details["score"], details["note"] = *input.Score, input.Note
		details["after"] = map[string]any{"score": *input.Score, "note": input.Note, "updatedAt": now}
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить личную оценку")
		return
	}
	if _, err = tx.ExecContext(r.Context(), `UPDATE criterion_decisions SET needs_review = 1 WHERE record_id = ? AND criterion_id = ?`, record.ID, criterion.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось обновить актуальность итога")
		return
	}
	if _, err = tx.ExecContext(r.Context(), `UPDATE records SET updated_at = ? WHERE id = ?`, now, record.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось обновить версию карточки")
		return
	}
	if err = writeActivity(r.Context(), tx, user.ID, record.Type, record.ID, action, input.Reason, details); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю оценки")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить оценку")
		return
	}
	scores, err := s.listScores(r.Context(), record.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Оценка сохранена, но не удалось перечитать список")
		return
	}
	writeJSON(w, http.StatusOK, scores)
}

func (s *Server) handleCriterionDecision(w http.ResponseWriter, r *http.Request) {
	record, criterion, ok := s.editableCriterionPair(w, r)
	if !ok {
		return
	}
	user := currentUser(r)
	if user.ID != record.OwnerID && (record.DecisionMakerID == nil || user.ID != *record.DecisionMakerID) {
		writeError(w, http.StatusForbidden, "Итог утверждает ответственный или назначенный принимающий решение")
		return
	}
	var input struct {
		Score                      *int   `json:"score"`
		Reason                     string `json:"reason"`
		ExpectedUpdatedAt          string `json:"expectedUpdatedAt"`
		ExpectedRecordUpdatedAt    string `json:"expectedRecordUpdatedAt"`
		ExpectedCriterionUpdatedAt string `json:"expectedCriterionUpdatedAt"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Reason = strings.TrimSpace(input.Reason)
	if input.Score == nil || *input.Score < 0 || *input.Score > 10 || input.Reason == "" || len(input.Reason) > 20000 {
		writeError(w, http.StatusBadRequest, "Для принятого итога нужны оценка от 0 до 10 и основание (до 20000 символов)")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать утверждение итога")
		return
	}
	defer tx.Rollback()
	var recordVersion, criterionVersion string
	err = tx.QueryRowContext(r.Context(), `SELECT r.updated_at, c.updated_at FROM records r, records c WHERE r.id = ? AND c.id = ?`, record.ID, criterion.ID).Scan(&recordVersion, &criterionVersion)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось проверить актуальность оценок")
		return
	}
	if recordVersion != input.ExpectedRecordUpdatedAt || criterionVersion != input.ExpectedCriterionUpdatedAt {
		writeError(w, http.StatusConflict, "Карточка или критерий изменились. Обновите оценки перед утверждением итога")
		return
	}
	var before CriterionDecision
	err = tx.QueryRowContext(r.Context(), `SELECT score, reason, decided_by, updated_at FROM criterion_decisions WHERE record_id = ? AND criterion_id = ?`, record.ID, criterion.ID).Scan(&before.Score, &before.Reason, &before.DecidedBy, &before.UpdatedAt)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "Не удалось проверить принятый итог")
		return
	}
	if before.UpdatedAt != input.ExpectedUpdatedAt {
		writeError(w, http.StatusConflict, "Принятый итог уже изменён. Обновите карточку")
		return
	}
	now := nowText()
	_, err = tx.ExecContext(r.Context(), `INSERT INTO criterion_decisions(record_id, criterion_id, score, reason, decided_by, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(record_id, criterion_id) DO UPDATE SET score = excluded.score, reason = excluded.reason, decided_by = excluded.decided_by, updated_at = excluded.updated_at, needs_review = 0`, record.ID, criterion.ID, *input.Score, input.Reason, user.ID, now, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить принятый итог")
		return
	}
	if _, err = tx.ExecContext(r.Context(), `UPDATE records SET updated_at = ? WHERE id = ?`, now, record.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось обновить карточку")
		return
	}
	details := map[string]any{"criterionId": criterion.ID, "criterion": criterion.Title, "score": *input.Score, "decidedBy": user.ID}
	if before.UpdatedAt != "" {
		details["before"] = before
	}
	details["after"] = map[string]any{"score": *input.Score, "reason": input.Reason, "decidedBy": user.ID}
	if err = writeActivity(r.Context(), tx, user.ID, record.Type, record.ID, "criterion_decision_updated", input.Reason, details); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю итога")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить утверждение итога")
		return
	}
	decisions, err := s.listCriterionDecisions(r.Context(), record.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Итог сохранён, но не удалось перечитать список")
		return
	}
	writeJSON(w, http.StatusOK, decisions)
}
