package app

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"net/http"
	"strings"
)

type ResearchOptionField struct {
	ID        string `json:"id"`
	RecordID  string `json:"recordId"`
	Name      string `json:"name"`
	FieldType string `json:"fieldType"`
	SortOrder int    `json:"sortOrder"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

type ResearchOption struct {
	ID                string            `json:"id"`
	RecordID          string            `json:"recordId"`
	Title             string            `json:"title"`
	SummaryMD         string            `json:"summaryMd"`
	ProsMD            string            `json:"prosMd"`
	ConsMD            string            `json:"consMd"`
	NotesMD           string            `json:"notesMd"`
	Rating            float64           `json:"rating"`
	SortOrder         int               `json:"sortOrder"`
	CreatedBy         int64             `json:"createdBy"`
	CreatedByUsername string            `json:"createdByUsername"`
	UpdatedBy         int64             `json:"updatedBy"`
	UpdatedByUsername string            `json:"updatedByUsername"`
	CreatedAt         string            `json:"createdAt"`
	UpdatedAt         string            `json:"updatedAt"`
	Values            map[string]string `json:"values"`
}

type ResearchRelationOption struct {
	ID        string  `json:"id"`
	RecordID  string  `json:"recordId"`
	Title     string  `json:"title"`
	Rating    float64 `json:"rating"`
	SortOrder int     `json:"sortOrder"`
}

type ResearchComparison struct {
	Fields  []ResearchOptionField `json:"fields"`
	Options []ResearchOption      `json:"options"`
}

type researchOptionRequest struct {
	Title             string            `json:"title"`
	SummaryMD         string            `json:"summaryMd"`
	ProsMD            string            `json:"prosMd"`
	ConsMD            string            `json:"consMd"`
	NotesMD           string            `json:"notesMd"`
	Rating            float64           `json:"rating"`
	Values            map[string]string `json:"values"`
	Reason            string            `json:"reason"`
	ExpectedUpdatedAt string            `json:"expectedUpdatedAt"`
}

func (s *Server) listResearchRelationOptions(ctx context.Context, recordID string) ([]ResearchRelationOption, error) {
	options := make([]ResearchRelationOption, 0)
	rows, err := s.store.db.QueryContext(ctx, `
		SELECT id, record_id, title, rating, sort_order
		FROM research_options
		WHERE record_id = ? AND status = 'active'
		ORDER BY sort_order, created_at`, recordID)
	if err != nil {
		return options, err
	}
	defer rows.Close()
	for rows.Next() {
		var option ResearchRelationOption
		if err := rows.Scan(&option.ID, &option.RecordID, &option.Title, &option.Rating, &option.SortOrder); err != nil {
			return options, err
		}
		options = append(options, option)
	}
	return options, rows.Err()
}

func validResearchFieldType(value string) bool {
	return value == "text" || value == "number" || value == "url" || value == "rating"
}

func (s *Server) requireResearchRecord(w http.ResponseWriter, r *http.Request) (Record, bool) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Исследование не найдено")
		return Record{}, false
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить исследование")
		return Record{}, false
	}
	if record.Type != "research" {
		writeError(w, http.StatusConflict, "Варианты сравнения доступны только в исследовании")
		return Record{}, false
	}
	return record, true
}

func (s *Server) listResearchComparison(ctx context.Context, recordID string) (ResearchComparison, error) {
	comparison := ResearchComparison{Fields: make([]ResearchOptionField, 0), Options: make([]ResearchOption, 0)}
	fieldRows, err := s.store.db.QueryContext(ctx, `
		SELECT id, record_id, name, field_type, sort_order, created_at, updated_at
		FROM research_option_fields
		WHERE record_id = ? AND active = 1
		ORDER BY sort_order, created_at`, recordID)
	if err != nil {
		return comparison, err
	}
	for fieldRows.Next() {
		var field ResearchOptionField
		if err := fieldRows.Scan(&field.ID, &field.RecordID, &field.Name, &field.FieldType, &field.SortOrder, &field.CreatedAt, &field.UpdatedAt); err != nil {
			fieldRows.Close()
			return comparison, err
		}
		comparison.Fields = append(comparison.Fields, field)
	}
	if err := fieldRows.Close(); err != nil {
		return comparison, err
	}

	optionRows, err := s.store.db.QueryContext(ctx, `
		SELECT o.id, o.record_id, o.title, o.summary_md, o.pros_md, o.cons_md, o.notes_md,
			o.rating, o.sort_order, o.created_by, creator.username, o.updated_by, editor.username,
			o.created_at, o.updated_at
		FROM research_options o
		JOIN users creator ON creator.id = o.created_by
		JOIN users editor ON editor.id = o.updated_by
		WHERE o.record_id = ? AND o.status = 'active'
		ORDER BY o.sort_order, o.created_at`, recordID)
	if err != nil {
		return comparison, err
	}
	optionIDs := make([]string, 0)
	for optionRows.Next() {
		var option ResearchOption
		if err := optionRows.Scan(&option.ID, &option.RecordID, &option.Title, &option.SummaryMD, &option.ProsMD, &option.ConsMD, &option.NotesMD,
			&option.Rating, &option.SortOrder, &option.CreatedBy, &option.CreatedByUsername, &option.UpdatedBy, &option.UpdatedByUsername,
			&option.CreatedAt, &option.UpdatedAt); err != nil {
			optionRows.Close()
			return comparison, err
		}
		option.Values = make(map[string]string)
		optionIDs = append(optionIDs, option.ID)
		comparison.Options = append(comparison.Options, option)
	}
	if err := optionRows.Close(); err != nil {
		return comparison, err
	}
	if len(optionIDs) == 0 {
		return comparison, nil
	}

	valueRows, err := s.store.db.QueryContext(ctx, `
		SELECT v.option_id, v.field_id, v.value
		FROM research_option_values v
		JOIN research_options o ON o.id = v.option_id
		JOIN research_option_fields f ON f.id = v.field_id
		WHERE o.record_id = ? AND o.status = 'active' AND f.active = 1`, recordID)
	if err != nil {
		return comparison, err
	}
	optionIndex := make(map[string]int, len(comparison.Options))
	for index, option := range comparison.Options {
		optionIndex[option.ID] = index
	}
	for valueRows.Next() {
		var optionID, fieldID, value string
		if err := valueRows.Scan(&optionID, &fieldID, &value); err != nil {
			valueRows.Close()
			return comparison, err
		}
		if index, ok := optionIndex[optionID]; ok {
			comparison.Options[index].Values[fieldID] = value
		}
	}
	return comparison, valueRows.Close()
}

func validateResearchOption(input researchOptionRequest) (researchOptionRequest, string) {
	input.Title = strings.TrimSpace(input.Title)
	input.SummaryMD = strings.TrimSpace(input.SummaryMD)
	input.ProsMD = strings.TrimSpace(input.ProsMD)
	input.ConsMD = strings.TrimSpace(input.ConsMD)
	input.NotesMD = strings.TrimSpace(input.NotesMD)
	input.Reason = strings.TrimSpace(input.Reason)
	if input.Title == "" || len(input.Title) > 160 {
		return input, "Название варианта обязательно и не длиннее 160 символов"
	}
	if input.Rating < 0 || input.Rating > 10 {
		return input, "Оценка должна быть от 0 до 10"
	}
	if len(input.SummaryMD)+len(input.ProsMD)+len(input.ConsMD)+len(input.NotesMD) > 200000 {
		return input, "Описание варианта слишком длинное"
	}
	if input.Values == nil {
		input.Values = make(map[string]string)
	}
	for key, value := range input.Values {
		input.Values[key] = strings.TrimSpace(value)
	}
	return input, ""
}

func (s *Server) saveResearchOptionValues(ctx context.Context, tx *sql.Tx, recordID, optionID string, values map[string]string, now string) error {
	for fieldID, value := range values {
		if len(value) > 10000 {
			return errors.New("research option value is too long")
		}
		var count int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM research_option_fields WHERE id = ? AND record_id = ? AND active = 1`, fieldID, recordID).Scan(&count); err != nil {
			return err
		}
		if count != 1 {
			continue
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO research_option_values(option_id, field_id, value, updated_at) VALUES(?, ?, ?, ?)
			ON CONFLICT(option_id, field_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, optionID, fieldID, value, now); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) handleGetResearchComparison(w http.ResponseWriter, r *http.Request) {
	record, ok := s.requireResearchRecord(w, r)
	if !ok {
		return
	}
	comparison, err := s.listResearchComparison(r.Context(), record.ID)
	if err != nil {
		log.Printf("list research comparison: %v", err)
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить варианты исследования")
		return
	}
	writeJSON(w, http.StatusOK, comparison)
}

func (s *Server) handleCreateResearchOption(w http.ResponseWriter, r *http.Request) {
	record, ok := s.requireResearchRecord(w, r)
	if !ok || !s.requireRecordEdit(w, r, record) {
		return
	}
	var input researchOptionRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	var message string
	if input, message = validateResearchOption(input); message != "" {
		writeError(w, http.StatusBadRequest, message)
		return
	}
	id, err := newID()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать вариант")
		return
	}
	now := nowText()
	user := currentUser(r)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать создание варианта")
		return
	}
	defer tx.Rollback()
	var sortOrder int
	if err := tx.QueryRowContext(r.Context(), `SELECT COALESCE(MAX(sort_order), -1) + 1 FROM research_options WHERE record_id = ?`, record.ID).Scan(&sortOrder); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось определить порядок вариантов")
		return
	}
	if _, err := tx.ExecContext(r.Context(), `
		INSERT INTO research_options(id, record_id, title, summary_md, pros_md, cons_md, notes_md, rating, sort_order, created_by, updated_by, created_at, updated_at)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, record.ID, input.Title, input.SummaryMD, input.ProsMD, input.ConsMD, input.NotesMD, input.Rating, sortOrder, user.ID, user.ID, now, now); err != nil {
		log.Printf("create research option: %v", err)
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить вариант")
		return
	}
	if err := s.saveResearchOptionValues(r.Context(), tx, record.ID, id, input.Values, now); err != nil {
		writeError(w, http.StatusBadRequest, "Не удалось сохранить параметры варианта")
		return
	}
	if _, err := tx.ExecContext(r.Context(), `UPDATE records SET updated_at = ? WHERE id = ?`, now, record.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось обновить исследование")
		return
	}
	if err := writeActivity(r.Context(), tx, user.ID, record.Type, record.ID, "research_option_created", input.Reason, map[string]any{"optionId": id, "title": input.Title, "rating": input.Rating}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить создание варианта")
		return
	}
	comparison, _ := s.listResearchComparison(r.Context(), record.ID)
	writeJSON(w, http.StatusCreated, comparison)
}

func (s *Server) handleUpdateResearchOption(w http.ResponseWriter, r *http.Request) {
	record, ok := s.requireResearchRecord(w, r)
	if !ok || !s.requireRecordEdit(w, r, record) {
		return
	}
	var input researchOptionRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	var message string
	if input, message = validateResearchOption(input); message != "" {
		writeError(w, http.StatusBadRequest, message)
		return
	}
	optionID := r.PathValue("optionId")
	var beforeTitle, beforeUpdatedAt string
	var beforeRating float64
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT title, rating, updated_at FROM research_options WHERE id = ? AND record_id = ? AND status = 'active'`, optionID, record.ID).Scan(&beforeTitle, &beforeRating, &beforeUpdatedAt); errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Вариант не найден")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить вариант")
		return
	}
	if input.ExpectedUpdatedAt != "" && input.ExpectedUpdatedAt != beforeUpdatedAt {
		writeError(w, http.StatusConflict, "Вариант уже изменён. Откройте его заново")
		return
	}
	now := nowText()
	user := currentUser(r)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать изменение варианта")
		return
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(r.Context(), `UPDATE research_options SET title = ?, summary_md = ?, pros_md = ?, cons_md = ?, notes_md = ?, rating = ?, updated_by = ?, updated_at = ? WHERE id = ? AND record_id = ? AND status = 'active'`, input.Title, input.SummaryMD, input.ProsMD, input.ConsMD, input.NotesMD, input.Rating, user.ID, now, optionID, record.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить вариант")
		return
	}
	if err := s.saveResearchOptionValues(r.Context(), tx, record.ID, optionID, input.Values, now); err != nil {
		writeError(w, http.StatusBadRequest, "Не удалось сохранить параметры варианта")
		return
	}
	if _, err := tx.ExecContext(r.Context(), `UPDATE records SET updated_at = ? WHERE id = ?`, now, record.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось обновить исследование")
		return
	}
	if err := writeActivity(r.Context(), tx, user.ID, record.Type, record.ID, "research_option_updated", input.Reason, map[string]any{"optionId": optionID, "title": map[string]any{"before": beforeTitle, "after": input.Title}, "rating": map[string]any{"before": beforeRating, "after": input.Rating}}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить изменение варианта")
		return
	}
	comparison, _ := s.listResearchComparison(r.Context(), record.ID)
	writeJSON(w, http.StatusOK, comparison)
}

func (s *Server) handleArchiveResearchOption(w http.ResponseWriter, r *http.Request) {
	record, ok := s.requireResearchRecord(w, r)
	if !ok || !s.requireRecordEdit(w, r, record) {
		return
	}
	var input struct {
		Reason string `json:"reason"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Reason = strings.TrimSpace(input.Reason)
	if input.Reason == "" {
		writeError(w, http.StatusBadRequest, "Укажите причину архивации варианта")
		return
	}
	optionID := r.PathValue("optionId")
	var title string
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT title FROM research_options WHERE id = ? AND record_id = ? AND status = 'active'`, optionID, record.ID).Scan(&title); errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Вариант не найден")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить вариант")
		return
	}
	now := nowText()
	user := currentUser(r)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать архивацию варианта")
		return
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(r.Context(), `UPDATE research_options SET status = 'archived', updated_by = ?, updated_at = ? WHERE id = ? AND record_id = ?`, user.ID, now, optionID, record.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось архивировать вариант")
		return
	}
	_, _ = tx.ExecContext(r.Context(), `UPDATE records SET updated_at = ? WHERE id = ?`, now, record.ID)
	if err := writeActivity(r.Context(), tx, user.ID, record.Type, record.ID, "research_option_archived", input.Reason, map[string]any{"optionId": optionID, "title": title}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить архивацию варианта")
		return
	}
	comparison, _ := s.listResearchComparison(r.Context(), record.ID)
	writeJSON(w, http.StatusOK, comparison)
}

func (s *Server) handleCreateResearchField(w http.ResponseWriter, r *http.Request) {
	record, ok := s.requireResearchRecord(w, r)
	if !ok || !s.requireRecordEdit(w, r, record) {
		return
	}
	var input struct {
		Name      string `json:"name"`
		FieldType string `json:"fieldType"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	input.FieldType = strings.TrimSpace(input.FieldType)
	if input.Name == "" || len(input.Name) > 80 {
		writeError(w, http.StatusBadRequest, "Название параметра обязательно и не длиннее 80 символов")
		return
	}
	if !validResearchFieldType(input.FieldType) {
		writeError(w, http.StatusBadRequest, "Неизвестный тип параметра")
		return
	}
	id, err := newID()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать параметр")
		return
	}
	now := nowText()
	user := currentUser(r)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать создание параметра")
		return
	}
	defer tx.Rollback()
	var sortOrder int
	if err := tx.QueryRowContext(r.Context(), `SELECT COALESCE(MAX(sort_order), -1) + 1 FROM research_option_fields WHERE record_id = ?`, record.ID).Scan(&sortOrder); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось определить порядок параметров")
		return
	}
	if _, err := tx.ExecContext(r.Context(), `INSERT INTO research_option_fields(id, record_id, name, field_type, sort_order, created_by, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`, id, record.ID, input.Name, input.FieldType, sortOrder, user.ID, now, now); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить параметр")
		return
	}
	_, _ = tx.ExecContext(r.Context(), `UPDATE records SET updated_at = ? WHERE id = ?`, now, record.ID)
	if err := writeActivity(r.Context(), tx, user.ID, record.Type, record.ID, "research_field_created", "", map[string]any{"fieldId": id, "name": input.Name, "fieldType": input.FieldType}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить создание параметра")
		return
	}
	comparison, _ := s.listResearchComparison(r.Context(), record.ID)
	writeJSON(w, http.StatusCreated, comparison)
}

func (s *Server) handleArchiveResearchField(w http.ResponseWriter, r *http.Request) {
	record, ok := s.requireResearchRecord(w, r)
	if !ok || !s.requireRecordEdit(w, r, record) {
		return
	}
	var input struct {
		Reason string `json:"reason"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Reason = strings.TrimSpace(input.Reason)
	if input.Reason == "" {
		writeError(w, http.StatusBadRequest, "Укажите причину архивации параметра")
		return
	}
	fieldID := r.PathValue("fieldId")
	var name string
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT name FROM research_option_fields WHERE id = ? AND record_id = ? AND active = 1`, fieldID, record.ID).Scan(&name); errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Параметр не найден")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить параметр")
		return
	}
	now := nowText()
	user := currentUser(r)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать архивацию параметра")
		return
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(r.Context(), `UPDATE research_option_fields SET active = 0, updated_at = ? WHERE id = ? AND record_id = ?`, now, fieldID, record.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось архивировать параметр")
		return
	}
	_, _ = tx.ExecContext(r.Context(), `UPDATE records SET updated_at = ? WHERE id = ?`, now, record.ID)
	if err := writeActivity(r.Context(), tx, user.ID, record.Type, record.ID, "research_field_archived", input.Reason, map[string]any{"fieldId": fieldID, "name": name}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить архивацию параметра")
		return
	}
	comparison, _ := s.listResearchComparison(r.Context(), record.ID)
	writeJSON(w, http.StatusOK, comparison)
}
