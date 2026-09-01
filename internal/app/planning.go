package app

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"
)

const planningDateLayout = "2006-01-02"

type PlanningCycle struct {
	ID                string `json:"id"`
	Title             string `json:"title"`
	StartDate         string `json:"startDate"`
	EndDate           string `json:"endDate"`
	ReviewWeekStart   string `json:"reviewWeekStart"`
	Status            string `json:"status"`
	CreatedBy         int64  `json:"createdBy"`
	CreatedByUsername string `json:"createdByUsername"`
	CreatedAt         string `json:"createdAt"`
	UpdatedAt         string `json:"updatedAt"`
}

type PlanningCyclesResponse struct {
	Active *PlanningCycle  `json:"active"`
	Cycles []PlanningCycle `json:"cycles"`
}

func parsePlanningStart(value string) (time.Time, error) {
	date, err := time.Parse(planningDateLayout, strings.TrimSpace(value))
	if err != nil {
		return time.Time{}, errors.New("Дата начала должна быть указана в формате ГГГГ-ММ-ДД")
	}
	return date, nil
}

func planningCycleDates(startDate string) (string, string) {
	start, _ := time.Parse(planningDateLayout, startDate)
	return start.AddDate(0, 0, 83).Format(planningDateLayout), start.AddDate(0, 0, 84).Format(planningDateLayout)
}

func scanPlanningCycle(scanner interface{ Scan(...any) error }) (PlanningCycle, error) {
	var cycle PlanningCycle
	err := scanner.Scan(&cycle.ID, &cycle.Title, &cycle.StartDate, &cycle.Status, &cycle.CreatedBy, &cycle.CreatedByUsername, &cycle.CreatedAt, &cycle.UpdatedAt)
	if err != nil {
		return cycle, err
	}
	cycle.EndDate, cycle.ReviewWeekStart = planningCycleDates(cycle.StartDate)
	return cycle, nil
}

func (s *Server) listPlanningCycles(r *http.Request) (PlanningCyclesResponse, error) {
	rows, err := s.store.db.QueryContext(r.Context(), `
		SELECT c.id, c.title, c.start_date, c.status, c.created_by, u.username, c.created_at, c.updated_at
		FROM planning_cycles c JOIN users u ON u.id = c.created_by
		WHERE c.workspace_id = ?
		ORDER BY c.start_date DESC, c.created_at DESC LIMIT 24`, currentWorkspace(r).ID)
	if err != nil {
		return PlanningCyclesResponse{}, err
	}
	defer rows.Close()
	result := PlanningCyclesResponse{Cycles: make([]PlanningCycle, 0)}
	for rows.Next() {
		cycle, scanErr := scanPlanningCycle(rows)
		if scanErr != nil {
			return PlanningCyclesResponse{}, scanErr
		}
		result.Cycles = append(result.Cycles, cycle)
		if cycle.Status == "active" {
			copy := cycle
			result.Active = &copy
		}
	}
	return result, rows.Err()
}

func (s *Server) handleListPlanningCycles(w http.ResponseWriter, r *http.Request) {
	cycles, err := s.listPlanningCycles(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить циклы планирования")
		return
	}
	writeJSON(w, http.StatusOK, cycles)
}

func (s *Server) handleCreatePlanningCycle(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Title     string `json:"title"`
		StartDate string `json:"startDate"`
		Reason    string `json:"reason"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Title = strings.TrimSpace(input.Title)
	if input.Title == "" || len(input.Title) > 120 {
		writeError(w, http.StatusBadRequest, "Название цикла обязательно и не длиннее 120 символов")
		return
	}
	start, err := parsePlanningStart(input.StartDate)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	id, err := newID()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать цикл")
		return
	}
	now := nowText()
	user := currentUser(r)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать создание цикла")
		return
	}
	defer tx.Rollback()
	var previousID, previousTitle string
	workspaceID := currentWorkspace(r).ID
	previousErr := tx.QueryRowContext(r.Context(), `SELECT id, title FROM planning_cycles WHERE workspace_id = ? AND status = 'active' LIMIT 1`, workspaceID).Scan(&previousID, &previousTitle)
	if previousErr != nil && !errors.Is(previousErr, sql.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "Не удалось проверить активный цикл")
		return
	}
	if previousID != "" {
		if _, err = tx.ExecContext(r.Context(), `UPDATE planning_cycles SET status = 'archived', updated_at = ? WHERE id = ?`, now, previousID); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось завершить предыдущий цикл")
			return
		}
		reason := strings.TrimSpace(input.Reason)
		if reason == "" {
			reason = "Начат новый 12-недельный цикл"
		}
		if err = writeActivity(r.Context(), tx, user.ID, "planning_cycle", previousID, "planning_cycle_replaced", reason, map[string]any{"title": previousTitle, "replacedBy": id}); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось записать смену цикла")
			return
		}
	}
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO planning_cycles(id, workspace_id, title, start_date, status, created_by, created_at, updated_at) VALUES(?, ?, ?, ?, 'active', ?, ?, ?)`, id, workspaceID, input.Title, start.Format(planningDateLayout), user.ID, now, now); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить цикл")
		return
	}
	if err = writeActivity(r.Context(), tx, user.ID, "planning_cycle", id, "planning_cycle_created", strings.TrimSpace(input.Reason), map[string]any{"title": input.Title, "startDate": start.Format(planningDateLayout)}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать создание цикла")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить создание цикла")
		return
	}
	cycles, err := s.listPlanningCycles(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Цикл создан, но не удалось обновить календарь")
		return
	}
	writeJSON(w, http.StatusCreated, cycles)
}

func (s *Server) handleUpdatePlanningCycle(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Title             *string `json:"title"`
		StartDate         *string `json:"startDate"`
		Status            *string `json:"status"`
		Reason            string  `json:"reason"`
		ExpectedUpdatedAt *string `json:"expectedUpdatedAt"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	var before PlanningCycle
	row := s.store.db.QueryRowContext(r.Context(), `
		SELECT c.id, c.title, c.start_date, c.status, c.created_by, u.username, c.created_at, c.updated_at
		FROM planning_cycles c JOIN users u ON u.id = c.created_by WHERE c.id = ? AND c.workspace_id = ?`, r.PathValue("id"), currentWorkspace(r).ID)
	before, err := scanPlanningCycle(row)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Цикл не найден")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить цикл")
		return
	}
	if input.ExpectedUpdatedAt != nil && *input.ExpectedUpdatedAt != before.UpdatedAt {
		writeError(w, http.StatusConflict, "Цикл уже изменён другим участником. Обновите календарь")
		return
	}
	title, startDate, status := before.Title, before.StartDate, before.Status
	changes := map[string]any{}
	if input.Title != nil {
		title = strings.TrimSpace(*input.Title)
		if title == "" || len(title) > 120 {
			writeError(w, http.StatusBadRequest, "Некорректное название цикла")
			return
		}
		if title != before.Title {
			changes["title"] = map[string]any{"before": before.Title, "after": title}
		}
	}
	if input.StartDate != nil {
		start, parseErr := parsePlanningStart(*input.StartDate)
		if parseErr != nil {
			writeError(w, http.StatusBadRequest, parseErr.Error())
			return
		}
		startDate = start.Format(planningDateLayout)
		if startDate != before.StartDate {
			changes["startDate"] = map[string]any{"before": before.StartDate, "after": startDate}
		}
	}
	if input.Status != nil {
		status = strings.TrimSpace(*input.Status)
		if status != "active" && status != "completed" && status != "archived" {
			writeError(w, http.StatusBadRequest, "Некорректный статус цикла")
			return
		}
		if status != before.Status {
			changes["status"] = map[string]any{"before": before.Status, "after": status}
		}
	}
	if len(changes) == 0 {
		writeError(w, http.StatusBadRequest, "Нет изменений")
		return
	}
	if (changes["startDate"] != nil || changes["status"] != nil) && strings.TrimSpace(input.Reason) == "" {
		writeError(w, http.StatusBadRequest, "Укажите причину изменения дат или состояния цикла")
		return
	}
	now := nowText()
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать изменение цикла")
		return
	}
	defer tx.Rollback()
	if status == "active" {
		if _, err = tx.ExecContext(r.Context(), `UPDATE planning_cycles SET status = 'archived', updated_at = ? WHERE workspace_id = ? AND status = 'active' AND id <> ?`, now, currentWorkspace(r).ID, before.ID); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось переключить активный цикл")
			return
		}
	}
	if _, err = tx.ExecContext(r.Context(), `UPDATE planning_cycles SET title = ?, start_date = ?, status = ?, updated_at = ? WHERE id = ?`, title, startDate, status, now, before.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить цикл")
		return
	}
	if err = writeActivity(r.Context(), tx, currentUser(r).ID, "planning_cycle", before.ID, "planning_cycle_updated", strings.TrimSpace(input.Reason), changes); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать изменение цикла")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить изменение цикла")
		return
	}
	cycles, err := s.listPlanningCycles(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Изменение сохранено, но календарь не обновился")
		return
	}
	writeJSON(w, http.StatusOK, cycles)
}
