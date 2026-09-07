package app

import (
	"context"
	"database/sql"
	"net/http"
)

type collectionTemplate struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Description string            `json:"description"`
	CardLabel   string            `json:"cardLabel"`
	Stages      []CollectionStage `json:"stages"`
	Fields      []CollectionField `json:"fields"`
}

// Templates are copied into a new board. They never constrain later editing.
func collectionTemplates() []collectionTemplate {
	stages := func(names ...string) []CollectionStage {
		result := make([]CollectionStage, len(names))
		for i, name := range names {
			category, color := "active", "blue"
			if i == 0 {
				category, color = "backlog", "amber"
			}
			if i == len(names)-1 {
				category, color = "done", "green"
			}
			result[i] = CollectionStage{Name: name, Category: category, ColorKey: color, SortOrder: (i + 1) * 10}
		}
		return result
	}
	field := func(key, name, kind string, options ...string) CollectionField {
		result := CollectionField{Key: key, Name: name, FieldType: kind, ShowOnCard: true, Options: []CollectionFieldOption{}}
		for i, name := range options {
			result.Options = append(result.Options, CollectionFieldOption{Name: name, ColorKey: "neutral", SortOrder: (i + 1) * 10})
		}
		return result
	}
	standard := stages("Бэклог", "Открыто", "В работе", "Готово")
	standard[0].ColorKey, standard[1].ColorKey = "red", "amber"
	return []collectionTemplate{
		{ID: "blank", Name: "Свой процесс", Description: "Начните с простых колонок и добавьте нужные поля.", CardLabel: "Карточка", Stages: standard, Fields: []CollectionField{}},
		{ID: "sales", Name: "Продажи", Description: "Ведите обращения от первого контакта до результата сделки.", CardLabel: "Сделка", Stages: stages("Новые обращения", "Переговоры", "Предложение", "Завершено"), Fields: []CollectionField{field("company", "Компания", "text"), field("amount", "Сумма", "number"), field("source", "Источник", "select", "Сайт", "Рекомендация", "Исходящий контакт", "Другое")}},
		{ID: "hiring", Name: "Подбор команды", Description: "Соберите кандидатов, интервью и итоговые решения.", CardLabel: "Кандидат", Stages: stages("Новые кандидаты", "Знакомство", "Интервью", "Решение принято"), Fields: []CollectionField{field("position", "Позиция", "text"), field("profile", "Ссылка на резюме", "url"), field("result", "Решение", "select", "В команду", "Резерв", "Отказ")}},
		{ID: "content", Name: "Публикации", Description: "Планируйте материалы, подготовку и выпуск в разных каналах.", CardLabel: "Материал", Stages: stages("Идеи", "Подготовка", "Проверка", "Опубликовано"), Fields: []CollectionField{field("channels", "Каналы", "multi_select", "Сайт", "Telegram", "ВКонтакте", "Другое"), field("format", "Формат", "select", "Статья", "Пост", "Видео", "Подкаст"), field("publication", "Ссылка на публикацию", "url")}},
		{ID: "support", Name: "Заявки и обращения", Description: "Принимайте запросы и отслеживайте их решение командой.", CardLabel: "Заявка", Stages: stages("Новые", "В работе", "Ожидаем ответ", "Закрыто"), Fields: []CollectionField{field("requester", "Заявитель", "text"), field("topic", "Тема обращения", "select", "Вопрос", "Ошибка", "Предложение", "Другое"), field("contact", "Контакт", "text")}},
	}
}

func (s *Server) handleCollectionTemplates(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, collectionTemplates())
}

func insertTemplateFields(ctx context.Context, tx *sql.Tx, collectionID string, fields []CollectionField, now string) error {
	for i := range fields {
		field := &fields[i]
		id, err := newID()
		if err != nil {
			return err
		}
		field.ID, field.SortOrder, field.UpdatedAt = id, (i+1)*10, now
		if _, err = tx.ExecContext(ctx, `INSERT INTO collection_fields(id,collection_id,field_key,name,field_type,required,show_on_card,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`, id, collectionID, field.Key, field.Name, field.FieldType, field.Required, field.ShowOnCard, field.SortOrder, now, now); err != nil {
			return err
		}
		for j := range field.Options {
			option := &field.Options[j]
			option.ID, err = newID()
			if err != nil {
				return err
			}
			if _, err = tx.ExecContext(ctx, `INSERT INTO collection_field_options(id,field_id,name,color_key,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`, option.ID, id, option.Name, option.ColorKey, option.SortOrder, now, now); err != nil {
				return err
			}
		}
	}
	return nil
}
