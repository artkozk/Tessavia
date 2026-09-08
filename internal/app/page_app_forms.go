package app

import (
	"errors"
	"fmt"
	"strings"
)

// Keys reference an existing field or a built-in record property; presentation never grants permissions.
type PageAppFormField struct {
	Key         string `json:"key"`
	Label       string `json:"label,omitempty"`
	Placeholder string `json:"placeholder,omitempty"`
	Width       int    `json:"width"`
	FontSize    int    `json:"fontSize,omitempty"`
	Color       string `json:"color,omitempty"`
	Background  string `json:"background,omitempty"`
	Hidden      bool   `json:"hidden,omitempty"`
}

func pageAppHasSource(b PageAppBlock) bool {
	return b.Kind == "records" || b.Kind == "form" || len(b.RecordBindings) > 0
}

func validatePageAppForm(b PageAppBlock) error {
	if len(b.FormFields) > 46 || len(b.DefaultTitle) > 240 || len([]rune(b.SuccessText)) > 240 {
		return errors.New("В форме допускается до 46 полей и короткие подписи результата")
	}
	seen := map[string]bool{}
	titleVisible := false
	for _, f := range b.FormFields {
		builtin := f.Key == "title" || f.Key == "description" || f.Key == "dueAt" || f.Key == "ownerId" || f.Key == "stageId" || f.Key == "priority"
		if seen[f.Key] || (!builtin && (!strings.HasPrefix(f.Key, "custom:") || !pageAppID.MatchString(strings.TrimPrefix(f.Key, "custom:")))) {
			return errors.New("Выберите разные действующие поля формы")
		}
		seen[f.Key] = true
		if f.Key == "title" && !f.Hidden {
			titleVisible = true
		}
		if len([]rune(f.Label)) > 160 || len([]rune(f.Placeholder)) > 240 || f.Width < 1 || f.Width > 12 || f.FontSize < 0 || f.FontSize > 72 || (f.Color != "" && !pageAppColor.MatchString(f.Color)) || (f.Background != "" && !pageAppColor.MatchString(f.Background)) {
			return errors.New("Проверьте подписи, ширину и цвета полей формы")
		}
	}
	if !titleVisible && strings.TrimSpace(b.DefaultTitle) == "" {
		return errors.New("Если поле названия убрано, задайте начальное название записи")
	}
	return nil
}

func validatePageFormSource(b PageAppBlock, fields []CollectionField) error {
	if b.Kind != "form" {
		return nil
	}
	known := map[string]CollectionField{}
	for _, f := range fields {
		known[f.ID] = f
	}
	visible := map[string]bool{}
	for _, f := range b.FormFields {
		if !strings.HasPrefix(f.Key, "custom:") {
			continue
		}
		id := strings.TrimPrefix(f.Key, "custom:")
		if _, ok := known[id]; !ok {
			return errors.New("Поле формы больше не доступно на выбранной доске")
		}
		if !f.Hidden {
			visible[id] = true
		}
	}
	for _, f := range fields {
		raw := strings.TrimSpace(string(f.DefaultValue))
		if f.Required && !visible[f.ID] && (raw == "" || raw == "null" || raw == `""` || raw == "[]") {
			return fmt.Errorf("Добавьте обязательное поле «%s» в форму или задайте ему начальное значение на доске", f.Name)
		}
	}
	return nil
}
