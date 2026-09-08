package app

import "errors"

// Visibility changes presentation, never authorization to read a page or act on data.
type PageBlockVisibility struct {
	Mode       string                `json:"mode,omitempty"`
	Conditions []PageBlockVisibility `json:"conditions,omitempty"`
	Source     string                `json:"source,omitempty"`
	Metric     string                `json:"metric,omitempty"`
	Operator   string                `json:"operator,omitempty"`
	Value      int                   `json:"value"`
}

func visibilityLeaves(c *PageBlockVisibility) []*PageBlockVisibility {
	if c == nil {
		return nil
	}
	if c.Mode == "" {
		return []*PageBlockVisibility{c}
	}
	leaves := []*PageBlockVisibility{}
	for i := range c.Conditions {
		leaves = append(leaves, &c.Conditions[i])
	}
	return leaves
}
func validatePageBlockVisibility(d *PageAppDefinition) error {
	blocks := map[string]PageAppBlock{}
	for _, b := range d.Blocks {
		blocks[b.ID] = b
	}
	edges := map[string][]string{}
	for _, b := range d.Blocks {
		c := b.Visibility
		if c == nil {
			continue
		}
		if c.Mode != "" || len(c.Conditions) > 0 {
			if (c.Mode != "all" && c.Mode != "any") || len(c.Conditions) < 1 || len(c.Conditions) > 8 || c.Source != "" || c.Metric != "" || c.Operator != "" || c.Value != 0 {
				return errors.New("Выберите «Все» или «Любое» и добавьте от 1 до 8 условий показа")
			}
		}
		for _, leaf := range visibilityLeaves(c) {
			if leaf.Mode != "" || len(leaf.Conditions) > 0 {
				return errors.New("Вложенные условия показа пока не поддерживаются")
			}
			if leaf.Source == b.ID || blocks[leaf.Source].Kind != "tracker" {
				return errors.New("Для условия выберите другой блок с пунктами и отметками")
			}
			if leaf.Metric != "checked" && leaf.Metric != "remaining" && leaf.Metric != "percent" {
				return errors.New("Выберите показатель прогресса")
			}
			if leaf.Operator != "eq" && leaf.Operator != "ne" && leaf.Operator != "gt" && leaf.Operator != "gte" && leaf.Operator != "lt" && leaf.Operator != "lte" {
				return errors.New("Выберите сравнение условия")
			}
			if leaf.Value < 0 || leaf.Value > 500 || (leaf.Metric == "percent" && leaf.Value > 100) {
				return errors.New("Порог: от 0 до 500 пунктов или от 0 до 100 процентов")
			}
			edges[b.ID] = append(edges[b.ID], leaf.Source)
		}
	}
	// DFS uses the current recursion path, so shared ancestors are not mistaken for cycles.
	colors := map[string]int{}
	var visit func(string) bool
	visit = func(id string) bool {
		if colors[id] == 1 {
			return false
		}
		if colors[id] == 2 {
			return true
		}
		colors[id] = 1
		for _, source := range edges[id] {
			if !visit(source) {
				return false
			}
		}
		colors[id] = 2
		return true
	}
	for id := range blocks {
		if !visit(id) {
			return errors.New("Условия блоков образуют круг: один из этапов должен быть доступен независимо")
		}
	}
	return nil
}
