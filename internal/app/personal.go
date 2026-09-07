package app

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"time"
)

type Workspace struct {
	ReadingEnabled bool   `json:"readingEnabled"`
	ID             string `json:"id"`
	Name           string `json:"name"`
	Slug           string `json:"slug"`
	Kind           string `json:"kind"`
	Role           string `json:"role"`
	DeletePolicy   string `json:"deletePolicy"`
	Description    string `json:"description"`
	TeamID         string `json:"teamId,omitempty"`
	TeamName       string `json:"teamName,omitempty"`
	TeamRole       string `json:"teamRole,omitempty"`
}

type PersonalSettings struct {
	BirthDate           *string `json:"birthDate"`
	LifeExpectancyYears int     `json:"lifeExpectancyYears"`
}

type PersonalNote struct {
	ArchivedAt     *string  `json:"archivedAt"`
	FolderID       string   `json:"folderId"`
	FolderName     string   `json:"folderName"`
	Tags           []string `json:"tags"`
	DailyDate      string   `json:"dailyDate"`
	TitleGenerated bool     `json:"titleGenerated"`
	InInbox        bool     `json:"inInbox"`
	ScheduledDate  *string  `json:"scheduledDate"`
	ID             string   `json:"id"`
	Title          string   `json:"title"`
	Body           string   `json:"body"`
	Pinned         bool     `json:"pinned"`
	CreatedAt      string   `json:"createdAt"`
	UpdatedAt      string   `json:"updatedAt"`
}

type PersonalPlan struct {
	TitleGenerated  bool                    `json:"titleGenerated"`
	ID              string                  `json:"id"`
	Title           string                  `json:"title"`
	Notes           string                  `json:"notes"`
	DueAt           *string                 `json:"dueAt"`
	StartDate       string                  `json:"startDate"`
	EndDate         string                  `json:"endDate"`
	ColorKey        string                  `json:"colorKey"`
	Status          string                  `json:"status"`
	CompletedAt     *string                 `json:"completedAt"`
	CreatedAt       string                  `json:"createdAt"`
	UpdatedAt       string                  `json:"updatedAt"`
	ItemKind        string                  `json:"itemKind"`
	ProjectID       string                  `json:"projectId,omitempty"`
	GoalID          string                  `json:"goalId,omitempty"`
	ParentID        string                  `json:"parentId,omitempty"`
	PlannedMinutes  int                     `json:"plannedMinutes"`
	ActualMinutes   int                     `json:"actualMinutes"`
	StartsAt        *string                 `json:"startsAt"`
	EndsAt          *string                 `json:"endsAt"`
	SeriesID        string                  `json:"seriesId,omitempty"`
	OccurrenceDate  string                  `json:"occurrenceDate,omitempty"`
	OccurrenceState string                  `json:"occurrenceState"`
	Recurrence      *PersonalRecurrenceRule `json:"recurrence,omitempty"`
}

type PersonalProject struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Notes     string `json:"notes"`
	ColorKey  string `json:"colorKey"`
	Status    string `json:"status"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

type PersonalGoal struct {
	ID             string `json:"id"`
	ProjectID      string `json:"projectId,omitempty"`
	Title          string `json:"title"`
	Notes          string `json:"notes"`
	Horizon        string `json:"horizon"`
	StartDate      string `json:"startDate"`
	EndDate        string `json:"endDate"`
	Progress       int    `json:"progress"`
	PlannedMinutes int    `json:"plannedMinutes"`
	ActualMinutes  int    `json:"actualMinutes"`
	Status         string `json:"status"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}

type PersonalRecurrenceRule struct {
	Template    *PersonalPlan `json:"template,omitempty"`
	NeedsReview bool          `json:"needsReview,omitempty"`
	SeriesID    string        `json:"seriesId"`
	Cadence     string        `json:"cadence"`
	Interval    int           `json:"interval"`
	Timezone    string        `json:"timezone"`
	StartDate   string        `json:"startDate"`
	UntilDate   string        `json:"untilDate"`
	Active      bool          `json:"active"`
	UpdatedAt   string        `json:"updatedAt"`
}

type HabitCheckin struct {
	SnoozedAt   string  `json:"snoozedAt,omitempty"`
	SnoozedFrom string  `json:"-"`
	Date        string  `json:"date"`
	Value       float64 `json:"value"`
	State       string  `json:"state"`
	Note        string  `json:"note"`
	UpdatedAt   string  `json:"updatedAt"`
}

type PersonalHabit struct {
	Description string       `json:"description"`
	ColorKey    string       `json:"colorKey"`
	IconKey     string       `json:"iconKey"`
	Timezone    string       `json:"timezone"`
	Revision    int          `json:"revision"`
	ArchivedAt  string       `json:"archivedAt"`
	Rule        HabitRule    `json:"rule"`
	Rules       []HabitRule  `json:"rules,omitempty"`
	Pauses      []HabitPause `json:"pauses"`
	Moves       []HabitMove  `json:"moves"`
	Paused      bool         `json:"paused"`
	Today       string       `json:"today"`
	Days        []HabitDay   `json:"days"`
	Summary     HabitSummary `json:"summary"`

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
	NoteFolders   []PersonalNoteFolder   `json:"noteFolders"`
	NoteTemplates []PersonalNoteTemplate `json:"noteTemplates"`
	Workspace     Workspace              `json:"workspace"`
	Settings      PersonalSettings       `json:"settings"`
	Projects      []PersonalProject      `json:"projects"`
	Goals         []PersonalGoal         `json:"goals"`
	Notes         []PersonalNote         `json:"notes"`
	Plans         []PersonalPlan         `json:"plans"`
	Habits        []PersonalHabit        `json:"habits"`
	Links         []PersonalLink         `json:"links"`
}

type PersonalSuggestion struct {
	Type     string `json:"type"`
	ID       string `json:"id"`
	Title    string `json:"title"`
	Subtitle string `json:"subtitle"`
	Score    int    `json:"-"`
}

type PersonalSearchResult struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	Title     string `json:"title"`
	Context   string `json:"context"`
	Status    string `json:"status"`
	UpdatedAt string `json:"updatedAt"`
}

func (s *Server) handlePersonalSearch(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		writeJSON(w, http.StatusOK, []PersonalSearchResult{})
		return
	}
	if len([]rune(query)) > 200 {
		writeError(w, http.StatusBadRequest, "Поисковый запрос слишком длинный")
		return
	}
	ownerID := currentUser(r).ID
	type source struct{ kind, sql string }
	sources := []source{
		{"project", `SELECT id,title,notes,status,updated_at FROM personal_projects WHERE owner_id=? AND status<>'archived'`},
		{"goal", `SELECT id,title,notes,status,updated_at FROM personal_goals WHERE owner_id=? AND status<>'archived'`},
		{"note", `SELECT n.id,n.title,n.body || char(10) || COALESCE(f.name,'') || ' ' || n.tags_json,'active',n.updated_at FROM personal_notes n LEFT JOIN personal_note_folders f ON f.id=n.folder_id AND f.owner_id=n.owner_id AND f.archived_at IS NULL WHERE n.owner_id=? AND n.archived_at IS NULL`},
		{"plan", `SELECT id,title,notes,status,updated_at FROM personal_plans WHERE owner_id=? AND status<>'archived'`},
		{"habit", `SELECT id,title,unit,'active',updated_at FROM personal_habits WHERE owner_id=? AND archived_at IS NULL`},
	}
	normalized := strings.ToLower(query)
	results := make([]PersonalSearchResult, 0)
	for _, source := range sources {
		rows, err := s.store.db.QueryContext(r.Context(), source.sql, ownerID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось выполнить личный поиск")
			return
		}
		for rows.Next() {
			var item PersonalSearchResult
			item.Type = source.kind
			if err := rows.Scan(&item.ID, &item.Title, &item.Context, &item.Status, &item.UpdatedAt); err != nil {
				rows.Close()
				writeError(w, http.StatusInternalServerError, "Не удалось прочитать результаты личного поиска")
				return
			}
			if strings.Contains(strings.ToLower(item.Title+" "+item.Context), normalized) {
				results = append(results, item)
			}
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			writeError(w, http.StatusInternalServerError, "Не удалось прочитать результаты личного поиска")
			return
		}
		rows.Close() // one DB connection: close before opening the next source.
	}
	sort.Slice(results, func(left, right int) bool {
		leftPrefix := strings.HasPrefix(strings.ToLower(results[left].Title), normalized)
		rightPrefix := strings.HasPrefix(strings.ToLower(results[right].Title), normalized)
		if leftPrefix != rightPrefix {
			return leftPrefix
		}
		if results[left].UpdatedAt != results[right].UpdatedAt {
			return results[left].UpdatedAt > results[right].UpdatedAt
		}
		return results[left].ID < results[right].ID
	})
	if len(results) > 40 {
		results = results[:40]
	}
	writeJSON(w, http.StatusOK, results)
}

func (s *Server) handleListWorkspaces(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	rows, err := s.store.db.QueryContext(r.Context(), `
		SELECT w.id, w.name, w.slug, w.kind, wm.role, w.delete_policy, w.description,
		       COALESCE(w.team_id, ''), COALESCE(t.name, ''), COALESCE(tm.role, ''), EXISTS(SELECT 1 FROM reading_spaces rs WHERE rs.workspace_id=w.id)
		FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id
		LEFT JOIN teams t ON t.id = w.team_id
		LEFT JOIN team_members tm ON tm.team_id = w.team_id AND tm.user_id = wm.user_id AND tm.status = 'active'
		WHERE wm.user_id = ? AND wm.status = 'active'
		  AND w.archived_at IS NULL
		  AND (w.team_id IS NULL OR (t.deleted_at IS NULL AND tm.user_id IS NOT NULL))
		ORDER BY CASE w.kind WHEN 'personal' THEN 0 ELSE 1 END, CASE WHEN w.kind='personal' THEN w.created_at END, CASE WHEN w.kind='personal' THEN w.id END, COALESCE(t.name, ''), w.name`, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить пространства")
		return
	}
	defer rows.Close()
	items := make([]Workspace, 0)
	for rows.Next() {
		var item Workspace
		if err := rows.Scan(&item.ID, &item.Name, &item.Slug, &item.Kind, &item.Role, &item.DeletePolicy, &item.Description, &item.TeamID, &item.TeamName, &item.TeamRole, &item.ReadingEnabled); err != nil {
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
		WHERE w.kind = 'personal' AND w.owner_id = ? AND wm.user_id = ? AND wm.status = 'active' AND w.archived_at IS NULL ORDER BY w.created_at, w.id LIMIT 1`, user.ID, user.ID).
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
	if overview.Projects, err = s.listPersonalProjects(r, user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить личные проекты")
		return
	}
	if overview.Goals, err = s.listPersonalGoals(r, user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить личные цели")
		return
	}
	if overview.Notes, err = s.listPersonalNotes(r, user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить заметки")
		return
	}
	if err = s.listNoteLibrary(r, &overview); err != nil {
		writeError(w, 500, "Не удалось загрузить папки и шаблоны")
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
	rows, err := s.store.db.QueryContext(r.Context(), personalNoteSelect+` WHERE n.owner_id = ? AND n.archived_at IS NULL ORDER BY n.pinned DESC, n.updated_at DESC,n.id`, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]PersonalNote, 0)
	for rows.Next() {
		item, err := scanPersonalNote(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Server) listPersonalPlans(r *http.Request, ownerID int64) ([]PersonalPlan, error) {
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT id,title,notes,due_at,status,completed_at,created_at,updated_at,start_date,end_date,color_key,title_generated,item_kind,COALESCE(project_id,''),COALESCE(goal_id,''),COALESCE(parent_id,''),planned_minutes,actual_minutes,starts_at,ends_at,series_id,occurrence_date,occurrence_state FROM personal_plans WHERE owner_id = ? AND status <> 'archived' ORDER BY CASE status WHEN 'planned' THEN 0 ELSE 1 END, CASE WHEN occurrence_date='' THEN 1 ELSE 0 END, occurrence_date, due_at IS NULL, due_at, updated_at DESC`, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]PersonalPlan, 0)
	for rows.Next() {
		var item PersonalPlan
		if err := scanPersonalPlan(rows, &item); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	rules, err := s.listPersonalRecurrenceRules(r, ownerID)
	if err != nil {
		return nil, err
	}
	for index := range items {
		if rule, ok := rules[items[index].SeriesID]; ok {
			copy := rule
			items[index].Recurrence = &copy
		}
	}
	return items, nil
}

func (s *Server) listPersonalHabits(r *http.Request, ownerID int64) ([]PersonalHabit, error) {
	items, err := s.loadHabits(r, ownerID, "", time.Now().AddDate(0, 0, -7).Format("2006-01-02"))
	if err != nil {
		return nil, err
	}
	for i, h := range items {
		today := habitToday(h)
		out := buildHabitTracker(h, habitAdd(today, -6), today, today)
		items[i] = out.Habit
		items[i].Days = out.Days
		items[i].Summary = out.Summary
		weekStart, _ := habitPeriodBounds(today, "weekly")
		for _, c := range out.Days {
			if c.Date >= weekStart && c.State == "success" {
				items[i].CompletedThisWeek++
			}
		}
	}
	return items, nil
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
		FolderID      string   `json:"folderId"`
		Tags          []string `json:"tags"`
		RequestKey    string   `json:"requestKey"`
		ScheduledDate *string  `json:"scheduledDate"`
		Title         string   `json:"title"`
		Body          string   `json:"body"`
		Pinned        bool     `json:"pinned"`
		LinkPlanID    string   `json:"linkPlanId"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if !validateCreateRequestKey(w, r, &input.RequestKey) {
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
	tags, tagErr := normalizeNoteTags(input.Tags)
	if tagErr != nil {
		writeError(w, 400, tagErr.Error())
		return
	}
	now := nowText()
	user := currentUser(r)
	payloadHash, err := createPayloadHash(struct {
		Title, Body, LinkPlanID string
		Pinned, TitleGenerated  bool
		ScheduledDate           *string
	}{input.Title, strings.TrimSpace(input.Body), input.LinkPlanID, input.Pinned, titleGenerated, input.ScheduledDate})
	if err != nil {
		writeError(w, 400, "Некорректная заметка")
		return
	}
	payloadHash, err = noteOrganizationHash(payloadHash, input.FolderID, tags)
	if err != nil {
		writeError(w, 400, "Некорректная организация заметки")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось сохранить заметку")
		return
	}
	defer tx.Rollback()
	existing, err := lookupPersonalCreate(r.Context(), tx, user.ID, "note", input.RequestKey, payloadHash)
	if err != nil {
		writeCreateReceiptError(w, err)
		return
	}
	if existing != "" {
		writePersonalCreateReplay(w, r, tx, "note", existing)
		return
	}
	if !noteFolderExists(r.Context(), tx, user.ID, input.FolderID) {
		writeError(w, 404, "Папка не найдена")
		return
	}
	if input.LinkPlanID != "" {
		var found int
		if tx.QueryRowContext(r.Context(), `SELECT 1 FROM personal_plans WHERE id = ? AND owner_id = ? AND status <> 'archived'`, input.LinkPlanID, user.ID).Scan(&found) != nil {
			writeError(w, 404, "План не найден")
			return
		}
	}
	tagsJSON, _ := json.Marshal(tags)
	_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_notes(id, owner_id, title, body, pinned, created_at, updated_at, scheduled_date, title_generated,folder_id,tags_json) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?,NULLIF(?,''),?)`, id, user.ID, input.Title, strings.TrimSpace(input.Body), boolInt(input.Pinned), now, now, input.ScheduledDate, titleGenerated, input.FolderID, string(tagsJSON))
	if err == nil && input.LinkPlanID != "" {
		linkID, ok := newPersonalID(w)
		if !ok {
			return
		}
		_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_links(id, owner_id, source_type, source_id, target_type, target_id, relation_type, created_at) VALUES(?, ?, 'note', ?, 'plan', ?, 'related', ?)`, linkID, user.ID, id, input.LinkPlanID, now)
	}
	if err == nil {
		err = recordPersonalCreate(r.Context(), tx, user.ID, "note", input.RequestKey, payloadHash, id, now)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить заметку")
		return
	}
	writeJSON(w, http.StatusCreated, PersonalNote{ID: id, Title: input.Title, Body: strings.TrimSpace(input.Body), Pinned: input.Pinned, CreatedAt: now, UpdatedAt: now, ScheduledDate: input.ScheduledDate, TitleGenerated: titleGenerated, FolderID: input.FolderID, Tags: tags})
}

func (s *Server) handleUpdatePersonalNote(w http.ResponseWriter, r *http.Request) {
	var input struct {
		FolderID          *string   `json:"folderId"`
		Tags              *[]string `json:"tags"`
		ExpectedUpdatedAt string    `json:"expectedUpdatedAt"`
		ScheduledDate     *string   `json:"scheduledDate"`
		Title             string    `json:"title"`
		Body              string    `json:"body"`
		Pinned            bool      `json:"pinned"`
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
	var tagsValue any
	if input.Tags != nil {
		tags, tagErr := normalizeNoteTags(*input.Tags)
		if tagErr != nil {
			writeError(w, 400, tagErr.Error())
			return
		}
		data, _ := json.Marshal(tags)
		tagsValue = string(data)
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось начать сохранение")
		return
	}
	defer tx.Rollback()
	var previousVersion string
	if err := tx.QueryRowContext(r.Context(), `SELECT updated_at FROM personal_notes WHERE id = ? AND owner_id = ? AND archived_at IS NULL`, r.PathValue("id"), user.ID).Scan(&previousVersion); err != nil {
		writeError(w, http.StatusNotFound, "Заметка не найдена")
		return
	}
	if input.ExpectedUpdatedAt != "" && input.ExpectedUpdatedAt != previousVersion {
		writeError(w, http.StatusConflict, "Заметка изменена в другом окне. Черновик сохранён; откройте актуальную версию.")
		return
	}
	if input.FolderID != nil && !noteFolderExists(r.Context(), tx, user.ID, *input.FolderID) {
		writeError(w, 404, "Папка не найдена")
		return
	}
	result, err := tx.ExecContext(r.Context(), `UPDATE personal_notes SET title = ?, body = ?, pinned = ?, updated_at = ?, scheduled_date = COALESCE(?, scheduled_date), title_generated = ?,folder_id = CASE WHEN ? IS NULL THEN folder_id ELSE NULLIF(?,'') END,tags_json=COALESCE(?,tags_json) WHERE id = ? AND owner_id = ? AND archived_at IS NULL AND updated_at = ?`, input.Title, strings.TrimSpace(input.Body), boolInt(input.Pinned), now, input.ScheduledDate, titleGenerated, input.FolderID, input.FolderID, tagsValue, r.PathValue("id"), user.ID, previousVersion)
	if err != nil {
		writeError(w, 500, "Не удалось сохранить заметку")
		return
	}
	if affectedRows(result) == 0 {
		writeError(w, 409, "Заметка изменена. Откройте актуальную версию.")
		return
	}
	note, err := scanPersonalNote(tx.QueryRowContext(r.Context(), personalNoteSelect+` WHERE n.id=? AND n.owner_id=? AND n.archived_at IS NULL`, r.PathValue("id"), user.ID))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось прочитать заметку")
		return
	}
	if tx.Commit() != nil {
		writeError(w, 500, "Не удалось завершить сохранение")
		return
	}
	writeJSON(w, http.StatusOK, note)
}

func (s *Server) handleArchivePersonalNote(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ExpectedUpdatedAt string `json:"expectedUpdatedAt"`
	}
	if r.ContentLength != 0 && !decodeJSON(w, r, &input) {
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось открыть заметку")
		return
	}
	defer tx.Rollback()
	var version string
	if tx.QueryRowContext(r.Context(), `SELECT updated_at FROM personal_notes WHERE id=? AND owner_id=? AND archived_at IS NULL`, r.PathValue("id"), currentUser(r).ID).Scan(&version) != nil {
		writeError(w, 404, "Заметка не найдена")
		return
	}
	if input.ExpectedUpdatedAt != "" && input.ExpectedUpdatedAt != version {
		writeError(w, 409, "Заметка изменилась. Обновите её перед архивированием")
		return
	}
	now := nowText()
	if _, err = tx.ExecContext(r.Context(), `UPDATE personal_notes SET archived_at=?,updated_at=? WHERE id=? AND owner_id=?`, now, now, r.PathValue("id"), currentUser(r).ID); err != nil || tx.Commit() != nil {
		writeError(w, 500, "Не удалось перенести в архив")
		return
	}
	// Links stay active but are hidden by personalTargetTitle while the note is
	// archived. Restoring the same ID makes them visible without guessing which
	// previously removed links the user wanted to restore.
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleCreatePersonalPlan(w http.ResponseWriter, r *http.Request) {
	var input personalPlanInput
	if !decodeJSON(w, r, &input) {
		return
	}
	if !validateCreateRequestKey(w, r, &input.RequestKey) {
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
	plan, err = applyPersonalPlanInput(plan, input)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	rule, err := recurrenceForCreate(input.Recurrence, plan)
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
	plan.ID, plan.Title, plan.Notes, plan.Status, plan.CreatedAt, plan.UpdatedAt = id, input.Title, strings.TrimSpace(input.Notes), "planned", now, now
	plan.TitleGenerated = titleGenerated
	if rule != nil {
		plan.SeriesID, plan.OccurrenceDate, plan.OccurrenceState = id, rule.StartDate, "scheduled"
		rule.SeriesID, rule.UpdatedAt = id, now
		plan.Recurrence = rule
	}
	hashPlan := plan
	hashPlan.ID, hashPlan.CreatedAt, hashPlan.UpdatedAt, hashPlan.SeriesID = "", "", "", ""
	hashPlan.Recurrence = nil
	var hashRule *PersonalRecurrenceRule
	if rule != nil {
		copy := *rule
		copy.SeriesID, copy.UpdatedAt = "", ""
		hashRule = &copy
	}
	payloadHash, err := createPayloadHash(struct {
		Plan       PersonalPlan
		Recurrence *PersonalRecurrenceRule
	}{hashPlan, hashRule})
	if err != nil {
		writeError(w, 400, "Некорректный план")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось начать сохранение плана")
		return
	}
	defer tx.Rollback()
	existing, err := lookupPersonalCreate(r.Context(), tx, user.ID, "plan", input.RequestKey, payloadHash)
	if err != nil {
		writeCreateReceiptError(w, err)
		return
	}
	if existing != "" {
		writePersonalCreateReplay(w, r, tx, "plan", existing)
		return
	}
	if err := validatePersonalPlanReferences(r.Context(), tx, user.ID, &plan, ""); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_plans(id,owner_id,title,notes,due_at,status,completed_at,created_at,updated_at,start_date,end_date,color_key,title_generated,item_kind,project_id,goal_id,parent_id,planned_minutes,actual_minutes,starts_at,ends_at,series_id,occurrence_date,occurrence_state) VALUES(?,?,?,?,?,'planned',NULL,?,?,?,?,?,?,?,NULLIF(?,''),NULLIF(?,''),NULLIF(?,''),?,?,?,?,?,?,?)`, id, user.ID, plan.Title, plan.Notes, plan.DueAt, now, now, plan.StartDate, plan.EndDate, plan.ColorKey, titleGenerated, plan.ItemKind, plan.ProjectID, plan.GoalID, plan.ParentID, plan.PlannedMinutes, plan.ActualMinutes, plan.StartsAt, plan.EndsAt, plan.SeriesID, plan.OccurrenceDate, plan.OccurrenceState)
	if err == nil && rule != nil {
		_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_recurrence_rules(series_id,owner_id,cadence,interval_count,timezone,start_date,until_date,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`, id, user.ID, rule.Cadence, rule.Interval, rule.Timezone, rule.StartDate, rule.UntilDate, boolInt(rule.Active), now, now)
		if err == nil {
			err = savePersonalRecurrenceTemplate(r.Context(), tx, user.ID, id, plan, now)
		}
		if err == nil {
			_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_recurrence_instances(plan_id,series_id,owner_id,scheduled_date) VALUES(?,?,?,?)`, id, id, user.ID, rule.StartDate)
		}
		template := recurrenceTemplate(plan)
		rule.Template = &template
	}
	if err == nil {
		err = recordPersonalCreate(r.Context(), tx, user.ID, "plan", input.RequestKey, payloadHash, id, now)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить план")
		return
	}
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
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать сохранение плана")
		return
	}
	defer tx.Rollback()
	current, err := loadPersonalPlan(r.Context(), tx, user.ID, r.PathValue("id"))
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
	plan, err = applyPersonalPlanInput(plan, input)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if plan.SeriesID != "" && plan.OccurrenceDate != current.OccurrenceDate && samePersonalCalendarFields(plan, current) {
		var zone string
		if err = tx.QueryRowContext(r.Context(), `SELECT timezone FROM personal_recurrence_rules WHERE series_id=? AND owner_id=?`, plan.SeriesID, user.ID).Scan(&zone); err != nil {
			writeError(w, 500, "Не удалось прочитать часовой пояс серии")
			return
		}
		moved, err := projectPersonalRecurrence(current, plan.OccurrenceDate, zone)
		if err != nil {
			writeError(w, 400, "Не удалось перенести время экземпляра")
			return
		}
		plan.DueAt, plan.StartsAt, plan.EndsAt = moved.DueAt, moved.StartsAt, moved.EndsAt
		plan.StartDate, plan.EndDate = moved.StartDate, moved.EndDate
	}

	if err := validatePersonalPlanReferences(r.Context(), tx, user.ID, &plan, current.ID); err != nil {
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
	result, err := tx.ExecContext(r.Context(), `UPDATE personal_plans SET title=?,notes=?,due_at=?,status=?,completed_at=?,updated_at=?,start_date=?,end_date=?,color_key=?,title_generated=?,item_kind=?,project_id=NULLIF(?,''),goal_id=NULLIF(?,''),parent_id=NULLIF(?,''),planned_minutes=?,actual_minutes=?,starts_at=?,ends_at=?,occurrence_date=?,occurrence_state=? WHERE id=? AND owner_id=? AND status<>'archived' AND updated_at=?`, input.Title, strings.TrimSpace(input.Notes), plan.DueAt, input.Status, completedAt, now, plan.StartDate, plan.EndDate, plan.ColorKey, titleGenerated, plan.ItemKind, plan.ProjectID, plan.GoalID, plan.ParentID, plan.PlannedMinutes, plan.ActualMinutes, plan.StartsAt, plan.EndsAt, plan.OccurrenceDate, plan.OccurrenceState, r.PathValue("id"), user.ID, current.UpdatedAt)
	if err != nil || affectedRows(result) == 0 {
		writeError(w, http.StatusConflict, "План изменён. Откройте актуальную версию.")
		return
	}
	plan.ID, plan.Title, plan.Notes, plan.Status, plan.CompletedAt, plan.UpdatedAt = r.PathValue("id"), input.Title, strings.TrimSpace(input.Notes), input.Status, completedAt, now
	plan.TitleGenerated = titleGenerated
	if input.Status == "done" && current.Status != "done" {
		if err := s.spawnNextPersonalOccurrence(r.Context(), tx, user.ID, plan, now); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось создать следующий экземпляр")
			return
		}
	}
	if current.SeriesID != "" {
		var recurrence PersonalRecurrenceRule
		var active int
		if err := tx.QueryRowContext(r.Context(), `SELECT series_id,cadence,interval_count,timezone,start_date,until_date,active,updated_at FROM personal_recurrence_rules WHERE series_id=? AND owner_id=?`, current.SeriesID, user.ID).Scan(&recurrence.SeriesID, &recurrence.Cadence, &recurrence.Interval, &recurrence.Timezone, &recurrence.StartDate, &recurrence.UntilDate, &active, &recurrence.UpdatedAt); err == nil {
			recurrence.Active = active == 1
			plan.Recurrence = &recurrence
		}
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить план")
		return
	}
	writeJSON(w, http.StatusOK, plan)
}

func (s *Server) handleArchivePersonalPlan(w http.ResponseWriter, r *http.Request) {
	s.archivePersonalEntity(w, r, "plan", `UPDATE personal_plans SET status = 'archived', updated_at = ? WHERE id = ? AND owner_id = ? AND status <> 'archived'`, "План не найден")
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
