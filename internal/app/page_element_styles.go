package app

import (
	"errors"
	"strings"
)

type PageElementStyle struct {
	Width      *int   `json:"width,omitempty"`
	MinHeight  *int   `json:"minHeight,omitempty"`
	FontSize   *int   `json:"fontSize,omitempty"`
	Padding    *int   `json:"padding,omitempty"`
	Radius     *int   `json:"radius,omitempty"`
	Color      string `json:"color,omitempty"`
	Background string `json:"background,omitempty"`
	Align      string `json:"align,omitempty"`
	Weight     string `json:"weight,omitempty"`
	Hidden     *bool  `json:"hidden,omitempty"`
}

func elementFieldID(key string) string {
	for _, prefix := range []string{"fieldLabel:", "fieldValue:"} {
		if strings.HasPrefix(key, prefix) {
			return strings.TrimPrefix(key, prefix)
		}
	}
	return ""
}
func hasFieldElementStyles(b PageAppBlock) bool {
	for key := range b.ElementStyles {
		if elementFieldID(key) != "" {
			return true
		}
	}
	return false
}

func validatePageElementStyles(b PageAppBlock) error {
	if len(b.ElementStyles) > 600 {
		return errors.New("Слишком много настроенных элементов блока")
	}
	for key, style := range b.ElementStyles {
		valid := false
		switch key {
		case "title", "text", "item", "progressValue", "progressCount", "progressBar", "button", "row", "rowTitle", "rowSubtitle", "fieldLabel", "fieldValue", "createButton", "actionButton":
			valid = true
		}
		for _, prefix := range []string{"item:", "fieldLabel:", "fieldValue:", "action:"} {
			if strings.HasPrefix(key, prefix) && pageAppID.MatchString(strings.TrimPrefix(key, prefix)) {
				valid = true
			}
		}
		if !valid {
			return errors.New("Неизвестный вложенный элемент")
		}
		for _, v := range []struct {
			value *int
			max   int
		}{{style.Width, 1600}, {style.MinHeight, 1600}, {style.FontSize, 96}, {style.Padding, 80}, {style.Radius, 80}} {
			if v.value != nil && (*v.value < 0 || *v.value > v.max) {
				return errors.New("Размер вложенного элемента вне допустимого диапазона")
			}
		}
		if (style.Color != "" && !pageAppColor.MatchString(style.Color)) || (style.Background != "" && !pageAppColor.MatchString(style.Background)) {
			return errors.New("Цвет элемента должен иметь вид #123456")
		}
		if style.Align != "" && style.Align != "left" && style.Align != "center" && style.Align != "right" {
			return errors.New("Выберите выравнивание элемента")
		}
		if style.Weight != "" && style.Weight != "normal" && style.Weight != "medium" && style.Weight != "bold" {
			return errors.New("Выберите начертание текста")
		}
	}
	return nil
}

func validatePageElementStyleSource(b PageAppBlock, fields []CollectionField) error {
	for key := range b.ElementStyles {
		if id := elementFieldID(key); id != "" {
			found := false
			for _, field := range fields {
				if field.ID == id {
					found = true
					break
				}
			}
			if !found {
				return errors.New("Поле настроенного элемента недоступно. Уберите его оформление или выберите действующее поле")
			}
		}
	}
	return nil
}
