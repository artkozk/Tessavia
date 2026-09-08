package app

import "errors"

func copyActionFieldType(kind string) bool {
	switch kind {
	case "text", "long_text", "number", "money", "date", "datetime", "checkbox", "url", "email", "phone":
		return true
	}
	return false
}
func compatibleActionFields(source, target CollectionField) bool {
	if source.ID == target.ID || !copyActionFieldType(source.FieldType) || !copyActionFieldType(target.FieldType) {
		return false
	}
	if source.FieldType == target.FieldType {
		return true
	}
	return ((source.FieldType == "number" || source.FieldType == "money") && (target.FieldType == "number" || target.FieldType == "money")) || ((source.FieldType == "text" || source.FieldType == "long_text") && (target.FieldType == "text" || target.FieldType == "long_text"))
}
func validateActionCopySource(action PageRecordAction, target CollectionField, fields []CollectionField) error {
	for _, source := range fields {
		if source.ID == action.SourceFieldID && compatibleActionFields(source, target) {
			return nil
		}
	}
	return errors.New("Для копирования выберите другое совместимое поле той же доски")
}
