package app

import (
	"database/sql"
	"net/http"
	"sort"
	"strings"
	"time"
)

type Workspace struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Slug         string `json:"slug"`
	Kind         string `json:"kind"`
	Role         string `json:"role"`
	DeletePolicy string `json:"deletePolicy"`
	Description  string `json:"description"`
	TeamID       string `json:"teamId,omitempty"`
	TeamName     string `json:"teamName,omitempty"`
	TeamRole     string `json:"teamRole,omitempty"`
}

type PersonalSettings struct {
	BirthDate           *string `json:"birthDate"`
	LifeExpectancyYears int     `json:"lifeExpectancyYears"`
}

type PersonalNote struct {
	TitleGenerated bool    `json:"titleGenerated"`
	InInbox        bool    `json:"inInbox"`
	ScheduledDate  *string `json:"scheduledDate"`
	ID             string  `json:"id"`
	Title          string  `json:"title"`
	Body           string  `json:"body"`
	Pinned         bool    `json:"pinned"`
	CreatedAt      string  `json:"createdAt"`
	UpdatedAt      string  `json:"updatedAt"`
}

type PersonalPlan struct {
	TitleGenerated bool    `json:"titleGenerated"`
	ID             string  `json:"id"`
	Title          string  `json:"title"`
	Notes          string  `json:"notes"`
	DueAt          *string `json:"dueAt"`
	StartDate      string  `json:"startDate"`
	EndDate        string  `json:"endDate"`
	ColorKey       string  `json:"colorKey"`
	Status         string  `json:"status"`
	CompletedAt    *string `json:"completedAt"`
	CreatedAt      string  `json:"createdAt"`
	UpdatedAt      string  `json:"updatedAt"`
}

type HabitCheckin struct {
	Date      string `json:"date"`
	Value     int    `json:"value"`
	Note      string `json:"note"`
	UpdatedAt string `json:"updatedAt"`
}

type PersonalHabit struct {
	ID                string         `json:"id"`
	Title             string         `json:"title"`
	ScheduleKind      string         `json:"scheduleKind"`
	TargetPerWeek     int            `json:"targetPerWeek"`
	Unit              string         `json:"unit"`
	StartDate         string         `json:"startDate"`
	CurrentStreak     int            `json:"currentStreak"`
	BestStreak        int            `json:"bestStreak"`
	CompletedThisWeek int            `json:"completedThisWeek"`
	Checkins          []HabitCheckin `json:"checkins"`
	CreatedAt         string         `json:"createdAt"`
	UpdatedAt         string         `json:"updatedAt"`
}

type PersonalLink struct {
	ID                string `json:"id"`
	SourceType        string `json:"sourceType"`
	SourceID          string `json:"sourceId"`
	SourceTitle       string `json:"sourceTitle"`
	TargetType        string `json:"targetType"`
	TargetID          string `json:"targetId"`
	TargetTitle       string `json:"targetTitle"`
	TargetWorkspaceID string `json:"targetWorkspaceId,omitempty"`
	RelationType      string `json:"relationType"`
	CreatedAt         string `json:"createdAt"`
}

type PersonalOverview struct {
	Workspace Workspace        `json:"workspace"`
	Settings  PersonalSettings `json:"settings"`
	Notes     []PersonalNote   `json:"notes"`
	Plans     []PersonalPlan   `json:"plans"`
	Habits    []PersonalHabit  `json:"habits"`
	Links     []PersonalLink   `json:"links"`
}

type PersonalSuggestion struct {
	Type     string `json:"type"`
	ID       string `json:"id"`
	Title    string `json:"title"`
	Subtitle string `json:"subtitle"`
	Score    int    `json:"-"`
}

func (s *Server) handleListWorkspaces(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	rows, err := s.store.db.QueryContext(r.Context(), `
		SELECT w.id, w.name, w.slug, w.kind, wm.role, w.delete_policy, w.description,
		       COALESCE(w.team_id, ''), COALESCE(t.name, ''), COALESCE(tm.role, '')
		FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id
		LEFT JOIN teams t ON t.id = w.team_id
		LEFT JOIN team_members tm ON tm.team_id = w.team_id AND tm.user_id = wm.user_id AND tm.status = 'active'
		WHERE wm.user_id = ? AND wm.status = 'active'
		  AND w.archived_at IS NULL
		  AND (w.team_id IS NULL OR (t.deleted_at IS NULL AND tm.user_id IS NOT NULL))
		ORDER BY CASE w.kind WHEN 'personal' THEN 0 ELSE 1 END, COALESCE(t.name, ''), w.name`, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить пространства")
		return
	}
	defer rows.Close()
	items := make([]Workspace, 0)
	for rows.Next() {
		var item Workspace
		if err := rows.Scan(&item.ID, &item.Name, &item.Slug, &item.Kind, &item.Role, &item.DeletePolicy, &item.Description, &item.TeamID, &item.TeamName, &item.TeamRole); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось прочитать пространства")
			return
		}
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) handlePersonalOverview(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	var overview PersonalOverview
	err := s.store.db.QueryRowContext(r.Context(), `
		SELECT w.id, w.name, w.slug, w.kind, wm.role, w.delete_policy, w.description
		FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id
		WHERE w.kind = 'personal' AND w.owner_id = ? AND wm.user_id = ? AND wm.status = 'active'`, user.ID, user.ID).
		Scan(&overview.Workspace.ID, &overview.Workspace.Name, &overview.Workspace.Slug, &overview.Workspace.Kind, &overview.Workspace.Role, &overview.Workspace.DeletePolicy, &overview.Workspace.Description)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Личное пространство не настроено")
		return
	}
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT birth_date, life_expectancy_years FROM users WHERE id = ?`, user.ID).
		Scan(&overview.Settings.BirthDate, &overview.Settings.LifeExpectancyYears); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить личные настройки")
		return
	}
	if overview.Notes, err = s.listPersonalNotes(r, user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить заметки")
		return
	}
	if overview.Plans, err = s.listPersonalPlans(r, user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить планы")
		return
	}
	if overview.Habits, err = s.listPersonalHabits(r, user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить привычки")
		return
	}
	if overview.Links, err = s.listPersonalLinks(r, user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить личные связи")
		return
	}
	writeJSON(w, http.StatusOK, overview)
}

func (s *Server) listPersonalNotes(r *http.Request, ownerID int64) ([]PersonalNote, error) {
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT id, title, body, pinned, created_at, updated_at, scheduled_date, in_inbox, title_generated FROM personal_notes WHERE owner_id = ? AND archived_at IS NULL ORDER BY pinned DESC, updated_at DESC`, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]PersonalNote, 0)
	for rows.Next() {
		var item PersonalNote
		var pinned int
		if err := rows.Scan(&item.ID, &item.Title, &item.Body, &pinned, &item.CreatedAt, &item.UpdatedAt, &item.ScheduledDate, &item.InInbox, &item.TitleGenerated); err != nil {
			return nil, err
		}
		item.Pinned = pinned == 1
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Server) listPersonalPlans(r *http.Request, ownerID int64) ([]PersonalPlan, error) {
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT id, title, notes, due_at, status, completed_at, created_at, updated_at, start_date, end_date, color_key, title_generated FROM personal_plans WHERE owner_id = ? AND status <> 'archived' ORDER BY CASE status WHEN 'planned' THEN 0 ELSE 1 END, due_at IS NULL, due_at, updated_at DESC`, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]PersonalPlan, 0)
	for rows.Next() {
		var item PersonalPlan
		if err := rows.Scan(&item.ID, &item.Title, &item.Notes, &item.DueAt, &item.Status, &item.CompletedAt, &item.CreatedAt, &item.UpdatedAt, &item.StartDate, &item.EndDate, &item.ColorKey, &item.TitleGenerated); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Server) listPersonalHabits(r *http.Request, ownerID int64) ([]PersonalHabit, error) {
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT id, title, schedule_kind, target_per_week, unit, start_date, created_at, updated_at FROM personal_habits WHERE owner_id = ? AND archived_at IS NULL ORDER BY updated_at DESC`, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]PersonalHabit, 0)
	for rows.Next() {
		var item PersonalHabit
		if err := rows.Scan(&item.ID, &item.Title, &item.ScheduleKind, &item.TargetPerWeek, &item.Unit, &item.StartDate, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		item.Checkins = make([]HabitCheckin, 0)
		items = append(items, item)
	}
	for index := range items {
		checkins, err := s.listHabitCheckins(r, ownerID, items[index].ID)
		if err != nil {
			return nil, err
		}
		items[index].Checkins = checkins
		items[index].CurrentStreak, items[index].BestStreak, items[index].CompletedThisWeek = habitStats(checkins)
	}
	return items, nil
}

func (s *Server) listHabitCheckins(r *http.Request, ownerID int64, habitID string) ([]HabitCheckin, error) {
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT checkin_date, value, note, updated_at FROM personal_habit_checkins WHERE owner_id = ? AND habit_id = ? AND value > 0 ORDER BY checkin_date DESC`, ownerID, habitID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]HabitCheckin, 0)
	for rows.Next() {
		var item HabitCheckin
		if err := rows.Scan(&item.Date, &item.Value, &item.Note, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func habitStats(checkins []HabitCheckin) (current, best, thisWeek int) {
	done := make(map[string]bool, len(checkins))
	for _, checkin := range checkins {
		done[checkin.Date] = checkin.Value > 0
	}
	now := time.Now().In(personalLocation())
	weekday := (int(now.Weekday()) + 6) % 7
	weekStart := now.AddDate(0, 0, -weekday)
	for offset := 0; offset < 7; offset++ {
		if done[weekStart.AddDate(0, 0, offset).Format("2006-01-02")] {
			thisWeek++
		}
	}
	day := now
	if !done[day.Format("2006-01-02")] {
		day = day.AddDate(0, 0, -1)
	}
	for done[day.Format("2006-01-02")] {
		current++
		day = day.AddDate(0, 0, -1)
	}
	dates := make([]string, 0, len(done))
	for date := range done {
		dates = append(dates, date)
	}
	sort.Strings(dates)
	streak := 0
	var previous time.Time
	for _, value := range dates {
		parsed, err := time.Parse("2006-01-02", value)
		if err != nil {
			continue
		}
		if previous.IsZero() || parsed.Sub(previous) == 24*time.Hour {
			streak++
		} else {
			streak = 1
		}
		if streak > best {
			best = streak
		}
		previous = parsed
	}
	return current, best, thisWeek
}

func (s *Server) listPersonalLinks(r *http.Request, ownerID int64) ([]PersonalLink, error) {
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT id, source_type, source_id, target_type, target_id, relation_type, created_at FROM personal_links WHERE owner_id = ? AND active = 1 ORDER BY created_at DESC`, ownerID)
	if err != nil {
		return nil, err
	}
	items := make([]PersonalLink, 0)
	for rows.Next() {
		var item PersonalLink
		if err := rows.Scan(&item.ID, &item.SourceType, &item.SourceID, &item.TargetType, &item.TargetID, &item.RelationType, &item.CreatedAt); err != nil {
			rows.Close()
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	visible := make([]PersonalLink, 0, len(items))
	for _, item := range items {
		item.SourceTitle = s.personalTargetTitle(r, ownerID, item.SourceType, item.SourceID)
		item.TargetTitle = s.personalTargetTitle(r, ownerID, item.TargetType, item.TargetID)
		if item.SourceTitle == "" || item.TargetTitle == "" {
			continue
		}
		if item.TargetType == "record" {
			_ = s.store.db.QueryRowContext(r.Context(), `SELECT workspace_id FROM records WHERE id = ?`, item.TargetID).Scan(&item.TargetWorkspaceID)
		}
		visible = append(visible, item)
	}
	return visible, nil
}

func (s *Server) personalTargetTitle(r *http.Request, ownerID int64, targetType, targetID string) string {
	var title string
	queries := map[string]string{
		"record": `SELECT r.title FROM records r JOIN workspaces w ON w.id = r.workspace_id JOIN workspace_members m ON m.workspace_id = w.id WHERE r.id = ? AND r.status <> 'archived' AND w.archived_at IS NULL AND m.user_id = ? AND m.status = 'active' AND (w.team_id IS NULL OR EXISTS (SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id = t.id WHERE t.id = w.team_id AND t.deleted_at IS NULL AND tm.user_id = m.user_id AND tm.status = 'active'))`,
		"note":   `SELECT title FROM personal_notes WHERE id = ? AND owner_id = ? AND archived_at IS NULL`,
		"plan":   `SELECT title FROM personal_plans WHERE id = ? AND owner_id = ? AND status <> 'archived'`,
		"habit":  `SELECT title FROM personal_habits WHERE id = ? AND owner_id = ? AND archived_at IS NULL`,
	}
	query := queries[targetType]
	if query != "" {
		_ = s.store.db.QueryRowContext(r.Context(), query, targetID, ownerID).Scan(&title)
	}
	return title
}

func (s *Server) handleCreatePersonalNote(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ScheduledDate *string `json:"scheduledDate"`
		Title         string  `json:"title"`
		Body          string  `json:"body"`
		Pinned        bool    `json:"pinned"`
		LinkPlanID    string  `json:"linkPlanId"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	titleGenerated := strings.TrimSpace(input.Title) == ""
	if !validatePersonalText(w, &input.Title, input.Body) {
		return
	}
	if input.ScheduledDate != nil && *input.ScheduledDate != "" && !validDate(*input.ScheduledDate) {
		writeError(w, http.StatusBadRequest, "Некорректная дата заметки")
		return
	}
	id, ok := newPersonalID(w)
	if !ok {
		return
	}
	now := nowText()
	user := currentUser(r)
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось сохранить заметку")
		return
	}
	defer tx.Rollback()
	if input.LinkPlanID != "" {
		var found int
		if tx.QueryRowContext(r.Context(), `SELECT 1 FROM personal_plans WHERE id = ? AND owner_id = ? AND status <> 'archived'`, input.LinkPlanID, user.ID).Scan(&found) != nil {
			writeError(w, 404, "План не найден")
			return
		}
	}
	_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_notes(id, owner_id, title, body, pinned, created_at, updated_at, scheduled_date, title_generated) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, user.ID, input.Title, strings.TrimSpace(input.Body), boolInt(input.Pinned), now, now, input.ScheduledDate, titleGenerated)
	if err == nil && input.LinkPlanID != "" {
		linkID, ok := newPersonalID(w)
		if !ok {
			return
		}
		_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_links(id, owner_id, source_type, source_id, target_type, target_id, relation_type, created_at) VALUES(?, ?, 'note', ?, 'plan', ?, 'related', ?)`, linkID, user.ID, id, input.LinkPlanID, now)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить заметку")
		return
	}
	writeJSON(w, http.StatusCreated, PersonalNote{ID: id, Title: input.Title, Body: strings.TrimSpace(input.Body), Pinned: input.Pinned, CreatedAt: now, UpdatedAt: now, ScheduledDate: input.ScheduledDate, TitleGenerated: titleGenerated})
}

func (s *Server) handleUpdatePersonalNote(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ExpectedUpdatedAt string  `json:"expectedUpdatedAt"`
		ScheduledDate     *string `json:"scheduledDate"`
		Title             string  `json:"title"`
		Body              string  `json:"body"`
		Pinned            bool    `json:"pinned"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	titleGenerated := strings.TrimSpace(input.Title) == ""
	if !validatePersonalText(w, &input.Title, input.Body) {
		return
	}
	if input.ScheduledDate != nil && *input.ScheduledDate != "" && !validDate(*input.ScheduledDate) {
		writeError(w, http.StatusBadRequest, "Некорректная дата заметки")
		return
	}
	user := currentUser(r)
	now := nowText()
	var previousVersion string
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT updated_at FROM personal_notes WHERE id = ? AND owner_id = ? AND archived_at IS NULL`, r.PathValue("id"), user.ID).Scan(&previousVersion); err != nil {
		writeError(w, http.StatusNotFound, "Заметка не найдена")
		return
	}
	if input.ExpectedUpdatedAt != "" && input.ExpectedUpdatedAt != previousVersion {
		writeError(w, http.StatusConflict, "Заметка изменена в другом окне. Черновик сохранён; откройте актуальную версию.")
		return
	}
	result, err := s.store.db.ExecContext(r.Context(), `UPDATE personal_notes SET title = ?, body = ?, pinned = ?, updated_at = ?, scheduled_date = COALESCE(?, scheduled_date), title_generated = ? WHERE id = ? AND owner_id = ? AND archived_at IS NULL AND updated_at = ?`, input.Title, strings.TrimSpace(input.Body), boolInt(input.Pinned), now, input.ScheduledDate, titleGenerated, r.PathValue("id"), user.ID, previousVersion)
	if err != nil {
		writeError(w, 500, "Не удалось сохранить заметку")
		return
	}
	if affectedRows(result) == 0 {
		writeError(w, 409, "Заметка изменена. Откройте актуальную версию.")
		return
	}
	var note PersonalNote
	err = s.store.db.QueryRowContext(r.Context(), `SELECT id, title, body, pinned, created_at, updated_at, scheduled_date, in_inbox, title_generated FROM personal_notes WHERE id = ? AND owner_id = ? AND archived_at IS NULL`, r.PathValue("id"), user.ID).Scan(&note.ID, &note.Title, &note.Body, &note.Pinned, &note.CreatedAt, &note.UpdatedAt, &note.ScheduledDate, &note.InInbox, &note.TitleGenerated)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось прочитать заметку")
		return
	}
	writeJSON(w, http.StatusOK, note)
}

func (s *Server) handleArchivePersonalNote(w http.ResponseWriter, r *http.Request) {
	s.archivePersonalEntity(w, r, "note", `UPDATE personal_notes SET archived_at = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND archived_at IS NULL`, "Заметка не найдена")
}

func (s *Server) handleCreatePersonalPlan(w http.ResponseWriter, r *http.Request) {
	var input personalPlanInput
	if !decodeJSON(w, r, &input) {
		return
	}
	titleGenerated := strings.TrimSpace(input.Title) == ""
	if !validatePersonalText(w, &input.Title, input.Notes) {
		return
	}
	plan, err := input.calendarFields(PersonalPlan{ColorKey: "green"})
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	id, ok := newPersonalID(w)
	if !ok {
		return
	}
	now := nowText()
	user := currentUser(r)
	_, err = s.store.db.ExecContext(r.Context(), `INSERT INTO personal_plans(id, owner_id, title, notes, due_at, status, created_at, updated_at, start_date, end_date, color_key, title_generated) VALUES(?, ?, ?, ?, ?, 'planned', ?, ?, ?, ?, ?, ?)`, id, user.ID, input.Title, strings.TrimSpace(input.Notes), plan.DueAt, now, now, plan.StartDate, plan.EndDate, plan.ColorKey, titleGenerated)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить план")
		return
	}
	plan.ID, plan.Title, plan.Notes, plan.Status, plan.CreatedAt, plan.UpdatedAt = id, input.Title, strings.TrimSpace(input.Notes), "planned", now, now
	plan.TitleGenerated = titleGenerated
	writeJSON(w, http.StatusCreated, plan)
}

func (s *Server) handleUpdatePersonalPlan(w http.ResponseWriter, r *http.Request) {
	var input personalPlanInput
	if !decodeJSON(w, r, &input) {
		return
	}
	titleGenerated := strings.TrimSpace(input.Title) == ""
	if !validatePersonalText(w, &input.Title, input.Notes) {
		return
	}
	if input.Status != "planned" && input.Status != "done" {
		writeError(w, http.StatusBadRequest, "Некорректное состояние плана")
		return
	}
	user := currentUser(r)
	var current PersonalPlan
	err := s.store.db.QueryRowContext(r.Context(), `SELECT due_at, start_date, end_date, color_key, completed_at, created_at, updated_at FROM personal_plans WHERE id = ? AND owner_id = ? AND status <> 'archived'`, r.PathValue("id"), user.ID).Scan(&current.DueAt, &current.StartDate, &current.EndDate, &current.ColorKey, &current.CompletedAt, &current.CreatedAt, &current.UpdatedAt)
	if err != nil {
		writeError(w, 404, "План не найден")
		return
	}
	if input.ExpectedUpdatedAt != "" && input.ExpectedUpdatedAt != current.UpdatedAt {
		writeError(w, 409, "План изменён в другом окне. Откройте актуальную версию.")
		return
	}
	plan, err := input.calendarFields(current)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	now := nowText()
	var completedAt *string
	if input.Status == "done" {
		completedAt = current.CompletedAt
		if completedAt == nil {
			completedAt = &now
		}
	}
	result, err := s.store.db.ExecContext(r.Context(), `UPDATE personal_plans SET title = ?, notes = ?, due_at = ?, status = ?, completed_at = ?, updated_at = ?, start_date = ?, end_date = ?, color_key = ?, title_generated = ? WHERE id = ? AND owner_id = ? AND status <> 'archived' AND updated_at = ?`, input.Title, strings.TrimSpace(input.Notes), plan.DueAt, input.Status, completedAt, now, plan.StartDate, plan.EndDate, plan.ColorKey, titleGenerated, r.PathValue("id"), user.ID, current.UpdatedAt)
	if err != nil || affectedRows(result) == 0 {
		writeError(w, http.StatusConflict, "План изменён. Откройте актуальную версию.")
		return
	}
	plan.ID, plan.Title, plan.Notes, plan.Status, plan.CompletedAt, plan.UpdatedAt = r.PathValue("id"), input.Title, strings.TrimSpace(input.Notes), input.Status, completedAt, now
	plan.TitleGenerated = titleGenerated
	writeJSON(w, http.StatusOK, plan)
}

func (s *Server) handleArchivePersonalPlan(w http.ResponseWriter, r *http.Request) {
	s.archivePersonalEntity(w, r, "plan", `UPDATE personal_plans SET status = 'archived', updated_at = ? WHERE id = ? AND owner_id = ? AND status <> 'archived'`, "План не найден")
}

func (s *Server) handleCreatePersonalHabit(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Title         string `json:"title"`
		ScheduleKind  string `json:"scheduleKind"`
		TargetPerWeek int    `json:"targetPerWeek"`
		Unit          string `json:"unit"`
		StartDate     string `json:"startDate"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Title = strings.TrimSpace(input.Title)
	input.Unit = strings.TrimSpace(input.Unit)
	if input.ScheduleKind == "" {
		input.ScheduleKind = "daily"
	}
	if input.TargetPerWeek == 0 {
		input.TargetPerWeek = 7
	}
	if input.Unit == "" {
		input.Unit = "раз"
	}
	if input.StartDate == "" {
		input.StartDate = time.Now().In(personalLocation()).Format("2006-01-02")
	}
	if len([]rune(input.Title)) < 1 || len([]rune(input.Title)) > 160 || len([]rune(input.Unit)) > 32 || input.TargetPerWeek < 1 || input.TargetPerWeek > 7 || !validHabitSchedule(input.ScheduleKind) || !validDate(input.StartDate) {
		writeError(w, http.StatusBadRequest, "Проверьте название и расписание привычки")
		return
	}
	id, ok := newPersonalID(w)
	if !ok {
		return
	}
	now := nowText()
	user := currentUser(r)
	_, err := s.store.db.ExecContext(r.Context(), `INSERT INTO personal_habits(id, owner_id, title, schedule_kind, target_per_week, unit, start_date, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, user.ID, input.Title, input.ScheduleKind, input.TargetPerWeek, input.Unit, input.StartDate, now, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить привычку")
		return
	}
	writeJSON(w, http.StatusCreated, PersonalHabit{ID: id, Title: input.Title, ScheduleKind: input.ScheduleKind, TargetPerWeek: input.TargetPerWeek, Unit: input.Unit, StartDate: input.StartDate, Checkins: []HabitCheckin{}, CreatedAt: now, UpdatedAt: now})
}

func (s *Server) handleUpdatePersonalHabit(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Title         string `json:"title"`
		ScheduleKind  string `json:"scheduleKind"`
		TargetPerWeek int    `json:"targetPerWeek"`
		Unit          string `json:"unit"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Title = strings.TrimSpace(input.Title)
	input.Unit = strings.TrimSpace(input.Unit)
	if len([]rune(input.Title)) < 1 || len([]rune(input.Title)) > 160 || len([]rune(input.Unit)) > 32 || input.TargetPerWeek < 1 || input.TargetPerWeek > 7 || !validHabitSchedule(input.ScheduleKind) {
		writeError(w, http.StatusBadRequest, "Проверьте название и расписание привычки")
		return
	}
	user := currentUser(r)
	result, err := s.store.db.ExecContext(r.Context(), `UPDATE personal_habits SET title = ?, schedule_kind = ?, target_per_week = ?, unit = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND archived_at IS NULL`, input.Title, input.ScheduleKind, input.TargetPerWeek, input.Unit, nowText(), r.PathValue("id"), user.ID)
	if err != nil || affectedRows(result) == 0 {
		writeError(w, http.StatusNotFound, "Привычка не найдена")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleArchivePersonalHabit(w http.ResponseWriter, r *http.Request) {
	s.archivePersonalEntity(w, r, "habit", `UPDATE personal_habits SET archived_at = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND archived_at IS NULL`, "Привычка не найдена")
}

func (s *Server) handleSetHabitCheckin(w http.ResponseWriter, r *http.Request) {
	date := r.PathValue("date")
	if !validDate(date) {
		writeError(w, http.StatusBadRequest, "Некорректная дата")
		return
	}
	var input struct {
		Value int    `json:"value"`
		Note  string `json:"note"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.Value == 0 {
		input.Value = 1
	}
	if input.Value < 1 || input.Value > 1000000 || len([]rune(input.Note)) > 1000 {
		writeError(w, http.StatusBadRequest, "Некорректная отметка")
		return
	}
	user := currentUser(r)
	habitID := r.PathValue("id")
	if !s.personalEntityExists(r, user.ID, "habit", habitID) {
		writeError(w, http.StatusNotFound, "Привычка не найдена")
		return
	}
	id, ok := newPersonalID(w)
	if !ok {
		return
	}
	now := nowText()
	_, err := s.store.db.ExecContext(r.Context(), `
		INSERT INTO personal_habit_checkins(id, habit_id, owner_id, checkin_date, value, note, created_at, updated_at)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(habit_id, checkin_date) DO UPDATE SET value = excluded.value, note = excluded.note, updated_at = excluded.updated_at`, id, habitID, user.ID, date, input.Value, strings.TrimSpace(input.Note), now, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить отметку")
		return
	}
	writeJSON(w, http.StatusOK, HabitCheckin{Date: date, Value: input.Value, Note: strings.TrimSpace(input.Note), UpdatedAt: now})
}

func (s *Server) handleDeleteHabitCheckin(w http.ResponseWriter, r *http.Request) {
	date := r.PathValue("date")
	if !validDate(date) {
		writeError(w, http.StatusBadRequest, "Некорректная дата")
		return
	}
	user := currentUser(r)
	result, err := s.store.db.ExecContext(r.Context(), `DELETE FROM personal_habit_checkins WHERE habit_id = ? AND owner_id = ? AND checkin_date = ?`, r.PathValue("id"), user.ID, date)
	if err != nil || affectedRows(result) == 0 {
		writeError(w, http.StatusNotFound, "Отметка не найдена")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handlePersonalSuggestions(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if len([]rune(query)) < 2 {
		writeJSON(w, http.StatusOK, []PersonalSuggestion{})
		return
	}
	user := currentUser(r)
	items := make([]PersonalSuggestion, 0)
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT r.id, CASE WHEN r.business_kind <> '' THEN r.business_kind WHEN r.subtype = 'question_set' THEN 'question_set' ELSE r.type END, r.title, w.name FROM records r JOIN workspaces w ON w.id = r.workspace_id JOIN workspace_members m ON m.workspace_id = w.id WHERE r.status NOT IN ('archived', 'cancelled') AND w.archived_at IS NULL AND m.user_id = ? AND m.status = 'active' AND (w.team_id IS NULL OR EXISTS (SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id = t.id WHERE t.id = w.team_id AND t.deleted_at IS NULL AND tm.user_id = m.user_id AND tm.status = 'active')) ORDER BY r.updated_at DESC LIMIT 250`, user.ID)
	if err == nil {
		for rows.Next() {
			var id, recordType, title, workspace string
			if rows.Scan(&id, &recordType, &title, &workspace) == nil {
				items = append(items, PersonalSuggestion{Type: "record", ID: id, Title: title, Subtitle: workspace + " · " + personalRecordTypeLabel(recordType)})
			}
		}
		rows.Close()
	}
	personalQueries := []struct {
		kind, subtitle, query string
	}{
		{"note", "Личная заметка", `SELECT id, title FROM personal_notes WHERE owner_id = ? AND archived_at IS NULL`},
		{"plan", "Личный план", `SELECT id, title FROM personal_plans WHERE owner_id = ? AND status <> 'archived'`},
		{"habit", "Привычка", `SELECT id, title FROM personal_habits WHERE owner_id = ? AND archived_at IS NULL`},
	}
	for _, source := range personalQueries {
		rows, err := s.store.db.QueryContext(r.Context(), source.query, user.ID)
		if err != nil {
			continue
		}
		for rows.Next() {
			var id, title string
			if rows.Scan(&id, &title) == nil {
				items = append(items, PersonalSuggestion{Type: source.kind, ID: id, Title: title, Subtitle: source.subtitle})
			}
		}
		rows.Close()
	}
	terms := strings.Fields(strings.ToLower(query))
	filtered := items[:0]
	for _, item := range items {
		text := strings.ToLower(item.Title)
		for _, term := range terms {
			if strings.Contains(text, term) {
				item.Score += 10 + len([]rune(term))
			}
		}
		if strings.Contains(text, strings.ToLower(query)) {
			item.Score += 30
		}
		if item.Score > 0 {
			filtered = append(filtered, item)
		}
	}
	sort.SliceStable(filtered, func(i, j int) bool { return filtered[i].Score > filtered[j].Score })
	if len(filtered) > 8 {
		filtered = filtered[:8]
	}
	writeJSON(w, http.StatusOK, filtered)
}

func (s *Server) handleCreatePersonalLink(w http.ResponseWriter, r *http.Request) {
	var input struct {
		SourceType   string `json:"sourceType"`
		SourceID     string `json:"sourceId"`
		TargetType   string `json:"targetType"`
		TargetID     string `json:"targetId"`
		RelationType string `json:"relationType"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.RelationType == "" {
		input.RelationType = "related"
	}
	user := currentUser(r)
	if !s.personalEntityExists(r, user.ID, input.SourceType, input.SourceID) || !s.personalTargetExists(r, user.ID, input.TargetType, input.TargetID) {
		writeError(w, http.StatusNotFound, "Объект для связи не найден")
		return
	}
	if !validPersonalRelation(input.RelationType) || (input.SourceType == input.TargetType && input.SourceID == input.TargetID) {
		writeError(w, http.StatusBadRequest, "Некорректная связь")
		return
	}
	// Related links are undirected in the personal workspace; retries reuse the same edge.
	var existing PersonalLink
	err := s.store.db.QueryRowContext(r.Context(), `SELECT id, source_type, source_id, target_type, target_id, relation_type, created_at FROM personal_links WHERE owner_id = ? AND active = 1 AND relation_type = ? AND ((source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?) OR (? = 'related' AND source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?)) LIMIT 1`, user.ID, input.RelationType, input.SourceType, input.SourceID, input.TargetType, input.TargetID, input.RelationType, input.TargetType, input.TargetID, input.SourceType, input.SourceID).Scan(&existing.ID, &existing.SourceType, &existing.SourceID, &existing.TargetType, &existing.TargetID, &existing.RelationType, &existing.CreatedAt)
	if err == nil {
		existing.TargetTitle = s.personalTargetTitle(r, user.ID, existing.TargetType, existing.TargetID)
		writeJSON(w, http.StatusOK, existing)
		return
	}
	if err != sql.ErrNoRows {
		writeError(w, 500, "Не удалось проверить связь")
		return
	}
	id, ok := newPersonalID(w)
	if !ok {
		return
	}
	now := nowText()
	_, err = s.store.db.ExecContext(r.Context(), `INSERT INTO personal_links(id, owner_id, source_type, source_id, target_type, target_id, relation_type, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`, id, user.ID, input.SourceType, input.SourceID, input.TargetType, input.TargetID, input.RelationType, now)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			writeError(w, http.StatusConflict, "Такая связь уже существует")
		} else {
			writeError(w, http.StatusInternalServerError, "Не удалось сохранить связь")
		}
		return
	}
	writeJSON(w, http.StatusCreated, PersonalLink{ID: id, SourceType: input.SourceType, SourceID: input.SourceID, TargetType: input.TargetType, TargetID: input.TargetID, TargetTitle: s.personalTargetTitle(r, user.ID, input.TargetType, input.TargetID), RelationType: input.RelationType, CreatedAt: now})
}

func (s *Server) handleRemovePersonalLink(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	result, err := s.store.db.ExecContext(r.Context(), `UPDATE personal_links SET active = 0, removed_at = ? WHERE id = ? AND owner_id = ? AND active = 1`, nowText(), r.PathValue("id"), user.ID)
	if err != nil || affectedRows(result) == 0 {
		writeError(w, http.StatusNotFound, "Связь не найдена")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) archivePersonalEntity(w http.ResponseWriter, r *http.Request, entityType, query, notFound string) {
	user := currentUser(r)
	now := nowText()
	args := []any{now, r.PathValue("id"), user.ID}
	if strings.Count(query, "?") == 4 {
		args = []any{now, now, r.PathValue("id"), user.ID}
	}
	result, err := s.store.db.ExecContext(r.Context(), query, args...)
	if err != nil || affectedRows(result) == 0 {
		writeError(w, http.StatusNotFound, notFound)
		return
	}
	_, _ = s.store.db.ExecContext(r.Context(), `
		UPDATE personal_links SET active = 0, removed_at = ?
		WHERE owner_id = ? AND active = 1
			AND ((source_type = ? AND source_id = ?) OR (target_type = ? AND target_id = ?))`,
		now, user.ID, entityType, r.PathValue("id"), entityType, r.PathValue("id"))
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) personalEntityExists(r *http.Request, ownerID int64, entityType, id string) bool {
	queries := map[string]string{
		"note":  `SELECT 1 FROM personal_notes WHERE id = ? AND owner_id = ? AND archived_at IS NULL`,
		"plan":  `SELECT 1 FROM personal_plans WHERE id = ? AND owner_id = ? AND status <> 'archived'`,
		"habit": `SELECT 1 FROM personal_habits WHERE id = ? AND owner_id = ? AND archived_at IS NULL`,
	}
	query := queries[entityType]
	if query == "" {
		return false
	}
	var exists int
	return s.store.db.QueryRowContext(r.Context(), query, id, ownerID).Scan(&exists) == nil
}

func (s *Server) personalTargetExists(r *http.Request, ownerID int64, targetType, targetID string) bool {
	if targetType != "record" {
		return s.personalEntityExists(r, ownerID, targetType, targetID)
	}
	return s.personalTargetTitle(r, ownerID, targetType, targetID) != ""
}

func validatePersonalText(w http.ResponseWriter, title *string, body string) bool {
	*title = strings.TrimSpace(*title)
	if *title == "" {
		*title = personalTitleFromBody(body)
	}
	if len([]rune(*title)) < 1 || len([]rune(*title)) > 240 {
		writeError(w, http.StatusBadRequest, "Добавьте текст или название длиной до 240 символов")
		return false
	}
	if len([]rune(body)) > 100000 {
		writeError(w, http.StatusBadRequest, "Текст слишком длинный")
		return false
	}
	return true
}

func personalTitleFromBody(body string) string {
	for _, line := range strings.Split(strings.ReplaceAll(body, "\r\n", "\n"), "\n") {
		candidate := strings.TrimSpace(line)
		candidate = strings.TrimLeft(candidate, "#> \t")
		if strings.HasPrefix(candidate, "- ") || strings.HasPrefix(candidate, "* ") || strings.HasPrefix(candidate, "+ ") {
			candidate = strings.TrimSpace(candidate[2:])
		}
		if separator := strings.Index(candidate, ". "); separator > 0 {
			ordered := true
			for _, symbol := range candidate[:separator] {
				if symbol < '0' || symbol > '9' {
					ordered = false
					break
				}
			}
			if ordered {
				candidate = strings.TrimSpace(candidate[separator+2:])
			}
		}
		candidate = strings.Trim(candidate, "*_~` ")
		if candidate == "" {
			continue
		}
		runes := []rune(candidate)
		if len(runes) > 120 {
			return strings.TrimSpace(string(runes[:117])) + "..."
		}
		return candidate
	}
	return ""
}

func validHabitSchedule(value string) bool {
	return value == "daily" || value == "weekdays" || value == "weekly_target"
}

func validPersonalRelation(value string) bool {
	return value == "related" || value == "supports" || value == "part_of" || value == "prepares_for"
}

func validDate(value string) bool {
	parsed, err := time.Parse("2006-01-02", value)
	return err == nil && parsed.Format("2006-01-02") == value
}

func personalRecordTypeLabel(value string) string {
	labels := map[string]string{"goal": "Цель", "task": "Задача", "question_set": "Карточка вопросов", "idea": "Идея", "criterion": "Критерий", "research": "Исследование", "decision": "Решение", "document": "Документ", "meeting": "Встреча", "risk": "Риск", "hypothesis": "Гипотеза", "experiment": "Эксперимент", "inbox": "Входящее"}
	if label := labels[value]; label != "" {
		return label
	}
	return "Карточка проекта"
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func affectedRows(result sql.Result) int64 {
	if result == nil {
		return 0
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return 0
	}
	return rows
}

func newPersonalID(w http.ResponseWriter) (string, bool) {
	id, err := newID()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать идентификатор")
		return "", false
	}
	return id, true
}

func personalLocation() *time.Location {
	location, err := time.LoadLocation("Europe/Moscow")
	if err != nil {
		return time.FixedZone("Europe/Moscow", 3*60*60)
	}
	return location
}
