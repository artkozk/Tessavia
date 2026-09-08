package app

import (
	"errors"
	"math"
)

// Record bindings change the displayed row, never the underlying record.
type PageTextBinding struct {
	FieldID     string                `json:"fieldId"`
	Prefix      string                `json:"prefix,omitempty"`
	Suffix      string                `json:"suffix,omitempty"`
	EmptyText   string                `json:"emptyText,omitempty"`
	Calculation []PageCalculationStep `json:"calculation,omitempty"`
	Precision   *int                  `json:"precision,omitempty"`
}

type PageCalculationStep struct {
	Operation string   `json:"operation"`
	FieldID   string   `json:"fieldId,omitempty"`
	Value     *float64 `json:"value,omitempty"`
}

func numericBindingType(kind string) bool { return kind == "number" || kind == "money" }

func validTextBindingType(kind string) bool {
	return kind == "long_text" || kind == "money" || kind == "datetime" || kind == "url" || kind == "email" || kind == "phone" || kind == "text" || kind == "number" || kind == "date" || kind == "checkbox" || kind == "select" || kind == "multi_select"
}

func validatePageRecordBindings(b PageAppBlock) error {
	for property, binding := range b.RecordBindings {
		if property != "title" && property != "subtitle" {
			return errors.New("Для привязки выберите заголовок или подпись карточки")
		}
		if !pageAppID.MatchString(binding.FieldID) || len([]rune(binding.Prefix)) > 160 || len([]rune(binding.Suffix)) > 160 || len([]rune(binding.EmptyText)) > 160 {
			return errors.New("Выберите поле и укажите тексты привязки не длиннее 160 символов")
		}
		if len(binding.Calculation) > 8 || (binding.Precision != nil && (*binding.Precision < 0 || *binding.Precision > 6)) {
			return errors.New("До 8 шагов вычисления и от 0 до 6 знаков после запятой")
		}
		for _, step := range binding.Calculation {
			switch step.Operation {
			case "add", "subtract", "multiply", "divide", "min", "max":
			default:
				return errors.New("Выберите операцию вычисления")
			}
			if (step.FieldID != "") == (step.Value != nil) {
				return errors.New("Для шага выберите одно поле или одно постоянное число")
			}
			if step.FieldID != "" && !pageAppID.MatchString(step.FieldID) {
				return errors.New("Выберите поле вычисления")
			}
			if step.Value != nil && (math.IsNaN(*step.Value) || math.IsInf(*step.Value, 0) || math.Abs(*step.Value) > 1e15) {
				return errors.New("Число вычисления должно быть конечным, по модулю не больше 10¹⁵")
			}
		}
	}
	return validatePageRecordCard(b)
}

func validatePageRecordBindingSource(b PageAppBlock, fields []CollectionField) error {
	for _, binding := range b.RecordBindings {
		valid := false
		for _, field := range fields {
			if field.ID == binding.FieldID && validTextBindingType(field.FieldType) && (len(binding.Calculation) == 0 || numericBindingType(field.FieldType)) {
				valid = true
				break
			}
		}
		if !valid {
			return errors.New("Поле привязки недоступно или его тип не поддерживает текст. Выберите действующее поле этой доски")
		}
		for _, step := range binding.Calculation {
			if step.FieldID == "" {
				continue
			}
			found := false
			for _, field := range fields {
				if field.ID == step.FieldID && numericBindingType(field.FieldType) {
					found = true
					break
				}
			}
			if !found {
				return errors.New("Вычисление использует только действующие числовые или денежные поля этой доски")
			}
		}
	}
	return validatePageRecordCardSource(b, fields)
}
