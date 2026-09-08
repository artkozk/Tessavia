package app

import "errors"

// Visibility changes presentation, never authorization to read a page or act on data.
type PageBlockVisibility struct {
	Source   string `json:"source"`
	Metric   string `json:"metric"`
	Operator string `json:"operator"`
	Value    int    `json:"value"`
}

func validatePageBlockVisibility(d *PageAppDefinition) error {
	blocks := map[string]PageAppBlock{}
	for _, b := range d.Blocks {
		blocks[b.ID] = b
	}
	for _, b := range d.Blocks {
		c := b.Visibility
		if c == nil {
			continue
		}
		if c.Source == b.ID || blocks[c.Source].Kind != "tracker" {
			return errors.New("Для условия выберите другой блок с пунктами и отметками")
		}
		if c.Metric != "checked" && c.Metric != "remaining" && c.Metric != "percent" {
			return errors.New("Выберите показатель прогресса")
		}
		if c.Operator != "eq" && c.Operator != "ne" && c.Operator != "gt" && c.Operator != "gte" && c.Operator != "lt" && c.Operator != "lte" {
			return errors.New("Выберите сравнение условия")
		}
		if c.Value < 0 || c.Value > 500 || (c.Metric == "percent" && c.Value > 100) {
			return errors.New("Порог: от 0 до 500 пунктов или от 0 до 100 процентов")
		}
		seen := map[string]bool{b.ID: true}
		for source := c.Source; source != ""; {
			if seen[source] {
				return errors.New("Условия блоков образуют круг: один из этапов должен быть доступен независимо")
			}
			seen[source] = true
			next := blocks[source].Visibility
			if next == nil {
				break
			}
			source = next.Source
		}
	}
	return nil
}
