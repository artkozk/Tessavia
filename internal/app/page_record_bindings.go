package app

import "errors"

// Record bindings change the displayed row, never the underlying record.
type PageTextBinding struct {
	FieldID   string `json:"fieldId"`
	Prefix    string `json:"prefix,omitempty"`
	Suffix    string `json:"suffix,omitempty"`
	EmptyText string `json:"emptyText,omitempty"`
}

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
	}
	return nil
}

func validatePageRecordBindingSource(b PageAppBlock, fields []CollectionField) error {
	for _, binding := range b.RecordBindings {
		valid := false
		for _, field := range fields {
			if field.ID == binding.FieldID && validTextBindingType(field.FieldType) {
				valid = true
				break
			}
		}
		if !valid {
			return errors.New("Поле привязки недоступно или его тип не поддерживает текст. Выберите действующее поле этой доски")
		}
	}
	return nil
}
