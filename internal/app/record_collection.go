package app

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

func collectionCategoryForStatus(status string) string {
	switch status {
	case "completed":
		return "done"
	case "review":
		return "review"
	case "in_progress", "blocked":
		return "active"
	default:
		return "backlog"
	}
}

// Attaching a record changes its container, not its lifecycle or access policy.
func (s *Server) handleAssignRecordCollection(w http.ResponseWriter, r *http.Request) {
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
	var input struct {
		CollectionID string                     `json:"collectionId"`
		ExpectedAt   string                     `json:"expectedUpdatedAt"`
		Values       map[string]json.RawMessage `json:"values"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.CollectionID = strings.TrimSpace(input.CollectionID)
	if input.ExpectedAt == "" || input.ExpectedAt != record.UpdatedAt {
		writeError(w, http.StatusConflict, "Карточка изменилась. Откройте её заново")
		return
	}
	if !s.collectionBelongsToWorkspace(r.Context(), input.CollectionID, record.WorkspaceID) {
		writeError(w, http.StatusBadRequest, "Доска недоступна в этом проекте")
		return
	}
	if record.CollectionID != "" {
		if record.CollectionID == input.CollectionID {
			writeJSON(w, http.StatusOK, record)
		} else {
			writeError(w, http.StatusConflict, "Карточка уже на доске. Её поля настраиваются на этой доске")
		}
		return
	}
	if record.Status == "archived" {
		writeError(w, http.StatusBadRequest, "Архивную карточку нельзя добавлять на доску")
		return
	}
	fields, err := s.listCollectionFields(r.Context(), input.CollectionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить поля")
		return
	}
	values := map[string]string{}
	for _, field := range fields {
		raw := input.Values[field.ID]
		if len(raw) == 0 {
			raw = json.RawMessage("null")
		}
		value, empty, err := s.normalizeCollectionFieldValue(r.Context(), record, field, raw)
		if err != nil || (empty && field.Required) {
			writeError(w, http.StatusBadRequest, "Проверьте поле «"+field.Name+"»")
			return
		}
		if !empty {
			values[field.ID] = value
		}
	}
	for key := range input.Values {
		found := false
		for _, field := range fields {
			if field.ID == key {
				found = true
				break
			}
		}
		if !found {
			writeError(w, http.StatusBadRequest, "Поле не относится к доске")
			return
		}
	}
	var stageID string
	if err = s.store.db.QueryRowContext(r.Context(), `SELECT id FROM collection_stages WHERE collection_id = ? AND category = ? AND archived_at IS NULL ORDER BY sort_order LIMIT 1`, input.CollectionID, collectionCategoryForStatus(record.Status)).Scan(&stageID); err != nil {
		writeError(w, http.StatusBadRequest, "Добавьте на доске этап для текущего состояния карточки")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать изменение")
		return
	}
	defer tx.Rollback()
	now := nowText()
	result, err := tx.ExecContext(r.Context(), `UPDATE records SET collection_id = ?, stage_id = ?, updated_at = ? WHERE id = ? AND updated_at = ? AND collection_id IS NULL`, input.CollectionID, stageID, now, record.ID, record.UpdatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось добавить на доску")
		return
	}
	if count, _ := result.RowsAffected(); count != 1 {
		writeError(w, http.StatusConflict, "Карточка уже изменилась")
		return
	}
	for id, value := range values {
		if _, err = tx.ExecContext(r.Context(), `INSERT INTO record_field_values(record_id, field_id, value_json, updated_by, updated_at) VALUES(?, ?, ?, ?, ?)`, record.ID, id, value, currentUser(r).ID, now); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось сохранить поля")
			return
		}
	}
	if err = writeActivity(r.Context(), tx, currentUser(r).ID, record.Type, record.ID, "collection_assigned", "Карточка добавлена на доску без изменения состояния", map[string]any{"collectionId": input.CollectionID, "stageId": stageID}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить историю")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить изменение")
		return
	}
	updated, err := s.getRecord(r.Context(), record.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Карточка добавлена, обновите страницу")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}
