package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
)

type PageRecordAction struct {
	SourceFieldID string               `json:"sourceFieldId,omitempty"`
	Operation     string               `json:"operation,omitempty"`
	Condition     *PageActionCondition `json:"condition,omitempty"`
	ID            string               `json:"id"`
	Label         string               `json:"label"`
	FieldID       string               `json:"fieldId"`
	Value         json.RawMessage      `json:"value"`
}

func validatePageRecordActions(b PageAppBlock) error {
	if len(b.Actions) > 8 || (len(b.Actions) > 0 && b.Kind != "records") {
		return errors.New("До 8 действий доступны в блоке списка записей")
	}
	seen := map[string]bool{}
	for _, a := range b.Actions {
		if !pageAppID.MatchString(a.ID) || seen[a.ID] || !pageAppID.MatchString(a.FieldID) || strings.TrimSpace(a.Label) == "" || len([]rune(a.Label)) > 80 || len(a.Value) > 40000 || (a.Operation != "copy" && !json.Valid(a.Value)) {
			return errors.New("Укажите подпись, поле, значение и разные ключи действий")
		}
		if a.Operation != "" && a.Operation != "set" && a.Operation != "add" && a.Operation != "copy" {
			return errors.New("Неизвестный способ изменения поля")
		}
		if a.Operation == "copy" {
			if !pageAppID.MatchString(a.SourceFieldID) || a.SourceFieldID == a.FieldID || (len(a.Value) > 0 && strings.TrimSpace(string(a.Value)) != "null") {
				return errors.New("Для копирования выберите другое поле; фиксированное значение не требуется")
			}
		} else if a.SourceFieldID != "" {
			return errors.New("Источник значения доступен только для копирования")
		}
		seen[a.ID] = true
	}
	return nil
}
func portableActionField(f CollectionField) bool {
	return validCollectionFieldType(f.FieldType) && f.FieldType != "user" && f.FieldType != "relation"
}
func (s *Server) validatePageActionSource(ctx context.Context, b PageAppBlock, fields []CollectionField) error {
	if err := validatePageRecordActions(b); err != nil {
		return err
	}
	for _, a := range b.Actions {
		if err := s.validateActionCondition(ctx, a.Condition, fields); err != nil {
			return err
		}
		found := false
		for _, f := range fields {
			if f.ID == a.FieldID {
				found = true
				if err := validateActionOperation(a, f); err != nil {
					return err
				}
				if !portableActionField(f) {
					return errors.New("Действия со ссылкой на участника или запись требуют отдельного контекста")
				}
				if a.Operation == "copy" {
					if err := validateActionCopySource(a, f, fields); err != nil {
						return err
					}
					continue
				}
				_, empty, err := s.normalizeCollectionFieldValue(ctx, Record{}, f, a.Value)
				if err != nil {
					return fmt.Errorf("%s: %s", a.Label, err.Error())
				}
				if empty && f.Required {
					return fmt.Errorf("Действие не может очистить обязательное поле «%s»", f.Name)
				}
			}
		}
		if !found {
			return errors.New("Поле действия больше недоступно на выбранной доске")
		}
	}
	return nil
}
func remapPageActionValue(a *PageRecordAction, kind string, options map[string]string) error {
	if string(a.Value) == "null" {
		return nil
	}
	if kind == "select" {
		var old string
		if json.Unmarshal(a.Value, &old) != nil {
			return errors.New("Некорректный вариант действия")
		}
		if old == "" {
			return nil
		}
		if options[old] == "" {
			return errors.New("Вариант действия отсутствует")
		}
		a.Value, _ = json.Marshal(options[old])
	}
	if kind == "multi_select" {
		var old []string
		if json.Unmarshal(a.Value, &old) != nil {
			return errors.New("Некорректные варианты действия")
		}
		mapped := []string{}
		for _, id := range old {
			if options[id] == "" {
				return errors.New("Вариант действия отсутствует")
			}
			mapped = append(mapped, options[id])
		}
		a.Value, _ = json.Marshal(mapped)
	}
	return nil
}

type pageActionPreview struct {
	SourceField       *CollectionField     `json:"sourceField,omitempty"`
	SourceValue       any                  `json:"sourceValue,omitempty"`
	Condition         *PageActionCondition `json:"condition,omitempty"`
	ConditionField    *CollectionField     `json:"conditionField,omitempty"`
	Allowed           bool                 `json:"allowed"`
	ConditionReason   string               `json:"conditionReason,omitempty"`
	RecordID          string               `json:"recordId"`
	Title             string               `json:"title"`
	Label             string               `json:"label"`
	Field             CollectionField      `json:"field"`
	Before            any                  `json:"before"`
	After             json.RawMessage      `json:"after"`
	ExpectedUpdatedAt string               `json:"expectedUpdatedAt"`
	ExpectedRevision  int                  `json:"expectedRevision"`
	SchemaHash        string               `json:"schemaHash"`
}

func (s *Server) handlePageRecordAction(w http.ResponseWriter, r *http.Request) {
	var input struct {
		BlockID           string `json:"blockId"`
		ActionID          string `json:"actionId"`
		RecordID          string `json:"recordId"`
		ExpectedRevision  int    `json:"expectedRevision"`
		ExpectedUpdatedAt string `json:"expectedUpdatedAt"`
		SchemaHash        string `json:"schemaHash"`
		Apply             bool   `json:"apply"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if !s.pageAppExists(r) {
		writeError(w, 404, "Страница недоступна")
		return
	}
	record, err := s.getRecord(r.Context(), input.RecordID)
	if err != nil {
		writeError(w, 404, "Запись недоступна")
		return
	}
	if !s.requireRecordEdit(w, r, record) {
		return
	}
	if record.Status == "archived" {
		writeError(w, 409, "Запись в архиве. Действие не выполнено")
		return
	}
	if input.ExpectedUpdatedAt == "" || input.ExpectedUpdatedAt != record.UpdatedAt {
		writeError(w, 409, "Запись изменилась. Обновите предпросмотр и проверьте значения")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось проверить действие")
		return
	}
	defer tx.Rollback()
	// Acquire the write lock before reading configuration; a concurrent editor cannot change it before commit.
	if input.Apply {
		locked, err := tx.ExecContext(r.Context(), `UPDATE page_app_definitions SET revision=revision WHERE page_id=? AND revision=? AND EXISTS(SELECT 1 FROM workspace_pages WHERE id=page_id AND workspace_id=? AND archived_at IS NULL)`, r.PathValue("id"), input.ExpectedRevision, currentWorkspace(r).ID)
		if err != nil {
			writeError(w, 500, "Не удалось начать действие")
			return
		}
		if n, _ := locked.RowsAffected(); n != 1 {
			writeError(w, 409, "Страница изменилась. Обновите её перед действием")
			return
		}
	}
	var raw string
	var revision int
	err = tx.QueryRowContext(r.Context(), `SELECT definition_json,revision FROM page_app_definitions WHERE page_id=?`, r.PathValue("id")).Scan(&raw, &revision)
	if err != nil || revision != input.ExpectedRevision {
		writeError(w, 409, "Страница изменилась. Обновите её перед действием")
		return
	}
	var def PageAppDefinition
	if json.Unmarshal([]byte(raw), &def) != nil {
		writeError(w, 500, "Не удалось прочитать действие")
		return
	}
	var block PageAppBlock
	var action PageRecordAction
	for _, b := range def.Blocks {
		if b.ID == input.BlockID && b.Kind == "records" && !b.Hidden {
			block = b
			for _, a := range b.Actions {
				if a.ID == input.ActionID {
					action = a
				}
			}
		}
	}
	if action.ID == "" || block.CollectionID != record.CollectionID {
		writeError(w, 400, "Действие не относится к этой записи")
		return
	}
	source, err := readPageAppSource(r.Context(), tx, currentWorkspace(r).ID, block.CollectionID)
	if err != nil {
		writeError(w, 409, "Источник действия недоступен")
		return
	}
	if err = s.validatePageActionSource(r.Context(), block, source.Fields); err != nil {
		writeError(w, 409, err.Error())
		return
	}
	var field CollectionField
	for _, f := range source.Fields {
		if f.ID == action.FieldID {
			field = f
		}
	}
	var conditionField *CollectionField
	var valueSource *CollectionField
	schema, _ := json.Marshal(field)
	if action.Condition != nil {
		for _, f := range source.Fields {
			if f.ID == action.Condition.FieldID {
				conditionField = &f
				schema, _ = json.Marshal([]CollectionField{field, f})
			}
		}
	}
	if action.Operation == "copy" {
		for _, f := range source.Fields {
			if f.ID == action.SourceFieldID {
				valueSource = &f
			}
		}
		schema, _ = json.Marshal(struct {
			Target    CollectionField
			Condition *CollectionField
			Source    *CollectionField
		}{field, conditionField, valueSource})
	}
	hash := sha256.Sum256(schema)
	schemaHash := hex.EncodeToString(hash[:])
	resolved, err := resolvePageActionValue(action, record)
	if err != nil {
		writeError(w, 409, err.Error())
		return
	}
	normalized, empty, err := s.normalizeCollectionFieldValue(r.Context(), record, field, resolved)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if empty && field.Required {
		writeError(w, 409, "Источник пуст: обязательное поле нельзя очистить. Заполните источник и обновите предпросмотр")
		return
	}
	allowed := actionConditionMatches(action.Condition, record, source.Fields)
	if input.Apply && !allowed {
		writeError(w, 409, "Условие действия не выполнено. Запись не изменена")
		return
	}
	preview := pageActionPreview{SourceField: valueSource, SourceValue: record.CustomFields[action.SourceFieldID], Condition: action.Condition, ConditionField: conditionField, Allowed: allowed, RecordID: record.ID, Title: record.Title, Label: action.Label, Field: field, Before: record.CustomFields[field.ID], After: json.RawMessage(normalized), ExpectedUpdatedAt: record.UpdatedAt, ExpectedRevision: revision, SchemaHash: schemaHash}
	if !allowed {
		preview.ConditionReason = "Условие действия не выполнено. Сначала проверьте поля записи"
	}
	if !input.Apply {
		writeJSON(w, 200, preview)
		return
	}
	if input.SchemaHash != schemaHash {
		writeError(w, 409, "Поле изменилось. Обновите предпросмотр действия")
		return
	}
	now := nowText()
	changed, err := tx.ExecContext(r.Context(), `UPDATE records SET updated_at=? WHERE id=? AND workspace_id=? AND collection_id=? AND updated_at=? AND status<>'archived'`, now, record.ID, currentWorkspace(r).ID, block.CollectionID, input.ExpectedUpdatedAt)
	if err != nil {
		writeError(w, 500, "Не удалось изменить запись")
		return
	}
	if n, _ := changed.RowsAffected(); n != 1 {
		writeError(w, 409, "Запись изменилась во время подтверждения. Обновите предпросмотр")
		return
	}
	if empty {
		_, err = tx.ExecContext(r.Context(), `DELETE FROM record_field_values WHERE record_id=? AND field_id=?`, record.ID, field.ID)
	} else {
		_, err = tx.ExecContext(r.Context(), `INSERT INTO record_field_values(record_id,field_id,value_json,updated_by,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(record_id,field_id) DO UPDATE SET value_json=excluded.value_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at`, record.ID, field.ID, normalized, currentUser(r).ID, now)
	}
	if err != nil {
		writeError(w, 500, "Не удалось сохранить поле")
		return
	}
	if err = writeActivity(r.Context(), tx, currentUser(r).ID, record.Type, record.ID, "custom_fields_updated", "Действие: "+action.Label, map[string]any{"pageId": r.PathValue("id"), "actionId": action.ID, "fieldId": field.ID, "sourceFieldId": action.SourceFieldID, "before": preview.Before, "after": preview.After}); err != nil {
		writeError(w, 500, "Не удалось записать историю")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, 500, "Не удалось завершить действие")
		return
	}
	updated, err := s.getRecord(r.Context(), record.ID)
	if err != nil {
		writeError(w, 500, "Действие сохранено. Обновите запись для проверки результата")
		return
	}
	writeJSON(w, 200, updated)
}
