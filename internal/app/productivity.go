package app

import (
	"context"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

type TeamCapacity struct {
	User                  User `json:"user"`
	WeeklyCapacityMinutes int  `json:"weeklyCapacityMinutes"`
	ScheduledMinutes      int  `json:"scheduledMinutes"`
	UnscheduledMinutes    int  `json:"unscheduledMinutes"`
	DueThisWeek           int  `json:"dueThisWeek"`
	UnscheduledRecords    int  `json:"unscheduledRecords"`
	UtilizationPercent    int  `json:"utilizationPercent"`
}

type QualityIssue struct {
	Code       string `json:"code"`
	Severity   string `json:"severity"`
	RecordID   string `json:"recordId"`
	RecordType string `json:"recordType"`
	Title      string `json:"title"`
	Message    string `json:"message"`
}

type QualityReport struct {
	GeneratedAt string         `json:"generatedAt"`
	Counts      map[string]int `json:"counts"`
	Issues      []QualityIssue `json:"issues"`
}

type qualityRecord struct {
	ID            string
	Type          string
	CollectionID  string
	Title         string
	Status        string
	ParentID      string
	IsRoot        bool
	Result        string
	UpdatedAt     string
	ReviewAt      string
	SourceExcerpt string
	LinkCount     int
}

func weekBounds(now time.Time) (time.Time, time.Time) {
	location, err := time.LoadLocation("Europe/Moscow")
	if err != nil {
		location = time.FixedZone("Europe/Moscow", 3*60*60)
	}
	localNow := now.In(location)
	weekday := (int(localNow.Weekday()) + 6) % 7
	start := time.Date(localNow.Year(), localNow.Month(), localNow.Day(), 0, 0, 0, 0, location).AddDate(0, 0, -weekday)
	return start.UTC(), start.AddDate(0, 0, 7).UTC()
}

func (s *Server) listTeamCapacity(r *http.Request) ([]TeamCapacity, error) {
	start, end := weekBounds(time.Now())
	rows, err := s.store.db.QueryContext(r.Context(), `
		SELECT u.id, u.username, u.display_name, u.bio, u.created_at, u.avatar_stored_name, u.avatar_updated_at, COALESCE(c.weekly_minutes, 0),
			COALESCE(SUM(CASE WHEN rec.due_at >= ? AND rec.due_at < ? THEN rec.estimate_minutes ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN rec.due_at IS NULL THEN rec.estimate_minutes ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN rec.due_at >= ? AND rec.due_at < ? THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN rec.due_at IS NULL THEN 1 ELSE 0 END), 0)
		FROM users u
		LEFT JOIN user_work_capacity c ON c.user_id = u.id
		LEFT JOIN records rec ON rec.owner_id = u.id
			AND rec.workspace_id = ?
			AND rec.status NOT IN ('completed', 'cancelled', 'archived', 'rejected')
			AND (rec.type IN ('task', 'research', 'disagreement') OR rec.subtype = 'question_set' OR rec.record_kind = 'meeting' OR rec.business_kind IN ('risk', 'hypothesis', 'experiment'))
		JOIN workspace_members member ON member.user_id = u.id AND member.workspace_id = ? AND member.status = 'active'
		GROUP BY u.id, u.username, u.display_name, u.bio, u.created_at, u.avatar_stored_name, u.avatar_updated_at, c.weekly_minutes
		ORDER BY u.username`, start.Format(time.RFC3339Nano), end.Format(time.RFC3339Nano), start.Format(time.RFC3339Nano), end.Format(time.RFC3339Nano), currentWorkspace(r).ID, currentWorkspace(r).ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]TeamCapacity, 0)
	for rows.Next() {
		var item TeamCapacity
		var avatarStoredName, avatarUpdatedAt string
		if err := rows.Scan(&item.User.ID, &item.User.Username, &item.User.DisplayName, &item.User.Bio, &item.User.CreatedAt, &avatarStoredName, &avatarUpdatedAt, &item.WeeklyCapacityMinutes, &item.ScheduledMinutes, &item.UnscheduledMinutes, &item.DueThisWeek, &item.UnscheduledRecords); err != nil {
			return nil, err
		}
		setUserAvatar(&item.User, avatarStoredName, avatarUpdatedAt)
		if item.WeeklyCapacityMinutes > 0 {
			item.UtilizationPercent = item.ScheduledMinutes * 100 / item.WeeklyCapacityMinutes
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Server) handleTeamCapacity(w http.ResponseWriter, r *http.Request) {
	items, err := s.listTeamCapacity(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось рассчитать недельную загрузку")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) handleUpdateUserCapacity(w http.ResponseWriter, r *http.Request) {
	userID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Некорректный участник")
		return
	}
	if userID != currentUser(r).ID {
		writeError(w, http.StatusForbidden, "Недельную ёмкость каждый участник задаёт в своём профиле")
		return
	}
	var input struct {
		WeeklyMinutes int `json:"weeklyMinutes"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.WeeklyMinutes < 0 || input.WeeklyMinutes > 10080 {
		writeError(w, http.StatusBadRequest, "Недельная ёмкость должна быть от 0 до 10080 минут")
		return
	}
	now := nowText()
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать сохранение")
		return
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(r.Context(), `INSERT INTO user_work_capacity(user_id, weekly_minutes, updated_at) VALUES(?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET weekly_minutes = excluded.weekly_minutes, updated_at = excluded.updated_at`, userID, input.WeeklyMinutes, now); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить недельную ёмкость")
		return
	}
	if err := writeActivity(r.Context(), tx, userID, "user", strconv.FormatInt(userID, 10), "capacity_updated", "", map[string]any{"weeklyMinutes": input.WeeklyMinutes}); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось записать изменение ёмкости")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось завершить сохранение")
		return
	}
	items, err := s.listTeamCapacity(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Ёмкость сохранена, но сводка не загрузилась")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func publicRecordType(databaseType, subtype, recordKind, businessKind string) string {
	if businessKind != "" {
		return businessKind
	}
	if subtype == "question_set" {
		return "question_set"
	}
	if recordKind == "meeting" {
		return "meeting"
	}
	return databaseType
}

func (s *Server) loadQualityRecords(r *http.Request) ([]qualityRecord, error) {
	rows, err := s.store.db.QueryContext(r.Context(), `
		SELECT r.id, r.type, r.subtype, r.record_kind, r.business_kind, COALESCE(r.collection_id, ''), r.title, r.status,
			COALESCE(r.parent_id, ''), r.is_root, r.result, r.updated_at,
			COALESCE(b.review_at, ''), COALESCE(b.source_excerpt_md, ''),
			(SELECT COUNT(*) FROM record_links l WHERE l.active = 1 AND (l.source_id = r.id OR l.target_id = r.id))
		FROM records r
		LEFT JOIN record_business_details b ON b.record_id = r.id
		WHERE r.workspace_id = ? AND r.status <> 'archived'`, currentWorkspace(r).ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]qualityRecord, 0)
	for rows.Next() {
		var item qualityRecord
		var databaseType, subtype, recordKind, businessKind string
		if err := rows.Scan(&item.ID, &databaseType, &subtype, &recordKind, &businessKind, &item.CollectionID, &item.Title, &item.Status, &item.ParentID, &item.IsRoot, &item.Result, &item.UpdatedAt, &item.ReviewAt, &item.SourceExcerpt, &item.LinkCount); err != nil {
			return nil, err
		}
		item.Type = publicRecordType(databaseType, subtype, recordKind, businessKind)
		items = append(items, item)
	}
	return items, rows.Err()
}

func addQualityIssue(report *QualityReport, issue QualityIssue) {
	report.Issues = append(report.Issues, issue)
	report.Counts[issue.Code]++
	report.Counts[issue.Severity]++
}

func (s *Server) handleQualityReport(w http.ResponseWriter, r *http.Request) {
	records, err := s.loadQualityRecords(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось проверить базу знаний")
		return
	}
	report := QualityReport{GeneratedAt: nowText(), Counts: map[string]int{}, Issues: make([]QualityIssue, 0)}
	byID := make(map[string]qualityRecord, len(records))
	titles := make(map[string][]qualityRecord)
	staleBefore := time.Now().UTC().AddDate(0, 0, -30)
	now := time.Now().UTC()
	for _, record := range records {
		byID[record.ID] = record
		normalizedTitle := strings.ToLower(strings.Join(strings.Fields(record.Title), " "))
		if normalizedTitle != "" && !containsString([]string{"cancelled", "rejected"}, record.Status) {
			titles[normalizedTitle] = append(titles[normalizedTitle], record)
		}
		active := record.Status != "completed" && record.Status != "cancelled" && record.Status != "rejected"
		if active && record.CollectionID == "" && record.ParentID == "" && !record.IsRoot && record.LinkCount == 0 && record.Type != "inbox" {
			addQualityIssue(&report, QualityIssue{Code: "orphan", Severity: "warning", RecordID: record.ID, RecordType: record.Type, Title: record.Title, Message: "Карточка не имеет родителя и смысловых связей"})
		}
		if record.Status == "completed" && strings.TrimSpace(record.Result) == "" && containsString([]string{"task", "research", "hypothesis", "experiment"}, record.Type) {
			addQualityIssue(&report, QualityIssue{Code: "missing_result", Severity: "critical", RecordID: record.ID, RecordType: record.Type, Title: record.Title, Message: "Работа завершена без зафиксированного результата"})
		}
		if record.ReviewAt != "" {
			if reviewAt, parseErr := time.Parse(time.RFC3339Nano, record.ReviewAt); parseErr == nil && reviewAt.Before(now) {
				addQualityIssue(&report, QualityIssue{Code: "overdue_review", Severity: "critical", RecordID: record.ID, RecordType: record.Type, Title: record.Title, Message: "Истекла дата проверки актуальности"})
			}
		}
		if containsString([]string{"draft", "inbox", "planned"}, record.Status) {
			if updatedAt, parseErr := time.Parse(time.RFC3339Nano, record.UpdatedAt); parseErr == nil && updatedAt.Before(staleBefore) {
				addQualityIssue(&report, QualityIssue{Code: "stale", Severity: "info", RecordID: record.ID, RecordType: record.Type, Title: record.Title, Message: "Карточка не менялась больше 30 дней"})
			}
		}
		if containsString([]string{"criterion", "decision"}, record.Type) && record.ParentID == "" && record.LinkCount == 0 && strings.TrimSpace(record.SourceExcerpt) == "" {
			addQualityIssue(&report, QualityIssue{Code: "missing_source", Severity: "warning", RecordID: record.ID, RecordType: record.Type, Title: record.Title, Message: "Для знания не указано происхождение"})
		}
	}
	for _, duplicates := range titles {
		if len(duplicates) < 2 {
			continue
		}
		for _, record := range duplicates {
			addQualityIssue(&report, QualityIssue{Code: "duplicate", Severity: "warning", RecordID: record.ID, RecordType: record.Type, Title: record.Title, Message: "Есть другая активная карточка с таким же названием"})
		}
	}
	for _, record := range records {
		seen := map[string]bool{record.ID: true}
		parentID := record.ParentID
		for parentID != "" {
			if seen[parentID] {
				addQualityIssue(&report, QualityIssue{Code: "cycle", Severity: "critical", RecordID: record.ID, RecordType: record.Type, Title: record.Title, Message: "В иерархии обнаружен цикл родителей"})
				break
			}
			seen[parentID] = true
			parent, ok := byID[parentID]
			if !ok {
				break
			}
			parentID = parent.ParentID
		}
	}
	severityRank := map[string]int{"critical": 0, "warning": 1, "info": 2}
	sort.SliceStable(report.Issues, func(i, j int) bool {
		if severityRank[report.Issues[i].Severity] != severityRank[report.Issues[j].Severity] {
			return severityRank[report.Issues[i].Severity] < severityRank[report.Issues[j].Severity]
		}
		return report.Issues[i].Title < report.Issues[j].Title
	})
	report.Counts["total"] = len(report.Issues)
	writeJSON(w, http.StatusOK, report)
}

func (s *Server) handleIncrementalSync(w http.ResponseWriter, r *http.Request) {
	recordsSince := strings.TrimSpace(r.URL.Query().Get("recordsSince"))
	activitySince := strings.TrimSpace(r.URL.Query().Get("activitySince"))
	if recordsSince == "" {
		recordsSince = "1970-01-01T00:00:00Z"
	}
	if activitySince == "" {
		activitySince = "1970-01-01T00:00:00Z"
	}
	if _, err := time.Parse(time.RFC3339Nano, recordsSince); err != nil {
		writeError(w, http.StatusBadRequest, "Некорректный курсор карточек")
		return
	}
	if _, err := time.Parse(time.RFC3339Nano, activitySince); err != nil {
		writeError(w, http.StatusBadRequest, "Некорректный курсор истории")
		return
	}
	if r.URL.Query().Has("pageSize") || r.URL.Query().Has("cursor") {
		s.handleSyncPages(w, r, recordsSince, activitySince)
		return
	}
	workspaceID := currentWorkspace(r).ID
	query := recordSelect + ` WHERE r.workspace_id = ? AND (julianday(r.updated_at) >= julianday(?) OR EXISTS (
		SELECT 1 FROM record_links dependency
		JOIN records target ON target.id = dependency.target_id
		WHERE dependency.source_id = r.id AND dependency.active = 1 AND dependency.relation_type = 'depends_on' AND julianday(target.updated_at) >= julianday(?)
	)) ORDER BY r.updated_at, r.id`
	rows, err := s.store.db.QueryContext(r.Context(), query, workspaceID, recordsSince, recordsSince)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось синхронизировать карточки")
		return
	}
	records := make([]Record, 0)
	for rows.Next() {
		record, scanErr := scanRecord(rows)
		if scanErr != nil {
			rows.Close()
			writeError(w, http.StatusInternalServerError, "Не удалось прочитать изменения карточек")
			return
		}
		records = append(records, record)
	}
	rows.Close()
	if err := s.attachActiveBlockers(r.Context(), records); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось обновить зависимости")
		return
	}
	if err := s.attachCustomFields(r.Context(), records); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось обновить пользовательские поля")
		return
	}
	activities, err := s.listActivitySince(r.Context(), activitySince, 200)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось синхронизировать историю")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"records": records, "activity": activities, "syncedAt": nowText(),
	})
}

func containsString(values []string, value string) bool {
	for _, item := range values {
		if item == value {
			return true
		}
	}
	return false
}

func (s *Server) listActivitySince(ctx context.Context, since string, limit int) ([]Activity, error) {
	rows, err := s.store.db.QueryContext(ctx, `SELECT a.id, a.actor_id, u.username, a.entity_type, a.entity_id, a.action, a.details_json, a.reason, a.created_at FROM activity a JOIN users u ON u.id = a.actor_id WHERE a.workspace_id = ? AND julianday(a.created_at) >= julianday(?) ORDER BY a.created_at ASC LIMIT ?`, workspaceIDFromContext(ctx), since, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Activity, 0)
	for rows.Next() {
		var item Activity
		var details string
		if err := rows.Scan(&item.ID, &item.ActorID, &item.ActorUsername, &item.EntityType, &item.EntityID, &item.Action, &details, &item.Reason, &item.CreatedAt); err != nil {
			return nil, err
		}
		item.Details = decodePublicActivityDetails(item.Action, details)
		items = append(items, item)
	}
	return items, rows.Err()
}
