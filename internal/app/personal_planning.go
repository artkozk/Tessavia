package app

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"
)

type personalProjectInput struct {
	Title             string `json:"title"`
	Notes             string `json:"notes"`
	ColorKey          string `json:"colorKey"`
	Status            string `json:"status"`
	ExpectedUpdatedAt string `json:"expectedUpdatedAt"`
}

type personalGoalInput struct {
	ProjectID         string `json:"projectId"`
	Title             string `json:"title"`
	Notes             string `json:"notes"`
	Horizon           string `json:"horizon"`
	StartDate         string `json:"startDate"`
	EndDate           string `json:"endDate"`
	Progress          int    `json:"progress"`
	PlannedMinutes    int    `json:"plannedMinutes"`
	ActualMinutes     int    `json:"actualMinutes"`
	Status            string `json:"status"`
	ExpectedUpdatedAt string `json:"expectedUpdatedAt"`
}

type personalRecurrenceInput struct {
	Cadence   string `json:"cadence"`
	Interval  int    `json:"interval"`
	Timezone  string `json:"timezone"`
	StartDate string `json:"startDate"`
	UntilDate string `json:"untilDate"`
	Active    *bool  `json:"active,omitempty"`
}

type planScanner interface {
	Scan(...any) error
}

const personalPlanSelect = `id,title,notes,due_at,status,completed_at,created_at,updated_at,start_date,end_date,color_key,title_generated,item_kind,COALESCE(project_id,''),COALESCE(goal_id,''),COALESCE(parent_id,''),planned_minutes,actual_minutes,starts_at,ends_at,series_id,occurrence_date,occurrence_state`

func scanPersonalPlan(scanner planScanner, plan *PersonalPlan) error {
	return scanner.Scan(&plan.ID, &plan.Title, &plan.Notes, &plan.DueAt, &plan.Status, &plan.CompletedAt,
		&plan.CreatedAt, &plan.UpdatedAt, &plan.StartDate, &plan.EndDate, &plan.ColorKey,
		&plan.TitleGenerated, &plan.ItemKind, &plan.ProjectID, &plan.GoalID, &plan.ParentID,
		&plan.PlannedMinutes, &plan.ActualMinutes, &plan.StartsAt, &plan.EndsAt, &plan.SeriesID,
		&plan.OccurrenceDate, &plan.OccurrenceState)
}

type personalQueryer interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func loadPersonalPlan(ctx context.Context, queryer personalQueryer, ownerID int64, id string) (PersonalPlan, error) {
	var plan PersonalPlan
	err := scanPersonalPlan(queryer.QueryRowContext(ctx, `SELECT `+personalPlanSelect+` FROM personal_plans WHERE id=? AND owner_id=? AND status<>'archived'`, id, ownerID), &plan)
	return plan, err
}

func (s *Server) listPersonalProjects(r *http.Request, ownerID int64) ([]PersonalProject, error) {
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT id,title,notes,color_key,status,created_at,updated_at FROM personal_projects WHERE owner_id=? AND status<>'archived' ORDER BY CASE status WHEN 'planned' THEN 0 ELSE 1 END, updated_at DESC`, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]PersonalProject, 0)
	for rows.Next() {
		var item PersonalProject
		if err := rows.Scan(&item.ID, &item.Title, &item.Notes, &item.ColorKey, &item.Status, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (s *Server) listPersonalGoals(r *http.Request, ownerID int64) ([]PersonalGoal, error) {
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT id,COALESCE(project_id,''),title,notes,horizon,start_date,end_date,progress,planned_minutes,actual_minutes,status,created_at,updated_at FROM personal_goals WHERE owner_id=? AND status<>'archived' ORDER BY CASE status WHEN 'planned' THEN 0 ELSE 1 END, end_date, updated_at DESC`, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]PersonalGoal, 0)
	for rows.Next() {
		var item PersonalGoal
		if err := rows.Scan(&item.ID, &item.ProjectID, &item.Title, &item.Notes, &item.Horizon, &item.StartDate, &item.EndDate, &item.Progress, &item.PlannedMinutes, &item.ActualMinutes, &item.Status, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (s *Server) listPersonalRecurrenceRules(r *http.Request, ownerID int64) (map[string]PersonalRecurrenceRule, error) {
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT series_id,cadence,interval_count,timezone,start_date,until_date,active,updated_at FROM personal_recurrence_rules WHERE owner_id=?`, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make(map[string]PersonalRecurrenceRule)
	for rows.Next() {
		var item PersonalRecurrenceRule
		var active int
		if err := rows.Scan(&item.SeriesID, &item.Cadence, &item.Interval, &item.Timezone, &item.StartDate, &item.UntilDate, &active, &item.UpdatedAt); err != nil {
			return nil, err
		}
		item.Active = active == 1
		result[item.SeriesID] = item
	}
	return result, rows.Err()
}

func validPersonalColor(value string) bool {
	switch value {
	case "green", "blue", "amber", "purple", "red", "neutral":
		return true
	default:
		return false
	}
}

func validatePersonalContainerText(title *string, notes string) error {
	*title = strings.TrimSpace(*title)
	if len([]rune(*title)) < 1 || len([]rune(*title)) > 240 {
		return errors.New("Укажите название до 240 символов")
	}
	if len([]rune(notes)) > 100000 {
		return errors.New("Текст слишком длинный")
	}
	return nil
}

func (s *Server) handleCreatePersonalProject(w http.ResponseWriter, r *http.Request) {
	var input personalProjectInput
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Notes = strings.TrimSpace(input.Notes)
	if input.ColorKey == "" {
		input.ColorKey = "green"
	}
	if err := validatePersonalContainerText(&input.Title, input.Notes); err != nil || !validPersonalColor(input.ColorKey) {
		message := "Некорректный цвет проекта"
		if err != nil {
			message = err.Error()
		}
		writeError(w, http.StatusBadRequest, message)
		return
	}
	id, ok := newPersonalID(w)
	if !ok {
		return
	}
	now := nowText()
	if _, err := s.store.db.ExecContext(r.Context(), `INSERT INTO personal_projects(id,owner_id,title,notes,color_key,status,created_at,updated_at) VALUES(?,?,?,?,?,'planned',?,?)`, id, currentUser(r).ID, input.Title, input.Notes, input.ColorKey, now, now); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать личный проект")
		return
	}
	writeJSON(w, http.StatusCreated, PersonalProject{ID: id, Title: input.Title, Notes: input.Notes, ColorKey: input.ColorKey, Status: "planned", CreatedAt: now, UpdatedAt: now})
}

func (s *Server) handleUpdatePersonalProject(w http.ResponseWriter, r *http.Request) {
	var input personalProjectInput
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Notes = strings.TrimSpace(input.Notes)
	if input.Status != "planned" && input.Status != "done" {
		writeError(w, http.StatusBadRequest, "Некорректное состояние проекта")
		return
	}
	if err := validatePersonalContainerText(&input.Title, input.Notes); err != nil || !validPersonalColor(input.ColorKey) {
		message := "Некорректный цвет проекта"
		if err != nil {
			message = err.Error()
		}
		writeError(w, http.StatusBadRequest, message)
		return
	}
	var version, created string
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT updated_at,created_at FROM personal_projects WHERE id=? AND owner_id=? AND status<>'archived'`, r.PathValue("id"), currentUser(r).ID).Scan(&version, &created); errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Личный проект не найден")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось прочитать личный проект")
		return
	}
	if input.ExpectedUpdatedAt != "" && input.ExpectedUpdatedAt != version {
		writeError(w, http.StatusConflict, "Личный проект изменён в другом окне")
		return
	}
	now := nowText()
	result, err := s.store.db.ExecContext(r.Context(), `UPDATE personal_projects SET title=?,notes=?,color_key=?,status=?,updated_at=? WHERE id=? AND owner_id=? AND status<>'archived' AND updated_at=?`, input.Title, input.Notes, input.ColorKey, input.Status, now, r.PathValue("id"), currentUser(r).ID, version)
	if err != nil || affectedRows(result) == 0 {
		writeError(w, http.StatusConflict, "Личный проект изменён. Откройте актуальную версию")
		return
	}
	writeJSON(w, http.StatusOK, PersonalProject{ID: r.PathValue("id"), Title: input.Title, Notes: input.Notes, ColorKey: input.ColorKey, Status: input.Status, CreatedAt: created, UpdatedAt: now})
}

func (s *Server) handleArchivePersonalProject(w http.ResponseWriter, r *http.Request) {
	s.archivePersonalEntity(w, r, "project", `UPDATE personal_projects SET status='archived',updated_at=? WHERE id=? AND owner_id=? AND status<>'archived'`, "Личный проект не найден")
}

func normalizePersonalGoal(input personalGoalInput) (personalGoalInput, error) {
	input.Notes = strings.TrimSpace(input.Notes)
	if err := validatePersonalContainerText(&input.Title, input.Notes); err != nil {
		return input, err
	}
	if input.Horizon == "" {
		input.Horizon = "month"
	}
	if input.Horizon != "month" && input.Horizon != "twelve_weeks" && input.Horizon != "custom" {
		return input, errors.New("Некорректный горизонт цели")
	}
	if input.StartDate == "" {
		input.StartDate = time.Now().In(personalLocation()).Format("2006-01-02")
	}
	start, err := time.Parse("2006-01-02", input.StartDate)
	if err != nil || start.Year() < 1900 || start.Year() > 9998 {
		return input, errors.New("Некорректное начало цели")
	}
	if input.EndDate == "" {
		switch input.Horizon {
		case "month":
			input.EndDate = start.AddDate(0, 1, -1).Format("2006-01-02")
		case "twelve_weeks":
			input.EndDate = start.AddDate(0, 0, 83).Format("2006-01-02")
		default:
			return input, errors.New("Укажите окончание своей цели")
		}
	}
	end, err := time.Parse("2006-01-02", input.EndDate)
	if err != nil || end.Before(start) {
		return input, errors.New("Окончание цели раньше начала")
	}
	if input.Progress < 0 || input.Progress > 100 || input.PlannedMinutes < 0 || input.PlannedMinutes > 525600 || input.ActualMinutes < 0 || input.ActualMinutes > 525600 {
		return input, errors.New("Проверьте прогресс и время цели")
	}
	return input, nil
}

func (s *Server) validatePersonalProject(ctx context.Context, ownerID int64, projectID string) error {
	if projectID == "" {
		return nil
	}
	var found int
	return s.store.db.QueryRowContext(ctx, `SELECT 1 FROM personal_projects WHERE id=? AND owner_id=? AND status<>'archived'`, projectID, ownerID).Scan(&found)
}

func (s *Server) handleCreatePersonalGoal(w http.ResponseWriter, r *http.Request) {
	var input personalGoalInput
	if !decodeJSON(w, r, &input) {
		return
	}
	var err error
	if input, err = normalizePersonalGoal(input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	ownerID := currentUser(r).ID
	if err := s.validatePersonalProject(r.Context(), ownerID, input.ProjectID); err != nil {
		writeError(w, http.StatusNotFound, "Личный проект не найден")
		return
	}
	id, ok := newPersonalID(w)
	if !ok {
		return
	}
	now := nowText()
	_, err = s.store.db.ExecContext(r.Context(), `INSERT INTO personal_goals(id,owner_id,project_id,title,notes,horizon,start_date,end_date,progress,planned_minutes,actual_minutes,status,created_at,updated_at) VALUES(?,?,NULLIF(?,''),?,?,?,?,?,?,?,?, 'planned',?,?)`, id, ownerID, input.ProjectID, input.Title, input.Notes, input.Horizon, input.StartDate, input.EndDate, input.Progress, input.PlannedMinutes, input.ActualMinutes, now, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать личную цель")
		return
	}
	writeJSON(w, http.StatusCreated, PersonalGoal{ID: id, ProjectID: input.ProjectID, Title: input.Title, Notes: input.Notes, Horizon: input.Horizon, StartDate: input.StartDate, EndDate: input.EndDate, Progress: input.Progress, PlannedMinutes: input.PlannedMinutes, ActualMinutes: input.ActualMinutes, Status: "planned", CreatedAt: now, UpdatedAt: now})
}

func (s *Server) handleUpdatePersonalGoal(w http.ResponseWriter, r *http.Request) {
	var input personalGoalInput
	if !decodeJSON(w, r, &input) {
		return
	}
	var err error
	if input, err = normalizePersonalGoal(input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if input.Status != "planned" && input.Status != "done" {
		writeError(w, http.StatusBadRequest, "Некорректное состояние цели")
		return
	}
	ownerID := currentUser(r).ID
	if err := s.validatePersonalProject(r.Context(), ownerID, input.ProjectID); err != nil {
		writeError(w, http.StatusNotFound, "Личный проект не найден")
		return
	}
	var version, created string
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT updated_at,created_at FROM personal_goals WHERE id=? AND owner_id=? AND status<>'archived'`, r.PathValue("id"), ownerID).Scan(&version, &created); errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Личная цель не найдена")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось прочитать личную цель")
		return
	}
	if input.ExpectedUpdatedAt != "" && input.ExpectedUpdatedAt != version {
		writeError(w, http.StatusConflict, "Личная цель изменена в другом окне")
		return
	}
	now := nowText()
	result, err := s.store.db.ExecContext(r.Context(), `UPDATE personal_goals SET project_id=NULLIF(?,''),title=?,notes=?,horizon=?,start_date=?,end_date=?,progress=?,planned_minutes=?,actual_minutes=?,status=?,updated_at=? WHERE id=? AND owner_id=? AND status<>'archived' AND updated_at=?`, input.ProjectID, input.Title, input.Notes, input.Horizon, input.StartDate, input.EndDate, input.Progress, input.PlannedMinutes, input.ActualMinutes, input.Status, now, r.PathValue("id"), ownerID, version)
	if err != nil || affectedRows(result) == 0 {
		writeError(w, http.StatusConflict, "Личная цель изменена. Откройте актуальную версию")
		return
	}
	writeJSON(w, http.StatusOK, PersonalGoal{ID: r.PathValue("id"), ProjectID: input.ProjectID, Title: input.Title, Notes: input.Notes, Horizon: input.Horizon, StartDate: input.StartDate, EndDate: input.EndDate, Progress: input.Progress, PlannedMinutes: input.PlannedMinutes, ActualMinutes: input.ActualMinutes, Status: input.Status, CreatedAt: created, UpdatedAt: now})
}

func (s *Server) handleArchivePersonalGoal(w http.ResponseWriter, r *http.Request) {
	s.archivePersonalEntity(w, r, "goal", `UPDATE personal_goals SET status='archived',updated_at=? WHERE id=? AND owner_id=? AND status<>'archived'`, "Личная цель не найдена")
}

func applyPersonalPlanInput(plan PersonalPlan, input personalPlanInput) (PersonalPlan, error) {
	if plan.ItemKind == "" {
		plan.ItemKind = "task"
	}
	if plan.OccurrenceState == "" {
		plan.OccurrenceState = "single"
	}
	if input.ItemKind != nil {
		plan.ItemKind = strings.TrimSpace(*input.ItemKind)
	}
	if input.ProjectID != nil {
		plan.ProjectID = strings.TrimSpace(*input.ProjectID)
	}
	if input.GoalID != nil {
		plan.GoalID = strings.TrimSpace(*input.GoalID)
	}
	if input.ParentID != nil {
		plan.ParentID = strings.TrimSpace(*input.ParentID)
	}
	if input.PlannedMinutes != nil {
		plan.PlannedMinutes = *input.PlannedMinutes
	}
	if input.ActualMinutes != nil {
		plan.ActualMinutes = *input.ActualMinutes
	}
	if input.OccurrenceDate != nil {
		previous := plan.OccurrenceDate
		plan.OccurrenceDate = strings.TrimSpace(*input.OccurrenceDate)
		if plan.SeriesID != "" && plan.OccurrenceDate != previous && plan.OccurrenceState != "skipped" {
			plan.OccurrenceState = "moved"
		}
	}
	if plan.ItemKind != "task" && plan.ItemKind != "event" {
		return plan, errors.New("Выберите дело или событие")
	}
	if plan.PlannedMinutes < 0 || plan.PlannedMinutes > 525600 || plan.ActualMinutes < 0 || plan.ActualMinutes > 525600 {
		return plan, errors.New("Проверьте плановое и фактическое время")
	}
	if plan.OccurrenceDate != "" && !validDate(plan.OccurrenceDate) {
		return plan, errors.New("Некорректная дата экземпляра")
	}
	return plan, nil
}

type personalReferenceQueryer interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func validatePersonalPlanReferences(ctx context.Context, queryer personalReferenceQueryer, ownerID int64, plan *PersonalPlan, selfID string) error {
	if plan.ProjectID != "" {
		var found int
		if err := queryer.QueryRowContext(ctx, `SELECT 1 FROM personal_projects WHERE id=? AND owner_id=? AND status<>'archived'`, plan.ProjectID, ownerID).Scan(&found); err != nil {
			return errors.New("Личный проект не найден")
		}
	}
	if plan.GoalID != "" {
		var projectID string
		if err := queryer.QueryRowContext(ctx, `SELECT COALESCE(project_id,'') FROM personal_goals WHERE id=? AND owner_id=? AND status<>'archived'`, plan.GoalID, ownerID).Scan(&projectID); err != nil {
			return errors.New("Личная цель не найдена")
		}
		if plan.ProjectID == "" {
			plan.ProjectID = projectID
		} else if projectID != "" && projectID != plan.ProjectID {
			return errors.New("Цель относится к другому личному проекту")
		}
	}
	if plan.ParentID == "" {
		return nil
	}
	if plan.ParentID == selfID {
		return errors.New("Дело не может быть собственной подзадачей")
	}
	var cycle int
	err := queryer.QueryRowContext(ctx, `WITH RECURSIVE chain(id,parent_id) AS (
		SELECT id,parent_id FROM personal_plans WHERE id=? AND owner_id=? AND status<>'archived'
		UNION ALL
		SELECT p.id,p.parent_id FROM personal_plans p JOIN chain c ON p.id=c.parent_id
		WHERE p.owner_id=? AND p.status<>'archived'
	) SELECT COUNT(*) FROM chain WHERE id=?`, plan.ParentID, ownerID, ownerID, selfID).Scan(&cycle)
	if err != nil {
		return errors.New("Родительское дело не найдено")
	}
	if selfID == "" {
		var found int
		if err := queryer.QueryRowContext(ctx, `SELECT 1 FROM personal_plans WHERE id=? AND owner_id=? AND status<>'archived'`, plan.ParentID, ownerID).Scan(&found); err != nil {
			return errors.New("Родительское дело не найдено")
		}
	}
	if cycle > 0 {
		return errors.New("Подзадачи не могут образовывать цикл")
	}
	return nil
}

func recurrenceForCreate(input *personalRecurrenceInput, plan PersonalPlan) (*PersonalRecurrenceRule, error) {
	if input == nil || input.Cadence == "" || input.Cadence == "none" {
		return nil, nil
	}
	if input.Cadence != "daily" && input.Cadence != "weekly" && input.Cadence != "monthly" {
		return nil, errors.New("Некорректный ритм повторения")
	}
	if input.Interval == 0 {
		input.Interval = 1
	}
	if input.Interval < 1 || input.Interval > 365 {
		return nil, errors.New("Некорректный интервал повторения")
	}
	input.Timezone = strings.TrimSpace(input.Timezone)
	if input.Timezone == "" {
		input.Timezone = personalLocation().String()
	}
	location, err := time.LoadLocation(input.Timezone)
	if err != nil {
		return nil, errors.New("Неизвестный часовой пояс")
	}
	if input.StartDate == "" {
		switch {
		case plan.OccurrenceDate != "":
			input.StartDate = plan.OccurrenceDate
		case plan.StartDate != "":
			input.StartDate = plan.StartDate
		case plan.StartsAt != nil:
			instant, _ := time.Parse(time.RFC3339Nano, *plan.StartsAt)
			input.StartDate = instant.In(location).Format("2006-01-02")
		case plan.DueAt != nil:
			instant, _ := time.Parse(time.RFC3339Nano, *plan.DueAt)
			input.StartDate = instant.In(location).Format("2006-01-02")
		default:
			input.StartDate = time.Now().In(location).Format("2006-01-02")
		}
	}
	if !validDate(input.StartDate) || input.UntilDate != "" && (!validDate(input.UntilDate) || input.UntilDate < input.StartDate) {
		return nil, errors.New("Проверьте границы повторения")
	}
	active := true
	if input.Active != nil {
		active = *input.Active
	}
	return &PersonalRecurrenceRule{Cadence: input.Cadence, Interval: input.Interval, Timezone: input.Timezone, StartDate: input.StartDate, UntilDate: input.UntilDate, Active: active}, nil
}

func nextPersonalOccurrenceDate(current, cadence string, interval int) (string, error) {
	date, err := time.Parse("2006-01-02", current)
	if err != nil {
		return "", err
	}
	switch cadence {
	case "daily":
		date = date.AddDate(0, 0, interval)
	case "weekly":
		date = date.AddDate(0, 0, 7*interval)
	case "monthly":
		target := time.Date(date.Year(), date.Month()+time.Month(interval), 1, 0, 0, 0, 0, time.UTC)
		last := time.Date(target.Year(), target.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day()
		day := date.Day()
		if day > last {
			day = last
		}
		date = time.Date(target.Year(), target.Month(), day, 0, 0, 0, 0, time.UTC)
	default:
		return "", errors.New("unknown cadence")
	}
	return date.Format("2006-01-02"), nil
}

func shiftDateRange(start, end, from, to string) (string, string, error) {
	if start == "" {
		return "", "", nil
	}
	fromDate, err := time.Parse("2006-01-02", from)
	if err != nil {
		return "", "", err
	}
	toDate, err := time.Parse("2006-01-02", to)
	if err != nil {
		return "", "", err
	}
	days := int(toDate.Sub(fromDate).Hours() / 24)
	startDate, _ := time.Parse("2006-01-02", start)
	endDate, _ := time.Parse("2006-01-02", end)
	return startDate.AddDate(0, 0, days).Format("2006-01-02"), endDate.AddDate(0, 0, days).Format("2006-01-02"), nil
}

func shiftInstantToDate(value *string, date string, location *time.Location) (*string, error) {
	if value == nil {
		return nil, nil
	}
	instant, err := time.Parse(time.RFC3339Nano, *value)
	if err != nil {
		return nil, err
	}
	target, err := time.ParseInLocation("2006-01-02", date, location)
	if err != nil {
		return nil, err
	}
	local := instant.In(location)
	shifted := time.Date(target.Year(), target.Month(), target.Day(), local.Hour(), local.Minute(), local.Second(), local.Nanosecond(), location).UTC().Format(time.RFC3339)
	return &shifted, nil
}

func (s *Server) spawnNextPersonalOccurrence(ctx context.Context, tx *sql.Tx, ownerID int64, current PersonalPlan, now string) error {
	if current.SeriesID == "" || current.OccurrenceDate == "" {
		return nil
	}
	var rule PersonalRecurrenceRule
	var active int
	err := tx.QueryRowContext(ctx, `SELECT series_id,cadence,interval_count,timezone,start_date,until_date,active,updated_at FROM personal_recurrence_rules WHERE series_id=? AND owner_id=?`, current.SeriesID, ownerID).
		Scan(&rule.SeriesID, &rule.Cadence, &rule.Interval, &rule.Timezone, &rule.StartDate, &rule.UntilDate, &active, &rule.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if active == 0 {
		return nil
	}
	nextDate, err := nextPersonalOccurrenceDate(current.OccurrenceDate, rule.Cadence, rule.Interval)
	if err != nil || rule.UntilDate != "" && nextDate > rule.UntilDate {
		return err
	}
	var exists int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM personal_plans WHERE owner_id=? AND series_id=? AND occurrence_date=?`, ownerID, current.SeriesID, nextDate).Scan(&exists); err != nil || exists > 0 {
		return err
	}
	next := current
	next.ID, err = newID()
	if err != nil {
		return err
	}
	next.Status, next.CompletedAt, next.ActualMinutes = "planned", nil, 0
	next.CreatedAt, next.UpdatedAt = now, now
	next.OccurrenceDate, next.OccurrenceState = nextDate, "scheduled"
	next.StartDate, next.EndDate, err = shiftDateRange(current.StartDate, current.EndDate, current.OccurrenceDate, nextDate)
	if err != nil {
		return err
	}
	location, err := time.LoadLocation(rule.Timezone)
	if err != nil {
		return err
	}
	next.DueAt, err = shiftInstantToDate(current.DueAt, nextDate, location)
	if err != nil {
		return err
	}
	if current.StartsAt != nil && current.EndsAt != nil {
		start, _ := time.Parse(time.RFC3339Nano, *current.StartsAt)
		end, _ := time.Parse(time.RFC3339Nano, *current.EndsAt)
		duration := end.Sub(start)
		next.StartsAt, err = shiftInstantToDate(current.StartsAt, nextDate, location)
		if err != nil {
			return err
		}
		shiftedStart, _ := time.Parse(time.RFC3339Nano, *next.StartsAt)
		shiftedEnd := shiftedStart.Add(duration).UTC().Format(time.RFC3339)
		next.EndsAt = &shiftedEnd
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO personal_plans(id,owner_id,title,notes,due_at,status,completed_at,created_at,updated_at,start_date,end_date,color_key,title_generated,item_kind,project_id,goal_id,parent_id,planned_minutes,actual_minutes,starts_at,ends_at,series_id,occurrence_date,occurrence_state) VALUES(?,?,?,?,?,'planned',NULL,?,?,?,?,?,?,?,NULLIF(?,''),NULLIF(?,''),NULLIF(?,''),?,?,?,?,?,?,?)`, next.ID, ownerID, next.Title, next.Notes, next.DueAt, now, now, next.StartDate, next.EndDate, next.ColorKey, next.TitleGenerated, next.ItemKind, next.ProjectID, next.GoalID, next.ParentID, next.PlannedMinutes, 0, next.StartsAt, next.EndsAt, next.SeriesID, next.OccurrenceDate, next.OccurrenceState)
	return err
}

func (s *Server) handleSkipPersonalPlan(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ExpectedUpdatedAt string `json:"expectedUpdatedAt"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	ownerID := currentUser(r).ID
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать пропуск")
		return
	}
	defer tx.Rollback()
	plan, err := loadPersonalPlan(r.Context(), tx, ownerID, r.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) || plan.SeriesID == "" || plan.Status != "planned" {
		writeError(w, http.StatusNotFound, "Повторяющийся экземпляр не найден")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось прочитать экземпляр")
		return
	}
	if input.ExpectedUpdatedAt != "" && input.ExpectedUpdatedAt != plan.UpdatedAt {
		writeError(w, http.StatusConflict, "Экземпляр изменён в другом окне")
		return
	}
	now := nowText()
	result, err := tx.ExecContext(r.Context(), `UPDATE personal_plans SET status='done',completed_at=?,occurrence_state='skipped',updated_at=? WHERE id=? AND owner_id=? AND status='planned' AND updated_at=?`, now, now, plan.ID, ownerID, plan.UpdatedAt)
	if err != nil || affectedRows(result) == 0 {
		writeError(w, http.StatusConflict, "Экземпляр изменён. Откройте актуальную версию")
		return
	}
	plan.Status, plan.CompletedAt, plan.OccurrenceState, plan.UpdatedAt = "done", &now, "skipped", now
	if err := s.spawnNextPersonalOccurrence(r.Context(), tx, ownerID, plan, now); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить пропуск")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить пропуск")
		return
	}
	writeJSON(w, http.StatusOK, plan)
}

func (s *Server) handleUpdatePersonalSeries(w http.ResponseWriter, r *http.Request) {
	var input personalPlanInput
	if !decodeJSON(w, r, &input) {
		return
	}
	ownerID := currentUser(r).ID
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать изменение серии")
		return
	}
	defer tx.Rollback()
	plan, err := loadPersonalPlan(r.Context(), tx, ownerID, r.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) || plan.SeriesID == "" {
		writeError(w, http.StatusNotFound, "Серия не найдена")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось прочитать серию")
		return
	}
	if input.ExpectedUpdatedAt != "" && input.ExpectedUpdatedAt != plan.UpdatedAt {
		writeError(w, http.StatusConflict, "Серия изменена в другом окне")
		return
	}
	var existingRule PersonalRecurrenceRule
	var existingActive int
	if err := tx.QueryRowContext(r.Context(), `SELECT series_id,cadence,interval_count,timezone,start_date,until_date,active,updated_at FROM personal_recurrence_rules WHERE series_id=? AND owner_id=?`, plan.SeriesID, ownerID).Scan(&existingRule.SeriesID, &existingRule.Cadence, &existingRule.Interval, &existingRule.Timezone, &existingRule.StartDate, &existingRule.UntilDate, &existingActive, &existingRule.UpdatedAt); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось прочитать параметры серии")
		return
	}
	updated, err := applyPersonalPlanInput(plan, input)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	updated.Title, updated.Notes = input.Title, strings.TrimSpace(input.Notes)
	if !validatePersonalText(w, &updated.Title, updated.Notes) {
		return
	}
	if err := validatePersonalPlanReferences(r.Context(), tx, ownerID, &updated, plan.ID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	requestedStartDate := ""
	if input.Recurrence != nil {
		requestedStartDate = input.Recurrence.StartDate
	}
	rule, err := recurrenceForCreate(input.Recurrence, updated)
	if err != nil || rule == nil {
		message := "Укажите параметры серии"
		if err != nil {
			message = err.Error()
		}
		writeError(w, http.StatusBadRequest, message)
		return
	}
	if requestedStartDate == "" {
		rule.StartDate = existingRule.StartDate
	}
	now := nowText()
	active := boolInt(rule.Active)
	_, err = tx.ExecContext(r.Context(), `UPDATE personal_recurrence_rules SET cadence=?,interval_count=?,timezone=?,start_date=?,until_date=?,active=?,updated_at=? WHERE series_id=? AND owner_id=?`, rule.Cadence, rule.Interval, rule.Timezone, rule.StartDate, rule.UntilDate, active, now, plan.SeriesID, ownerID)
	if err == nil {
		_, err = tx.ExecContext(r.Context(), `UPDATE personal_plans SET title=?,notes=?,item_kind=?,project_id=NULLIF(?,''),goal_id=NULLIF(?,''),parent_id=NULLIF(?,''),planned_minutes=?,updated_at=? WHERE owner_id=? AND series_id=? AND status='planned'`, updated.Title, updated.Notes, updated.ItemKind, updated.ProjectID, updated.GoalID, updated.ParentID, updated.PlannedMinutes, now, ownerID, plan.SeriesID)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось изменить серию")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось изменить серию")
		return
	}
	updated.UpdatedAt = now
	rule.SeriesID, rule.UpdatedAt = plan.SeriesID, now
	updated.Recurrence = rule
	writeJSON(w, http.StatusOK, updated)
}
