package app

import (
	"context"
	"database/sql"
	"errors"
	"strings"
)

// Existing option IDs remain stable: renaming never rewrites card values.
func updateCollectionOptions(ctx context.Context, tx *sql.Tx, fieldID string, options []CollectionFieldOption, now string) error {
	var kind string
	if err := tx.QueryRowContext(ctx, `SELECT field_type FROM collection_fields WHERE id=?`, fieldID).Scan(&kind); err != nil {
		return err
	}
	if kind != "select" && kind != "multi_select" {
		return errors.New("Варианты доступны только полям выбора")
	}
	if len(options) == 0 || len(options) > 1000 {
		return errors.New("Добавьте от 1 до 1000 вариантов")
	}
	rows, err := tx.QueryContext(ctx, `SELECT id FROM collection_field_options WHERE field_id=? AND archived_at IS NULL`, fieldID)
	if err != nil {
		return err
	}
	existing := map[string]bool{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		existing[id] = true
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	names, ids := map[string]bool{}, map[string]bool{}
	for i := range options {
		option := &options[i]
		option.Name = strings.TrimSpace(option.Name)
		name := strings.ToLower(option.Name)
		if name == "" || len([]rune(option.Name)) > 80 || names[name] {
			return errors.New("Названия вариантов должны быть разными, от 1 до 80 символов")
		}
		names[name] = true
		if option.ID != "" {
			if !existing[option.ID] || ids[option.ID] {
				return errors.New("Вариант не относится к этому полю или повторён")
			}
			ids[option.ID] = true
		}
	}
	if len(ids) != len(existing) {
		return errors.New("Существующие варианты необходимо сохранить: их используют карточки")
	}
	// Temporary unique labels also allow swapping two labels in one transaction.
	nonce, err := newID()
	if err != nil {
		return err
	}
	for id := range existing {
		if _, err = tx.ExecContext(ctx, `UPDATE collection_field_options SET name=? WHERE id=? AND field_id=?`, nonce+":"+id, id, fieldID); err != nil {
			return err
		}
	}
	for i, option := range options {
		if option.ID == "" {
			id, e := newID()
			if e != nil {
				return e
			}
			_, err = tx.ExecContext(ctx, `INSERT INTO collection_field_options(id,field_id,name,color_key,sort_order,created_at,updated_at) VALUES(?,?,?,'neutral',?,?,?)`, id, fieldID, option.Name, i*10, now, now)
		} else {
			_, err = tx.ExecContext(ctx, `UPDATE collection_field_options SET name=?,sort_order=?,updated_at=? WHERE id=? AND field_id=?`, option.Name, i*10, now, option.ID, fieldID)
		}
		if err != nil {
			return errors.New("Не удалось сохранить варианты. Проверьте совпадающие названия")
		}
	}
	return nil
}
