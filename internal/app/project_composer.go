package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

var projectViewKeys = map[string]bool{
	"reading":   true,
	"dashboard": true, "work": true, "collections": true, "chat": true, "calendar": true,
	"principles": true, "goal": true, "idea": true, "research": true,
	"validation": true, "outcomes": true, "document": true, "graph": true,
	"quality": true, "history": true, "structure": true,
}

type ProjectNavigation struct {
	EnabledViews []string `json:"enabledViews"`
}

type WorkspacePage struct {
	App          bool     `json:"app"`
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	CollectionID string   `json:"collectionId"`
	RecordType   string   `json:"recordType"`
	RecordTypes  []string `json:"recordTypes"`
	StatusFilter string   `json:"statusFilter"`
	OwnerFilter  string   `json:"ownerFilter"`
	ViewMode     string   `json:"viewMode"`
	Fields       []string `json:"fields"`
	SortOrder    int      `json:"sortOrder"`
	Archived     bool     `json:"archived"`
}

func (s *Server) handleProjectNavigation(w http.ResponseWriter, r *http.Request) {
	workspace := currentWorkspace(r)
	if r.Method == http.MethodGet {
		result := ProjectNavigation{EnabledViews: []string{"dashboard", "work", "calendar", "collections", "chat"}}
		if workspace.Kind == "personal" {
			result.EnabledViews = []string{"dashboard", "work", "calendar", "collections"}
		}
		var raw string
		err := s.store.db.QueryRowContext(r.Context(), `SELECT enabled_views_json FROM workspace_navigation WHERE workspace_id = ?`, workspace.ID).Scan(&raw)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			writeError(w, 500, "Не удалось загрузить разделы проекта")
			return
		}
		if err == nil && json.Unmarshal([]byte(raw), &result.EnabledViews) != nil {
			writeError(w, 500, "Настройки разделов повреждены")
			return
		}
		writeJSON(w, 200, result)
		return
	}
	if !s.requireWorkspaceAdmin(w, r) {
		return
	}
	var input ProjectNavigation
	if !decodeJSON(w, r, &input) {
		return
	}
	input.EnabledViews = uniqueAllowedStrings(input.EnabledViews, projectViewKeys)
	raw, _ := json.Marshal(input.EnabledViews)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось начать настройку")
		return
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(r.Context(), `INSERT INTO workspace_navigation(workspace_id, enabled_views_json, updated_at) VALUES(?, ?, ?) ON CONFLICT(workspace_id) DO UPDATE SET enabled_views_json=excluded.enabled_views_json, updated_at=excluded.updated_at`, workspace.ID, string(raw), nowText())
	if err == nil {
		err = writeActivity(r.Context(), tx, currentUser(r).ID, "workspace", workspace.ID, "modules_updated", "", map[string]any{"enabledViews": input.EnabledViews})
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, 500, "Не удалось сохранить разделы")
		return
	}
	writeJSON(w, 200, input)
}

func (s *Server) navigationKeys(ctx context.Context, workspaceID string) (map[string]bool, error) {
	keys := map[string]bool{"personal": true}
	for key := range projectViewKeys {
		keys[key] = true
	}
	rows, err := s.store.db.QueryContext(ctx, `SELECT id FROM workspace_pages WHERE workspace_id = ?`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		keys["page:"+id] = true
	}
	return keys, rows.Err()
}

func (s *Server) handleListWorkspacePages(w http.ResponseWriter, r *http.Request) {
	query := `SELECT id, name, COALESCE(collection_id,''), record_type, record_types_json, status_filter, owner_filter, view_mode, fields_json, sort_order, archived_at IS NOT NULL, EXISTS(SELECT 1 FROM page_app_definitions a WHERE a.page_id=workspace_pages.id) FROM workspace_pages WHERE workspace_id = ?`
	if r.URL.Query().Get("includeArchived") != "true" {
		query += ` AND archived_at IS NULL`
	}
	rows, err := s.store.db.QueryContext(r.Context(), query+` ORDER BY sort_order, name, id`, currentWorkspace(r).ID)
	if err != nil {
		writeError(w, 500, "Не удалось загрузить страницы")
		return
	}
	defer rows.Close()
	result := []WorkspacePage{}
	for rows.Next() {
		var page WorkspacePage
		var fields, types string
		if err := rows.Scan(&page.ID, &page.Name, &page.CollectionID, &page.RecordType, &types, &page.StatusFilter, &page.OwnerFilter, &page.ViewMode, &fields, &page.SortOrder, &page.Archived, &page.App); err != nil {
			writeError(w, 500, "Не удалось прочитать страницу")
			return
		}
		if json.Unmarshal([]byte(fields), &page.Fields) != nil || json.Unmarshal([]byte(types), &page.RecordTypes) != nil {
			writeError(w, 500, "Настройки страницы повреждены")
			return
		}
		result = append(result, page)
	}
	if rows.Err() != nil {
		writeError(w, 500, "Не удалось прочитать страницы")
		return
	}
	writeJSON(w, 200, result)
}

func (s *Server) handleSaveWorkspacePage(w http.ResponseWriter, r *http.Request) {
	if !s.requireWorkspaceAdmin(w, r) {
		return
	}
	var input WorkspacePage
	if !decodeJSON(w, r, &input) {
		return
	}
	workspace := currentWorkspace(r)
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || len([]rune(input.Name)) > 80 {
		writeError(w, 400, "Название страницы: от 1 до 80 символов")
		return
	}
	if input.CollectionID != "" && !s.collectionBelongsToWorkspace(r.Context(), input.CollectionID, workspace.ID) {
		writeError(w, 400, "Доска не найдена в этом проекте")
		return
	}
	if input.RecordTypes == nil && input.RecordType != "" {
		input.RecordTypes = []string{input.RecordType}
	}
	if input.RecordTypes == nil && r.Method == http.MethodPatch {
		// A legacy client must not erase a mixed source when renaming or archiving it.
		var rawTypes string
		err := s.store.db.QueryRowContext(r.Context(), `SELECT record_types_json FROM workspace_pages WHERE id=? AND workspace_id=?`, r.PathValue("id"), workspace.ID).Scan(&rawTypes)
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, 404, "Страница не найдена")
			return
		}
		if err != nil || json.Unmarshal([]byte(rawTypes), &input.RecordTypes) != nil {
			writeError(w, 500, "Не удалось прочитать типы страницы")
			return
		}
	}
	selectedTypes := []string{}
	seenTypes := map[string]bool{}
	for _, kind := range input.RecordTypes {
		if _, ok := recordTypes[kind]; !ok {
			writeError(w, 400, "Неизвестный тип карточек")
			return
		}
		if !seenTypes[kind] {
			selectedTypes = append(selectedTypes, kind)
			seenTypes[kind] = true
		}
	}
	input.RecordTypes = selectedTypes
	input.RecordType = ""
	if len(selectedTypes) == 1 {
		input.RecordType = selectedTypes[0]
	}
	rawTypes, _ := json.Marshal(selectedTypes)
	if input.StatusFilter == "" {
		input.StatusFilter = "active"
	}
	if input.StatusFilter != "active" && input.StatusFilter != "completed" && input.StatusFilter != "all" {
		writeError(w, 400, "Неизвестный фильтр состояния")
		return
	}
	if input.OwnerFilter == "" {
		input.OwnerFilter = "all"
	}
	if input.OwnerFilter != "all" && input.OwnerFilter != "me" {
		writeError(w, 400, "Неизвестный фильтр ответственного")
		return
	}
	if input.ViewMode == "" {
		input.ViewMode = "list"
	}
	if input.ViewMode != "list" && input.ViewMode != "board" {
		writeError(w, 400, "Неизвестный вид страницы")
		return
	}
	if input.ViewMode == "board" && input.CollectionID == "" {
		writeError(w, 400, "Для доски выберите процесс с этапами")
		return
	}
	allowed := map[string]bool{"description": true, "owner": true, "status": true, "due": true}
	if input.CollectionID != "" {
		fields, err := s.listCollectionFields(r.Context(), input.CollectionID)
		if err != nil {
			writeError(w, 500, "Не удалось загрузить поля доски")
			return
		}
		for _, field := range fields {
			allowed["field:"+field.ID] = true
		}
	}
	if input.Fields == nil {
		input.Fields = []string{"description", "owner", "status", "due"}
	}
	for _, field := range input.Fields {
		if !allowed[field] {
			writeError(w, 400, "Поле не принадлежит выбранной странице")
			return
		}
	}
	input.Fields = uniqueAllowedStrings(input.Fields, allowed)
	raw, _ := json.Marshal(input.Fields)
	input.ID = r.PathValue("id")
	creating := r.Method == http.MethodPost
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось начать сохранение страницы")
		return
	}
	defer tx.Rollback()
	now := nowText()
	if !creating {
		var wasArchived bool
		err = tx.QueryRowContext(r.Context(), `SELECT sort_order, archived_at IS NOT NULL FROM workspace_pages WHERE id=? AND workspace_id=?`, input.ID, workspace.ID).Scan(&input.SortOrder, &wasArchived)
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, 404, "Страница не найдена")
			return
		}
		if err != nil {
			writeError(w, 500, "Не удалось загрузить страницу")
			return
		}
		if wasArchived && !input.Archived {
			var count int
			if err = tx.QueryRowContext(r.Context(), `SELECT count(*) FROM workspace_pages WHERE workspace_id=? AND archived_at IS NULL`, workspace.ID).Scan(&count); err != nil || count >= 50 {
				writeError(w, 409, "В проекте можно создать до 50 активных страниц")
				return
			}
		}
	}
	if creating {
		var count int
		if err = tx.QueryRowContext(r.Context(), `SELECT count(*) FROM workspace_pages WHERE workspace_id=? AND archived_at IS NULL`, workspace.ID).Scan(&count); err != nil || count >= 50 {
			writeError(w, 409, "В проекте можно создать до 50 активных страниц")
			return
		}
		input.ID, err = newID()
		if err != nil {
			writeError(w, 500, "Не удалось создать страницу")
			return
		}
		if err = tx.QueryRowContext(r.Context(), `SELECT COALESCE(MAX(sort_order),0)+10 FROM workspace_pages WHERE workspace_id=?`, workspace.ID).Scan(&input.SortOrder); err != nil {
			writeError(w, 500, "Не удалось определить порядок")
			return
		}
		input.Archived = false
		_, err = tx.ExecContext(r.Context(), `INSERT INTO workspace_pages(id,workspace_id,name,collection_id,record_type,record_types_json,status_filter,owner_filter,view_mode,fields_json,sort_order,created_by,created_at,updated_at) VALUES(?,?,?,NULLIF(?,''),?,?,?,?,?,?,?,?,?,?)`, input.ID, workspace.ID, input.Name, input.CollectionID, input.RecordType, string(rawTypes), input.StatusFilter, input.OwnerFilter, input.ViewMode, string(raw), input.SortOrder, currentUser(r).ID, now, now)
	} else {
		var result sql.Result
		result, err = tx.ExecContext(r.Context(), `UPDATE workspace_pages SET name=?,collection_id=NULLIF(?,''),record_type=?,record_types_json=?,status_filter=?,owner_filter=?,view_mode=?,fields_json=?,archived_at=CASE WHEN ? THEN COALESCE(archived_at,?) ELSE NULL END,updated_at=? WHERE id=? AND workspace_id=?`, input.Name, input.CollectionID, input.RecordType, string(rawTypes), input.StatusFilter, input.OwnerFilter, input.ViewMode, string(raw), input.Archived, now, now, input.ID, workspace.ID)
		if err == nil {
			if count, _ := result.RowsAffected(); count == 0 {
				writeError(w, 404, "Страница не найдена")
				return
			}
		}
	}
	if err == nil {
		err = writeActivity(r.Context(), tx, currentUser(r).ID, "workspace_page", input.ID, "configured", "", map[string]any{"page": input})
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, 500, "Не удалось сохранить страницу")
		return
	}
	status := http.StatusOK
	if creating {
		status = http.StatusCreated
	}
	writeJSON(w, status, input)
}
