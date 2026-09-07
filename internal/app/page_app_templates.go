package app

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

type PageAppTemplate struct {
	ID          string             `json:"id"`
	Name        string             `json:"name"`
	Description string             `json:"description"`
	Visibility  string             `json:"visibility"`
	Mine        bool               `json:"mine"`
	Definition  *PageAppDefinition `json:"definition,omitempty"`
}

func (s *Server) handlePageAppTemplates(w http.ResponseWriter, r *http.Request) {
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT id,name,description,visibility,owner_id=? FROM page_app_templates WHERE owner_id=? OR visibility='public' ORDER BY updated_at DESC,id LIMIT 200`, currentUser(r).ID, currentUser(r).ID)
	if err != nil {
		writeError(w, 500, "Не удалось загрузить наборы страниц")
		return
	}
	defer rows.Close()
	result := []PageAppTemplate{}
	for rows.Next() {
		var item PageAppTemplate
		if err = rows.Scan(&item.ID, &item.Name, &item.Description, &item.Visibility, &item.Mine); err != nil {
			writeError(w, 500, "Не удалось прочитать набор")
			return
		}
		result = append(result, item)
	}
	if rows.Err() != nil {
		writeError(w, 500, "Не удалось прочитать наборы")
		return
	}
	writeJSON(w, 200, result)
}
func (s *Server) readPageAppTemplate(r *http.Request) (PageAppTemplate, error) {
	var item PageAppTemplate
	var raw string
	err := s.store.db.QueryRowContext(r.Context(), `SELECT id,name,description,visibility,owner_id=?,definition_json FROM page_app_templates WHERE id=? AND (owner_id=? OR visibility='public')`, currentUser(r).ID, r.PathValue("id"), currentUser(r).ID).Scan(&item.ID, &item.Name, &item.Description, &item.Visibility, &item.Mine, &raw)
	if err == nil {
		err = json.Unmarshal([]byte(raw), &item.Definition)
	}
	return item, err
}
func (s *Server) handleGetPageAppTemplate(w http.ResponseWriter, r *http.Request) {
	item, err := s.readPageAppTemplate(r)
	if err != nil {
		writeError(w, 404, "Набор не найден")
		return
	}
	writeJSON(w, 200, item)
}

// Changing publication affects future access, never copies already installed by others.
func (s *Server) handleUpdatePageAppTemplate(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Visibility string `json:"visibility"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.Visibility != "private" && input.Visibility != "public" {
		writeError(w, 400, "Выберите доступ к набору")
		return
	}
	result, err := s.store.db.ExecContext(r.Context(), `UPDATE page_app_templates SET visibility=?,updated_at=? WHERE id=? AND owner_id=?`, input.Visibility, nowText(), r.PathValue("id"), currentUser(r).ID)
	if err != nil {
		writeError(w, 500, "Не удалось изменить доступ")
		return
	}
	if count, _ := result.RowsAffected(); count != 1 {
		writeError(w, 404, "Набор не найден")
		return
	}
	s.handleGetPageAppTemplate(w, r)
}
func (s *Server) handleCreatePageAppTemplate(w http.ResponseWriter, r *http.Request) {
	if !s.requireWorkspaceAdmin(w, r) {
		return
	}
	if !s.pageAppExists(r) {
		writeError(w, 404, "Страница не найдена")
		return
	}
	var input struct {
		Name             string `json:"name"`
		Description      string `json:"description"`
		Visibility       string `json:"visibility"`
		ExpectedRevision int    `json:"expectedRevision"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	input.Description = strings.TrimSpace(input.Description)
	if err := validInterfacePresetText(input.Name, input.Description, input.Visibility); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	state, err := s.readPageApp(r)
	if err != nil || state.Revision == 0 {
		writeError(w, 400, "Сначала сохраните страницу")
		return
	}
	if state.Revision != input.ExpectedRevision {
		writeError(w, 409, "Страница изменилась. Обновите предпросмотр набора")
		return
	}
	if err := s.snapshotPageAppCollections(r, &state.Definition); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	// Only the declarative structure is portable. Personal marks and business records never enter the payload.
	raw, _ := json.Marshal(state.Definition)
	if len(raw) > 2*1024*1024 {
		writeError(w, 400, "Структура набора больше 2 МБ. Разделите её на несколько страниц")
		return
	}
	id, err := newID()
	if err != nil {
		writeError(w, 500, "Не удалось создать набор")
		return
	}
	now := nowText()
	_, err = s.store.db.ExecContext(r.Context(), `INSERT INTO page_app_templates(id,owner_id,name,description,visibility,definition_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`, id, currentUser(r).ID, input.Name, input.Description, input.Visibility, string(raw), now, now)
	if err != nil {
		writeError(w, 500, "Не удалось сохранить набор")
		return
	}
	writeJSON(w, 201, PageAppTemplate{ID: id, Name: input.Name, Description: input.Description, Visibility: input.Visibility, Mine: true, Definition: &state.Definition})
}
func (s *Server) handleInstallPageAppTemplate(w http.ResponseWriter, r *http.Request) {
	if !s.requireWorkspaceAdmin(w, r) {
		return
	}
	item, err := s.readPageAppTemplate(r)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, 404, "Набор не найден")
		return
	}
	if err != nil || item.Definition == nil {
		writeError(w, 500, "Не удалось прочитать набор")
		return
	}
	if err = validatePageApp(item.Definition); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	var input struct {
		Name string `json:"name"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" {
		input.Name = item.Name
	}
	if len([]rune(input.Name)) > 80 {
		writeError(w, 400, "Название не длиннее 80 символов")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось начать установку")
		return
	}
	defer tx.Rollback()
	workspace := currentWorkspace(r).ID
	var count, order int
	if err = tx.QueryRowContext(r.Context(), `SELECT count(*),COALESCE(MAX(sort_order),0)+10 FROM workspace_pages WHERE workspace_id=? AND archived_at IS NULL`, workspace).Scan(&count, &order); err != nil || count >= 50 {
		writeError(w, 409, "В проекте уже 50 страниц")
		return
	}
	id, err := newID()
	if err != nil {
		writeError(w, 500, "Не удалось создать страницу")
		return
	}
	now := nowText()
	if err = installPageAppCollections(r.Context(), tx, workspace, currentUser(r).ID, item.Definition, now); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	raw, _ := json.Marshal(item.Definition)
	_, err = tx.ExecContext(r.Context(), `INSERT INTO workspace_pages(id,workspace_id,name,record_type,record_types_json,status_filter,owner_filter,view_mode,fields_json,sort_order,created_by,created_at,updated_at) VALUES(?,?,?,'','[]','all','all','list','[]',?,?,?,?)`, id, workspace, input.Name, order, currentUser(r).ID, now, now)
	if err == nil {
		_, err = tx.ExecContext(r.Context(), `INSERT INTO page_app_definitions(page_id,definition_json,revision,updated_at) VALUES(?,?,1,?)`, id, string(raw), now)
	}
	if err == nil {
		err = writeActivity(r.Context(), tx, currentUser(r).ID, "workspace_page", id, "app_installed", "", map[string]any{"templateId": item.ID})
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, 500, "Не удалось установить набор")
		return
	}
	writeJSON(w, 201, WorkspacePage{ID: id, Name: input.Name, App: true, ViewMode: "list", StatusFilter: "all", OwnerFilter: "all", RecordTypes: []string{}, Fields: []string{}, SortOrder: order})
}
