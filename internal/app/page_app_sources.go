package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
)

func (s *Server) validatePageAppSources(r *http.Request, def *PageAppDefinition) error {
	for _, block := range def.Blocks {
		if !pageAppHasSource(block) {
			continue
		}
		if !s.collectionBelongsToWorkspace(r.Context(), block.CollectionID, currentWorkspace(r).ID) {
			return errors.New("Доска списка недоступна в этом пространстве")
		}
		fields, err := s.listCollectionFields(r.Context(), block.CollectionID)
		if err != nil {
			return err
		}
		if err := s.validatePageActionSource(r.Context(), block, fields); err != nil {
			return err
		}
		if err := validatePageFormSource(block, fields); err != nil {
			return err
		}
		valid := map[string]bool{}
		for _, field := range fields {
			valid[field.ID] = true
		}
		seen := map[string]bool{}
		for _, id := range block.Fields {
			if !valid[id] || seen[id] {
				return errors.New("Выберите действующие поля доски без повторений")
			}
			seen[id] = true
		}
	}
	return nil
}

func (s *Server) snapshotPageAppCollections(r *http.Request, def *PageAppDefinition) error {
	sources := map[string]bool{}
	for _, block := range def.Blocks {
		if pageAppHasSource(block) {
			sources[block.CollectionID] = true
		}
	}
	if len(sources) == 0 {
		return nil
	}
	tx, err := s.store.db.BeginTx(r.Context(), &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for id := range sources {
		source, err := readPageAppSource(r.Context(), tx, currentWorkspace(r).ID, id)
		if err != nil {
			return errors.New("Доска изменилась или недоступна. Обновите страницу перед сохранением набора")
		}
		if len(source.Fields) > 100 || len(source.Stages) > 100 {
			return errors.New("Набор поддерживает до 100 полей и колонок на доске")
		}
		valid := map[string]bool{}
		for _, field := range source.Fields {
			valid[field.ID] = true
			if (field.FieldType == "user" || field.FieldType == "relation") && len(field.DefaultValue) > 0 && string(field.DefaultValue) != "null" {
				return errors.New("Начальная ссылка на участника или запись не переносится в набор")
			}
		}
		for _, block := range def.Blocks {
			if pageAppHasSource(block) && block.CollectionID == id {
				if err := s.validatePageActionSource(r.Context(), block, source.Fields); err != nil {
					return err
				}
				if err := validatePageFormSource(block, source.Fields); err != nil {
					return err
				}
				for _, fieldID := range block.Fields {
					if !valid[fieldID] {
						return errors.New("Поле списка изменилось. Обновите состав списка перед сохранением набора")
					}
				}
			}
		}
		def.Collections = append(def.Collections, source)
	}
	return tx.Commit()
}

func readPageAppSource(ctx context.Context, tx *sql.Tx, workspace, id string) (WorkspaceCollection, error) {
	source := WorkspaceCollection{ID: id, Fields: []CollectionField{}, Stages: []CollectionStage{}}
	if err := tx.QueryRowContext(ctx, `SELECT name,description,card_label,default_record_type FROM workspace_collections WHERE id=? AND workspace_id=? AND archived_at IS NULL`, id, workspace).Scan(&source.Name, &source.Description, &source.CardLabel, &source.DefaultRecordType); err != nil {
		return source, err
	}
	stages, err := tx.QueryContext(ctx, `SELECT id,name,category,color_key,sort_order FROM collection_stages WHERE collection_id=? AND archived_at IS NULL ORDER BY sort_order,id`, id)
	if err != nil {
		return source, err
	}
	for stages.Next() {
		var stage CollectionStage
		if err = stages.Scan(&stage.ID, &stage.Name, &stage.Category, &stage.ColorKey, &stage.SortOrder); err != nil {
			stages.Close()
			return source, err
		}
		source.Stages = append(source.Stages, stage)
	}
	if err = stages.Err(); err != nil {
		stages.Close()
		return source, err
	}
	stages.Close()
	fields, err := tx.QueryContext(ctx, `SELECT f.id,f.field_key,f.name,f.field_type,f.required,f.show_on_card,f.sort_order,COALESCE(d.value_json,'null') FROM collection_fields f LEFT JOIN collection_field_defaults d ON d.field_id=f.id WHERE f.collection_id=? AND f.archived_at IS NULL ORDER BY f.sort_order,f.id`, id)
	if err != nil {
		return source, err
	}
	for fields.Next() {
		var field CollectionField
		var raw string
		if err = fields.Scan(&field.ID, &field.Key, &field.Name, &field.FieldType, &field.Required, &field.ShowOnCard, &field.SortOrder, &raw); err != nil {
			fields.Close()
			return source, err
		}
		field.DefaultValue = json.RawMessage(raw)
		field.Options = []CollectionFieldOption{}
		source.Fields = append(source.Fields, field)
	}
	if err = fields.Err(); err != nil {
		fields.Close()
		return source, err
	}
	fields.Close()
	for i := range source.Fields {
		field := &source.Fields[i]
		rows, err := tx.QueryContext(ctx, `SELECT id,name,color_key,sort_order FROM collection_field_options WHERE field_id=? AND archived_at IS NULL ORDER BY sort_order,id`, field.ID)
		if err != nil {
			return source, err
		}
		for rows.Next() {
			var option CollectionFieldOption
			if err = rows.Scan(&option.ID, &option.Name, &option.ColorKey, &option.SortOrder); err != nil {
				rows.Close()
				return source, err
			}
			field.Options = append(field.Options, option)
		}
		if err = rows.Err(); err != nil {
			rows.Close()
			return source, err
		}
		rows.Close()
	}
	return source, nil
}

// A template installs fresh schema IDs inside the page installation transaction, never source records.
func (s *Server) installPageAppCollections(ctx context.Context, tx *sql.Tx, workspace string, userID int64, def *PageAppDefinition, now string) error {
	collectionIDs := map[string]string{}
	sourceSchemas := map[string][]CollectionField{}
	fieldIDs := map[string]string{}
	fieldOrigins := map[string]string{}
	optionMappings := map[string]map[string]string{}
	for _, source := range def.Collections {
		if !pageAppID.MatchString(source.ID) || collectionIDs[source.ID] != "" || !validCollectionRecordType(source.DefaultRecordType) || len(source.Fields) > 100 || len(source.Stages) == 0 || len(source.Stages) > 100 {
			return errors.New("Некорректная схема доски в наборе")
		}
		id, err := newID()
		if err != nil {
			return err
		}
		collectionIDs[source.ID] = id
		sourceSchemas[source.ID] = source.Fields
		name := []rune(source.Name)
		if len(name) > 78 {
			name = name[:78]
		}
		nameText := string(name) + " · копия"
		for attempt := 1; ; attempt++ {
			var exists int
			if err = tx.QueryRowContext(ctx, `SELECT count(*) FROM workspace_collections WHERE workspace_id=? AND name=?`, workspace, nameText).Scan(&exists); err != nil {
				return err
			}
			if exists == 0 {
				break
			}
			if attempt >= 10000 {
				return errors.New("Не удалось подобрать название копии доски")
			}
			nameText = fmt.Sprintf("%s · копия %d", string(name), attempt+1)
		}
		var order int
		if err = tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(sort_order),0)+10 FROM workspace_collections WHERE workspace_id=?`, workspace).Scan(&order); err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO workspace_collections(id,workspace_id,name,description,card_label,default_record_type,sort_order,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`, id, workspace, nameText, source.Description, source.CardLabel, source.DefaultRecordType, order, userID, now, now)
		if err != nil {
			return err
		}
		for _, stage := range source.Stages {
			if !validStageCategory(stage.Category) || !validColorKey(stage.ColorKey) {
				return errors.New("Некорректный этап набора")
			}
			sid, err := newID()
			if err != nil {
				return err
			}
			if _, err = tx.ExecContext(ctx, `INSERT INTO collection_stages(id,collection_id,name,category,color_key,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`, sid, id, stage.Name, stage.Category, stage.ColorKey, stage.SortOrder, now, now); err != nil {
				return err
			}
		}
		for _, field := range source.Fields {
			if !pageAppID.MatchString(field.ID) || fieldIDs[field.ID] != "" || !validCollectionFieldType(field.FieldType) {
				return errors.New("Некорректное поле набора")
			}
			fid, err := newID()
			if err != nil {
				return err
			}
			fieldIDs[field.ID] = fid
			fieldOrigins[field.ID] = source.ID
			if _, err = tx.ExecContext(ctx, `INSERT INTO collection_fields(id,collection_id,field_key,name,field_type,required,show_on_card,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`, fid, id, field.Key, field.Name, field.FieldType, field.Required, field.ShowOnCard, field.SortOrder, now, now); err != nil {
				return err
			}
			options := map[string]string{}
			optionMappings[field.ID] = options
			for _, option := range field.Options {
				if options[option.ID] != "" || !validColorKey(option.ColorKey) {
					return errors.New("Некорректные варианты поля")
				}
				oid, err := newID()
				if err != nil {
					return err
				}
				options[option.ID] = oid
				if _, err = tx.ExecContext(ctx, `INSERT INTO collection_field_options(id,field_id,name,color_key,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`, oid, fid, option.Name, option.ColorKey, option.SortOrder, now, now); err != nil {
					return err
				}
			}
			raw := field.DefaultValue
			if len(raw) > 0 && string(raw) != "null" {
				if field.FieldType == "user" || field.FieldType == "relation" {
					return errors.New("Нельзя установить внешнюю начальную ссылку")
				}
				if field.FieldType == "select" {
					var old string
					if json.Unmarshal(raw, &old) != nil || options[old] == "" {
						return errors.New("Начальный вариант поля отсутствует")
					}
					raw, _ = json.Marshal(options[old])
				}
				if field.FieldType == "multi_select" {
					var old []string
					if json.Unmarshal(raw, &old) != nil {
						return errors.New("Некорректный начальный список")
					}
					mapped := []string{}
					for _, value := range old {
						if options[value] == "" {
							return errors.New("Начальный вариант поля отсутствует")
						}
						mapped = append(mapped, options[value])
					}
					raw, _ = json.Marshal(mapped)
				}
				if _, err = tx.ExecContext(ctx, `INSERT INTO collection_field_defaults(field_id,value_json,updated_at) VALUES(?,?,?)`, fid, string(raw), now); err != nil {
					return err
				}
			}
		}
	}
	for i := range def.Blocks {
		b := &def.Blocks[i]
		if !pageAppHasSource(*b) {
			continue
		}
		target := collectionIDs[b.CollectionID]
		if target == "" {
			return fmt.Errorf("У списка %s отсутствует схема источника", b.Title)
		}
		sourceID := b.CollectionID
		if err := s.validatePageActionSource(ctx, *b, sourceSchemas[sourceID]); err != nil {
			return err
		}
		for j := range b.Actions {
			a := &b.Actions[j]
			for _, field := range sourceSchemas[sourceID] {
				if field.ID == a.FieldID {
					if err := remapPageActionValue(a, field.FieldType, optionMappings[field.ID]); err != nil {
						return err
					}
				}
			}
			a.FieldID = fieldIDs[a.FieldID]
		}
		if err := validatePageFormSource(*b, sourceSchemas[sourceID]); err != nil {
			return err
		}
		for j, f := range b.FormFields {
			if !strings.HasPrefix(f.Key, "custom:") {
				continue
			}
			old := strings.TrimPrefix(f.Key, "custom:")
			if fieldIDs[old] == "" || fieldOrigins[old] != sourceID {
				return errors.New("Поле формы отсутствует в наборе")
			}
			b.FormFields[j].Key = "custom:" + fieldIDs[old]
		}
		b.CollectionID = target
		for j, old := range b.Fields {
			if fieldIDs[old] == "" || fieldOrigins[old] != sourceID {
				return errors.New("Поле списка отсутствует в наборе")
			}
			b.Fields[j] = fieldIDs[old]
		}
	}
	def.Collections = nil
	return nil
}
