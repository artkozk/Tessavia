package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"reflect"
	"strings"
)

type businessDetailsInput struct {
	Probability       int     `json:"probability"`
	Impact            int     `json:"impact"`
	Mitigation        string  `json:"mitigation"`
	Occurred          bool    `json:"occurred"`
	Metric            string  `json:"metric"`
	SuccessThreshold  string  `json:"successThreshold"`
	ExperimentMethod  string  `json:"experimentMethod"`
	Verdict           string  `json:"verdict"`
	DecisionState     string  `json:"decisionState"`
	EffectiveAt       string  `json:"effectiveAt"`
	ReviewAt          string  `json:"reviewAt"`
	SupersedesID      string  `json:"supersedesId"`
	Reason            string  `json:"reason"`
	ExpectedUpdatedAt *string `json:"expectedUpdatedAt"`
}

func validVerdict(value string) bool {
	return value == "pending" || value == "confirmed" || value == "rejected" || value == "inconclusive"
}

func validDecisionState(value string) bool {
	return value == "active" || value == "review" || value == "superseded"
}

func normalizeBusinessDetails(recordType string, input *businessDetailsInput, now string) (RecordBusinessDetails, error) {
	value := businessDetailsInput{}
	if input != nil {
		value = *input
	}
	value.Mitigation = strings.TrimSpace(value.Mitigation)
	value.Metric = strings.TrimSpace(value.Metric)
	value.SuccessThreshold = strings.TrimSpace(value.SuccessThreshold)
	value.ExperimentMethod = strings.TrimSpace(value.ExperimentMethod)
	value.Verdict = strings.TrimSpace(value.Verdict)
	value.DecisionState = strings.TrimSpace(value.DecisionState)
	value.SupersedesID = strings.TrimSpace(value.SupersedesID)
	if value.Probability < 0 || value.Probability > 5 || value.Impact < 0 || value.Impact > 5 {
		return RecordBusinessDetails{}, errors.New("Вероятность и влияние должны быть от 0 до 5")
	}
	if len(value.Mitigation) > 20000 || len(value.ExperimentMethod) > 20000 || len(value.Metric) > 1000 || len(value.SuccessThreshold) > 2000 {
		return RecordBusinessDetails{}, errors.New("Содержимое специальных полей слишком длинное")
	}
	details := RecordBusinessDetails{}
	switch recordType {
	case "risk":
		details.Probability = value.Probability
		details.Impact = value.Impact
		details.Mitigation = value.Mitigation
		details.Occurred = value.Occurred
	case "hypothesis", "experiment":
		if value.Verdict == "" {
			value.Verdict = "pending"
		}
		if !validVerdict(value.Verdict) {
			return RecordBusinessDetails{}, errors.New("Некорректный итог проверки")
		}
		details.Metric = value.Metric
		details.SuccessThreshold = value.SuccessThreshold
		details.ExperimentMethod = value.ExperimentMethod
		details.Verdict = value.Verdict
	case "decision":
		if value.DecisionState == "" {
			value.DecisionState = "active"
		}
		if !validDecisionState(value.DecisionState) {
			return RecordBusinessDetails{}, errors.New("Некорректное состояние решения")
		}
		effectiveAt, err := normalizeDueAt(value.EffectiveAt)
		if err != nil {
			return RecordBusinessDetails{}, errors.New("Некорректная дата вступления решения в силу")
		}
		if effectiveAt == nil {
			effectiveAt = &now
		}
		reviewAt, err := normalizeDueAt(value.ReviewAt)
		if err != nil {
			return RecordBusinessDetails{}, errors.New("Некорректная дата пересмотра решения")
		}
		details.DecisionState = value.DecisionState
		details.EffectiveAt = effectiveAt
		details.ReviewAt = reviewAt
		if value.SupersedesID != "" {
			details.SupersedesID = &value.SupersedesID
		}
	case "inbox":
		// Входящее намеренно не требует структуры до разбора.
	default:
		return RecordBusinessDetails{}, errors.New("Для этой карточки специальные поля не предусмотрены")
	}
	return details, nil
}

func saveBusinessDetails(ctx context.Context, tx *sql.Tx, recordID, recordType string, input *businessDetailsInput, actorID int64, now string) error {
	details, err := normalizeBusinessDetails(recordType, input, now)
	if err != nil {
		return err
	}
	if details.SupersedesID != nil {
		if *details.SupersedesID == recordID {
			return errors.New("Решение не может заменять само себя")
		}
		var replacedType, replacedBusinessKind, replacedState string
		if err := tx.QueryRowContext(ctx, `SELECT r.type, r.business_kind, COALESCE(b.decision_state, 'active')
			FROM records r LEFT JOIN record_business_details b ON b.record_id = r.id
			WHERE r.id = ? AND r.status <> 'archived'`, *details.SupersedesID).Scan(&replacedType, &replacedBusinessKind, &replacedState); err != nil || replacedType != "decision" || replacedBusinessKind != "" {
			return errors.New("Заменяемое решение не найдено")
		}
		if replacedState != "superseded" {
			_, err = tx.ExecContext(ctx, `INSERT INTO record_business_details(record_id, decision_state, effective_at, updated_by, updated_at)
				VALUES(?, 'superseded', ?, ?, ?)
				ON CONFLICT(record_id) DO UPDATE SET decision_state = 'superseded', updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
				*details.SupersedesID, now, actorID, now)
			if err != nil {
				return fmt.Errorf("не удалось отметить заменённое решение: %w", err)
			}
			if _, err := tx.ExecContext(ctx, `UPDATE records SET updated_at = ? WHERE id = ?`, now, *details.SupersedesID); err != nil {
				return fmt.Errorf("не удалось обновить заменённое решение: %w", err)
			}
			changes := map[string]any{"businessDetails": map[string]any{
				"before": map[string]any{"decisionState": replacedState},
				"after":  map[string]any{"decisionState": "superseded", "supersededById": recordID},
			}}
			if err := writeActivity(ctx, tx, actorID, "decision", *details.SupersedesID, "business_details_updated", "Решение заменено новым", changes); err != nil {
				return fmt.Errorf("не удалось записать замену решения: %w", err)
			}
		}
	}
	var effectiveAt, reviewAt, supersedesID any
	if details.EffectiveAt != nil {
		effectiveAt = *details.EffectiveAt
	}
	if details.ReviewAt != nil {
		reviewAt = *details.ReviewAt
	}
	if details.SupersedesID != nil {
		supersedesID = *details.SupersedesID
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO record_business_details(
		record_id, probability, impact, mitigation_md, occurred, metric, success_threshold,
		experiment_method_md, verdict, decision_state, effective_at, review_at, supersedes_id, updated_by, updated_at)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(record_id) DO UPDATE SET probability = excluded.probability, impact = excluded.impact,
		mitigation_md = excluded.mitigation_md, occurred = excluded.occurred, metric = excluded.metric,
		success_threshold = excluded.success_threshold, experiment_method_md = excluded.experiment_method_md,
		verdict = excluded.verdict, decision_state = excluded.decision_state, effective_at = excluded.effective_at,
		review_at = excluded.review_at, supersedes_id = excluded.supersedes_id,
		updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
		recordID, details.Probability, details.Impact, details.Mitigation, details.Occurred,
		details.Metric, details.SuccessThreshold, details.ExperimentMethod, details.Verdict,
		details.DecisionState, effectiveAt, reviewAt, supersedesID, actorID, now)
	return err
}

func businessDetailsMap(details *RecordBusinessDetails) map[string]any {
	if details == nil {
		return map[string]any{}
	}
	return map[string]any{
		"probability": details.Probability, "impact": details.Impact, "mitigation": details.Mitigation,
		"occurred": details.Occurred, "metric": details.Metric, "successThreshold": details.SuccessThreshold,
		"experimentMethod": details.ExperimentMethod, "verdict": details.Verdict,
		"decisionState": details.DecisionState, "effectiveAt": details.EffectiveAt,
		"reviewAt": details.ReviewAt, "supersedesId": details.SupersedesID,
	}
}

func (s *Server) handleUpdateBusinessDetails(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Карточка не найдена")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить карточку")
		return
	}
	if !s.requireRecordEdit(w, r, record) {
		return
	}
	var input businessDetailsInput
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.ExpectedUpdatedAt != nil && *input.ExpectedUpdatedAt != record.UpdatedAt {
		writeError(w, http.StatusConflict, "Карточка уже изменена. Откройте её заново")
		return
	}
	now := nowText()
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать изменение")
		return
	}
	defer tx.Rollback()
	if err := saveBusinessDetails(r.Context(), tx, record.ID, record.Type, &input, currentUser(r).ID, now); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if _, err := tx.ExecContext(r.Context(), `UPDATE records SET updated_at = ? WHERE id = ?`, now, record.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось обновить карточку")
		return
	}
	afterDetails, err := normalizeBusinessDetails(record.Type, &input, now)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	beforeMap := businessDetailsMap(record.BusinessDetails)
	afterMap := businessDetailsMap(&afterDetails)
	if reflect.DeepEqual(beforeMap, afterMap) {
		writeError(w, http.StatusBadRequest, "Нет изменений")
		return
	}
	importantChange := beforeMap["decisionState"] != afterMap["decisionState"] || beforeMap["supersedesId"] != afterMap["supersedesId"] || beforeMap["occurred"] != afterMap["occurred"]
	if importantChange && strings.TrimSpace(input.Reason) == "" {
		writeError(w, http.StatusBadRequest, "Укажите причину изменения состояния")
		return
	}
	changes := map[string]any{"businessDetails": map[string]any{"before": beforeMap, "after": afterMap}}
	if err := writeActivity(r.Context(), tx, currentUser(r).ID, record.Type, record.ID, "business_details_updated", strings.TrimSpace(input.Reason), changes); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить изменение")
		return
	}
	updated, _ := s.getRecord(r.Context(), record.ID)
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleTriageInbox(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Входящее не найдено")
		return
	}
	if err != nil || record.Type != "inbox" {
		writeError(w, http.StatusConflict, "Разобрать можно только входящее")
		return
	}
	if !s.requireRecordEdit(w, r, record) {
		return
	}
	var input struct {
		TargetType string `json:"targetType"`
		Reason     string `json:"reason"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.TargetType = strings.TrimSpace(input.TargetType)
	input.Reason = strings.TrimSpace(input.Reason)
	if input.Reason == "" {
		writeError(w, http.StatusBadRequest, "Укажите, почему выбран этот тип карточки")
		return
	}
	databaseType, subtype, recordKind, businessKind := input.TargetType, "", "", ""
	switch input.TargetType {
	case "task", "idea", "research", "document":
	case "question_set":
		databaseType, subtype = "document", "question_set"
	case "risk":
		databaseType, businessKind = "disagreement", "risk"
	case "hypothesis":
		databaseType, businessKind = "idea", "hypothesis"
	case "experiment":
		databaseType, businessKind = "research", "experiment"
	default:
		writeError(w, http.StatusBadRequest, "Выберите доступный тип карточки")
		return
	}
	now := nowText()
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать разбор")
		return
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(r.Context(), `UPDATE records SET type = ?, subtype = ?, record_kind = ?, business_kind = ?, status = ?, updated_at = ? WHERE id = ? AND business_kind = 'inbox'`, databaseType, subtype, recordKind, businessKind, defaultStatus(input.TargetType), now, record.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось разобрать входящее")
		return
	}
	if changed, _ := result.RowsAffected(); changed != 1 {
		writeError(w, http.StatusConflict, "Входящее уже было разобрано. Откройте карточку заново")
		return
	}
	if businessKind != "" {
		if err := saveBusinessDetails(r.Context(), tx, record.ID, input.TargetType, nil, currentUser(r).ID, now); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось подготовить поля карточки")
			return
		}
	} else if _, err := tx.ExecContext(r.Context(), `DELETE FROM record_business_details WHERE record_id = ?`, record.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить разбор")
		return
	}
	if err := writeActivity(r.Context(), tx, currentUser(r).ID, input.TargetType, record.ID, "triaged", input.Reason, map[string]any{"type": map[string]any{"before": "inbox", "after": input.TargetType}, "status": map[string]any{"before": record.Status, "after": defaultStatus(input.TargetType)}}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю разбора")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить разбор")
		return
	}
	updated, _ := s.getRecord(r.Context(), record.ID)
	writeJSON(w, http.StatusOK, updated)
}

func undoValueMatches(current any, expected any) bool {
	currentJSON, _ := json.Marshal(current)
	expectedJSON, _ := json.Marshal(expected)
	return string(currentJSON) == string(expectedJSON)
}

func (s *Server) handleUndoActivity(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	var actorID int64
	var entityType, entityID, action, detailsJSON string
	err := s.store.db.QueryRowContext(r.Context(), `SELECT actor_id, entity_type, entity_id, action, details_json FROM activity WHERE id = ?`, r.PathValue("id")).Scan(&actorID, &entityType, &entityID, &action, &detailsJSON)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Событие не найдено")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить событие")
		return
	}
	if actorID != user.ID {
		writeError(w, http.StatusForbidden, "Отменить изменение может только его автор")
		return
	}
	var alreadyUndone int
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM activity_undos WHERE activity_id = ?`, r.PathValue("id")).Scan(&alreadyUndone); err != nil || alreadyUndone > 0 {
		if alreadyUndone > 0 {
			writeError(w, http.StatusConflict, "Это изменение уже отменено")
		} else {
			writeError(w, http.StatusInternalServerError, "Не удалось проверить отмену")
		}
		return
	}
	var details map[string]any
	if err := json.Unmarshal([]byte(detailsJSON), &details); err != nil {
		writeError(w, http.StatusConflict, "Событие нельзя безопасно отменить")
		return
	}
	record, err := s.getRecord(r.Context(), entityID)
	if err != nil || !s.requireRecordEdit(w, r, record) {
		if err != nil {
			writeError(w, http.StatusNotFound, "Связанная карточка не найдена")
		}
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать отмену")
		return
	}
	defer tx.Rollback()
	now := nowText()
	switch action {
	case "updated":
		allowed := map[string]string{"status": "status", "parentId": "parent_id", "isRoot": "is_root", "priority": "priority"}
		current := map[string]any{"status": record.Status, "parentId": record.ParentID, "isRoot": record.IsRoot, "priority": record.Priority}
		updates := make([]string, 0)
		args := make([]any, 0)
		for field, raw := range details {
			change, ok := raw.(map[string]any)
			column, supported := allowed[field]
			if !ok || !supported {
				writeError(w, http.StatusConflict, "Это составное изменение нельзя отменить автоматически")
				return
			}
			if field == "status" && (change["after"] == "completed" || change["after"] == "archived") {
				writeError(w, http.StatusConflict, "Завершение и архивацию отменяйте через карточку: они меняют несколько связанных полей")
				return
			}
			if !undoValueMatches(current[field], change["after"]) {
				writeError(w, http.StatusConflict, "Карточка уже изменилась после этого события")
				return
			}
			before := change["before"]
			if field == "isRoot" {
				before = change["before"] == true
			}
			updates = append(updates, column+" = ?")
			args = append(args, before)
		}
		if len(updates) == 0 {
			writeError(w, http.StatusConflict, "В событии нет обратимых изменений")
			return
		}
		updates = append(updates, "updated_at = ?")
		args = append(args, now, record.ID)
		if _, err := tx.ExecContext(r.Context(), `UPDATE records SET `+strings.Join(updates, ", ")+` WHERE id = ?`, args...); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось отменить изменение")
			return
		}
	case "link_created":
		targetID, _ := details["targetId"].(string)
		relationType, _ := details["relationType"].(string)
		result, err := tx.ExecContext(r.Context(), `UPDATE record_links SET active = 0, removed_by = ?, removed_at = ? WHERE source_id = ? AND target_id = ? AND relation_type = ? AND active = 1`, user.ID, now, entityID, targetID, relationType)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось отменить связь")
			return
		}
		if count, _ := result.RowsAffected(); count != 1 {
			writeError(w, http.StatusConflict, "Связь уже изменилась")
			return
		}
	case "link_removed":
		linkID, _ := details["linkId"].(string)
		result, err := tx.ExecContext(r.Context(), `UPDATE record_links SET active = 1, removed_by = NULL, removed_at = NULL WHERE id = ? AND active = 0`, linkID)
		if err != nil {
			writeError(w, http.StatusConflict, "Связь уже заменена другой или больше недоступна")
			return
		}
		if count, _ := result.RowsAffected(); count != 1 {
			writeError(w, http.StatusConflict, "Связь уже восстановлена")
			return
		}
	default:
		writeError(w, http.StatusConflict, "Для этого события безопасная отмена не предусмотрена")
		return
	}
	undoActivityID, err := writeActivityWithID(r.Context(), tx, user.ID, entityType, entityID, "change_undone", "Отмена ошибочного действия из истории", map[string]any{"originalActivityId": r.PathValue("id"), "originalAction": action})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать отмену")
		return
	}
	if _, err := tx.ExecContext(r.Context(), `INSERT INTO activity_undos(activity_id, undone_by, undo_activity_id, created_at) VALUES(?, ?, ?, ?)`, r.PathValue("id"), user.ID, undoActivityID, now); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить отмену")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить отмену")
		return
	}
	updated, _ := s.getRecord(r.Context(), entityID)
	writeJSON(w, http.StatusOK, updated)
}
