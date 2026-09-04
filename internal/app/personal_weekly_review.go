package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"
)

const personalReviewLimit = 50

type personalReviewChoice struct {
	ID         string `json:"id"`
	WeekStart  string `json:"weekStart"`
	SourceKind string `json:"sourceKind"`
	SourceID   string `json:"sourceId"`
	Action     string `json:"action"`
	Note       string `json:"note"`
	Revision   int    `json:"revision"`
	CreatedAt  string `json:"createdAt"`
	UpdatedAt  string `json:"updatedAt"`
}

type personalReviewItem struct {
	SourceKind   string                `json:"sourceKind"`
	SourceID     string                `json:"sourceId"`
	Kind         string                `json:"kind"`
	Title        string                `json:"title"`
	Reason       string                `json:"reason,omitempty"`
	Result       string                `json:"result,omitempty"`
	Date         string                `json:"date,omitempty"`
	Context      string                `json:"context,omitempty"`
	WorkspaceID  string                `json:"workspaceId,omitempty"`
	Workspace    string                `json:"workspace,omitempty"`
	Actual       int                   `json:"actualMinutes,omitempty"`
	Recorded     int                   `json:"recorded,omitempty"`
	Success      int                   `json:"success,omitempty"`
	Partial      int                   `json:"partial,omitempty"`
	Failed       int                   `json:"failed,omitempty"`
	Skipped      int                   `json:"skipped,omitempty"`
	TotalValue   float64               `json:"totalValue,omitempty"`
	Unit         string                `json:"unit,omitempty"`
	ExpectedDate string                `json:"expectedDate,omitempty"`
	WaitingFor   string                `json:"waitingFor,omitempty"`
	Choice       *personalReviewChoice `json:"choice,omitempty"`
}

type personalReviewSection struct {
	Items   []personalReviewItem `json:"items"`
	Total   int                  `json:"total"`
	HasMore bool                 `json:"hasMore"`
}

type personalReviewResponse struct {
	WeekStart        string                `json:"weekStart"`
	WeekEnd          string                `json:"weekEnd"`
	NextWeekStart    string                `json:"nextWeekStart"`
	Today            string                `json:"today"`
	CompletedPlans   personalReviewSection `json:"completedPlans"`
	CompletedRecords personalReviewSection `json:"completedRecords"`
	HabitResults     personalReviewSection `json:"habitResults"`
	Waiting          personalReviewSection `json:"waiting"`
	Stalled          personalReviewSection `json:"stalled"`
	Unlinked         personalReviewSection `json:"unlinked"`
	Decisions        personalReviewSection `json:"decisions"`
	Risks            personalReviewSection `json:"risks"`
	Candidates       int                   `json:"candidates"`
	Reviewed         int                   `json:"reviewed"`
}

type reviewWeek struct {
	Start, End, Next, Today string
	StartUTC, NextUTC       string
}

func monday(date time.Time) time.Time {
	return date.AddDate(0, 0, -(int(date.Weekday())+6)%7)
}

func (s *Server) personalReviewWeek(r *http.Request, value string) (reviewWeek, error) {
	settings, err := loadDaySettings(s.store.db, r)
	if err != nil {
		return reviewWeek{}, err
	}
	loc, err := time.LoadLocation(settings.Timezone)
	if err != nil {
		return reviewWeek{}, err
	}
	now := time.Now().In(loc)
	today := now.Format("2006-01-02")
	if value == "" {
		value = today
	}
	if !validDate(value) {
		return reviewWeek{}, errors.New("Некорректная неделя")
	}
	selected, _ := time.ParseInLocation("2006-01-02", value, loc)
	start := monday(selected)
	current := monday(time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc))
	if start.After(current) {
		return reviewWeek{}, errors.New("Будущая неделя ещё не началась")
	}
	next := start.AddDate(0, 0, 7)
	return reviewWeek{
		Start: start.Format("2006-01-02"), End: start.AddDate(0, 0, 6).Format("2006-01-02"),
		Next: next.Format("2006-01-02"), Today: today,
		StartUTC: start.UTC().Format(time.RFC3339Nano), NextUTC: next.UTC().Format(time.RFC3339Nano),
	}, nil
}

func limitedReview(items []personalReviewItem, total int) personalReviewSection {
	more := len(items) > personalReviewLimit || total > personalReviewLimit
	if len(items) > personalReviewLimit {
		items = items[:personalReviewLimit]
	}
	if items == nil {
		items = []personalReviewItem{}
	}
	return personalReviewSection{Items: items, Total: total, HasMore: more}
}

func (s *Server) reviewCompletedPlans(r *http.Request, owner int64, week reviewWeek) (personalReviewSection, error) {
	var total int
	err := s.store.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM personal_plans WHERE owner_id=? AND status='done' AND completed_at>=? AND completed_at<?`, owner, week.StartUTC, week.NextUTC).Scan(&total)
	if err != nil {
		return personalReviewSection{}, err
	}
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT p.id,p.title,p.item_kind,p.actual_minutes,p.completed_at,COALESCE(g.title,''),COALESCE(pr.title,'') FROM personal_plans p LEFT JOIN personal_goals g ON g.id=p.goal_id AND g.owner_id=p.owner_id LEFT JOIN personal_projects pr ON pr.id=p.project_id AND pr.owner_id=p.owner_id WHERE p.owner_id=? AND p.status='done' AND p.completed_at>=? AND p.completed_at<? ORDER BY p.completed_at DESC,p.id LIMIT ?`, owner, week.StartUTC, week.NextUTC, personalReviewLimit+1)
	if err != nil {
		return personalReviewSection{}, err
	}
	defer rows.Close()
	items := []personalReviewItem{}
	for rows.Next() {
		var item personalReviewItem
		var goal, project string
		item.SourceKind = "plan"
		if err = rows.Scan(&item.SourceID, &item.Title, &item.Kind, &item.Actual, &item.Date, &goal, &project); err != nil {
			return personalReviewSection{}, err
		}
		if goal != "" {
			item.Context = goal
		} else {
			item.Context = project
		}
		items = append(items, item)
	}
	if err = rows.Err(); err != nil {
		return personalReviewSection{}, err
	}
	return limitedReview(items, total), nil
}

const reviewWorkspaceAccess = ` JOIN workspaces w ON w.id=r.workspace_id JOIN workspace_members wm ON wm.workspace_id=w.id WHERE wm.user_id=? AND wm.status='active' AND w.kind='team' AND w.archived_at IS NULL AND (w.team_id IS NULL OR EXISTS (SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id=t.id WHERE t.id=w.team_id AND t.deleted_at IS NULL AND tm.user_id=wm.user_id AND tm.status='active'))`

func (s *Server) reviewCompletedRecords(r *http.Request, owner int64, week reviewWeek) (personalReviewSection, error) {
	condition := reviewWorkspaceAccess + ` AND r.status='completed' AND r.completed_at>=? AND r.completed_at<?`
	var total int
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM records r`+condition, owner, week.StartUTC, week.NextUTC).Scan(&total); err != nil {
		return personalReviewSection{}, err
	}
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT r.id,CASE WHEN r.business_kind<>'' THEN r.business_kind WHEN r.subtype='question_set' THEN 'question_set' WHEN r.record_kind='meeting' THEN 'meeting' ELSE r.type END,r.title,r.result,r.completed_at,w.id,w.name FROM records r`+condition+` ORDER BY r.completed_at DESC,r.id LIMIT ?`, owner, week.StartUTC, week.NextUTC, personalReviewLimit+1)
	if err != nil {
		return personalReviewSection{}, err
	}
	defer rows.Close()
	items := []personalReviewItem{}
	for rows.Next() {
		var item personalReviewItem
		item.SourceKind = "record"
		if err = rows.Scan(&item.SourceID, &item.Kind, &item.Title, &item.Result, &item.Date, &item.WorkspaceID, &item.Workspace); err != nil {
			return personalReviewSection{}, err
		}
		items = append(items, item)
	}
	if err = rows.Err(); err != nil {
		return personalReviewSection{}, err
	}
	return limitedReview(items, total), nil
}

func (s *Server) reviewHabits(r *http.Request, owner int64, week reviewWeek) (personalReviewSection, error) {
	var total int
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT COUNT(DISTINCT h.id) FROM personal_habits h JOIN personal_habit_checkins c ON c.habit_id=h.id AND c.owner_id=h.owner_id WHERE h.owner_id=? AND c.checkin_date>=? AND c.checkin_date<=?`, owner, week.Start, week.End).Scan(&total); err != nil {
		return personalReviewSection{}, err
	}
	// The regular tracker keeps compact all-time history to calculate streaks. A
	// weekly review does not need that history: select at most 51 matching habits
	// and only the rules and facts that can affect these seven civil dates.
	rows, err := s.store.db.QueryContext(r.Context(), `WITH chosen AS (
	 SELECT h.id,h.title,h.unit,h.start_date,h.timezone,COALESCE(h.archived_at,'') archived_at,MAX(c.checkin_date) latest
	 FROM personal_habits h JOIN personal_habit_checkins c ON c.habit_id=h.id AND c.owner_id=h.owner_id
	 WHERE h.owner_id=? AND c.checkin_date>=? AND c.checkin_date<=?
	 GROUP BY h.id,h.title,h.unit,h.start_date,h.timezone,h.archived_at
	 ORDER BY latest DESC,h.id LIMIT ?
	)
	SELECT h.id,h.title,h.unit,h.start_date,h.timezone,h.archived_at,
	 COALESCE((SELECT json_group_array(json(rule)) FROM (SELECT json_set(config,'$.effectiveDate',effective_date) rule FROM personal_habit_rules WHERE habit_id=h.id AND effective_date<=? ORDER BY effective_date)),'[]'),
	 COALESCE((SELECT json_group_array(json_object('id',id,'startDate',start_date,'endDate',end_date,'reason',reason)) FROM personal_habit_pauses WHERE habit_id=h.id AND start_date<=? AND (end_date='' OR end_date>=?)),'[]'),
	 COALESCE((SELECT json_group_array(json_object('sourceDate',source_date,'targetDate',target_date)) FROM personal_habit_moves WHERE habit_id=h.id AND ((source_date>=? AND source_date<=?) OR (target_date>=? AND target_date<=?))),'[]'),
	 COALESCE((SELECT json_group_array(json_object('date',checkin_date,'value',COALESCE(amount,value),'state',result_state,'snoozedAt',snoozed_at)) FROM personal_habit_checkins WHERE habit_id=h.id AND owner_id=? AND checkin_date>=? AND checkin_date<=?),'[]')
	FROM chosen h ORDER BY h.latest DESC,h.id`, owner, week.Start, week.End, personalReviewLimit+1,
		week.End, week.End, week.Start, week.Start, week.End, week.Start, week.End, owner, week.Start, week.End)
	if err != nil {
		return personalReviewSection{}, err
	}
	defer rows.Close()
	items := []personalReviewItem{}
	for rows.Next() {
		var habit PersonalHabit
		var rules, pauses, moves, checkins string
		if err = rows.Scan(&habit.ID, &habit.Title, &habit.Unit, &habit.StartDate, &habit.Timezone, &habit.ArchivedAt, &rules, &pauses, &moves, &checkins); err != nil {
			return personalReviewSection{}, err
		}
		if err = json.Unmarshal([]byte(rules), &habit.Rules); err != nil {
			return personalReviewSection{}, err
		}
		if err = json.Unmarshal([]byte(pauses), &habit.Pauses); err != nil {
			return personalReviewSection{}, err
		}
		if err = json.Unmarshal([]byte(moves), &habit.Moves); err != nil {
			return personalReviewSection{}, err
		}
		if err = json.Unmarshal([]byte(checkins), &habit.Checkins); err != nil {
			return personalReviewSection{}, err
		}
		tracker := buildHabitTracker(habit, week.Start, week.End, habitToday(habit))
		items = append(items, personalReviewItem{
			SourceKind: "habit", SourceID: habit.ID, Kind: "habit", Title: habit.Title,
			Recorded: len(tracker.Habit.Checkins), Success: tracker.Summary.Success,
			Partial: tracker.Summary.Partial, Failed: tracker.Summary.Failed,
			Skipped: tracker.Summary.Skipped, TotalValue: tracker.Summary.Total, Unit: habit.Unit,
		})
	}
	if err = rows.Err(); err != nil {
		return personalReviewSection{}, err
	}
	return limitedReview(items, total), nil
}

func (s *Server) reviewWaiting(r *http.Request, owner int64, week reviewWeek) (personalReviewSection, error) {
	var total int
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM personal_waiting WHERE owner_id=? AND status='waiting'`, owner).Scan(&total); err != nil {
		return personalReviewSection{}, err
	}
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT id,title,waiting_for,expected_date,since_date,COALESCE(plan_id,'') FROM personal_waiting WHERE owner_id=? AND status='waiting' ORDER BY CASE WHEN expected_date<>'' AND expected_date<? THEN 0 ELSE 1 END,CASE WHEN expected_date='' THEN 1 ELSE 0 END,expected_date,since_date,id LIMIT ?`, owner, week.Today, personalReviewLimit+1)
	if err != nil {
		return personalReviewSection{}, err
	}
	defer rows.Close()
	items := []personalReviewItem{}
	for rows.Next() {
		var item personalReviewItem
		var since, plan string
		item.SourceKind, item.Kind = "waiting", "waiting"
		if err = rows.Scan(&item.SourceID, &item.Title, &item.WaitingFor, &item.ExpectedDate, &since, &plan); err != nil {
			return personalReviewSection{}, err
		}
		item.Date = since
		switch {
		case item.ExpectedDate == "":
			item.Reason = "Дата ответа не назначена"
		case item.ExpectedDate < week.Today:
			item.Reason = "Ожидаемая дата прошла"
		case item.ExpectedDate == week.Today:
			item.Reason = "Ответ ожидается сегодня"
		default:
			item.Reason = "Ответ ещё ожидается"
		}
		items = append(items, item)
	}
	if err = rows.Err(); err != nil {
		return personalReviewSection{}, err
	}
	return limitedReview(items, total), nil
}

func planReviewDate(due *string, end, occurrence string) string {
	if due != nil && len(*due) >= 10 {
		return (*due)[:10]
	}
	if occurrence != "" {
		return occurrence
	}
	return end
}

func (s *Server) reviewStalledPlans(r *http.Request, owner int64, week reviewWeek) (personalReviewSection, error) {
	condition := ` FROM personal_plans p LEFT JOIN personal_goals g ON g.id=p.goal_id AND g.owner_id=p.owner_id LEFT JOIN personal_projects pr ON pr.id=p.project_id AND pr.owner_id=p.owner_id WHERE p.owner_id=? AND p.status='planned' AND ((p.due_at IS NOT NULL AND substr(p.due_at,1,10)<?) OR (p.occurrence_date<>'' AND p.occurrence_date<?) OR (p.end_date<>'' AND p.end_date<?) OR (p.updated_at<? AND p.created_at<?))`
	var total int
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT COUNT(*)`+condition, owner, week.Today, week.Today, week.Today, week.StartUTC, week.StartUTC).Scan(&total); err != nil {
		return personalReviewSection{}, err
	}
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT p.id,p.title,p.item_kind,p.due_at,p.end_date,p.occurrence_date,p.updated_at,COALESCE(g.title,''),COALESCE(pr.title,'')`+condition+` ORDER BY CASE WHEN (p.due_at IS NOT NULL AND substr(p.due_at,1,10)<?) OR (p.occurrence_date<>'' AND p.occurrence_date<?) OR (p.end_date<>'' AND p.end_date<?) THEN 0 ELSE 1 END,p.updated_at,p.id LIMIT ?`, owner, week.Today, week.Today, week.Today, week.StartUTC, week.StartUTC, week.Today, week.Today, week.Today, personalReviewLimit+1)
	if err != nil {
		return personalReviewSection{}, err
	}
	defer rows.Close()
	items := []personalReviewItem{}
	for rows.Next() {
		var item personalReviewItem
		var due *string
		var end, occurrence, updated, goal, project string
		item.SourceKind = "plan"
		if err = rows.Scan(&item.SourceID, &item.Title, &item.Kind, &due, &end, &occurrence, &updated, &goal, &project); err != nil {
			return personalReviewSection{}, err
		}
		item.Date = planReviewDate(due, end, occurrence)
		if item.Date != "" && item.Date < week.Today {
			item.Reason = "Запланированная дата прошла"
		} else {
			item.Reason = "Не менялось с начала недели"
		}
		if goal != "" {
			item.Context = goal
		} else {
			item.Context = project
		}
		items = append(items, item)
	}
	if err = rows.Err(); err != nil {
		return personalReviewSection{}, err
	}
	return limitedReview(items, total), nil
}

func (s *Server) reviewUnlinkedPlans(r *http.Request, owner int64, week reviewWeek) (personalReviewSection, error) {
	condition := ` FROM personal_plans p WHERE p.owner_id=? AND p.status='planned' AND p.project_id IS NULL AND p.goal_id IS NULL AND p.parent_id IS NULL AND p.created_at<? AND p.updated_at<? AND NOT EXISTS (SELECT 1 FROM personal_links l WHERE l.owner_id=p.owner_id AND l.active=1 AND ((l.source_type='plan' AND l.source_id=p.id) OR (l.target_type='plan' AND l.target_id=p.id)))`
	var total int
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT COUNT(*)`+condition, owner, week.StartUTC, week.StartUTC).Scan(&total); err != nil {
		return personalReviewSection{}, err
	}
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT p.id,p.title,p.item_kind,p.updated_at`+condition+` ORDER BY p.updated_at,p.id LIMIT ?`, owner, week.StartUTC, week.StartUTC, personalReviewLimit+1)
	if err != nil {
		return personalReviewSection{}, err
	}
	defer rows.Close()
	items := []personalReviewItem{}
	for rows.Next() {
		var item personalReviewItem
		item.SourceKind, item.Reason = "plan", "Нет проекта, цели, родителя или активной связи"
		if err = rows.Scan(&item.SourceID, &item.Title, &item.Kind, &item.Date); err != nil {
			return personalReviewSection{}, err
		}
		items = append(items, item)
	}
	if err = rows.Err(); err != nil {
		return personalReviewSection{}, err
	}
	return limitedReview(items, total), nil
}

func noNextActionSQL() string {
	return ` AND NOT EXISTS (SELECT 1 FROM record_links l JOIN records next ON next.id=CASE WHEN l.source_id=r.id THEN l.target_id ELSE l.source_id END WHERE l.active=1 AND (l.source_id=r.id OR l.target_id=r.id) AND next.id<>r.id AND next.type='task' AND next.status NOT IN ('completed','cancelled','archived','rejected'))`
}

func (s *Server) reviewTeamSignals(r *http.Request, owner int64, kind string) (personalReviewSection, error) {
	condition := reviewWorkspaceAccess
	if kind == "decision" {
		condition += ` AND r.type='decision' AND r.status NOT IN ('archived','cancelled','rejected') AND COALESCE(b.decision_state,'active') IN ('active','review')`
	} else {
		condition += ` AND r.business_kind='risk' AND r.status NOT IN ('completed','archived','cancelled','rejected')`
	}
	condition += noNextActionSQL()
	from := ` FROM records r LEFT JOIN record_business_details b ON b.record_id=r.id` + condition
	var total int
	if err := s.store.db.QueryRowContext(r.Context(), `SELECT COUNT(*)`+from, owner).Scan(&total); err != nil {
		return personalReviewSection{}, err
	}
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT r.id,r.title,COALESCE(NULLIF(r.result,''),r.description),r.updated_at,w.id,w.name`+from+` ORDER BY CASE WHEN COALESCE(b.review_at,'')<>'' AND b.review_at<? THEN 0 ELSE 1 END,r.updated_at,r.id LIMIT ?`, owner, nowText(), personalReviewLimit+1)
	if err != nil {
		return personalReviewSection{}, err
	}
	defer rows.Close()
	items := []personalReviewItem{}
	for rows.Next() {
		var item personalReviewItem
		item.SourceKind, item.Kind = "record", kind
		item.Reason = "Нет связанной незавершённой задачи следующего действия"
		if err = rows.Scan(&item.SourceID, &item.Title, &item.Result, &item.Date, &item.WorkspaceID, &item.Workspace); err != nil {
			return personalReviewSection{}, err
		}
		items = append(items, item)
	}
	if err = rows.Err(); err != nil {
		return personalReviewSection{}, err
	}
	return limitedReview(items, total), nil
}

func scanReviewChoice(scanner interface{ Scan(...any) error }) (personalReviewChoice, error) {
	var choice personalReviewChoice
	err := scanner.Scan(&choice.ID, &choice.WeekStart, &choice.SourceKind, &choice.SourceID, &choice.Action, &choice.Note, &choice.Revision, &choice.CreatedAt, &choice.UpdatedAt)
	return choice, err
}

const reviewChoiceSelect = `SELECT id,week_start,source_kind,source_id,action,note,revision,created_at,updated_at FROM personal_review_choices`

func (s *Server) reviewChoices(ctx context.Context, owner int64, week string) (map[string]*personalReviewChoice, error) {
	rows, err := s.store.db.QueryContext(ctx, reviewChoiceSelect+` WHERE owner_id=? AND week_start=?`, owner, week)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	choices := map[string]*personalReviewChoice{}
	for rows.Next() {
		choice, scanErr := scanReviewChoice(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		copy := choice
		choices[choice.SourceKind+":"+choice.SourceID] = &copy
	}
	return choices, rows.Err()
}

func attachReviewChoices(response *personalReviewResponse, choices map[string]*personalReviewChoice) {
	sections := []*personalReviewSection{&response.Waiting, &response.Stalled, &response.Unlinked, &response.Decisions, &response.Risks}
	candidates, reviewed := map[string]bool{}, map[string]bool{}
	for _, section := range sections {
		for index := range section.Items {
			item := &section.Items[index]
			key := item.SourceKind + ":" + item.SourceID
			candidates[key] = true
			if choice := choices[key]; choice != nil {
				copy := *choice
				item.Choice = &copy
				reviewed[key] = true
			}
		}
	}
	response.Candidates, response.Reviewed = len(candidates), len(reviewed)
}

func (s *Server) handlePersonalReview(w http.ResponseWriter, r *http.Request) {
	week, err := s.personalReviewWeek(r, strings.TrimSpace(r.URL.Query().Get("week")))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	owner := currentUser(r).ID
	response := personalReviewResponse{WeekStart: week.Start, WeekEnd: week.End, NextWeekStart: week.Next, Today: week.Today}
	loaders := []struct {
		name   string
		target *personalReviewSection
		load   func() (personalReviewSection, error)
	}{
		{"completed plans", &response.CompletedPlans, func() (personalReviewSection, error) { return s.reviewCompletedPlans(r, owner, week) }},
		{"completed records", &response.CompletedRecords, func() (personalReviewSection, error) { return s.reviewCompletedRecords(r, owner, week) }},
		{"habit results", &response.HabitResults, func() (personalReviewSection, error) { return s.reviewHabits(r, owner, week) }},
		{"waiting", &response.Waiting, func() (personalReviewSection, error) { return s.reviewWaiting(r, owner, week) }},
		{"stalled", &response.Stalled, func() (personalReviewSection, error) { return s.reviewStalledPlans(r, owner, week) }},
		{"unlinked", &response.Unlinked, func() (personalReviewSection, error) { return s.reviewUnlinkedPlans(r, owner, week) }},
		{"decisions", &response.Decisions, func() (personalReviewSection, error) { return s.reviewTeamSignals(r, owner, "decision") }},
		{"risks", &response.Risks, func() (personalReviewSection, error) { return s.reviewTeamSignals(r, owner, "risk") }},
	}
	for _, loader := range loaders {
		section, loadErr := loader.load()
		if loadErr != nil {
			log.Printf("personal weekly review %s: %v", loader.name, loadErr)
			writeError(w, http.StatusInternalServerError, "Не удалось собрать недельный обзор")
			return
		}
		*loader.target = section
	}
	choices, err := s.reviewChoices(r.Context(), owner, week.Start)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось прочитать решения обзора")
		return
	}
	attachReviewChoices(&response, choices)
	writeJSON(w, http.StatusOK, response)
}

type reviewChoiceInput struct {
	Action           string `json:"action"`
	Note             string `json:"note"`
	ExpectedRevision int    `json:"expectedRevision"`
	RequestKey       string `json:"requestKey"`
}

func reviewSourceExists(ctx context.Context, q personalQueryer, owner int64, kind, id string) bool {
	var found int
	switch kind {
	case "plan":
		return q.QueryRowContext(ctx, `SELECT 1 FROM personal_plans WHERE id=? AND owner_id=? AND status<>'archived'`, id, owner).Scan(&found) == nil
	case "waiting":
		return q.QueryRowContext(ctx, `SELECT 1 FROM personal_waiting WHERE id=? AND owner_id=?`, id, owner).Scan(&found) == nil
	case "record":
		return q.QueryRowContext(ctx, `SELECT 1 FROM records r`+reviewWorkspaceAccess+` AND r.id=? AND r.status NOT IN ('archived','cancelled','rejected')`, owner, id).Scan(&found) == nil
	default:
		return false
	}
}

func readReviewChoice(ctx context.Context, q personalQueryer, owner int64, week, kind, id string) (personalReviewChoice, error) {
	return scanReviewChoice(q.QueryRowContext(ctx, reviewChoiceSelect+` WHERE owner_id=? AND week_start=? AND source_kind=? AND source_id=?`, owner, week, kind, id))
}

func (s *Server) handlePersonalReviewChoice(w http.ResponseWriter, r *http.Request) {
	owner, kind, id := currentUser(r).ID, r.PathValue("kind"), r.PathValue("id")
	week, err := s.personalReviewWeek(r, r.PathValue("week"))
	if err != nil || week.Start != r.PathValue("week") {
		writeError(w, http.StatusBadRequest, "Укажите понедельник недели обзора")
		return
	}
	var input reviewChoiceInput
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Note = strings.TrimSpace(input.Note)
	if !oneOf(kind, "plan", "waiting", "record") || !oneOf(input.Action, "next_week", "skip", "postpone", "fix") || len([]rune(input.Note)) > 1000 || input.ExpectedRevision < 0 || len(input.RequestKey) < 16 || len(input.RequestKey) > 100 {
		writeError(w, http.StatusBadRequest, "Проверьте решение, заметку и версию")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить решение обзора")
		return
	}
	defer tx.Rollback()
	if !reviewSourceExists(r.Context(), tx, owner, kind, id) {
		writeError(w, http.StatusNotFound, "Источник обзора не найден")
		return
	}
	var replayChoice string
	err = tx.QueryRowContext(r.Context(), `SELECT choice_id FROM personal_review_choice_events WHERE owner_id=? AND request_key=?`, owner, input.RequestKey).Scan(&replayChoice)
	if err == nil {
		choice, readErr := scanReviewChoice(tx.QueryRowContext(r.Context(), reviewChoiceSelect+` WHERE id=? AND owner_id=?`, replayChoice, owner))
		if readErr != nil || choice.WeekStart != week.Start || choice.SourceKind != kind || choice.SourceID != id {
			writeError(w, http.StatusConflict, "Ключ запроса уже использован для другого решения")
			return
		}
		writeJSON(w, http.StatusOK, choice)
		return
	}
	if !errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "Не удалось проверить повтор решения")
		return
	}
	current, err := readReviewChoice(r.Context(), tx, owner, week.Start, kind, id)
	creating := errors.Is(err, sql.ErrNoRows)
	if err != nil && !creating {
		writeError(w, http.StatusInternalServerError, "Не удалось прочитать решение обзора")
		return
	}
	if creating && input.ExpectedRevision != 0 || !creating && input.ExpectedRevision != current.Revision {
		writeError(w, http.StatusConflict, "Решение обзора изменено в другом окне")
		return
	}
	if !creating && current.Action == input.Action && current.Note == input.Note {
		if _, err = tx.ExecContext(r.Context(), `INSERT INTO personal_review_choice_events(choice_id,owner_id,old_action,new_action,request_key,happened_at) VALUES(?,?,?,?,?,?)`, current.ID, owner, current.Action, current.Action, input.RequestKey, nowText()); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось сохранить повтор решения")
			return
		}
		if err = tx.Commit(); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось сохранить повтор решения")
			return
		}
		writeJSON(w, http.StatusOK, current)
		return
	}
	now := nowText()
	oldAction := ""
	choiceID := current.ID
	if creating {
		var ok bool
		choiceID, ok = newPersonalID(w)
		if !ok {
			return
		}
		_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_review_choices(id,owner_id,week_start,source_kind,source_id,action,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`, choiceID, owner, week.Start, kind, id, input.Action, input.Note, now, now)
	} else {
		oldAction = current.Action
		result, updateErr := tx.ExecContext(r.Context(), `UPDATE personal_review_choices SET action=?,note=?,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=?`, input.Action, input.Note, now, choiceID, owner, current.Revision)
		err = updateErr
		if err == nil && affectedRows(result) != 1 {
			writeError(w, http.StatusConflict, "Решение обзора изменено в другом окне")
			return
		}
	}
	if err == nil {
		_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_review_choice_events(choice_id,owner_id,old_action,new_action,request_key,happened_at) VALUES(?,?,?,?,?,?)`, choiceID, owner, oldAction, input.Action, input.RequestKey, now)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить решение обзора")
		return
	}
	choice, err := readReviewChoice(r.Context(), s.store.db, owner, week.Start, kind, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Решение сохранено, но не перечитано")
		return
	}
	writeJSON(w, http.StatusOK, choice)
}
