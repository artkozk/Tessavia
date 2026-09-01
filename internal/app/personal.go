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
}

type PersonalSettings struct {
	BirthDate           *string `json:"birthDate"`
	LifeExpectancyYears int     `json:"lifeExpectancyYears"`
}

type PersonalNote struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	Pinned    bool   `json:"pinned"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

type PersonalPlan struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Notes       string  `json:"notes"`
	DueAt       *string `json:"dueAt"`
	Status      string  `json:"status"`
	CompletedAt *string `json:"completedAt"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
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
	ID           string `json:"id"`
	SourceType   string `json:"sourceType"`
	SourceID     string `json:"sourceId"`
	TargetType   string `json:"targetType"`
	TargetID     string `json:"targetId"`
	TargetTitle  string `json:"targetTitle"`
	RelationType string `json:"relationType"`
	CreatedAt    string `json:"createdAt"`
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
		SELECT w.id, w.name, w.slug, w.kind, wm.role, w.delete_policy, w.description
		FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id
		WHERE wm.user_id = ? AND wm.status = 'active'
		ORDER BY CASE w.kind WHEN 'personal' THEN 0 ELSE 1 END, w.name`, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить пространства")
		return
	}
	defer rows.Close()
	items := make([]Workspace, 0)
	for rows.Next() {
		var item Workspace
		if err := rows.Scan(&item.ID, &item.Name, &item.Slug, &item.Kind, &item.Role, &item.DeletePolicy, &item.Description); err != nil {
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
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT id, title, body, pinned, created_at, updated_at FROM personal_notes WHERE owner_id = ? AND archived_at IS NULL ORDER BY pinned DESC, updated_at DESC`, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]PersonalNote, 0)
	for rows.Next() {
		var item PersonalNote
		var pinned int
		if err := rows.Scan(&item.ID, &item.Title, &item.Body, &pinned, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		item.Pinned = pinned == 1
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Server) listPersonalPlans(r *http.Request, ownerID int64) ([]PersonalPlan, error) {
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT id, title, notes, due_at, status, completed_at, created_at, updated_at FROM personal_plans WHERE owner_id = ? AND status <> 'archived' ORDER BY CASE status WHEN 'planned' THEN 0 ELSE 1 END, due_at IS NULL, due_at, updated_at DESC`, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]PersonalPlan, 0)
	for rows.Next() {
		var item PersonalPlan
		if err := rows.Scan(&item.ID, &item.Title, &item.Notes, &item.DueAt, &item.Status, &item.CompletedAt, &item.CreatedAt, &item.UpdatedAt); err != nil {
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
	for index := range items {
		items[index].TargetTitle = s.personalTargetTitle(r, ownerID, items[index].TargetType, items[index].TargetID)
	}
	return items, nil
}

func (s *Server) personalTargetTitle(r *http.Request, ownerID int64, targetType, targetID string) string {
	var title string
	queries := map[string]string{
		"record": `SELECT title FROM records WHERE id = ? AND status <> 'archived'`,
		"note":   `SELECT title FROM personal_notes WHERE id = ? AND owner_id = ? AND archived_at IS NULL`,
		"plan":   `SELECT title FROM personal_plans WHERE id = ? AND owner_id = ? AND status <> 'archived'`,
		"habit":  `SELECT title FROM personal_habits WHERE id = ? AND owner_id = ? AND archived_at IS NULL`,
	}
	query := queries[targetType]
	if targetType == "record" {
		_ = s.store.db.QueryRowContext(r.Context(), query, targetID).Scan(&title)
	} else if query != "" {
		_ = s.store.db.QueryRowContext(r.Context(), query, targetID, ownerID).Scan(&title)
	}
	return title
}

func (s *Server) handleCreatePersonalNote(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Title  string `json:"title"`
		Body   string `json:"body"`
		Pinned bool   `json:"pinned"`
	}
	if !decodeJSON(w, r, &input) || !validatePersonalText(w, &input.Title, input.Body) {
		return
	}
	id, ok := newPersonalID(w)
	if !ok {
		return
	}
	now := nowText()
	user := currentUser(r)
	_, err := s.store.db.ExecContext(r.Context(), `INSERT INTO personal_notes(id, owner_id, title, body, pinned, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?)`, id, user.ID, input.Title, strings.TrimSpace(input.Body), boolInt(input.Pinned), now, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить заметку")
		return
	}
	writeJSON(w, http.StatusCreated, PersonalNote{ID: id, Title: input.Title, Body: strings.TrimSpace(input.Body), Pinned: input.Pinned, CreatedAt: now, UpdatedAt: now})
}

func (s *Server) handleUpdatePersonalNote(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Title  string `json:"title"`
		Body   string `json:"body"`
		Pinned bool   `json:"pinned"`
	}
	if !decodeJSON(w, r, &input) || !validatePersonalText(w, &input.Title, input.Body) {
		return
	}
	user := currentUser(r)
	now := nowText()
	result, err := s.store.db.ExecContext(r.Context(), `UPDATE personal_notes SET title = ?, body = ?, pinned = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND archived_at IS NULL`, input.Title, strings.TrimSpace(input.Body), boolInt(input.Pinned), now, r.PathValue("id"), user.ID)
	if err != nil || affectedRows(result) == 0 {
		writeError(w, http.StatusNotFound, "Заметка не найдена")
		return
	}
	writeJSON(w, http.StatusOK, PersonalNote{ID: r.PathValue("id"), Title: input.Title, Body: strings.TrimSpace(input.Body), Pinned: input.Pinned, UpdatedAt: now})
}

func (s *Server) handleArchivePersonalNote(w http.ResponseWriter, r *http.Request) {
	s.archivePersonalEntity(w, r, "note", `UPDATE personal_notes SET archived_at = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND archived_at IS NULL`, "Заметка не найдена")
}

func (s *Server) handleCreatePersonalPlan(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Title string `json:"title"`
		Notes string `json:"notes"`
		DueAt string `json:"dueAt"`
	}
	if !decodeJSON(w, r, &input) || !validatePersonalText(w, &input.Title, input.Notes) {
		return
	}
	dueAt, err := normalizeDueAt(input.DueAt)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Некорректный срок")
		return
	}
	id, ok := newPersonalID(w)
	if !ok {
		return
	}
	now := nowText()
	user := currentUser(r)
	_, err = s.store.db.ExecContext(r.Context(), `INSERT INTO personal_plans(id, owner_id, title, notes, due_at, status, created_at, updated_at) VALUES(?, ?, ?, ?, ?, 'planned', ?, ?)`, id, user.ID, input.Title, strings.TrimSpace(input.Notes), dueAt, now, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить план")
		return
	}
	writeJSON(w, http.StatusCreated, PersonalPlan{ID: id, Title: input.Title, Notes: strings.TrimSpace(input.Notes), DueAt: dueAt, Status: "planned", CreatedAt: now, UpdatedAt: now})
}

func (s *Server) handleUpdatePersonalPlan(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Title  string `json:"title"`
		Notes  string `json:"notes"`
		DueAt  string `json:"dueAt"`
		Status string `json:"status"`
	}
	if !decodeJSON(w, r, &input) || !validatePersonalText(w, &input.Title, input.Notes) {
		return
	}
	if input.Status != "planned" && input.Status != "done" {
		writeError(w, http.StatusBadRequest, "Некорректное состояние плана")
		return
	}
	dueAt, err := normalizeDueAt(input.DueAt)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Некорректный срок")
		return
	}
	user := currentUser(r)
	now := nowText()
	var completedAt *string
	if input.Status == "done" {
		completedAt = &now
	}
	result, err := s.store.db.ExecContext(r.Context(), `UPDATE personal_plans SET title = ?, notes = ?, due_at = ?, status = ?, completed_at = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND status <> 'archived'`, input.Title, strings.TrimSpace(input.Notes), dueAt, input.Status, completedAt, now, r.PathValue("id"), user.ID)
	if err != nil || affectedRows(result) == 0 {
		writeError(w, http.StatusNotFound, "План не найден")
		return
	}
	writeJSON(w, http.StatusOK, PersonalPlan{ID: r.PathValue("id"), Title: input.Title, Notes: strings.TrimSpace(input.Notes), DueAt: dueAt, Status: input.Status, CompletedAt: completedAt, UpdatedAt: now})
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
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT id, CASE WHEN business_kind <> '' THEN business_kind WHEN subtype = 'question_set' THEN 'question_set' ELSE type END, title FROM records WHERE status NOT IN ('archived', 'cancelled') ORDER BY updated_at DESC LIMIT 250`)
	if err == nil {
		for rows.Next() {
			var id, recordType, title string
			if rows.Scan(&id, &recordType, &title) == nil {
				items = append(items, PersonalSuggestion{Type: "record", ID: id, Title: title, Subtitle: personalRecordTypeLabel(recordType)})
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
	id, ok := newPersonalID(w)
	if !ok {
		return
	}
	now := nowText()
	_, err := s.store.db.ExecContext(r.Context(), `INSERT INTO personal_links(id, owner_id, source_type, source_id, target_type, target_id, relation_type, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`, id, user.ID, input.SourceType, input.SourceID, input.TargetType, input.TargetID, input.RelationType, now)
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
	var exists int
	return s.store.db.QueryRowContext(r.Context(), `SELECT 1 FROM records WHERE id = ? AND status <> 'archived'`, targetID).Scan(&exists) == nil
}

func validatePersonalText(w http.ResponseWriter, title *string, body string) bool {
	*title = strings.TrimSpace(*title)
	if len([]rune(*title)) < 1 || len([]rune(*title)) > 240 {
		writeError(w, http.StatusBadRequest, "Название должно содержать от 1 до 240 символов")
		return false
	}
	if len([]rune(body)) > 100000 {
		writeError(w, http.StatusBadRequest, "Текст слишком длинный")
		return false
	}
	return true
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
