package app

import "errors"

// A record card repeats presentation over already authorized records; it stores no values.
type PageRecordCard struct {
	Enabled bool             `json:"enabled"`
	Columns int              `json:"columns"`
	Gap     *int             `json:"gap,omitempty"`
	Parts   []PageRecordPart `json:"parts"`
}
type PageRecordPart struct {
	ID        string `json:"id"`
	Kind      string `json:"kind"`
	FieldID   string `json:"fieldId,omitempty"`
	Text      string `json:"text,omitempty"`
	Label     string `json:"label,omitempty"`
	Width     int    `json:"width"`
	Hidden    bool   `json:"hidden,omitempty"`
	HideLabel bool   `json:"hideLabel,omitempty"`
}

func validatePageRecordCard(b PageAppBlock) error {
	c := b.RecordCard
	if c == nil {
		return nil
	}
	if c.Columns < 1 || c.Columns > 4 || len(c.Parts) > 48 || (c.Gap != nil && (*c.Gap < 0 || *c.Gap > 48)) {
		return errors.New("Карточка: до 48 частей, 1–4 колонки, интервал 0–48 px")
	}
	seen := map[string]bool{}
	for _, p := range c.Parts {
		if !pageAppID.MatchString(p.ID) || seen[p.ID] || p.Width < 1 || p.Width > 12 || len([]rune(p.Text)) > 2000 || len([]rune(p.Label)) > 160 {
			return errors.New("Укажите разные ключи частей карточки, ширину 1–12 и допустимую длину текста")
		}
		seen[p.ID] = true
		switch p.Kind {
		case "title", "subtitle", "text":
		case "field":
			if !pageAppID.MatchString(p.FieldID) {
				return errors.New("Выберите поле части карточки")
			}
		default:
			return errors.New("Неизвестный тип части карточки")
		}
		if p.Kind != "field" && p.FieldID != "" {
			return errors.New("Источник поля допустим только у части «Поле записи»")
		}
	}
	return nil
}
func validatePageRecordCardSource(b PageAppBlock, fields []CollectionField) error {
	if b.RecordCard == nil {
		return nil
	}
	for _, p := range b.RecordCard.Parts {
		if p.Kind != "field" {
			continue
		}
		found := false
		for _, f := range fields {
			if f.ID == p.FieldID {
				found = true
				break
			}
		}
		if !found {
			return errors.New("Поле части карточки недоступно. Выберите действующее поле этой доски")
		}
	}
	return nil
}
