package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

type PageActionChange struct {
	FieldID       string          `json:"fieldId"`
	Operation     string          `json:"operation,omitempty"`
	SourceFieldID string          `json:"sourceFieldId,omitempty"`
	Value         json.RawMessage `json:"value"`
}

func actionChanges(a PageRecordAction) []PageRecordAction {
	first := a
	first.Changes = nil
	out := []PageRecordAction{first}
	for _, c := range a.Changes {
		out = append(out, PageRecordAction{ID: a.ID, Label: a.Label, FieldID: c.FieldID, Operation: c.Operation, SourceFieldID: c.SourceFieldID, Value: c.Value})
	}
	return out
}
func validateSinglePageAction(a PageRecordAction) error {
	if !pageAppID.MatchString(a.ID) || !pageAppID.MatchString(a.FieldID) || strings.TrimSpace(a.Label) == "" || len([]rune(a.Label)) > 80 || len(a.Value) > 40000 || (a.Operation != "copy" && !json.Valid(a.Value)) {
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
	return nil
}

type pageActionChangePreview struct {
	Field       CollectionField  `json:"field"`
	SourceField *CollectionField `json:"sourceField,omitempty"`
	SourceValue any              `json:"sourceValue,omitempty"`
	Before      any              `json:"before"`
	After       json.RawMessage  `json:"after"`
	empty       bool
}

func (s *Server) previewActionChanges(ctx context.Context, a PageRecordAction, record Record, fields []CollectionField) ([]pageActionChangePreview, []byte, error) {
	changes := []pageActionChangePreview{}
	schemas := []CollectionField{}
	// Every expression reads the same original record. Steps never read intermediate writes.
	for _, step := range actionChanges(a) {
		c := pageActionChangePreview{}
		for _, f := range fields {
			if f.ID == step.FieldID {
				c.Field = f
				schemas = append(schemas, f)
			}
			if step.Operation == "copy" && f.ID == step.SourceFieldID {
				c.SourceField = &f
				schemas = append(schemas, f)
			}
		}
		resolved, err := resolvePageActionValue(step, record)
		if err != nil {
			return nil, nil, fmt.Errorf("%s: %s", c.Field.Name, err)
		}
		normalized, empty, err := s.normalizeCollectionFieldValue(ctx, record, c.Field, resolved)
		if err != nil {
			return nil, nil, fmt.Errorf("%s: %s", c.Field.Name, err)
		}
		if empty && c.Field.Required {
			return nil, nil, fmt.Errorf("Источник пуст: обязательное поле «%s» нельзя очистить", c.Field.Name)
		}
		c.Before = record.CustomFields[step.FieldID]
		c.After = json.RawMessage(normalized)
		c.empty = empty
		c.SourceValue = record.CustomFields[step.SourceFieldID]
		changes = append(changes, c)
	}
	for _, f := range fields {
		if a.Condition != nil && f.ID == a.Condition.FieldID {
			schemas = append(schemas, f)
		}
	}
	schema, err := json.Marshal(schemas)
	return changes, schema, err
}
