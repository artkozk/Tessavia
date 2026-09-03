package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"regexp"
	"strings"
)

type GraphPosition struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type GraphLayoutData struct {
	Positions    map[string]GraphPosition `json:"positions"`
	Settings     map[string]any           `json:"settings"`
	Search       string                   `json:"search"`
	BranchRootID string                   `json:"branchRootId"`
	Depth        int                      `json:"depth"`
}

type GraphLayout struct {
	View      string          `json:"view"`
	Version   int64           `json:"version"`
	UpdatedAt string          `json:"updatedAt"`
	Data      GraphLayoutData `json:"data"`
}

var graphLayoutID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,100}$`)
var graphLayoutGroup = regexp.MustCompile(`^[a-z][a-z_]{0,39}$`)
var graphLayoutColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func (s *Server) graphLayoutView(w http.ResponseWriter, r *http.Request) (string, bool) {
	view := r.URL.Query().Get("view")
	if view == "" || view == "project" {
		return "project", true
	}
	id, local := strings.CutPrefix(view, "record:")
	if !local || !graphLayoutID.MatchString(id) {
		writeError(w, 400, "Неизвестный вид карты")
		return "", false
	}
	if _, err := s.getRecord(r.Context(), id); err != nil {
		writeError(w, 404, "Карточка локальной карты не найдена")
		return "", false
	}
	return view, true
}

func (s *Server) loadGraphLayout(ctx context.Context, userID int64, workspace, view string) (GraphLayout, error) {
	layout := GraphLayout{View: view, Data: GraphLayoutData{Positions: map[string]GraphPosition{}, Settings: map[string]any{}, Depth: 2}}
	var payload string
	err := s.store.db.QueryRowContext(ctx, `SELECT data_json, version, updated_at FROM user_graph_layouts WHERE user_id=? AND workspace_id=? AND view_key=?`, userID, workspace, view).Scan(&payload, &layout.Version, &layout.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return layout, nil
	}
	if err != nil {
		return layout, err
	}
	err = json.Unmarshal([]byte(payload), &layout.Data)
	return layout, err
}

func (s *Server) handleGetGraphLayout(w http.ResponseWriter, r *http.Request) {
	view, ok := s.graphLayoutView(w, r)
	if !ok {
		return
	}
	layout, err := s.loadGraphLayout(r.Context(), currentUser(r).ID, currentWorkspace(r).ID, view)
	if err != nil {
		writeError(w, 500, "Не удалось загрузить раскладку карты")
		return
	}
	writeJSON(w, 200, layout)
}

func validateGraphLayoutSettings(settings map[string]any) error {
	booleans := map[string]bool{"showDiscussion": true, "showOrphans": true, "showArrows": true, "physics": true, "moveBranch": true}
	ranges := map[string][2]float64{"textFade": {0, 100}, "nodeSize": {70, 150}, "linkThickness": {60, 180}, "centerForce": {0, 100}, "repelForce": {0, 100}, "linkForce": {0, 100}, "linkDistance": {0, 100}}
	for key, value := range settings {
		if booleans[key] {
			if _, ok := value.(bool); !ok {
				return fmt.Errorf("Некорректный переключатель карты: %s", key)
			}
			continue
		}
		if bounds, ok := ranges[key]; ok {
			number, ok := value.(float64)
			if !ok || math.IsNaN(number) || math.IsInf(number, 0) || number < bounds[0] || number > bounds[1] {
				return fmt.Errorf("Параметр карты вне диапазона: %s", key)
			}
			continue
		}
		switch key {
		case "hiddenGroups":
			groups, ok := value.([]any)
			if !ok || len(groups) > 40 {
				return errors.New("Некорректные группы карты")
			}
			for _, group := range groups {
				name, ok := group.(string)
				if !ok || !graphLayoutGroup.MatchString(name) {
					return errors.New("Некорректная группа карты")
				}
			}
		case "groupColors":
			colors, ok := value.(map[string]any)
			if !ok || len(colors) > 40 {
				return errors.New("Некорректные цвета карты")
			}
			for group, value := range colors {
				color, ok := value.(string)
				if !ok || !graphLayoutGroup.MatchString(group) || !graphLayoutColor.MatchString(color) {
					return errors.New("Некорректный цвет группы")
				}
			}
		default:
			return fmt.Errorf("Неизвестная настройка карты: %s", key)
		}
	}
	return nil
}

func (s *Server) validateGraphLayout(ctx context.Context, workspace string, data *GraphLayoutData) error {
	if len(data.Positions) > 10000 || len(data.Search) > 1000 || data.Depth < 1 || data.Depth > 4 {
		return errors.New("Раскладка или фильтр карты превышает допустимый размер")
	}
	if err := validateGraphLayoutSettings(data.Settings); err != nil {
		return err
	}
	for id, position := range data.Positions {
		if len(id) > 130 || math.IsNaN(position.X) || math.IsNaN(position.Y) || math.IsInf(position.X, 0) || math.IsInf(position.Y, 0) || math.Abs(position.X) > 1e6 || math.Abs(position.Y) > 1e6 {
			return errors.New("Некорректные координаты карты")
		}
	}
	// One read validates all referenced node kinds; never one query per node.
	rows, err := s.store.db.QueryContext(ctx, `
		SELECT 'record:'||id FROM records WHERE workspace_id=?
		UNION ALL SELECT 'question:'||q.id FROM question_items q JOIN records r ON r.id=q.record_id WHERE r.workspace_id=?
		UNION ALL SELECT 'answer:'||a.id FROM question_answers a JOIN question_items q ON q.id=a.question_id JOIN records r ON r.id=q.record_id WHERE r.workspace_id=?
		UNION ALL SELECT 'decision:'||d.id FROM question_decisions d JOIN question_items q ON q.id=d.question_id JOIN records r ON r.id=q.record_id WHERE r.workspace_id=?
		UNION ALL SELECT 'research-option:'||o.id FROM research_options o JOIN records r ON r.id=o.record_id WHERE r.workspace_id=?`, workspace, workspace, workspace, workspace, workspace)
	if err != nil {
		return err
	}
	defer rows.Close()
	allowed := make(map[string]bool)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return err
		}
		allowed[id] = true
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for id := range data.Positions {
		if !allowed[id] {
			return errors.New("В раскладке есть узел из другого проекта или удалённый узел")
		}
	}
	if data.BranchRootID != "" && (!strings.HasPrefix(data.BranchRootID, "record:") || !allowed[data.BranchRootID]) {
		return errors.New("Ветка не принадлежит текущему проекту")
	}
	if data.Positions == nil {
		data.Positions = map[string]GraphPosition{}
	}
	if data.Settings == nil {
		data.Settings = map[string]any{}
	}
	return nil
}

func (s *Server) handlePutGraphLayout(w http.ResponseWriter, r *http.Request) {
	view, ok := s.graphLayoutView(w, r)
	if !ok {
		return
	}
	var input struct {
		ExpectedVersion *int64          `json:"expectedVersion"`
		Data            GraphLayoutData `json:"data"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.ExpectedVersion == nil || *input.ExpectedVersion < 0 {
		writeError(w, 400, "Нужна ожидаемая версия раскладки")
		return
	}
	workspace, user := currentWorkspace(r).ID, currentUser(r).ID
	if err := s.validateGraphLayout(r.Context(), workspace, &input.Data); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	payload, err := json.Marshal(input.Data)
	if err != nil {
		writeError(w, 400, "Некорректная раскладка")
		return
	}
	if len(payload) > 850000 {
		writeError(w, 400, "Раскладка превышает допустимый размер")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось начать сохранение раскладки")
		return
	}
	defer tx.Rollback()
	var version int64
	err = tx.QueryRowContext(r.Context(), `SELECT version FROM user_graph_layouts WHERE user_id=? AND workspace_id=? AND view_key=?`, user, workspace, view).Scan(&version)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		writeError(w, 500, "Не удалось проверить версию раскладки")
		return
	}
	if version != *input.ExpectedVersion {
		writeError(w, 409, "Раскладка изменена в другом окне или на другом устройстве")
		return
	}
	version++
	now := nowText()
	_, err = tx.ExecContext(r.Context(), `INSERT INTO user_graph_layouts(user_id,workspace_id,view_key,data_json,version,updated_at) VALUES(?,?,?,?,?,?)
		ON CONFLICT(user_id,workspace_id,view_key) DO UPDATE SET data_json=excluded.data_json,version=excluded.version,updated_at=excluded.updated_at`, user, workspace, view, string(payload), version, now)
	if err != nil {
		writeError(w, 500, "Не удалось сохранить раскладку")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, 500, "Не удалось завершить сохранение раскладки")
		return
	}
	writeJSON(w, 200, GraphLayout{View: view, Version: version, UpdatedAt: now, Data: input.Data})
}
