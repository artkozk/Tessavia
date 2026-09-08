package app

import "errors"

func validatePageComposition(d *PageAppDefinition) error {
	blocks := map[string]PageAppBlock{}
	for _, b := range d.Blocks {
		blocks[b.ID] = b
		if b.GroupLayout != "" && b.GroupLayout != "grid" && b.GroupLayout != "stack" {
			return errors.New("Выберите сетку или вертикальную группу")
		}
		if b.Gap != nil && (*b.Gap < 0 || *b.Gap > 48) {
			return errors.New("Интервал группы — от 0 до 48 px")
		}
	}
	for _, b := range d.Blocks {
		seen := map[string]bool{b.ID: true}
		parent := b.ParentID
		depth := 0
		for parent != "" {
			p, ok := blocks[parent]
			if !ok || p.Kind != "group" {
				return errors.New("Вложенный блок должен находиться в существующей группе")
			}
			if seen[parent] {
				return errors.New("Группа не может содержать саму себя или своего родителя")
			}
			seen[parent] = true
			depth++
			if depth > 4 {
				return errors.New("Допускается не более четырёх уровней вложенности")
			}
			parent = p.ParentID
		}
	}
	return nil
}
