package app

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type personalWaiting struct {
	ID           string  `json:"id"`
	Title        string  `json:"title"`
	WaitingFor   string  `json:"waitingFor"`
	Notes        string  `json:"notes"`
	SinceDate    string  `json:"sinceDate"`
	ExpectedDate string  `json:"expectedDate"`
	Status       string  `json:"status"`
	PlanID       string  `json:"planId,omitempty"`
	PlanTitle    string  `json:"planTitle,omitempty"`
	Revision     int     `json:"revision"`
	CreatedAt    string  `json:"createdAt"`
	UpdatedAt    string  `json:"updatedAt"`
	ClosedAt     *string `json:"closedAt"`
	Overdue      bool    `json:"overdue"`
}
type waitingEvent struct {
	ID              int64  `json:"id"`
	Action          string `json:"action"`
	OldStatus       string `json:"oldStatus"`
	NewStatus       string `json:"newStatus"`
	OldExpectedDate string `json:"oldExpectedDate"`
	NewExpectedDate string `json:"newExpectedDate"`
	HappenedAt      string `json:"happenedAt"`
}

type waitingPingRecipient struct {
	UserID      int64  `json:"userId"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
}

type waitingPingTarget struct {
	WorkspaceID   string                 `json:"workspaceId"`
	WorkspaceName string                 `json:"workspaceName"`
	Recipients    []waitingPingRecipient `json:"recipients"`
}

type waitingPing struct {
	ID                   string `json:"id"`
	WorkspaceID          string `json:"workspaceId"`
	WorkspaceName        string `json:"workspaceName"`
	RecipientID          int64  `json:"recipientId"`
	RecipientUsername    string `json:"recipientUsername"`
	RecipientDisplayName string `json:"recipientDisplayName"`
	IncludeTitle         bool   `json:"includeTitle"`
	Message              string `json:"message"`
	CreatedAt            string `json:"createdAt"`
}

func scanWaitingPing(scanner interface{ Scan(...any) error }) (waitingPing, error) {
	var item waitingPing
	err := scanner.Scan(&item.ID, &item.WorkspaceID, &item.WorkspaceName, &item.RecipientID, &item.RecipientUsername, &item.RecipientDisplayName, &item.IncludeTitle, &item.Message, &item.CreatedAt)
	return item, err
}

func waitingPingMessage(username, workspaceName, waitingTitle string, includeTitle bool) string {
	message := fmt.Sprintf("@%s ждёт вашего ответа в «%s»", username, workspaceName)
	if includeTitle {
		message += fmt.Sprintf(": «%s»", waitingTitle)
	}
	return message
}

func (s *Server) waitingPingData(ctx context.Context, owner int64, includeTargets bool) ([]waitingPingTarget, error) {
	targets := []waitingPingTarget{}
	if includeTargets {
		rows, err := s.store.db.QueryContext(ctx, `SELECT workspace.id,workspace.name,recipient.user_id,user.username,user.display_name
			FROM workspaces workspace
			JOIN workspace_members sender ON sender.workspace_id=workspace.id AND sender.user_id=? AND sender.status='active' AND sender.role IN ('owner','admin','member')
			JOIN workspace_members recipient ON recipient.workspace_id=workspace.id AND recipient.user_id<>? AND recipient.status='active' AND recipient.role IN ('owner','admin','member')
			JOIN users user ON user.id=recipient.user_id
			WHERE workspace.kind='team' AND workspace.archived_at IS NULL
			AND (workspace.team_id IS NULL OR (EXISTS(SELECT 1 FROM teams team JOIN team_members member ON member.team_id=team.id WHERE team.id=workspace.team_id AND team.deleted_at IS NULL AND member.user_id=sender.user_id AND member.status='active')
			AND EXISTS(SELECT 1 FROM team_members member WHERE member.team_id=workspace.team_id AND member.user_id=recipient.user_id AND member.status='active')))
			ORDER BY lower(workspace.name),workspace.id,lower(COALESCE(NULLIF(user.display_name,''),user.username)),user.id LIMIT 500`, owner, owner)
		if err != nil {
			return nil, err
		}
		byWorkspace := map[string]int{}
		for rows.Next() {
			var workspaceID, workspaceName string
			var recipient waitingPingRecipient
			if err = rows.Scan(&workspaceID, &workspaceName, &recipient.UserID, &recipient.Username, &recipient.DisplayName); err != nil {
				rows.Close()
				return nil, err
			}
			index, exists := byWorkspace[workspaceID]
			if !exists {
				index = len(targets)
				byWorkspace[workspaceID] = index
				targets = append(targets, waitingPingTarget{WorkspaceID: workspaceID, WorkspaceName: workspaceName, Recipients: []waitingPingRecipient{}})
			}
			targets[index].Recipients = append(targets[index].Recipients, recipient)
		}
		if err = rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		if err = rows.Close(); err != nil {
			return nil, err
		}
	}
	return targets, nil
}

func (s *Server) waitingPings(ctx context.Context, owner int64, waitingID string) ([]waitingPing, error) {
	rows, err := s.store.db.QueryContext(ctx, `SELECT ping.id,ping.workspace_id,workspace.name,ping.recipient_id,user.username,user.display_name,ping.include_title,ping.message,ping.created_at
		FROM personal_waiting_pings ping JOIN workspaces workspace ON workspace.id=ping.workspace_id JOIN users user ON user.id=ping.recipient_id
		WHERE ping.waiting_id=? AND ping.owner_id=? ORDER BY ping.created_at DESC,ping.id DESC LIMIT 100`, waitingID, owner)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []waitingPing{}
	for rows.Next() {
		item, scanErr := scanWaitingPing(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func scanWaiting(scanner interface{ Scan(...any) error }, today string) (personalWaiting, error) {
	var x personalWaiting
	var plan sql.NullString
	err := scanner.Scan(&x.ID, &x.Title, &x.WaitingFor, &x.Notes, &x.SinceDate, &x.ExpectedDate, &x.Status, &x.PlanID, &x.Revision, &x.CreatedAt, &x.UpdatedAt, &x.ClosedAt, &plan)
	if plan.Valid {
		x.PlanTitle = plan.String
	}
	x.Overdue = x.Status == "waiting" && x.ExpectedDate != "" && x.ExpectedDate < today
	return x, err
}

const waitingSelect = `SELECT x.id,x.title,x.waiting_for,x.notes,x.since_date,x.expected_date,x.status,COALESCE(x.plan_id,''),x.revision,x.created_at,x.updated_at,x.closed_at,p.title FROM personal_waiting x LEFT JOIN personal_plans p ON p.id=x.plan_id AND p.owner_id=x.owner_id AND p.status<>'archived'`

func (s *Server) waitingToday(r *http.Request) (string, error) {
	settings, err := loadDaySettings(s.store.db, r)
	if err != nil {
		return "", err
	}
	loc, err := time.LoadLocation(settings.Timezone)
	if err != nil {
		return "", err
	}
	return time.Now().In(loc).Format("2006-01-02"), nil
}

func (s *Server) handlePersonalWaiting(w http.ResponseWriter, r *http.Request) {
	owner := currentUser(r).ID
	if r.Method == http.MethodPost {
		s.createPersonalWaiting(w, r)
		return
	}
	today, err := s.waitingToday(r)
	if err != nil {
		writeError(w, 400, "Не удалось определить сегодняшний день")
		return
	}
	page, size := 1, 20
	if v := r.URL.Query().Get("page"); v != "" {
		page, _ = strconv.Atoi(v)
	}
	if v := r.URL.Query().Get("pageSize"); v != "" {
		size, _ = strconv.Atoi(v)
	}
	if page < 1 || page > 500 || size < 1 || size > 50 {
		writeError(w, 400, "Проверьте номер страницы")
		return
	}
	status := r.URL.Query().Get("status")
	if status == "" {
		status = "waiting"
	}
	if !oneOf(status, "waiting", "received", "cancelled", "all") {
		writeError(w, 400, "Проверьте статус ожидания")
		return
	}
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if len([]rune(query)) > 160 {
		writeError(w, 400, "Сократите поисковый запрос")
		return
	}
	where := " WHERE x.owner_id=?"
	args := []any{owner}
	if status != "all" {
		where += " AND x.status=?"
		args = append(args, status)
	}
	if query != "" {
		where += " AND (x.title LIKE ? OR x.waiting_for LIKE ? OR x.notes LIKE ?)"
		pattern := "%" + query + "%"
		args = append(args, pattern, pattern, pattern)
	}
	var total int
	if err = s.store.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM personal_waiting x`+where, args...).Scan(&total); err != nil {
		writeError(w, 500, "Не удалось посчитать ожидания")
		return
	}
	args = append(args, size, (page-1)*size)
	rows, err := s.store.db.QueryContext(r.Context(), waitingSelect+where+` ORDER BY CASE WHEN x.status='waiting' AND x.expected_date<>'' AND x.expected_date<? THEN 0 ELSE 1 END,CASE WHEN x.expected_date='' THEN 1 ELSE 0 END,x.expected_date,x.since_date,x.id LIMIT ? OFFSET ?`, append(args[:len(args)-2], append([]any{today}, args[len(args)-2:]...)...)...)
	if err != nil {
		writeError(w, 500, "Не удалось прочитать ожидания")
		return
	}
	items := []personalWaiting{}
	for rows.Next() {
		item, e := scanWaiting(rows, today)
		if e != nil {
			rows.Close()
			writeError(w, 500, "Не удалось прочитать ожидание")
			return
		}
		items = append(items, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		writeError(w, 500, "Не удалось дочитать ожидания")
		return
	}
	var overdue int
	s.store.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM personal_waiting WHERE owner_id=? AND status='waiting' AND expected_date<>'' AND expected_date<?`, owner, today).Scan(&overdue)
	writeJSON(w, 200, map[string]any{"items": items, "total": total, "page": page, "pageSize": size, "overdue": overdue, "today": today})
}

func (s *Server) handlePersonalWaitingToday(w http.ResponseWriter, r *http.Request) {
	owner := currentUser(r).ID
	today, err := s.waitingToday(r)
	if err != nil {
		writeError(w, 400, "Не удалось определить сегодняшний день")
		return
	}
	rows, err := s.store.db.QueryContext(r.Context(), waitingSelect+` WHERE x.owner_id=? AND x.status='waiting' ORDER BY CASE WHEN x.expected_date<>'' AND x.expected_date<? THEN 0 ELSE 1 END,CASE WHEN x.expected_date='' THEN 1 ELSE 0 END,x.expected_date,x.since_date,x.id LIMIT 7`, owner, today)
	if err != nil {
		writeError(w, 500, "Не удалось прочитать ожидания дня")
		return
	}
	defer rows.Close()
	items := []personalWaiting{}
	for rows.Next() {
		item, e := scanWaiting(rows, today)
		if e != nil {
			writeError(w, 500, "Не удалось прочитать ожидание")
			return
		}
		items = append(items, item)
	}
	more := len(items) > 6
	if more {
		items = items[:6]
	}
	writeJSON(w, 200, map[string]any{"items": items, "hasMore": more, "today": today})
}

type waitingInput struct {
	Title            string `json:"title"`
	WaitingFor       string `json:"waitingFor"`
	Notes            string `json:"notes"`
	SinceDate        string `json:"sinceDate"`
	ExpectedDate     string `json:"expectedDate"`
	PlanID           string `json:"planId"`
	Status           string `json:"status"`
	ExpectedRevision int    `json:"expectedRevision"`
	RequestKey       string `json:"requestKey"`
}

func validWaitingInput(in waitingInput) bool {
	return strings.TrimSpace(in.Title) != "" && len([]rune(in.Title)) <= 160 && strings.TrimSpace(in.WaitingFor) != "" && len([]rune(in.WaitingFor)) <= 160 && len([]rune(in.Notes)) <= 5000 && validDate(in.SinceDate) && (in.ExpectedDate == "" || validDate(in.ExpectedDate) && in.ExpectedDate >= in.SinceDate) && len(in.RequestKey) >= 16 && len(in.RequestKey) <= 100
}
func (s *Server) waitingPlanOK(r *http.Request, owner int64, id string) bool {
	if id == "" {
		return true
	}
	var n int
	return s.store.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM personal_plans WHERE id=? AND owner_id=? AND status<>'archived'`, id, owner).Scan(&n) == nil && n == 1
}
func (s *Server) createPersonalWaiting(w http.ResponseWriter, r *http.Request) {
	owner := currentUser(r).ID
	var in waitingInput
	if !decodeJSON(w, r, &in) {
		return
	}
	in.Title = strings.TrimSpace(in.Title)
	in.WaitingFor = strings.TrimSpace(in.WaitingFor)
	in.Notes = strings.TrimSpace(in.Notes)
	if !validWaitingInput(in) || !s.waitingPlanOK(r, owner, in.PlanID) {
		writeError(w, 400, "Заполните ожидание, от кого и корректные даты")
		return
	}
	today, dayErr := s.waitingToday(r)
	if dayErr != nil {
		writeError(w, 400, "Не удалось определить сегодняшний день")
		return
	}
	if in.SinceDate > today {
		writeError(w, 400, "Ожидание не может начаться в будущем")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось создать ожидание")
		return
	}
	defer tx.Rollback()
	var oldID string
	err = tx.QueryRowContext(r.Context(), `SELECT waiting_id FROM personal_waiting_events WHERE owner_id=? AND request_key=?`, owner, in.RequestKey).Scan(&oldID)
	if err == nil {
		item, e := readWaiting(r.Context(), tx, owner, oldID, today)
		if e != nil {
			writeError(w, 500, "Не удалось прочитать ожидание")
			return
		}
		writeJSON(w, 200, item)
		return
	}
	if err != sql.ErrNoRows {
		writeError(w, 500, "Не удалось проверить повтор")
		return
	}
	id, ok := newPersonalID(w)
	if !ok {
		return
	}
	now := nowText()
	var plan any = nil
	if in.PlanID != "" {
		plan = in.PlanID
	}
	_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_waiting(id,owner_id,title,waiting_for,notes,since_date,expected_date,plan_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`, id, owner, in.Title, in.WaitingFor, in.Notes, in.SinceDate, in.ExpectedDate, plan, now, now)
	if err == nil {
		_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_waiting_events(waiting_id,owner_id,action,old_status,new_status,old_expected_date,new_expected_date,request_key,happened_at) VALUES(?,?,'create','','waiting','',?,?,?)`, id, owner, in.ExpectedDate, in.RequestKey, now)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, 500, "Не удалось создать ожидание")
		return
	}
	item, _ := readWaiting(r.Context(), s.store.db, owner, id, today)
	writeJSON(w, 201, item)
}

func readWaiting(ctx context.Context, q personalQueryer, owner int64, id, today string) (personalWaiting, error) {
	return scanWaiting(q.QueryRowContext(ctx, waitingSelect+` WHERE x.id=? AND x.owner_id=?`, id, owner), today)
}
func (s *Server) handlePersonalWaitingItem(w http.ResponseWriter, r *http.Request) {
	owner, id := currentUser(r).ID, r.PathValue("id")
	if r.Method == http.MethodGet {
		today, dayErr := s.waitingToday(r)
		if dayErr != nil {
			writeError(w, 400, "Не удалось определить сегодняшний день")
			return
		}
		item, err := readWaiting(r.Context(), s.store.db, owner, id, today)
		if err == sql.ErrNoRows {
			writeError(w, 404, "Ожидание не найдено")
			return
		}
		if err != nil {
			writeError(w, 500, "Не удалось прочитать ожидание")
			return
		}
		rows, err := s.store.db.QueryContext(r.Context(), `SELECT id,action,old_status,new_status,old_expected_date,new_expected_date,happened_at FROM personal_waiting_events WHERE waiting_id=? AND owner_id=? ORDER BY id DESC LIMIT 100`, id, owner)
		if err != nil {
			writeError(w, 500, "Не удалось прочитать историю")
			return
		}
		events := []waitingEvent{}
		for rows.Next() {
			var x waitingEvent
			if err = rows.Scan(&x.ID, &x.Action, &x.OldStatus, &x.NewStatus, &x.OldExpectedDate, &x.NewExpectedDate, &x.HappenedAt); err != nil {
				rows.Close()
				writeError(w, 500, "Не удалось прочитать историю")
				return
			}
			events = append(events, x)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			writeError(w, 500, "Не удалось дочитать историю")
			return
		}
		targets, err := s.waitingPingData(r.Context(), owner, item.Status == "waiting")
		if err != nil {
			writeError(w, 500, "Не удалось прочитать доступных получателей")
			return
		}
		pings, err := s.waitingPings(r.Context(), owner, id)
		if err != nil {
			writeError(w, 500, "Не удалось прочитать отправленные напоминания")
			return
		}
		writeJSON(w, 200, map[string]any{"waiting": item, "events": events, "pingTargets": targets, "pings": pings})
		return
	}
	var in waitingInput
	if !decodeJSON(w, r, &in) {
		return
	}
	in.Title = strings.TrimSpace(in.Title)
	in.WaitingFor = strings.TrimSpace(in.WaitingFor)
	in.Notes = strings.TrimSpace(in.Notes)
	if !validWaitingInput(in) || in.ExpectedRevision < 1 || !s.waitingPlanOK(r, owner, in.PlanID) {
		writeError(w, 400, "Заполните ожидание, от кого, даты и текущую версию")
		return
	}
	today, dayErr := s.waitingToday(r)
	if dayErr != nil {
		writeError(w, 400, "Не удалось определить сегодняшний день")
		return
	}
	if in.SinceDate > today {
		writeError(w, 400, "Ожидание не может начаться в будущем")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось сохранить ожидание")
		return
	}
	defer tx.Rollback()
	if replay, e := waitingReplay(r, tx, owner, id, in.RequestKey); e != nil {
		writeError(w, 500, "Не удалось проверить повтор")
		return
	} else if replay {
		item, e := readWaiting(r.Context(), tx, owner, id, today)
		if e != nil {
			writeError(w, 409, "Ожидание уже изменено")
			return
		}
		writeJSON(w, 200, item)
		return
	}
	old, err := readWaiting(r.Context(), tx, owner, id, today)
	if err == sql.ErrNoRows {
		writeError(w, 404, "Ожидание не найдено")
		return
	}
	if err != nil {
		writeError(w, 500, "Не удалось прочитать ожидание")
		return
	}
	if old.Revision != in.ExpectedRevision {
		writeError(w, 409, "Ожидание изменено в другом окне. Ваши поля сохранены.")
		return
	}
	if old.Title == in.Title && old.WaitingFor == in.WaitingFor && old.Notes == in.Notes && old.SinceDate == in.SinceDate && old.ExpectedDate == in.ExpectedDate && old.PlanID == in.PlanID {
		writeJSON(w, 200, old)
		return
	}
	action := "update"
	if old.ExpectedDate != in.ExpectedDate {
		action = "expected_changed"
	}
	now := nowText()
	var plan any = nil
	if in.PlanID != "" {
		plan = in.PlanID
	}
	result, err := tx.ExecContext(r.Context(), `UPDATE personal_waiting SET title=?,waiting_for=?,notes=?,since_date=?,expected_date=?,plan_id=?,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=?`, in.Title, in.WaitingFor, in.Notes, in.SinceDate, in.ExpectedDate, plan, now, id, owner, in.ExpectedRevision)
	if err == nil {
		var n int64
		n, _ = result.RowsAffected()
		if n != 1 {
			writeError(w, 409, "Ожидание изменено в другом окне. Ваши поля сохранены.")
			return
		}
		_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_waiting_events(waiting_id,owner_id,action,old_status,new_status,old_expected_date,new_expected_date,request_key,happened_at) VALUES(?,?,?,?,?,?,?,?,?)`, id, owner, action, old.Status, old.Status, old.ExpectedDate, in.ExpectedDate, in.RequestKey, now)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, 500, "Не удалось сохранить ожидание")
		return
	}
	item, _ := readWaiting(r.Context(), s.store.db, owner, id, today)
	writeJSON(w, 200, item)
}

type waitingPingInput struct {
	WorkspaceID      string `json:"workspaceId"`
	RecipientID      int64  `json:"recipientId"`
	IncludeTitle     bool   `json:"includeTitle"`
	Confirm          bool   `json:"confirm"`
	ExpectedRevision int    `json:"expectedRevision"`
	RequestKey       string `json:"requestKey"`
}

func (s *Server) handlePersonalWaitingPing(w http.ResponseWriter, r *http.Request) {
	owner, waitingID := currentUser(r).ID, strings.TrimSpace(r.PathValue("id"))
	var in waitingPingInput
	if !decodeJSON(w, r, &in) {
		return
	}
	in.WorkspaceID = strings.TrimSpace(in.WorkspaceID)
	in.RequestKey = strings.TrimSpace(in.RequestKey)
	if waitingID == "" || in.WorkspaceID == "" || in.RecipientID <= 0 || in.RecipientID == owner || !in.Confirm || in.ExpectedRevision < 1 || len(in.RequestKey) < 16 || len(in.RequestKey) > 100 {
		writeError(w, 400, "Выберите проект и участника, затем подтвердите отправку")
		return
	}
	today, err := s.waitingToday(r)
	if err != nil {
		writeError(w, 400, "Не удалось определить сегодняшний день")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось отправить напоминание")
		return
	}
	defer tx.Rollback()
	var existingWaiting, existingWorkspace string
	var existingRecipient int64
	var existingInclude bool
	err = tx.QueryRowContext(r.Context(), `SELECT waiting_id,workspace_id,recipient_id,include_title FROM personal_waiting_pings WHERE owner_id=? AND request_key=?`, owner, in.RequestKey).Scan(&existingWaiting, &existingWorkspace, &existingRecipient, &existingInclude)
	if err == nil {
		if existingWaiting != waitingID || existingWorkspace != in.WorkspaceID || existingRecipient != in.RecipientID || existingInclude != in.IncludeTitle {
			writeError(w, 409, "Этот ключ уже использован для другого напоминания")
			return
		}
		item, readErr := scanWaitingPing(tx.QueryRowContext(r.Context(), `SELECT ping.id,ping.workspace_id,workspace.name,ping.recipient_id,user.username,user.display_name,ping.include_title,ping.message,ping.created_at FROM personal_waiting_pings ping JOIN workspaces workspace ON workspace.id=ping.workspace_id JOIN users user ON user.id=ping.recipient_id WHERE ping.owner_id=? AND ping.request_key=?`, owner, in.RequestKey))
		if readErr != nil {
			writeError(w, 500, "Не удалось прочитать отправленное напоминание")
			return
		}
		writeJSON(w, 200, item)
		return
	}
	if err != sql.ErrNoRows {
		writeError(w, 500, "Не удалось проверить повтор отправки")
		return
	}
	waiting, err := readWaiting(r.Context(), tx, owner, waitingID, today)
	if err == sql.ErrNoRows {
		writeError(w, 404, "Ожидание не найдено")
		return
	}
	if err != nil {
		writeError(w, 500, "Не удалось прочитать ожидание")
		return
	}
	if waiting.Revision != in.ExpectedRevision {
		writeError(w, 409, "Ожидание изменено в другом окне. Проверьте текст перед отправкой.")
		return
	}
	if waiting.Status != "waiting" {
		writeError(w, 409, "Напоминание можно отправить только по активному ожиданию")
		return
	}
	var workspaceName, recipientUsername, recipientDisplayName string
	err = tx.QueryRowContext(r.Context(), `SELECT workspace.name,user.username,user.display_name
		FROM workspaces workspace
		JOIN workspace_members sender ON sender.workspace_id=workspace.id AND sender.user_id=? AND sender.status='active' AND sender.role IN ('owner','admin','member')
		JOIN workspace_members recipient ON recipient.workspace_id=workspace.id AND recipient.user_id=? AND recipient.status='active' AND recipient.role IN ('owner','admin','member')
		JOIN users user ON user.id=recipient.user_id
		WHERE workspace.id=? AND workspace.kind='team' AND workspace.archived_at IS NULL
		AND (workspace.team_id IS NULL OR (EXISTS(SELECT 1 FROM teams team JOIN team_members member ON member.team_id=team.id WHERE team.id=workspace.team_id AND team.deleted_at IS NULL AND member.user_id=sender.user_id AND member.status='active')
		AND EXISTS(SELECT 1 FROM team_members member WHERE member.team_id=workspace.team_id AND member.user_id=recipient.user_id AND member.status='active')))`, owner, in.RecipientID, in.WorkspaceID).Scan(&workspaceName, &recipientUsername, &recipientDisplayName)
	if err == sql.ErrNoRows {
		writeError(w, 403, "У вас с получателем больше нет доступа к выбранному проекту")
		return
	}
	if err != nil {
		writeError(w, 500, "Не удалось проверить права получателя")
		return
	}
	pingID, err := newID()
	if err != nil {
		writeError(w, 500, "Не удалось создать напоминание")
		return
	}
	notificationID, err := newID()
	if err != nil {
		writeError(w, 500, "Не удалось создать уведомление")
		return
	}
	message := waitingPingMessage(currentUser(r).Username, workspaceName, waiting.Title, in.IncludeTitle)
	createdAt := nowText()
	_, err = tx.ExecContext(r.Context(), `INSERT INTO notifications(id,user_id,type,title,body,entity_type,entity_id,created_at) VALUES(?,?,'waiting_ping','Напоминание об ожидании',?,'waiting_ping',?,?)`, notificationID, in.RecipientID, message, pingID, createdAt)
	if err == nil {
		_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_waiting_pings(id,waiting_id,owner_id,workspace_id,recipient_id,notification_id,include_title,message,request_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`, pingID, waitingID, owner, in.WorkspaceID, in.RecipientID, notificationID, in.IncludeTitle, message, in.RequestKey, createdAt)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, 500, "Не удалось отправить напоминание")
		return
	}
	writeJSON(w, 201, waitingPing{ID: pingID, WorkspaceID: in.WorkspaceID, WorkspaceName: workspaceName, RecipientID: in.RecipientID, RecipientUsername: recipientUsername, RecipientDisplayName: recipientDisplayName, IncludeTitle: in.IncludeTitle, Message: message, CreatedAt: createdAt})
}
func waitingReplay(r *http.Request, q personalQueryer, owner int64, id, key string) (bool, error) {
	var found string
	err := q.QueryRowContext(r.Context(), `SELECT waiting_id FROM personal_waiting_events WHERE owner_id=? AND request_key=?`, owner, key).Scan(&found)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return found == id, err
}
func (s *Server) handlePersonalWaitingAction(w http.ResponseWriter, r *http.Request) {
	owner, id := currentUser(r).ID, r.PathValue("id")
	var in waitingInput
	if !decodeJSON(w, r, &in) {
		return
	}
	if in.ExpectedRevision < 1 || len(in.RequestKey) < 16 || len(in.RequestKey) > 100 {
		writeError(w, 400, "Укажите текущую версию и ключ запроса")
		return
	}
	action := r.PathValue("action")
	target, event := "", ""
	switch action {
	case "receive":
		target, event = "received", "received"
	case "cancel":
		target, event = "cancelled", "cancelled"
	case "reopen":
		target, event = "waiting", "reopened"
	default:
		writeError(w, 404, "Действие не найдено")
		return
	}
	today, dayErr := s.waitingToday(r)
	if dayErr != nil {
		writeError(w, 400, "Не удалось определить сегодняшний день")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось изменить ожидание")
		return
	}
	defer tx.Rollback()
	if replay, e := waitingReplay(r, tx, owner, id, in.RequestKey); e != nil {
		writeError(w, 500, "Не удалось проверить повтор")
		return
	} else if replay {
		item, e := readWaiting(r.Context(), tx, owner, id, today)
		if e != nil {
			writeError(w, 409, "Ожидание уже изменено")
			return
		}
		writeJSON(w, 200, item)
		return
	}
	old, err := readWaiting(r.Context(), tx, owner, id, today)
	if err == sql.ErrNoRows {
		writeError(w, 404, "Ожидание не найдено")
		return
	}
	if err != nil {
		writeError(w, 500, "Не удалось прочитать ожидание")
		return
	}
	if old.Revision != in.ExpectedRevision {
		writeError(w, 409, "Ожидание изменено в другом окне")
		return
	}
	if old.Status == target {
		writeJSON(w, 200, old)
		return
	}
	if target == "waiting" && !oneOf(old.Status, "received", "cancelled") {
		writeError(w, 400, "Ожидание уже открыто")
		return
	}
	if target != "waiting" && old.Status != "waiting" {
		writeError(w, 400, "Сначала верните ожидание в работу")
		return
	}
	now := nowText()
	var closed any = now
	if target == "waiting" {
		closed = nil
	}
	res, err := tx.ExecContext(r.Context(), `UPDATE personal_waiting SET status=?,closed_at=?,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=?`, target, closed, now, id, owner, in.ExpectedRevision)
	if err == nil {
		n, _ := res.RowsAffected()
		if n != 1 {
			writeError(w, 409, "Ожидание изменено в другом окне")
			return
		}
		_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_waiting_events(waiting_id,owner_id,action,old_status,new_status,old_expected_date,new_expected_date,request_key,happened_at) VALUES(?,?,?,?,?,?,?,?,?)`, id, owner, event, old.Status, target, old.ExpectedDate, old.ExpectedDate, in.RequestKey, now)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, 500, "Не удалось изменить ожидание")
		return
	}
	item, _ := readWaiting(r.Context(), s.store.db, owner, id, today)
	writeJSON(w, 200, item)
}
