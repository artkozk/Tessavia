package app

import (
	"context"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"time"
)

type PageActionCondition struct {
	FieldID  string          `json:"fieldId"`
	Operator string          `json:"operator"`
	Value    json.RawMessage `json:"value,omitempty"`
}

func conditionOperatorAllowed(operator, kind string) bool {
	switch operator {
	case "eq", "ne", "empty", "not_empty":
		return true
	case "gt", "gte", "lt", "lte":
		return kind == "number" || kind == "money"
	}
	return false
}
func (s *Server) validateActionCondition(ctx context.Context, c *PageActionCondition, fields []CollectionField) error {
	if c == nil {
		return nil
	}
	for _, field := range fields {
		if field.ID == c.FieldID && portableActionField(field) {
			if !conditionOperatorAllowed(c.Operator, field.FieldType) {
				return errors.New("Выберите допустимое сравнение для поля условия")
			}
			if len(c.Value) > 40000 {
				return errors.New("Значение условия слишком длинное")
			}
			if c.Operator == "empty" || c.Operator == "not_empty" {
				return nil
			}
			if len(c.Value) > 40000 || !json.Valid(c.Value) {
				return errors.New("Укажите значение условия")
			}
			_, empty, err := s.normalizeCollectionFieldValue(ctx, Record{}, field, c.Value)
			if err != nil {
				return err
			}
			if empty && c.Operator != "eq" && c.Operator != "ne" {
				return errors.New("Для числового сравнения укажите число")
			}
			return nil
		}
	}
	return errors.New("Поле условия недоступно на выбранной доске")
}
func conditionValue(v any, kind string) any {
	if v == nil {
		return nil
	}
	if text, ok := v.(string); ok {
		if strings.TrimSpace(text) == "" {
			return nil
		}
		if kind == "datetime" {
			if date, err := time.Parse(time.RFC3339Nano, text); err == nil {
				return date.UnixMilli()
			}
		}
		return text
	}
	if values, ok := v.([]any); ok {
		if len(values) == 0 {
			return nil
		}
		parts := []string{}
		seen := map[string]bool{}
		for _, value := range values {
			raw, _ := json.Marshal(value)
			key := string(raw)
			if !seen[key] {
				parts = append(parts, key)
				seen[key] = true
			}
		}
		sort.Strings(parts)
		return parts
	}
	return v
}
func actionConditionMatches(c *PageActionCondition, record Record, fields []CollectionField) bool {
	if c == nil {
		return true
	}
	var field CollectionField
	for _, f := range fields {
		if f.ID == c.FieldID {
			field = f
		}
	}
	if field.ID == "" || !conditionOperatorAllowed(c.Operator, field.FieldType) {
		return false
	}
	current := conditionValue(record.CustomFields[c.FieldID], field.FieldType)
	if c.Operator == "empty" {
		return current == nil
	}
	if c.Operator == "not_empty" {
		return current != nil
	}
	var wanted any
	if json.Unmarshal(c.Value, &wanted) != nil {
		return false
	}
	wanted = conditionValue(wanted, field.FieldType)
	if c.Operator == "eq" || c.Operator == "ne" {
		a, _ := json.Marshal(current)
		b, _ := json.Marshal(wanted)
		equal := string(a) == string(b)
		if c.Operator == "ne" {
			return !equal
		}
		return equal
	}
	a, aok := current.(float64)
	b, bok := wanted.(float64)
	if !aok || !bok {
		return false
	}
	switch c.Operator {
	case "gt":
		return a > b
	case "gte":
		return a >= b
	case "lt":
		return a < b
	case "lte":
		return a <= b
	}
	return false
}
