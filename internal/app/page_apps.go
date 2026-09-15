package app

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
)

type PageAppItem struct {
	Hidden bool   `json:"hidden,omitempty"`
	ID     string `json:"id"`
	Label  string `json:"label"`
}
type PageAppBlock struct {
	Finance        *PageFinanceConfig          `json:"finance,omitempty"`
	Sheet          *PageSheetConfig            `json:"sheet,omitempty"`
	RecordCard     *PageRecordCard             `json:"recordCard,omitempty"`
	ParentID       string                      `json:"parentId,omitempty"`
	GroupLayout    string                      `json:"groupLayout,omitempty"`
	Gap            *int                        `json:"gap,omitempty"`
	ElementStyles  map[string]PageElementStyle `json:"elementStyles,omitempty"`
	RecordBindings map[string]PageTextBinding  `json:"recordBindings,omitempty"`
	Visibility     *PageBlockVisibility        `json:"visibility,omitempty"`
	Data           *PageDataConfig             `json:"data,omitempty"`
	Actions        []PageRecordAction          `json:"actions,omitempty"`
	FormFields     []PageAppFormField          `json:"formFields,omitempty"`
	DefaultTitle   string                      `json:"defaultTitle,omitempty"`
	SuccessText    string                      `json:"successText,omitempty"`
	CollectionID   string                      `json:"collectionId,omitempty"`
	Fields         []string                    `json:"fields,omitempty"`
	AllowCreate    bool                        `json:"allowCreate,omitempty"`
	ActionLabel    string                      `json:"actionLabel,omitempty"`
	ID             string                      `json:"id"`
	Kind           string                      `json:"kind"`
	Title          string                      `json:"title"`
	Text           string                      `json:"text"`
	Items          []PageAppItem               `json:"items,omitempty"`
	Source         string                      `json:"source,omitempty"`
	Width          int                         `json:"width"`
	Height         int                         `json:"height,omitempty"`
	FontSize       int                         `json:"fontSize,omitempty"`
	Color          string                      `json:"color,omitempty"`
	Background     string                      `json:"background,omitempty"`
	Radius         int                         `json:"radius,omitempty"`
	Padding        int                         `json:"padding,omitempty"`
	Hidden         bool                        `json:"hidden,omitempty"`
	Format         string                      `json:"format,omitempty"`
}
type PageAppDefinition struct {
	Collections []WorkspaceCollection `json:"collections,omitempty"`
	Version     int                   `json:"version"`
	Blocks      []PageAppBlock        `json:"blocks"`
}
type PageAppState struct {
	Definition PageAppDefinition         `json:"definition"`
	Revision   int                       `json:"revision"`
	Marks      map[string]bool           `json:"marks"`
	Sheets     map[string]PageSheetState `json:"sheets"`
}

var pageAppID = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)
var pageAppColor = regexp.MustCompile(`^#[a-fA-F0-9]{6}$`)

func validatePageApp(d *PageAppDefinition) error {
	if d.Blocks == nil {
		d.Blocks = []PageAppBlock{}
	}
	if d.Version != 1 || len(d.Blocks) > 40 {
		return errors.New("Неизвестная версия или слишком много блоков (максимум 40)")
	}
	ids := map[string]string{}
	for i := range d.Blocks {
		b := &d.Blocks[i]
		if !pageAppID.MatchString(b.ID) || ids[b.ID] != "" {
			return errors.New("У блоков должны быть разные постоянные ключи")
		}
		if b.Kind != "heading" && b.Kind != "text" && b.Kind != "tracker" && b.Kind != "progress" && b.Kind != "button" && b.Kind != "records" && b.Kind != "form" && b.Kind != "data" && b.Kind != "group" && b.Kind != "sheet" && b.Kind != "media" && b.Kind != "finance" {
			return errors.New("Неизвестный тип блока")
		}
		if err := validatePageSheet(b); err != nil {
			return err
		}
		if err := validatePageFinance(b); err != nil {
			return err
		}
		if pageAppHasSource(*b) && (!pageAppID.MatchString(b.CollectionID) || len(b.Fields) > 40 || len([]rune(b.ActionLabel)) > 80) {
			return errors.New("Для списка выберите доску и не более 40 полей")
		}
		if err := validatePageDataConfig(*b); err != nil {
			return err
		}
		if b.Kind == "form" {
			if err := validatePageAppForm(*b); err != nil {
				return err
			}
		}
		if err := validatePageElementStyles(*b); err != nil {
			return err
		}
		if err := validatePageRecordBindings(*b); err != nil {
			return err
		}
		if err := validatePageRecordActions(*b); err != nil {
			return err
		}
		ids[b.ID] = b.Kind
		b.Title = strings.TrimSpace(b.Title)
		if len([]rune(b.Title)) > 160 || len([]rune(b.Text)) > 8000 || len(b.Items) > 500 {
			return errors.New("Слишком длинный текст или больше 500 пунктов")
		}
		if b.Width == 0 {
			b.Width = 12
		}
		if b.Width < 2 || b.Width > 12 || b.Height < 0 || b.Height > 1600 || b.FontSize < 0 || b.FontSize > 72 || b.Padding < 0 || b.Padding > 80 || b.Radius < 0 || b.Radius > 80 {
			return errors.New("Размер блока вне допустимого диапазона")
		}
		if (b.Color != "" && !pageAppColor.MatchString(b.Color)) || (b.Background != "" && !pageAppColor.MatchString(b.Background)) {
			return errors.New("Цвет должен иметь вид #123456")
		}
		if b.Format != "" && b.Format != "list" && b.Format != "grid" && b.Format != "circles" {
			return errors.New("Неизвестный вид пунктов")
		}
		seen := map[string]bool{}
		for j := range b.Items {
			item := &b.Items[j]
			item.Label = strings.TrimSpace(item.Label)
			if !pageAppID.MatchString(item.ID) || seen[item.ID] || item.Label == "" || len([]rune(item.Label)) > 160 {
				return errors.New("Укажите подписи и разные ключи пунктов")
			}
			seen[item.ID] = true
		}
	}
	for _, b := range d.Blocks {
		if b.Kind == "progress" && ids[b.Source] != "tracker" {
			return errors.New("Для прогресса выберите блок с отметками")
		}
		if b.Kind == "button" && (ids[b.Source] == "" || b.Source == b.ID) {
			return errors.New("Для кнопки выберите блок перехода")
		}
	}
	if err := validatePageComposition(d); err != nil {
		return err
	}
	return validatePageBlockVisibility(d)
}
func (s *Server) pageAppExists(r *http.Request) bool {
	var count int
	err := s.store.db.QueryRowContext(r.Context(), `SELECT count(*) FROM workspace_pages WHERE id=? AND workspace_id=? AND archived_at IS NULL`, r.PathValue("id"), currentWorkspace(r).ID).Scan(&count)
	return err == nil && count == 1
}
func (s *Server) readPageApp(r *http.Request) (PageAppState, error) {
	result := PageAppState{Definition: PageAppDefinition{Version: 1, Blocks: []PageAppBlock{}}, Marks: map[string]bool{}, Sheets: map[string]PageSheetState{}}
	var raw string
	err := s.store.db.QueryRowContext(r.Context(), `SELECT definition_json,revision FROM page_app_definitions WHERE page_id=?`, r.PathValue("id")).Scan(&raw, &result.Revision)
	if errors.Is(err, sql.ErrNoRows) {
		return result, nil
	}
	if err != nil {
		return result, err
	}
	if err = json.Unmarshal([]byte(raw), &result.Definition); err != nil {
		return result, err
	}
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT block_id,item_id,checked FROM page_app_marks WHERE page_id=? AND user_id=?`, r.PathValue("id"), currentUser(r).ID)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var block, item string
		var checked bool
		if err = rows.Scan(&block, &item, &checked); err != nil {
			return result, err
		}
		result.Marks[block+":"+item] = checked
	}
	if err = rows.Err(); err != nil {
		return result, err
	}
	// Release the sole database connection before reading private sheet values.
	if err = rows.Close(); err != nil {
		return result, err
	}
	result.Sheets, err = s.readPageSheets(r, result.Definition)
	return result, err
}
func (s *Server) handlePageApp(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	if !s.pageAppExists(r) {
		writeError(w, 404, "Страница не найдена")
		return
	}
	if r.Method == http.MethodGet {
		result, err := s.readPageApp(r)
		if err != nil {
			writeError(w, 500, "Не удалось прочитать страницу")
			return
		}
		writeJSON(w, 200, result)
		return
	}
	if !s.requireWorkspaceAdmin(w, r) {
		return
	}
	var input struct {
		Definition       PageAppDefinition `json:"definition"`
		ExpectedRevision int               `json:"expectedRevision"`
		PageName         *string           `json:"pageName"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if err := validatePageApp(&input.Definition); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if len(input.Definition.Collections) > 0 {
		writeError(w, 400, "Схемы наборов устанавливаются через библиотеку")
		return
	}
	if err := s.validatePageAppSources(r, &input.Definition); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if input.PageName != nil {
		*input.PageName = strings.TrimSpace(*input.PageName)
		if *input.PageName == "" || len([]rune(*input.PageName)) > 80 {
			writeError(w, 400, "Название страницы должно содержать от 1 до 80 символов")
			return
		}
	}
	raw, _ := json.Marshal(input.Definition)
	now := nowText()
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось начать сохранение")
		return
	}
	defer tx.Rollback()
	if err = validatePageBlockTrashIDs(r.Context(), tx, currentWorkspace(r).ID, r.PathValue("id"), input.Definition); err != nil {
		writeError(w, 409, err.Error())
		return
	}
	var changed sql.Result
	if input.ExpectedRevision == 0 {
		changed, err = tx.ExecContext(r.Context(), `INSERT INTO page_app_definitions(page_id,definition_json,revision,updated_at) VALUES(?,?,1,?) ON CONFLICT(page_id) DO NOTHING`, r.PathValue("id"), string(raw), now)
	} else {
		changed, err = tx.ExecContext(r.Context(), `UPDATE page_app_definitions SET definition_json=?,revision=revision+1,updated_at=? WHERE page_id=? AND revision=?`, string(raw), now, r.PathValue("id"), input.ExpectedRevision)
	}
	if err != nil {
		writeError(w, 500, "Не удалось сохранить блоки")
		return
	}
	if n, _ := changed.RowsAffected(); n != 1 {
		writeError(w, 409, "Страница уже изменена. Обновите её перед сохранением")
		return
	}
	if input.PageName != nil {
		if _, err = tx.ExecContext(r.Context(), `UPDATE workspace_pages SET name=?,updated_at=? WHERE id=? AND workspace_id=?`, *input.PageName, now, r.PathValue("id"), currentWorkspace(r).ID); err != nil {
			writeError(w, 500, "Не удалось сохранить название")
			return
		}
	}
	if err = writeActivity(r.Context(), tx, currentUser(r).ID, "workspace_page", r.PathValue("id"), "app_configured", "", map[string]any{"revision": input.ExpectedRevision + 1}); err != nil {
		writeError(w, 500, "Не удалось записать историю")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, 500, "Не удалось сохранить страницу")
		return
	}
	result, err := s.readPageApp(r)
	if err != nil {
		writeError(w, 500, "Не удалось перечитать страницу")
		return
	}
	writeJSON(w, 200, result)
}
func (s *Server) handlePageAppMark(w http.ResponseWriter, r *http.Request) {
	if !s.pageAppExists(r) {
		writeError(w, 404, "Страница не найдена")
		return
	}
	var input struct {
		BlockID          string `json:"blockId"`
		ItemID           string `json:"itemId"`
		Checked          *bool  `json:"checked"`
		ExpectedRevision int    `json:"expectedRevision"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.Checked == nil {
		writeError(w, 400, "Укажите состояние отметки")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось начать изменение")
		return
	}
	defer tx.Rollback()
	var raw string
	var revision int
	err = tx.QueryRowContext(r.Context(), `SELECT definition_json,revision FROM page_app_definitions WHERE page_id=?`, r.PathValue("id")).Scan(&raw, &revision)
	if err != nil {
		writeError(w, 404, "Страница ещё не настроена")
		return
	}
	if revision != input.ExpectedRevision {
		writeError(w, 409, "Состав страницы изменился. Обновите страницу")
		return
	}
	var def PageAppDefinition
	if json.Unmarshal([]byte(raw), &def) != nil {
		writeError(w, 500, "Не удалось прочитать блоки")
		return
	}
	found := false
	for _, b := range def.Blocks {
		if b.ID == input.BlockID && b.Kind == "tracker" && !b.Hidden {
			for _, item := range b.Items {
				if item.ID == input.ItemID && !item.Hidden {
					found = true
				}
			}
		}
	}
	if !found {
		writeError(w, 400, "Пункт больше не доступен")
		return
	}
	_, err = tx.ExecContext(r.Context(), `INSERT INTO page_app_marks(page_id,block_id,item_id,user_id,checked,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(page_id,block_id,item_id,user_id) DO UPDATE SET checked=excluded.checked,updated_at=excluded.updated_at`, r.PathValue("id"), input.BlockID, input.ItemID, currentUser(r).ID, *input.Checked, nowText())
	if err != nil {
		writeError(w, 500, "Не удалось сохранить отметку")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, 500, "Не удалось сохранить отметку")
		return
	}
	writeJSON(w, 200, map[string]any{"key": fmt.Sprintf("%s:%s", input.BlockID, input.ItemID), "checked": *input.Checked})
}
