package app

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
)

// Only pairs whose meaning and complete stored values can be retained are
// available. Other conversions need an explicit mapping, not a best guess.
func fieldTypeConversion(from, to string) bool {
	return from == to || (from == "text" && to == "long_text") || (from == "long_text" && to == "text") ||
		(from == "number" && to == "money") || (from == "money" && to == "number") ||
		(from == "select" && to == "multi_select") || (from == "multi_select" && to == "select")
}

func convertCollectionFieldRaw(from, to, raw string) (string, bool, error) {
	if !fieldTypeConversion(from, to) {
		return "", false, errors.New("для этой пары типов нет преобразования без потери данных")
	}
	var value any
	if err := json.Unmarshal([]byte(raw), &value); err != nil {
		return "", false, errors.New("сохранённое значение повреждено; исправьте его до смены типа")
	}
	// Explicit absence must stay absent, including a cleared default.
	if value == nil {
		return raw, false, nil
	}
	switch from {
	case "text", "long_text", "select":
		text, ok := value.(string)
		if !ok {
			return "", false, errors.New("сохранённое значение не является текстом")
		}
		if from == "select" && to == "multi_select" {
			values := []string{}
			if text != "" {
				values = append(values, text)
			}
			converted, _ := json.Marshal(values)
			return string(converted), true, nil
		}
	case "number", "money":
		if _, ok := value.(float64); !ok {
			return "", false, errors.New("сохранённое значение не является числом")
		}
	case "multi_select":
		values, ok := value.([]any)
		if !ok {
			return "", false, errors.New("сохранённое значение не является списком вариантов")
		}
		for _, item := range values {
			if _, ok := item.(string); !ok {
				return "", false, errors.New("сохранённый список вариантов повреждён")
			}
		}
		if to == "select" {
			if len(values) > 1 {
				return "", false, errors.New("выбрано несколько вариантов; оставьте один вариант или сохраните тип «Несколько вариантов»")
			}
			text := ""
			if len(values) == 1 {
				text = values[0].(string)
			}
			converted, _ := json.Marshal(text)
			return string(converted), true, nil
		}
	default:
		return "", false, errors.New("выберите совместимый новый тип")
	}
	// Do not unmarshal/marshal numbers: that would round large precise values.
	return raw, false, nil
}

type fieldTypeConversionRow struct {
	RecordID     string          `json:"recordId"`
	RecordTitle  string          `json:"recordTitle"`
	Value        json.RawMessage `json:"value"`
	Converted    json.RawMessage `json:"converted"`
	ValueRaw     string          `json:"valueRaw"`
	ConvertedRaw string          `json:"convertedRaw"`
}

type fieldTypeConversionPreview struct {
	FieldID          string                   `json:"fieldId"`
	From             string                   `json:"from"`
	To               string                   `json:"to"`
	Affected         int                      `json:"affected"`
	Changed          int                      `json:"changed"`
	Archived         int                      `json:"archived"`
	Detached         int                      `json:"detached"`
	DefaultBefore    json.RawMessage          `json:"defaultBefore"`
	DefaultAfter     json.RawMessage          `json:"defaultAfter"`
	DefaultChanged   bool                     `json:"defaultChanged"`
	DefaultBeforeRaw string                   `json:"defaultBeforeRaw"`
	DefaultAfterRaw  string                   `json:"defaultAfterRaw"`
	Examples         []fieldTypeConversionRow `json:"examples"`
	ConversionHash   string                   `json:"conversionHash"`
}

type fieldConversionStoredRow struct {
	RecordID, RecordTitle, RecordType, RecordUpdatedAt, CollectionID, Status string
	Value, UpdatedAt                                                         sql.NullString
	Converted                                                                string
}

type fieldConversionSnapshot struct {
	Field                          CollectionField
	DefaultValue, DefaultUpdatedAt sql.NullString
	DefaultConverted               string
	Options                        []fieldConversionStoredOption
	Rows                           []fieldConversionStoredRow
}

type fieldConversionStoredOption struct {
	ID, Name, ColorKey, ArchivedAt, UpdatedAt string
	SortOrder                                 int
}

// Both preview and application read a single database snapshot. Apply never
// relies on rows read outside its transaction, including newly added values.
func readFieldConversion(ctx context.Context, tx *sql.Tx, workspaceID, collectionID, fieldID, to string) (fieldTypeConversionPreview, fieldConversionSnapshot, error) {
	preview := fieldTypeConversionPreview{FieldID: fieldID, To: to, Examples: []fieldTypeConversionRow{}, DefaultBefore: json.RawMessage("null"), DefaultAfter: json.RawMessage("null")}
	snapshot := fieldConversionSnapshot{}
	f := &snapshot.Field
	err := tx.QueryRowContext(ctx, `SELECT f.id,f.field_key,f.name,f.field_type,f.required,f.show_on_card,f.sort_order,f.updated_at,d.value_json,d.updated_at
	 FROM collection_fields f JOIN workspace_collections c ON c.id=f.collection_id
	 LEFT JOIN collection_field_defaults d ON d.field_id=f.id
	 WHERE f.id=? AND f.collection_id=? AND c.workspace_id=? AND f.archived_at IS NULL AND c.archived_at IS NULL`, fieldID, collectionID, workspaceID).
		Scan(&f.ID, &f.Key, &f.Name, &f.FieldType, &f.Required, &f.ShowOnCard, &f.SortOrder, &f.UpdatedAt, &snapshot.DefaultValue, &snapshot.DefaultUpdatedAt)
	if err != nil {
		return preview, snapshot, err
	}
	preview.From = f.FieldType
	if !validCollectionFieldType(to) || !fieldTypeConversion(f.FieldType, to) || f.FieldType == to {
		return preview, snapshot, errors.New("выберите совместимый новый тип")
	}
	// A damaged cross-workspace reference must not be ignored or expose its
	// value/record ID to this workspace's administrator.
	var foreign int
	if err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM record_field_values v LEFT JOIN records r ON r.id=v.record_id WHERE v.field_id=? AND (r.id IS NULL OR r.workspace_id<>?)`, fieldID, workspaceID).Scan(&foreign); err != nil {
		return preview, snapshot, err
	}
	if foreign != 0 {
		return preview, snapshot, errors.New("связи поля требуют проверки целостности; смена типа не выполнена")
	}
	options, err := tx.QueryContext(ctx, `SELECT id,name,color_key,COALESCE(archived_at,''),updated_at,sort_order FROM collection_field_options WHERE field_id=? ORDER BY id`, fieldID)
	if err != nil {
		return preview, snapshot, err
	}
	for options.Next() {
		var option fieldConversionStoredOption
		if err = options.Scan(&option.ID, &option.Name, &option.ColorKey, &option.ArchivedAt, &option.UpdatedAt, &option.SortOrder); err != nil {
			options.Close()
			return preview, snapshot, err
		}
		snapshot.Options = append(snapshot.Options, option)
	}
	err = options.Err()
	options.Close()
	if err != nil {
		return preview, snapshot, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT r.id,r.title,CASE WHEN r.business_kind<>'' THEN r.business_kind WHEN r.subtype='question_set' THEN 'question_set' WHEN r.record_kind='meeting' THEN 'meeting' ELSE r.type END,
	 r.updated_at,COALESCE(r.collection_id,''),r.status,v.value_json,v.updated_at FROM records r LEFT JOIN record_field_values v ON v.record_id=r.id AND v.field_id=?
	 WHERE r.workspace_id=? AND (r.collection_id=? OR v.field_id IS NOT NULL) ORDER BY r.id`, fieldID, workspaceID, collectionID)
	if err != nil {
		return preview, snapshot, err
	}
	for rows.Next() {
		var row fieldConversionStoredRow
		if err = rows.Scan(&row.RecordID, &row.RecordTitle, &row.RecordType, &row.RecordUpdatedAt, &row.CollectionID, &row.Status, &row.Value, &row.UpdatedAt); err != nil {
			rows.Close()
			return preview, snapshot, err
		}
		if row.Value.Valid {
			var changed bool
			row.Converted, changed, err = convertCollectionFieldRaw(f.FieldType, to, row.Value.String)
			if err != nil {
				rows.Close()
				return preview, snapshot, fmt.Errorf("Поле в карточке «%.80s»: %w", row.RecordTitle, err)
			}
			preview.Affected++
			if changed {
				preview.Changed++
			}
			if row.Status == "archived" {
				preview.Archived++
			}
			if row.CollectionID != collectionID {
				preview.Detached++
			}
			if len(preview.Examples) < 5 {
				preview.Examples = append(preview.Examples, fieldTypeConversionRow{RecordID: row.RecordID, RecordTitle: row.RecordTitle, Value: json.RawMessage(row.Value.String), Converted: json.RawMessage(row.Converted), ValueRaw: row.Value.String, ConvertedRaw: row.Converted})
			}
		}
		snapshot.Rows = append(snapshot.Rows, row)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return preview, snapshot, err
	}
	if snapshot.DefaultValue.Valid {
		snapshot.DefaultConverted, preview.DefaultChanged, err = convertCollectionFieldRaw(f.FieldType, to, snapshot.DefaultValue.String)
		if err != nil {
			return preview, snapshot, fmt.Errorf("Начальное значение: %w", err)
		}
		preview.DefaultBefore = json.RawMessage(snapshot.DefaultValue.String)
		preview.DefaultAfter = json.RawMessage(snapshot.DefaultConverted)
		preview.DefaultBeforeRaw = snapshot.DefaultValue.String
		preview.DefaultAfterRaw = snapshot.DefaultConverted
	}
	// JSON encoding keeps fields unambiguous even when stored strings contain
	// separators. Include presence, schema, defaults, all rows and their versions.
	encoded, _ := json.Marshal(struct {
		Workspace, Collection, To string
		Snapshot                  fieldConversionSnapshot
	}{workspaceID, collectionID, to, snapshot})
	sum := sha256.Sum256(encoded)
	preview.ConversionHash = hex.EncodeToString(sum[:])
	return preview, snapshot, nil
}

func writeFieldConversionError(w http.ResponseWriter, err error) {
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, 404, "Поле не найдено")
		return
	}
	writeError(w, 400, err.Error())
}

// Writers which normalized values before obtaining their transaction must not
// insert that old representation after a concurrent schema conversion commits.
// Checking the complete set also catches newly added required fields.
func collectionFieldSnapshotMatches(ctx context.Context, tx *sql.Tx, collectionID string, fields []CollectionField) bool {
	if collectionID == "" {
		return len(fields) == 0
	}
	var active int
	if tx.QueryRowContext(ctx, `SELECT 1 FROM workspace_collections WHERE id=? AND archived_at IS NULL`, collectionID).Scan(&active) != nil {
		return false
	}
	rows, err := tx.QueryContext(ctx, `SELECT id,field_type,updated_at FROM collection_fields WHERE collection_id=? AND archived_at IS NULL`, collectionID)
	if err != nil {
		return false
	}
	defer rows.Close()
	expected := make(map[string]CollectionField, len(fields))
	for _, field := range fields {
		expected[field.ID] = field
	}
	for rows.Next() {
		var id, kind, version string
		if rows.Scan(&id, &kind, &version) != nil {
			return false
		}
		field, ok := expected[id]
		if !ok || field.FieldType != kind || field.UpdatedAt != version {
			return false
		}
		delete(expected, id)
	}
	return rows.Err() == nil && len(expected) == 0
}

func (s *Server) applyCollectionFieldConversion(w http.ResponseWriter, r *http.Request, collectionID, fieldID, name, to, expectedAt, hash string, required, showOnCard bool) {
	if expectedAt == "" || hash == "" {
		writeError(w, 409, "Обновите поле и проверьте преобразование перед сохранением")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось начать смену типа")
		return
	}
	defer tx.Rollback()
	preview, snapshot, err := readFieldConversion(r.Context(), tx, currentWorkspace(r).ID, collectionID, fieldID, to)
	if err != nil {
		writeFieldConversionError(w, err)
		return
	}
	if snapshot.Field.UpdatedAt != expectedAt || preview.ConversionHash != hash {
		writeError(w, 409, "Схема или значения поля изменились. Проверьте преобразование ещё раз")
		return
	}
	now := nowText()
	result, err := tx.ExecContext(r.Context(), `UPDATE collection_fields SET name=?,field_type=?,required=?,show_on_card=?,updated_at=? WHERE id=? AND updated_at=? AND archived_at IS NULL`, name, to, required, showOnCard, now, fieldID, expectedAt)
	if err != nil {
		writeError(w, 409, "Поле не сохранено: проверьте название и актуальность схемы")
		return
	}
	if n, _ := result.RowsAffected(); n != 1 {
		writeError(w, 409, "Схема изменилась. Обновите конструктор")
		return
	}
	for _, row := range snapshot.Rows {
		if row.Value.Valid {
			result, err = tx.ExecContext(r.Context(), `UPDATE record_field_values SET value_json=?,updated_by=?,updated_at=? WHERE record_id=? AND field_id=? AND value_json=? AND updated_at=?`, row.Converted, currentUser(r).ID, now, row.RecordID, fieldID, row.Value.String, row.UpdatedAt.String)
			if err != nil {
				writeError(w, 500, "Не удалось преобразовать поле; изменения отменены")
				return
			}
			if n, _ := result.RowsAffected(); n != 1 {
				writeError(w, 409, "Значения изменились. Повторите предпросмотр")
				return
			}
			if err = writeActivity(r.Context(), tx, currentUser(r).ID, row.RecordType, row.RecordID, "field_type_converted", "", map[string]any{"fieldId": fieldID, "fieldName": name, "from": preview.From, "to": to, "beforeRaw": row.Value.String, "afterRaw": row.Converted, "conversionHash": hash}); err != nil {
				writeError(w, 500, "Не удалось сохранить исходные значения; изменения отменены")
				return
			}
		}
		// Even an empty card's old draft was built against the old schema.
		result, err = tx.ExecContext(r.Context(), `UPDATE records SET updated_at=? WHERE id=? AND updated_at=?`, now, row.RecordID, row.RecordUpdatedAt)
		if err != nil {
			writeError(w, 500, "Не удалось обновить карточки; изменения отменены")
			return
		}
		if n, _ := result.RowsAffected(); n != 1 {
			writeError(w, 409, "Карточки изменились. Повторите предпросмотр")
			return
		}
	}
	if snapshot.DefaultValue.Valid {
		result, err = tx.ExecContext(r.Context(), `UPDATE collection_field_defaults SET value_json=?,updated_at=? WHERE field_id=? AND value_json=? AND updated_at=?`, snapshot.DefaultConverted, now, fieldID, snapshot.DefaultValue.String, snapshot.DefaultUpdatedAt.String)
		if err != nil {
			writeError(w, 500, "Не удалось преобразовать начальное значение; изменения отменены")
			return
		}
		if n, _ := result.RowsAffected(); n != 1 {
			writeError(w, 409, "Начальное значение изменилось. Повторите предпросмотр")
			return
		}
	}
	if err = writeActivity(r.Context(), tx, currentUser(r).ID, "collection", collectionID, "field_type_converted", "", map[string]any{"fieldId": fieldID, "fieldName": name, "from": preview.From, "to": to, "affected": preview.Affected, "changed": preview.Changed, "defaultPresent": snapshot.DefaultValue.Valid, "defaultBeforeRaw": snapshot.DefaultValue.String, "defaultAfterRaw": snapshot.DefaultConverted, "conversionHash": hash}); err != nil {
		writeError(w, 500, "Не удалось сохранить историю; изменения отменены")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, 409, "Не удалось завершить смену типа. Обновите предпросмотр")
		return
	}
	fields, err := s.listCollectionFields(r.Context(), collectionID)
	if err != nil {
		writeError(w, 500, "Тип изменён. Обновите конструктор")
		return
	}
	for _, field := range fields {
		if field.ID == fieldID {
			writeJSON(w, 200, field)
			return
		}
	}
	writeError(w, 404, "Поле не найдено")
}
