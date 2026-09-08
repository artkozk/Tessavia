package app

import "errors"

// Only declarative display settings travel in kits. Personal IDs and data never do.
type PageDataConfig struct {
	Source           string   `json:"source"`
	Filter           string   `json:"filter,omitempty"`
	Layout           string   `json:"layout,omitempty"`
	Fields           []string `json:"fields"`
	Limit            int      `json:"limit,omitempty"`
	HideAction       bool     `json:"hideAction,omitempty"`
	HideReader       bool     `json:"hideReader,omitempty"`
	ReadLabel        string   `json:"readLabel,omitempty"`
	ReaderSize       int      `json:"readerSize,omitempty"`
	ActionLabel      string   `json:"actionLabel,omitempty"`
	Search           bool     `json:"search,omitempty"`
	TextSize         int      `json:"textSize,omitempty"`
	ActionSize       int      `json:"actionSize,omitempty"`
	TextColor        string   `json:"textColor,omitempty"`
	ActionColor      string   `json:"actionColor,omitempty"`
	ActionBackground string   `json:"actionBackground,omitempty"`
}

func validatePageDataConfig(b PageAppBlock) error {
	if b.Kind != "data" {
		return nil
	}
	d := b.Data
	if d == nil || (d.Source != "habits" && d.Source != "plans" && d.Source != "work" && d.Source != "reading") {
		return errors.New("Выберите источник данных блока")
	}
	if d.Filter != "" && d.Filter != "today" && d.Filter != "all" && d.Filter != "open" {
		return errors.New("Неизвестный фильтр данных")
	}
	if d.ReaderSize < 0 || d.ReaderSize > 72 || len([]rune(d.ReadLabel)) > 80 {
		return errors.New("Настройки чтения вне допустимого диапазона")
	}
	if d.Layout != "" && d.Layout != "list" && d.Layout != "cards" {
		return errors.New("Выберите список или карточки")
	}
	if d.Limit < 0 || d.Limit > 100 || d.TextSize < 0 || d.TextSize > 72 || d.ActionSize < 0 || d.ActionSize > 48 || len([]rune(d.ActionLabel)) > 80 || len(d.Fields) > 5 {
		return errors.New("Настройки представления вне допустимого диапазона")
	}
	seen := map[string]bool{}
	for _, field := range d.Fields {
		if seen[field] || (field != "title" && field != "description" && field != "status" && field != "progress" && field != "date") {
			return errors.New("Выберите разные доступные поля представления")
		}
		seen[field] = true
	}
	for _, color := range []string{d.TextColor, d.ActionColor, d.ActionBackground} {
		if color != "" && !pageAppColor.MatchString(color) {
			return errors.New("Укажите цвет в формате #176b58")
		}
	}
	return nil
}
