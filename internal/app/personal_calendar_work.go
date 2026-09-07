package app

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"time"
)

type calendarWorkItem struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	WorkspaceID string `json:"workspaceId"`
	Workspace   string `json:"workspace"`
	Kind        string `json:"kind"`
	Status      string `json:"status"`
	DueAt       string `json:"dueAt"`
	StartsAt    string `json:"startsAt"`
	EndsAt      string `json:"endsAt"`
	UpdatedAt   string `json:"updatedAt"`
}
type calendarBusyItem struct {
	ID          string    `json:"id"`
	Kind        string    `json:"kind"`
	Title       string    `json:"title"`
	WorkspaceID string    `json:"workspaceId,omitempty"`
	Workspace   string    `json:"workspace,omitempty"`
	Start       time.Time `json:"start"`
	End         time.Time `json:"end"`
}
type calendarConflict struct {
	ID        string             `json:"id"`
	Items     []calendarBusyItem `json:"items"`
	Start     time.Time          `json:"start"`
	End       time.Time          `json:"end"`
	Confirmed bool               `json:"confirmed"`
}
type calendarOverview struct {
	Work      []calendarWorkItem `json:"work"`
	Conflicts []calendarConflict `json:"conflicts"`
}
type calendarQueryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func calendarPeriod(r *http.Request) (time.Time, time.Time, *time.Location, error) {
	from, to, zone := r.URL.Query().Get("from"), r.URL.Query().Get("to"), r.URL.Query().Get("timezone")
	if zone == "" {
		zone = "UTC"
	}
	if !validDate(from) || !validDate(to) || len(zone) > 64 || zone == "Local" {
		return time.Time{}, time.Time{}, nil, errors.New("Укажите даты календаря и часовой пояс")
	}
	loc, err := time.LoadLocation(zone)
	if err != nil {
		return time.Time{}, time.Time{}, nil, errors.New("Неизвестный часовой пояс")
	}
	start, _ := time.ParseInLocation("2006-01-02", from, loc)
	end, _ := time.ParseInLocation("2006-01-02", to, loc)
	if !end.After(start) || end.Sub(start) > 94*24*time.Hour {
		return start, end, loc, errors.New("Период календаря должен быть от одного до 93 дней")
	}
	return start, end, loc, nil
}

func calendarConflictPairs(items []calendarBusyItem, start, end time.Time) []calendarConflict {
	sort.Slice(items, func(i, j int) bool { return items[i].Start.Before(items[j].Start) })
	out := []calendarConflict{}
	for i, a := range items {
		for _, b := range items[i+1:] {
			if !b.Start.Before(a.End) {
				break
			}
			left, right := maxDayTime(a.Start, b.Start), minDayTime(a.End, b.End)
			if !left.Before(right) || !left.Before(end) || !right.After(start) {
				continue
			}
			pair := []calendarBusyItem{a, b}
			sort.Slice(pair, func(i, j int) bool { return pair[i].Kind+":"+pair[i].ID < pair[j].Kind+":"+pair[j].ID })
			// Exact source intervals, not labels or the visible range, identify consent.
			keys := [][]string{}
			for _, item := range pair {
				keys = append(keys, []string{item.Kind, item.ID, item.Start.UTC().Format(time.RFC3339Nano), item.End.UTC().Format(time.RFC3339Nano)})
			}
			raw, _ := json.Marshal(keys)
			digest := sha256.Sum256(raw)
			out = append(out, calendarConflict{ID: hex.EncodeToString(digest[:]), Items: pair, Start: left, End: right})
		}
	}
	return out
}

func (s *Server) readCalendarOverview(ctx context.Context, q calendarQueryer, owner int64, start, end time.Time, loc *time.Location) (calendarOverview, error) {
	out := calendarOverview{Work: []calendarWorkItem{}, Conflicts: []calendarConflict{}}
	busy := []calendarBusyItem{}
	rows, err := q.QueryContext(ctx, `SELECT r.id,r.title,w.id,w.name,`+projectDayKindSQL()+`,CASE WHEN r.progress>=100 AND r.status<>'review' THEN 'completed' ELSE r.status END,COALESCE(r.due_at,''),COALESCE(b.starts_at,''),COALESCE(b.ends_at,''),COALESCE(b.updated_at,'') FROM records r LEFT JOIN personal_calendar_work_blocks b ON b.record_id=r.id AND b.owner_id=?`+reviewWorkspaceAccess+` AND r.owner_id=? AND r.status NOT IN ('archived','cancelled','rejected','postponed') ORDER BY w.name,r.title,r.id`, owner, owner, owner)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var item calendarWorkItem
		if err = rows.Scan(&item.ID, &item.Title, &item.WorkspaceID, &item.Workspace, &item.Kind, &item.Status, &item.DueAt, &item.StartsAt, &item.EndsAt, &item.UpdatedAt); err != nil {
			rows.Close()
			return out, err
		}
		out.Work = append(out.Work, item)
		a, ea := time.Parse(time.RFC3339Nano, item.StartsAt)
		b, eb := time.Parse(time.RFC3339Nano, item.EndsAt)
		if ea == nil && eb == nil && b.After(a) && a.Before(end) && b.After(start) && item.Status != "completed" {
			busy = append(busy, calendarBusyItem{ID: item.ID, Kind: "work", Title: item.Title, WorkspaceID: item.WorkspaceID, Workspace: item.Workspace, Start: a, End: b})
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return out, err
	}
	rows, err = q.QueryContext(ctx, `SELECT id,title,item_kind,start_date,end_date,starts_at,ends_at FROM personal_plans WHERE owner_id=? AND status NOT IN ('archived','done') AND occurrence_state<>'skipped'`, owner)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var id, title, kind, from, to string
		var a, b *string
		if err = rows.Scan(&id, &title, &kind, &from, &to, &a, &b); err != nil {
			rows.Close()
			return out, err
		}
		left, right := parseDayTime(a), parseDayTime(b)
		if left.IsZero() && kind == "event" && validDate(from) {
			if to == "" {
				to = from
			}
			left, _ = time.ParseInLocation("2006-01-02", from, loc)
			last, _ := time.ParseInLocation("2006-01-02", to, loc)
			right = last.AddDate(0, 0, 1)
		}
		if !left.IsZero() && right.After(left) && left.Before(end) && right.After(start) {
			busy = append(busy, calendarBusyItem{ID: id, Kind: "personal", Title: title, Start: left, End: right})
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return out, err
	}
	out.Conflicts = calendarConflictPairs(busy, start, end)
	rows, err = q.QueryContext(ctx, `SELECT fingerprint FROM personal_calendar_confirmations WHERE owner_id=?`, owner)
	if err != nil {
		return out, err
	}
	accepted := map[string]bool{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return out, err
		}
		accepted[id] = true
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return out, err
	}
	for i := range out.Conflicts {
		out.Conflicts[i].Confirmed = accepted[out.Conflicts[i].ID]
	}
	return out, nil
}

func (s *Server) handlePersonalCalendar(w http.ResponseWriter, r *http.Request) {
	start, end, loc, err := calendarPeriod(r)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	out, err := s.readCalendarOverview(r.Context(), s.store.db, currentUser(r).ID, start, end, loc)
	if err != nil {
		writeError(w, 500, "Не удалось проверить занятость календаря")
		return
	}
	writeJSON(w, 200, out)
}

func (s *Server) handleCalendarWorkBlock(w http.ResponseWriter, r *http.Request) {
	var input struct {
		StartsAt          string `json:"startsAt"`
		EndsAt            string `json:"endsAt"`
		ExpectedUpdatedAt string `json:"expectedUpdatedAt"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	a, ea := time.Parse(time.RFC3339Nano, input.StartsAt)
	b, eb := time.Parse(time.RFC3339Nano, input.EndsAt)
	clear := input.StartsAt == "" && input.EndsAt == ""
	if !clear && (ea != nil || eb != nil || !b.After(a) || b.Sub(a) > 31*24*time.Hour) {
		writeError(w, 400, "Укажите начало и окончание позже начала, не более 31 дня")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось сохранить время")
		return
	}
	defer tx.Rollback()
	owner := currentUser(r).ID
	id := r.PathValue("id")
	var found string
	err = tx.QueryRowContext(r.Context(), `SELECT r.id FROM records r`+reviewWorkspaceAccess+` AND r.owner_id=? AND r.id=? AND `+personalDayActiveProjectRecord, owner, owner, id).Scan(&found)
	if err != nil {
		if err == sql.ErrNoRows {
			writeError(w, 404, "Работа больше не назначена вам или недоступна")
		} else {
			writeError(w, 500, "Не удалось проверить доступ")
		}
		return
	}
	var version string
	err = tx.QueryRowContext(r.Context(), `SELECT updated_at FROM personal_calendar_work_blocks WHERE owner_id=? AND record_id=?`, owner, id).Scan(&version)
	if err != nil && err != sql.ErrNoRows {
		writeError(w, 500, "Не удалось прочитать время")
		return
	}
	if version != input.ExpectedUpdatedAt {
		writeError(w, 409, "Время уже изменено. Обновите календарь и сравните значения")
		return
	}
	if clear {
		_, err = tx.ExecContext(r.Context(), `DELETE FROM personal_calendar_work_blocks WHERE owner_id=? AND record_id=?`, owner, id)
	} else {
		_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_calendar_work_blocks(owner_id,record_id,starts_at,ends_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(owner_id,record_id) DO UPDATE SET starts_at=excluded.starts_at,ends_at=excluded.ends_at,updated_at=excluded.updated_at`, owner, id, a.UTC().Format(time.RFC3339Nano), b.UTC().Format(time.RFC3339Nano), nowText())
	}
	if err != nil {
		writeError(w, 500, "Не удалось сохранить время")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, 500, "Не удалось сохранить время")
		return
	}
	writeJSON(w, 200, map[string]bool{"saved": true})
}

func (s *Server) handleCalendarConfirmation(w http.ResponseWriter, r *http.Request) {
	start, end, loc, err := calendarPeriod(r)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	var input struct {
		ID        string `json:"id"`
		Confirmed bool   `json:"confirmed"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось подтвердить пересечение")
		return
	}
	defer tx.Rollback()
	out, err := s.readCalendarOverview(r.Context(), tx, currentUser(r).ID, start, end, loc)
	if err != nil {
		writeError(w, 500, "Не удалось проверить текущее расписание")
		return
	}
	found := false
	for _, item := range out.Conflicts {
		if item.ID == input.ID {
			found = true
			break
		}
	}
	if !found {
		writeError(w, 409, "Расписание изменилось. Проверьте актуальные пересечения")
		return
	}
	if input.Confirmed {
		_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_calendar_confirmations(owner_id,fingerprint,confirmed_at) VALUES(?,?,?) ON CONFLICT(owner_id,fingerprint) DO NOTHING`, currentUser(r).ID, input.ID, nowText())
	} else {
		_, err = tx.ExecContext(r.Context(), `DELETE FROM personal_calendar_confirmations WHERE owner_id=? AND fingerprint=?`, currentUser(r).ID, input.ID)
	}
	if err != nil {
		writeError(w, 500, "Не удалось сохранить подтверждение")
		return
	}
	if err = tx.Commit(); err != nil {
		writeError(w, 500, "Не удалось сохранить подтверждение")
		return
	}
	writeJSON(w, 200, map[string]bool{"saved": true})
}
