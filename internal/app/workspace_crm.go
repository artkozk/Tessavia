package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"
)

type workspaceAccess struct {
	ID   string
	Kind string
	Role string
}

const workspaceContextKey contextKey = "workspace"

var collectionKeyPattern = regexp.MustCompile(`[^a-z0-9]+`)

type CollectionFieldOption struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	ColorKey  string `json:"colorKey"`
	SortOrder int    `json:"sortOrder"`
}

type CollectionField struct {
	ID         string                  `json:"id"`
	Key        string                  `json:"key"`
	Name       string                  `json:"name"`
	FieldType  string                  `json:"fieldType"`
	Required   bool                    `json:"required"`
	ShowOnCard bool                    `json:"showOnCard"`
	SortOrder  int                     `json:"sortOrder"`
	Options    []CollectionFieldOption `json:"options"`
}

type CollectionStage struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Category  string `json:"category"`
	ColorKey  string `json:"colorKey"`
	SortOrder int    `json:"sortOrder"`
}

type WorkspaceCollection struct {
	ID                string            `json:"id"`
	WorkspaceID       string            `json:"workspaceId"`
	Name              string            `json:"name"`
	Description       string            `json:"description"`
	CardLabel         string            `json:"cardLabel"`
	DefaultRecordType string            `json:"defaultRecordType"`
	SortOrder         int               `json:"sortOrder"`
	Stages            []CollectionStage `json:"stages"`
	Fields            []CollectionField `json:"fields"`
}

func currentWorkspace(r *http.Request) workspaceAccess {
	access, _ := r.Context().Value(workspaceContextKey).(workspaceAccess)
	return access
}

func workspaceIDFromContext(ctx context.Context) string {
	access, _ := ctx.Value(workspaceContextKey).(workspaceAccess)
	return access.ID
}

func (s *Server) resolveWorkspaceAccess(ctx context.Context, userID int64, requestedID string) (workspaceAccess, error) {
	requestedID = strings.TrimSpace(requestedID)
	query := `SELECT w.id, w.kind, wm.role
		FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id
		WHERE wm.user_id = ? AND wm.status = 'active' AND w.archived_at IS NULL
		AND (w.team_id IS NULL OR EXISTS (SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id = t.id
		WHERE t.id = w.team_id AND t.deleted_at IS NULL AND tm.user_id = wm.user_id AND tm.status = 'active'))`
	args := []any{userID}
	if requestedID != "" {
		query += ` AND w.id = ?`
		args = append(args, requestedID)
	} else {
		query += ` ORDER BY CASE WHEN w.id = 'bizflow-team' THEN 0 WHEN w.kind = 'team' THEN 1 ELSE 2 END, w.created_at LIMIT 1`
	}
	var access workspaceAccess
	err := s.store.db.QueryRowContext(ctx, query, args...).Scan(&access.ID, &access.Kind, &access.Role)
	return access, err
}

func (s *Server) requireWorkspaceAdmin(w http.ResponseWriter, r *http.Request) bool {
	role := currentWorkspace(r).Role
	if role != "owner" && role != "admin" {
		writeError(w, http.StatusForbidden, "Настраивать команду и доски может владелец или администратор")
		return false
	}
	return true
}

func (s *Server) workspaceHasMember(ctx context.Context, workspaceID string, userID int64) bool {
	var exists int
	err := s.store.db.QueryRowContext(ctx, `SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ? AND status = 'active'`, workspaceID, userID).Scan(&exists)
	return err == nil
}

func (s *Server) handleCreateWorkspace(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Name        string  `json:"name"`
		Description string  `json:"description"`
		MemberIDs   []int64 `json:"memberIds"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	input.Description = strings.TrimSpace(input.Description)
	if input.Name == "" || len([]rune(input.Name)) > 100 || len([]rune(input.Description)) > 800 {
		writeError(w, http.StatusBadRequest, "Название команды обязательно и не длиннее 100 символов")
		return
	}
	id, err := newID()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать идентификатор команды")
		return
	}
	slugBase := collectionKeyPattern.ReplaceAllString(strings.ToLower(input.Name), "-")
	slugBase = strings.Trim(slugBase, "-")
	if slugBase == "" {
		slugBase = "workspace"
	}
	slug := fmt.Sprintf("%s-%s", slugBase, id[:8])
	teamID := "team-" + id
	user := currentUser(r)
	now := nowText()
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать создание команды")
		return
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO teams(id, name, slug, description, owner_id, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?)`, teamID, input.Name, "team-"+slug, input.Description, user.ID, now, now); err != nil {
		writeError(w, http.StatusConflict, "Команда с таким названием уже существует")
		return
	}
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO team_members(team_id, user_id, role, status, joined_at) VALUES(?, ?, 'owner', 'active', ?)`, teamID, user.ID, now); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось добавить владельца команды")
		return
	}
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO workspaces(id, name, slug, kind, owner_id, delete_policy, description, team_id, created_at, updated_at) VALUES(?, ?, ?, 'team', ?, 'archive_only', ?, ?, ?, ?)`, id, input.Name, slug, user.ID, input.Description, teamID, now, now); err != nil {
		writeError(w, http.StatusConflict, "Проект с таким названием уже существует")
		return
	}
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO workspace_members(workspace_id, user_id, role, status, joined_at) VALUES(?, ?, 'owner', 'active', ?)`, id, user.ID, now); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось добавить владельца команды")
		return
	}
	seen := map[int64]bool{user.ID: true}
	for _, memberID := range input.MemberIDs {
		if memberID <= 0 || seen[memberID] {
			continue
		}
		seen[memberID] = true
		var shared int
		err = tx.QueryRowContext(r.Context(), `SELECT 1 FROM workspace_members mine JOIN workspace_members candidate ON candidate.workspace_id = mine.workspace_id WHERE mine.user_id = ? AND mine.status = 'active' AND candidate.user_id = ? AND candidate.status = 'active' LIMIT 1`, user.ID, memberID).Scan(&shared)
		if err != nil {
			writeError(w, http.StatusBadRequest, "Один из участников недоступен для добавления")
			return
		}
		if _, err = tx.ExecContext(r.Context(), `INSERT INTO workspace_members(workspace_id, user_id, role, status, joined_at) VALUES(?, ?, 'member', 'active', ?)`, id, memberID, now); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось добавить участника")
			return
		}
		if _, err = tx.ExecContext(r.Context(), `INSERT INTO team_members(team_id, user_id, role, status, joined_at) VALUES(?, ?, 'member', 'active', ?)`, teamID, memberID, now); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось добавить участника в команду")
			return
		}
	}
	if err = tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить создание команды")
		return
	}
	writeJSON(w, http.StatusCreated, Workspace{ID: id, Name: input.Name, Slug: slug, Kind: "team", Role: "owner", DeletePolicy: "archive_only", Description: input.Description, TeamID: teamID, TeamName: input.Name, TeamRole: "owner"})
}

func (s *Server) handleListCollections(w http.ResponseWriter, r *http.Request) {
	items, err := s.listCollections(r.Context(), currentWorkspace(r).ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить доски")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) listCollections(ctx context.Context, workspaceID string) ([]WorkspaceCollection, error) {
	rows, err := s.store.db.QueryContext(ctx, `SELECT id, workspace_id, name, description, card_label, default_record_type, sort_order FROM workspace_collections WHERE workspace_id = ? AND archived_at IS NULL ORDER BY sort_order, name`, workspaceID)
	if err != nil {
		return nil, err
	}
	items := make([]WorkspaceCollection, 0)
	for rows.Next() {
		var item WorkspaceCollection
		if err := rows.Scan(&item.ID, &item.WorkspaceID, &item.Name, &item.Description, &item.CardLabel, &item.DefaultRecordType, &item.SortOrder); err != nil {
			rows.Close()
			return nil, err
		}
		items = append(items, item)
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	if err = rows.Close(); err != nil {
		return nil, err
	}
	for index := range items {
		items[index].Stages, err = s.listCollectionStages(ctx, items[index].ID)
		if err != nil {
			return nil, err
		}
		items[index].Fields, err = s.listCollectionFields(ctx, items[index].ID)
		if err != nil {
			return nil, err
		}
	}
	return items, nil
}

func (s *Server) listCollectionStages(ctx context.Context, collectionID string) ([]CollectionStage, error) {
	rows, err := s.store.db.QueryContext(ctx, `SELECT id, name, category, color_key, sort_order FROM collection_stages WHERE collection_id = ? AND archived_at IS NULL ORDER BY sort_order, name`, collectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]CollectionStage, 0)
	for rows.Next() {
		var item CollectionStage
		if err := rows.Scan(&item.ID, &item.Name, &item.Category, &item.ColorKey, &item.SortOrder); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Server) listCollectionFields(ctx context.Context, collectionID string) ([]CollectionField, error) {
	rows, err := s.store.db.QueryContext(ctx, `SELECT id, field_key, name, field_type, required, show_on_card, sort_order FROM collection_fields WHERE collection_id = ? AND archived_at IS NULL ORDER BY sort_order, name`, collectionID)
	if err != nil {
		return nil, err
	}
	items := make([]CollectionField, 0)
	for rows.Next() {
		var item CollectionField
		var required, showOnCard int
		if err := rows.Scan(&item.ID, &item.Key, &item.Name, &item.FieldType, &required, &showOnCard, &item.SortOrder); err != nil {
			rows.Close()
			return nil, err
		}
		item.Required = required == 1
		item.ShowOnCard = showOnCard == 1
		item.Options = make([]CollectionFieldOption, 0)
		items = append(items, item)
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	if err = rows.Close(); err != nil {
		return nil, err
	}
	for index := range items {
		optionRows, optionErr := s.store.db.QueryContext(ctx, `SELECT id, name, color_key, sort_order FROM collection_field_options WHERE field_id = ? AND archived_at IS NULL ORDER BY sort_order, name`, items[index].ID)
		if optionErr != nil {
			return nil, optionErr
		}
		for optionRows.Next() {
			var option CollectionFieldOption
			if scanErr := optionRows.Scan(&option.ID, &option.Name, &option.ColorKey, &option.SortOrder); scanErr != nil {
				optionRows.Close()
				return nil, scanErr
			}
			items[index].Options = append(items[index].Options, option)
		}
		if optionErr = optionRows.Close(); optionErr != nil {
			return nil, optionErr
		}
	}
	return items, nil
}

func validCollectionRecordType(value string) bool {
	return value == "task" || value == "idea" || value == "document"
}

func validStageCategory(value string) bool {
	return value == "backlog" || value == "active" || value == "review" || value == "done"
}

func validColorKey(value string) bool {
	return value == "neutral" || value == "red" || value == "amber" || value == "green" || value == "blue" || value == "violet"
}

func validCollectionFieldType(value string) bool {
	switch value {
	case "text", "long_text", "number", "money", "date", "datetime", "select", "multi_select", "user", "checkbox", "url", "email", "phone", "relation":
		return true
	default:
		return false
	}
}

func (s *Server) collectionBelongsToWorkspace(ctx context.Context, collectionID, workspaceID string) bool {
	var exists int
	err := s.store.db.QueryRowContext(ctx, `SELECT 1 FROM workspace_collections WHERE id = ? AND workspace_id = ? AND archived_at IS NULL`, collectionID, workspaceID).Scan(&exists)
	return err == nil
}

func (s *Server) handleCreateCollection(w http.ResponseWriter, r *http.Request) {
	if !s.requireWorkspaceAdmin(w, r) {
		return
	}
	var input struct {
		Name              string `json:"name"`
		Description       string `json:"description"`
		CardLabel         string `json:"cardLabel"`
		DefaultRecordType string `json:"defaultRecordType"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	input.Description = strings.TrimSpace(input.Description)
	input.CardLabel = strings.TrimSpace(input.CardLabel)
	if input.CardLabel == "" {
		input.CardLabel = "Карточка"
	}
	if input.DefaultRecordType == "" {
		input.DefaultRecordType = "task"
	}
	if input.Name == "" || len([]rune(input.Name)) > 100 || len([]rune(input.Description)) > 800 || len([]rune(input.CardLabel)) > 40 || !validCollectionRecordType(input.DefaultRecordType) {
		writeError(w, http.StatusBadRequest, "Некорректные параметры доски")
		return
	}
	workspaceID := currentWorkspace(r).ID
	id, _ := newID()
	now := nowText()
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать создание доски")
		return
	}
	defer tx.Rollback()
	var sortOrder int
	_ = tx.QueryRowContext(r.Context(), `SELECT COALESCE(MAX(sort_order), 0) + 10 FROM workspace_collections WHERE workspace_id = ?`, workspaceID).Scan(&sortOrder)
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO workspace_collections(id, workspace_id, name, description, card_label, default_record_type, sort_order, created_by, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, workspaceID, input.Name, input.Description, input.CardLabel, input.DefaultRecordType, sortOrder, currentUser(r).ID, now, now); err != nil {
		writeError(w, http.StatusConflict, "Доска с таким названием уже существует")
		return
	}
	defaults := []CollectionStage{
		{Name: "Бэклог", Category: "backlog", ColorKey: "red", SortOrder: 10},
		{Name: "Открыто", Category: "active", ColorKey: "amber", SortOrder: 20},
		{Name: "В работе", Category: "active", ColorKey: "blue", SortOrder: 30},
		{Name: "Готово", Category: "done", ColorKey: "green", SortOrder: 40},
	}
	for index := range defaults {
		stageID, _ := newID()
		defaults[index].ID = stageID
		if _, err = tx.ExecContext(r.Context(), `INSERT INTO collection_stages(id, collection_id, name, category, color_key, sort_order, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`, stageID, id, defaults[index].Name, defaults[index].Category, defaults[index].ColorKey, defaults[index].SortOrder, now, now); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось создать этапы доски")
			return
		}
	}
	if err = writeActivity(r.Context(), tx, currentUser(r).ID, "collection", id, "created", "", map[string]any{"name": input.Name}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю доски")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить создание доски")
		return
	}
	writeJSON(w, http.StatusCreated, WorkspaceCollection{ID: id, WorkspaceID: workspaceID, Name: input.Name, Description: input.Description, CardLabel: input.CardLabel, DefaultRecordType: input.DefaultRecordType, SortOrder: sortOrder, Stages: defaults, Fields: []CollectionField{}})
}

func (s *Server) handleUpdateCollection(w http.ResponseWriter, r *http.Request) {
	if !s.requireWorkspaceAdmin(w, r) {
		return
	}
	collectionID := r.PathValue("id")
	if !s.collectionBelongsToWorkspace(r.Context(), collectionID, currentWorkspace(r).ID) {
		writeError(w, http.StatusNotFound, "Доска не найдена")
		return
	}
	var input struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		CardLabel   string `json:"cardLabel"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	input.Description = strings.TrimSpace(input.Description)
	input.CardLabel = strings.TrimSpace(input.CardLabel)
	if input.Name == "" || input.CardLabel == "" || len([]rune(input.Name)) > 100 || len([]rune(input.Description)) > 800 || len([]rune(input.CardLabel)) > 40 {
		writeError(w, http.StatusBadRequest, "Некорректные параметры доски")
		return
	}
	now := nowText()
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать изменение доски")
		return
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(r.Context(), `UPDATE workspace_collections SET name = ?, description = ?, card_label = ?, updated_at = ? WHERE id = ?`, input.Name, input.Description, input.CardLabel, now, collectionID); err != nil {
		writeError(w, http.StatusConflict, "Доска с таким названием уже существует")
		return
	}
	if err = writeActivity(r.Context(), tx, currentUser(r).ID, "collection", collectionID, "updated", "", map[string]any{"name": input.Name, "cardLabel": input.CardLabel}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю доски")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить доску")
		return
	}
	collections, err := s.listCollections(r.Context(), currentWorkspace(r).ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Доска сохранена, но не загрузилась")
		return
	}
	for _, collection := range collections {
		if collection.ID == collectionID {
			writeJSON(w, http.StatusOK, collection)
			return
		}
	}
	writeError(w, http.StatusNotFound, "Доска не найдена")
}

func (s *Server) handleCreateCollectionStage(w http.ResponseWriter, r *http.Request) {
	if !s.requireWorkspaceAdmin(w, r) {
		return
	}
	collectionID := r.PathValue("id")
	if !s.collectionBelongsToWorkspace(r.Context(), collectionID, currentWorkspace(r).ID) {
		writeError(w, http.StatusNotFound, "Доска не найдена")
		return
	}
	var input struct {
		Name     string `json:"name"`
		Category string `json:"category"`
		ColorKey string `json:"colorKey"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Category == "" {
		input.Category = "active"
	}
	if input.ColorKey == "" {
		input.ColorKey = "neutral"
	}
	if input.Name == "" || len([]rune(input.Name)) > 60 || !validStageCategory(input.Category) || !validColorKey(input.ColorKey) {
		writeError(w, http.StatusBadRequest, "Некорректный этап")
		return
	}
	id, _ := newID()
	now := nowText()
	var sortOrder int
	_ = s.store.db.QueryRowContext(r.Context(), `SELECT COALESCE(MAX(sort_order), 0) + 10 FROM collection_stages WHERE collection_id = ?`, collectionID).Scan(&sortOrder)
	_, err := s.store.db.ExecContext(r.Context(), `INSERT INTO collection_stages(id, collection_id, name, category, color_key, sort_order, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`, id, collectionID, input.Name, input.Category, input.ColorKey, sortOrder, now, now)
	if err != nil {
		writeError(w, http.StatusConflict, "Этап с таким названием уже существует")
		return
	}
	writeJSON(w, http.StatusCreated, CollectionStage{ID: id, Name: input.Name, Category: input.Category, ColorKey: input.ColorKey, SortOrder: sortOrder})
}

func (s *Server) handleUpdateCollectionStage(w http.ResponseWriter, r *http.Request) {
	if !s.requireWorkspaceAdmin(w, r) {
		return
	}
	collectionID := r.PathValue("id")
	stageID := r.PathValue("stageId")
	if !s.collectionBelongsToWorkspace(r.Context(), collectionID, currentWorkspace(r).ID) {
		writeError(w, http.StatusNotFound, "Доска не найдена")
		return
	}
	var input struct {
		Name     string `json:"name"`
		Category string `json:"category"`
		ColorKey string `json:"colorKey"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || len([]rune(input.Name)) > 60 || !validStageCategory(input.Category) || !validColorKey(input.ColorKey) {
		writeError(w, http.StatusBadRequest, "Некорректный этап")
		return
	}
	now := nowText()
	result, err := s.store.db.ExecContext(r.Context(), `UPDATE collection_stages SET name = ?, category = ?, color_key = ?, updated_at = ? WHERE id = ? AND collection_id = ? AND archived_at IS NULL`, input.Name, input.Category, input.ColorKey, now, stageID, collectionID)
	if err != nil {
		writeError(w, http.StatusConflict, "Этап с таким названием уже существует")
		return
	}
	if changed, _ := result.RowsAffected(); changed == 0 {
		writeError(w, http.StatusNotFound, "Этап не найден")
		return
	}
	var stage CollectionStage
	if err = s.store.db.QueryRowContext(r.Context(), `SELECT id, name, category, color_key, sort_order FROM collection_stages WHERE id = ?`, stageID).Scan(&stage.ID, &stage.Name, &stage.Category, &stage.ColorKey, &stage.SortOrder); err != nil {
		writeError(w, http.StatusInternalServerError, "Этап сохранён, но не загрузился")
		return
	}
	writeJSON(w, http.StatusOK, stage)
}

func slugifyFieldKey(value string) string {
	value = collectionKeyPattern.ReplaceAllString(strings.ToLower(strings.TrimSpace(value)), "_")
	value = strings.Trim(value, "_")
	if value == "" {
		value = "field"
	}
	return value
}

func (s *Server) handleCreateCollectionField(w http.ResponseWriter, r *http.Request) {
	if !s.requireWorkspaceAdmin(w, r) {
		return
	}
	collectionID := r.PathValue("id")
	if !s.collectionBelongsToWorkspace(r.Context(), collectionID, currentWorkspace(r).ID) {
		writeError(w, http.StatusNotFound, "Доска не найдена")
		return
	}
	var input struct {
		Name       string   `json:"name"`
		Key        string   `json:"key"`
		FieldType  string   `json:"fieldType"`
		Required   bool     `json:"required"`
		ShowOnCard bool     `json:"showOnCard"`
		Options    []string `json:"options"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	autoKey := strings.TrimSpace(input.Key) == ""
	if autoKey {
		input.Key = input.Name
	}
	input.Key = slugifyFieldKey(input.Key)
	if input.Name == "" || len([]rune(input.Name)) > 80 || len(input.Key) > 80 || !validCollectionFieldType(input.FieldType) {
		writeError(w, http.StatusBadRequest, "Некорректное пользовательское поле")
		return
	}
	if (input.FieldType == "select" || input.FieldType == "multi_select") && len(input.Options) == 0 {
		writeError(w, http.StatusBadRequest, "Для поля выбора добавьте хотя бы один вариант")
		return
	}
	id, _ := newID()
	if autoKey {
		var exists int
		if err := s.store.db.QueryRowContext(r.Context(), `SELECT 1 FROM collection_fields WHERE collection_id = ? AND field_key = ? LIMIT 1`, collectionID, input.Key).Scan(&exists); err == nil {
			input.Key = fmt.Sprintf("%s_%s", input.Key, id[:8])
		} else if !errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusInternalServerError, "Не удалось проверить ключ поля")
			return
		}
	}
	now := nowText()
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать создание поля")
		return
	}
	defer tx.Rollback()
	var sortOrder int
	_ = tx.QueryRowContext(r.Context(), `SELECT COALESCE(MAX(sort_order), 0) + 10 FROM collection_fields WHERE collection_id = ?`, collectionID).Scan(&sortOrder)
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO collection_fields(id, collection_id, field_key, name, field_type, required, show_on_card, sort_order, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, collectionID, input.Key, input.Name, input.FieldType, input.Required, input.ShowOnCard, sortOrder, now, now); err != nil {
		writeError(w, http.StatusConflict, "Поле с таким названием или ключом уже существует")
		return
	}
	options := make([]CollectionFieldOption, 0)
	seen := map[string]bool{}
	colors := []string{"neutral", "blue", "amber", "green", "violet", "red"}
	for index, rawName := range input.Options {
		name := strings.TrimSpace(rawName)
		key := strings.ToLower(name)
		if name == "" || seen[key] || len([]rune(name)) > 60 {
			continue
		}
		seen[key] = true
		optionID, _ := newID()
		option := CollectionFieldOption{ID: optionID, Name: name, ColorKey: colors[index%len(colors)], SortOrder: (index + 1) * 10}
		if _, err = tx.ExecContext(r.Context(), `INSERT INTO collection_field_options(id, field_id, name, color_key, sort_order, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?)`, option.ID, id, option.Name, option.ColorKey, option.SortOrder, now, now); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось сохранить варианты поля")
			return
		}
		options = append(options, option)
	}
	if err = writeActivity(r.Context(), tx, currentUser(r).ID, "collection", collectionID, "field_created", "", map[string]any{"fieldId": id, "name": input.Name, "fieldType": input.FieldType}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю поля")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить создание поля")
		return
	}
	writeJSON(w, http.StatusCreated, CollectionField{ID: id, Key: input.Key, Name: input.Name, FieldType: input.FieldType, Required: input.Required, ShowOnCard: input.ShowOnCard, SortOrder: sortOrder, Options: options})
}

func (s *Server) handleUpdateCollectionField(w http.ResponseWriter, r *http.Request) {
	if !s.requireWorkspaceAdmin(w, r) {
		return
	}
	collectionID := r.PathValue("id")
	fieldID := r.PathValue("fieldId")
	if !s.collectionBelongsToWorkspace(r.Context(), collectionID, currentWorkspace(r).ID) {
		writeError(w, http.StatusNotFound, "Доска не найдена")
		return
	}
	var input struct {
		Name       string `json:"name"`
		Required   bool   `json:"required"`
		ShowOnCard bool   `json:"showOnCard"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || len([]rune(input.Name)) > 80 {
		writeError(w, http.StatusBadRequest, "Некорректное название поля")
		return
	}
	now := nowText()
	result, err := s.store.db.ExecContext(r.Context(), `UPDATE collection_fields SET name = ?, required = ?, show_on_card = ?, updated_at = ? WHERE id = ? AND collection_id = ? AND archived_at IS NULL`, input.Name, input.Required, input.ShowOnCard, now, fieldID, collectionID)
	if err != nil {
		writeError(w, http.StatusConflict, "Поле с таким названием уже существует")
		return
	}
	if changed, _ := result.RowsAffected(); changed == 0 {
		writeError(w, http.StatusNotFound, "Поле не найдено")
		return
	}
	fields, err := s.listCollectionFields(r.Context(), collectionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Поле сохранено, но не загрузилось")
		return
	}
	for _, field := range fields {
		if field.ID == fieldID {
			writeJSON(w, http.StatusOK, field)
			return
		}
	}
	writeError(w, http.StatusNotFound, "Поле не найдено")
}

func (s *Server) handleMoveRecordStage(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Карточка не найдена")
		return
	}
	if err != nil || !s.requireRecordEdit(w, r, record) {
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось загрузить карточку")
		}
		return
	}
	if record.CollectionID == "" {
		writeError(w, http.StatusConflict, "Карточка не относится к настраиваемой доске")
		return
	}
	var input struct {
		StageID string `json:"stageId"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	var stage CollectionStage
	err = s.store.db.QueryRowContext(r.Context(), `SELECT id, name, category, color_key, sort_order FROM collection_stages WHERE id = ? AND collection_id = ? AND archived_at IS NULL`, strings.TrimSpace(input.StageID), record.CollectionID).Scan(&stage.ID, &stage.Name, &stage.Category, &stage.ColorKey, &stage.SortOrder)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusBadRequest, "Этап не относится к этой доске")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось проверить этап")
		return
	}
	status := map[string]string{"backlog": "planned", "active": "in_progress", "review": "review", "done": "completed"}[stage.Category]
	if status == "planned" && !validStatusForType(record.Type, status) {
		status = defaultStatus(record.Type)
	}
	if !validStatusForType(record.Type, status) {
		writeError(w, http.StatusBadRequest, "Этот этап не подходит типу карточки")
		return
	}
	if status == "completed" && record.Status != "completed" {
		if record.Type == "research" || record.Type == "question_set" {
			writeError(w, http.StatusBadRequest, "Завершите работу в карточке после принятия итогов")
			return
		}
		if record.Type == "hypothesis" || record.Type == "experiment" {
			if strings.TrimSpace(record.Result) == "" || record.BusinessDetails == nil || record.BusinessDetails.Verdict == "" || record.BusinessDetails.Verdict == "pending" {
				writeError(w, http.StatusBadRequest, "Зафиксируйте вывод и итог проверки в карточке")
				return
			}
		}
	}
	now := nowText()
	completedAt := any(nil)
	progress := record.Progress
	if stage.Category == "done" {
		completedAt = now
		progress = 100
	} else if record.CompletedAt != nil && progress >= 100 {
		progress = 0
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать перемещение")
		return
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(r.Context(), `UPDATE records SET stage_id = ?, status = ?, progress = ?, completed_at = ?, updated_at = ? WHERE id = ?`, stage.ID, status, progress, completedAt, now, record.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось переместить карточку")
		return
	}
	if err = writeActivity(r.Context(), tx, currentUser(r).ID, record.Type, record.ID, "stage_moved", "", map[string]any{"stageId": stage.ID, "stage": stage.Name, "previousStageId": record.StageID}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать перемещение")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить перемещение")
		return
	}
	updated, err := s.getRecord(r.Context(), record.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Карточка перемещена, но не загрузилась")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleUpdateRecordFields(w http.ResponseWriter, r *http.Request) {
	record, err := s.getRecord(r.Context(), r.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Карточка не найдена")
		return
	}
	if err != nil || !s.requireRecordEdit(w, r, record) {
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось загрузить карточку")
		}
		return
	}
	if record.CollectionID == "" {
		writeError(w, http.StatusConflict, "У карточки нет настраиваемых полей")
		return
	}
	var input struct {
		Values map[string]json.RawMessage `json:"values"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	fields, err := s.listCollectionFields(r.Context(), record.CollectionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить определения полей")
		return
	}
	fieldByID := make(map[string]CollectionField, len(fields))
	for _, field := range fields {
		fieldByID[field.ID] = field
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать сохранение полей")
		return
	}
	defer tx.Rollback()
	now := nowText()
	for fieldID, raw := range input.Values {
		field, ok := fieldByID[fieldID]
		if !ok {
			writeError(w, http.StatusBadRequest, "Одно из полей не относится к этой доске")
			return
		}
		normalized, empty, normalizeErr := s.normalizeCollectionFieldValue(r.Context(), record, field, raw)
		if normalizeErr != nil {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("%s: %s", field.Name, normalizeErr.Error()))
			return
		}
		if empty {
			if field.Required {
				writeError(w, http.StatusBadRequest, fmt.Sprintf("Заполните обязательное поле «%s»", field.Name))
				return
			}
			if _, err = tx.ExecContext(r.Context(), `DELETE FROM record_field_values WHERE record_id = ? AND field_id = ?`, record.ID, field.ID); err != nil {
				writeError(w, http.StatusInternalServerError, "Не удалось очистить поле")
				return
			}
			continue
		}
		if _, err = tx.ExecContext(r.Context(), `INSERT INTO record_field_values(record_id, field_id, value_json, updated_by, updated_at) VALUES(?, ?, ?, ?, ?) ON CONFLICT(record_id, field_id) DO UPDATE SET value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at`, record.ID, field.ID, normalized, currentUser(r).ID, now); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось сохранить поле")
			return
		}
	}
	for _, field := range fields {
		if !field.Required {
			continue
		}
		var exists int
		if err = tx.QueryRowContext(r.Context(), `SELECT 1 FROM record_field_values WHERE record_id = ? AND field_id = ? AND value_json NOT IN ('null', '""', '[]')`, record.ID, field.ID).Scan(&exists); err != nil {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("Заполните обязательное поле «%s»", field.Name))
			return
		}
	}
	if _, err = tx.ExecContext(r.Context(), `UPDATE records SET updated_at = ? WHERE id = ?`, now, record.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось обновить карточку")
		return
	}
	if err = writeActivity(r.Context(), tx, currentUser(r).ID, record.Type, record.ID, "custom_fields_updated", "", map[string]any{"fieldCount": len(input.Values)}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать историю полей")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить сохранение полей")
		return
	}
	updated, err := s.getRecord(r.Context(), record.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Поля сохранены, но карточка не загрузилась")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) normalizeCollectionFieldValue(ctx context.Context, record Record, field CollectionField, raw json.RawMessage) (string, bool, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return "null", true, nil
	}
	optionIDs := make(map[string]bool, len(field.Options))
	for _, option := range field.Options {
		optionIDs[option.ID] = true
	}
	switch field.FieldType {
	case "number", "money":
		var value float64
		if err := json.Unmarshal(raw, &value); err != nil {
			return "", false, errors.New("укажите число")
		}
	case "checkbox":
		var value bool
		if err := json.Unmarshal(raw, &value); err != nil {
			return "", false, errors.New("укажите да или нет")
		}
	case "user":
		var value int64
		if err := json.Unmarshal(raw, &value); err != nil || !s.workspaceHasMember(ctx, record.WorkspaceID, value) {
			return "", false, errors.New("выберите участника команды")
		}
	case "select":
		var value string
		if err := json.Unmarshal(raw, &value); err != nil {
			return "", false, errors.New("выберите вариант")
		}
		if value == "" {
			return `""`, true, nil
		}
		if !optionIDs[value] {
			return "", false, errors.New("вариант больше недоступен")
		}
	case "multi_select":
		var values []string
		if err := json.Unmarshal(raw, &values); err != nil {
			return "", false, errors.New("выберите варианты")
		}
		if len(values) == 0 {
			return "[]", true, nil
		}
		uniqueValues := make([]string, 0, len(values))
		seenValues := make(map[string]bool, len(values))
		for _, value := range values {
			if !optionIDs[value] {
				return "", false, errors.New("один из вариантов больше недоступен")
			}
			if !seenValues[value] {
				seenValues[value] = true
				uniqueValues = append(uniqueValues, value)
			}
		}
		raw, _ = json.Marshal(uniqueValues)
	case "relation":
		var value string
		if err := json.Unmarshal(raw, &value); err != nil {
			return "", false, errors.New("выберите карточку")
		}
		if value == "" {
			return `""`, true, nil
		}
		if _, err := s.getRecord(ctx, value); err != nil {
			return "", false, errors.New("связанная карточка недоступна")
		}
	case "date", "datetime":
		var value string
		if err := json.Unmarshal(raw, &value); err != nil {
			return "", false, errors.New("укажите дату")
		}
		if strings.TrimSpace(value) == "" {
			return `""`, true, nil
		}
		layout := "2006-01-02"
		if field.FieldType == "datetime" {
			layout = time.RFC3339
		}
		if _, err := time.Parse(layout, value); err != nil {
			return "", false, errors.New("укажите дату в корректном формате")
		}
	default:
		var value string
		if err := json.Unmarshal(raw, &value); err != nil {
			return "", false, errors.New("укажите текст")
		}
		if strings.TrimSpace(value) == "" {
			return `""`, true, nil
		}
		if len([]rune(value)) > 10000 {
			return "", false, errors.New("значение слишком длинное")
		}
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", false, errors.New("некорректное значение")
	}
	normalized, err := json.Marshal(value)
	if err != nil {
		return "", false, errors.New("не удалось сохранить значение")
	}
	return string(normalized), false, nil
}

func (s *Server) attachCustomFields(ctx context.Context, records []Record) error {
	if len(records) == 0 {
		return nil
	}
	indexes := make(map[string][]int, len(records))
	placeholders := make([]string, 0, len(records))
	args := make([]any, 0, len(records))
	for index := range records {
		records[index].CustomFields = map[string]any{}
		if _, exists := indexes[records[index].ID]; !exists {
			placeholders = append(placeholders, "?")
			args = append(args, records[index].ID)
		}
		indexes[records[index].ID] = append(indexes[records[index].ID], index)
	}
	rows, err := s.store.db.QueryContext(ctx, `SELECT record_id, field_id, value_json FROM record_field_values WHERE record_id IN (`+strings.Join(placeholders, ",")+`)`, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var recordID, fieldID, raw string
		if err := rows.Scan(&recordID, &fieldID, &raw); err != nil {
			return err
		}
		var value any
		if json.Unmarshal([]byte(raw), &value) != nil {
			value = raw
		}
		for _, index := range indexes[recordID] {
			records[index].CustomFields[fieldID] = value
		}
	}
	return rows.Err()
}

func sortedCollectionFields(fields []CollectionField) []CollectionField {
	items := append([]CollectionField(nil), fields...)
	sort.SliceStable(items, func(i, j int) bool { return items[i].SortOrder < items[j].SortOrder })
	return items
}
