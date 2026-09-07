package app

import (
	"database/sql"
	"errors"
	"net/http"
	"sort"
	"time"
)

type personalDaySettings struct {
	Timezone  string `json:"timezone"`
	Start     string `json:"start"`
	End       string `json:"end"`
	UpdatedAt string `json:"updatedAt"`
}
type personalDayFocus struct {
	PlanID    string `json:"planId"`
	UpdatedAt string `json:"updatedAt"`
	Title     string `json:"title,omitempty"`
	Status    string `json:"status,omitempty"`
}
type dayWindow struct {
	Start   time.Time `json:"start"`
	End     time.Time `json:"end"`
	Minutes int       `json:"minutes"`
}
type personalDaySummary struct {
	Date                 string                    `json:"date"`
	Settings             personalDaySettings       `json:"settings"`
	Focus                personalDayFocus          `json:"focus"`
	Today                []string                  `json:"today"`
	Overdue              []string                  `json:"overdue"`
	Upcoming             []string                  `json:"upcoming"`
	Completed            []string                  `json:"completed"`
	Events               []string                  `json:"events"`
	Free                 []dayWindow               `json:"free"`
	FreeMinutes          int                       `json:"freeMinutes"`
	RemainingFree        []dayWindow               `json:"remainingFree"`
	RemainingFreeMinutes int                       `json:"remainingFreeMinutes"`
	TimeKnown            bool                      `json:"timeKnown"`
	TimeReason           string                    `json:"timeReason"`
	Unscheduled          int                       `json:"unscheduled"`
	ProjectWork          personalDayProjectSection `json:"projectWork"`
	ProjectAttention     personalDayProjectSection `json:"projectAttention"`
}

func loadDaySettings(q personalQueryer, r *http.Request) (personalDaySettings, error) {
	// The browser hint affects this read only. Saved settings take precedence.
	zone := r.URL.Query().Get("timezone")
	if zone == "" {
		zone = "UTC"
	}
	if len(zone) > 64 || zone == "Local" {
		return personalDaySettings{}, errors.New("invalid timezone")
	}
	if _, err := time.LoadLocation(zone); err != nil {
		return personalDaySettings{}, err
	}
	value := personalDaySettings{Timezone: zone}
	err := q.QueryRowContext(r.Context(), `SELECT timezone,starts_at,ends_at,updated_at FROM personal_day_settings WHERE owner_id=?`, currentUser(r).ID).Scan(&value.Timezone, &value.Start, &value.End, &value.UpdatedAt)
	if err == sql.ErrNoRows {
		err = nil
	}
	return value, err
}

func (s *Server) handlePersonalDay(w http.ResponseWriter, r *http.Request) {
	day := r.URL.Query().Get("date")
	if day != "" && !validDate(day) {
		writeError(w, 400, "Выберите корректную дату")
		return
	}
	settings, err := loadDaySettings(s.store.db, r)
	if err != nil {
		writeError(w, 400, "Не удалось прочитать часовой пояс дня")
		return
	}
	if day == "" {
		loc, _ := time.LoadLocation(settings.Timezone)
		day = time.Now().In(loc).Format("2006-01-02")
	}
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT id,title,status,start_date,end_date,starts_at,ends_at,due_at,item_kind,occurrence_date,occurrence_state,completed_at FROM personal_plans WHERE owner_id=? AND status<>'archived' ORDER BY created_at,id`, currentUser(r).ID)
	if err != nil {
		writeError(w, 500, "Не удалось прочитать дела дня")
		return
	}
	plans := []PersonalPlan{}
	for rows.Next() {
		var p PersonalPlan
		e := rows.Scan(&p.ID, &p.Title, &p.Status, &p.StartDate, &p.EndDate, &p.StartsAt, &p.EndsAt, &p.DueAt, &p.ItemKind, &p.OccurrenceDate, &p.OccurrenceState, &p.CompletedAt)
		if e != nil {
			rows.Close()
			writeError(w, 500, "Не удалось прочитать дела дня")
			return
		}
		plans = append(plans, p)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		writeError(w, 500, "Не удалось прочитать дела дня")
		return
	}
	focus := personalDayFocus{}
	err = s.store.db.QueryRowContext(r.Context(), `SELECT COALESCE(plan_id,''),updated_at FROM personal_day_focus WHERE owner_id=? AND day=?`, currentUser(r).ID, day).Scan(&focus.PlanID, &focus.UpdatedAt)
	if err != nil && err != sql.ErrNoRows {
		writeError(w, 500, "Не удалось прочитать фокус дня")
		return
	}
	found := false
	for _, p := range plans {
		if p.ID == focus.PlanID {
			found = true
			focus.Title = p.Title
			focus.Status = p.Status
		}
	}
	if !found {
		focus.PlanID = ""
	} // Never return a foreign or archived source identifier.
	summary := calculatePersonalDay(day, settings, plans, time.Now())
	summary.Focus = focus
	summary.ProjectWork, summary.ProjectAttention, err = s.personalDayProjects(r.Context(), currentUser(r).ID, day, settings.Timezone)
	if err != nil {
		writeError(w, 500, "Не удалось прочитать работу доступных проектов")
		return
	}
	writeJSON(w, 200, summary)
}

func (s *Server) handlePersonalDaySettings(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Timezone          string  `json:"timezone"`
		Start             string  `json:"start"`
		End               string  `json:"end"`
		ExpectedUpdatedAt *string `json:"expectedUpdatedAt"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.ExpectedUpdatedAt == nil || len(input.Timezone) > 64 || input.Timezone == "" || input.Timezone == "Local" {
		writeError(w, 400, "Укажите часовой пояс и текущую версию настроек")
		return
	}
	if _, err := time.LoadLocation(input.Timezone); err != nil {
		writeError(w, 400, "Неизвестный часовой пояс")
		return
	}
	if (input.Start != "" || input.End != "") && (!validDayClock(input.Start) || !validDayClock(input.End) || input.Start == input.End) {
		writeError(w, 400, "Укажите разные начало и конец дня или очистите оба поля")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось сохранить границы дня")
		return
	}
	defer tx.Rollback()
	old, err := loadDaySettings(tx, r)
	if err != nil {
		writeError(w, 500, "Не удалось прочитать границы дня")
		return
	}
	if old.Timezone != input.Timezone || old.Start != input.Start || old.End != input.End {
		if old.UpdatedAt != *input.ExpectedUpdatedAt {
			writeError(w, 409, "Границы дня изменились в другом окне. Откройте настройки заново")
			return
		}
		old = personalDaySettings{Timezone: input.Timezone, Start: input.Start, End: input.End, UpdatedAt: nowText()}
		_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_day_settings(owner_id,timezone,starts_at,ends_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET timezone=excluded.timezone,starts_at=excluded.starts_at,ends_at=excluded.ends_at,updated_at=excluded.updated_at`, currentUser(r).ID, old.Timezone, old.Start, old.End, old.UpdatedAt)
		if err != nil {
			writeError(w, 500, "Не удалось сохранить границы дня")
			return
		}
	}
	if tx.Commit() != nil {
		writeError(w, 500, "Не удалось подтвердить настройки дня")
		return
	}
	writeJSON(w, 200, old)
}

func (s *Server) handlePersonalDayFocus(w http.ResponseWriter, r *http.Request) {
	day := r.PathValue("date")
	if !validDate(day) {
		writeError(w, 400, "Выберите корректную дату")
		return
	}
	var input struct {
		PlanID            string  `json:"planId"`
		ExpectedUpdatedAt *string `json:"expectedUpdatedAt"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.ExpectedUpdatedAt == nil {
		writeError(w, 400, "Нужна текущая версия фокуса")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось сохранить фокус")
		return
	}
	defer tx.Rollback()
	owner := currentUser(r).ID
	old := personalDayFocus{}
	err = tx.QueryRowContext(r.Context(), `SELECT COALESCE(plan_id,''),updated_at FROM personal_day_focus WHERE owner_id=? AND day=?`, owner, day).Scan(&old.PlanID, &old.UpdatedAt)
	if err != nil && err != sql.ErrNoRows {
		writeError(w, 500, "Не удалось прочитать фокус")
		return
	}
	if input.PlanID != "" {
		var status string
		if tx.QueryRowContext(r.Context(), `SELECT status FROM personal_plans WHERE id=? AND owner_id=? AND status<>'archived'`, input.PlanID, owner).Scan(&status) != nil {
			writeError(w, 404, "Личное дело недоступно")
			return
		}
		if status != "planned" && input.PlanID != old.PlanID {
			writeError(w, 409, "Выберите незавершённое дело")
			return
		}
	}
	if old.PlanID != input.PlanID {
		if old.UpdatedAt != *input.ExpectedUpdatedAt {
			writeError(w, 409, "Фокус дня изменился в другом окне. Обновите день")
			return
		}
		old = personalDayFocus{PlanID: input.PlanID, UpdatedAt: nowText()}
		_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_day_focus(owner_id,day,plan_id,updated_at) VALUES(?,?,NULLIF(?,''),?) ON CONFLICT(owner_id,day) DO UPDATE SET plan_id=excluded.plan_id,updated_at=excluded.updated_at`, owner, day, old.PlanID, old.UpdatedAt)
		if err != nil {
			writeError(w, 500, "Не удалось сохранить фокус")
			return
		}
	}
	if tx.Commit() != nil {
		writeError(w, 500, "Не удалось подтвердить фокус")
		return
	}
	writeJSON(w, 200, old)
}

func validDayClock(value string) bool {
	v, e := time.Parse("15:04", value)
	return e == nil && v.Format("15:04") == value
}
func dayInstant(date, clock string, loc *time.Location) (time.Time, bool) {
	parsed, e := time.ParseInLocation("2006-01-02 15:04", date+" "+clock, loc)
	// A skipped wall-clock time at a DST transition must not silently shift the window.
	if e != nil || parsed.Format("2006-01-02 15:04") != date+" "+clock {
		return parsed, false
	}
	// Modern repeated clock times (including 30-minute and two-hour transitions)
	// require a different boundary instead of silently selecting one occurrence.
	for offset := -180; offset <= 180; offset += 15 {
		if offset != 0 && parsed.Add(time.Duration(offset)*time.Minute).In(loc).Format("2006-01-02 15:04") == date+" "+clock {
			return parsed, false
		}
	}
	return parsed, true
}
func parseDayTime(value *string) time.Time {
	if value == nil {
		return time.Time{}
	}
	v, _ := time.Parse(time.RFC3339Nano, *value)
	return v
}
func maxDayTime(a, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}
func minDayTime(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}

func calculatePersonalDay(day string, settings personalDaySettings, plans []PersonalPlan, now time.Time) personalDaySummary {
	out := personalDaySummary{Date: day, Settings: settings, Today: []string{}, Overdue: []string{}, Upcoming: []string{}, Completed: []string{}, Events: []string{}, Free: []dayWindow{}, RemainingFree: []dayWindow{}}
	loc, err := time.LoadLocation(settings.Timezone)
	if err != nil {
		loc = time.UTC
	}
	start, _ := time.ParseInLocation("2006-01-02", day, loc)
	end := start.AddDate(0, 0, 1)
	cutoff := start
	if now.In(loc).Format("2006-01-02") == day {
		cutoff = now
	}
	busy := []dayWindow{}
	windowStart, windowEnd := time.Time{}, time.Time{}
	if settings.Start == "" || settings.End == "" {
		out.TimeReason = "Задайте границы дня, чтобы увидеть свободные промежутки"
	} else {
		endDate := day
		if settings.End < settings.Start {
			endDate = end.Format("2006-01-02")
		}
		var a, b bool
		windowStart, a = dayInstant(day, settings.Start, loc)
		windowEnd, b = dayInstant(endDate, settings.End, loc)
		out.TimeKnown = a && b && windowEnd.After(windowStart)
		if !out.TimeKnown {
			out.TimeReason = "Границы дня попали на смену часового пояса. Уточните время"
		}
	}
	for _, p := range plans {
		if p.Status == "archived" || p.OccurrenceState == "skipped" {
			continue
		}
		from, to, due := parseDayTime(p.StartsAt), parseDayTime(p.EndsAt), parseDayTime(p.DueAt)
		overlaps := !from.IsZero() && from.Before(end) && to.After(start)
		dateFrom, dateTo := p.StartDate, p.EndDate
		if dateTo == "" {
			dateTo = dateFrom
		}
		if dateFrom == "" && from.IsZero() {
			dateFrom = p.OccurrenceDate
			dateTo = dateFrom
			if dateFrom == "" && !due.IsZero() {
				dateFrom = due.In(loc).Format("2006-01-02")
				dateTo = dateFrom
			}
		}
		scheduled := overlaps || (dateFrom != "" && dateFrom <= day && dateTo >= day)
		if p.Status == "done" {
			if scheduled {
				out.Completed = append(out.Completed, p.ID)
			}
		} else {
			if scheduled {
				if p.ItemKind == "event" || overlaps {
					out.Events = append(out.Events, p.ID)
				}
				if p.ItemKind != "event" {
					out.Today = append(out.Today, p.ID)
				}
			}
			if !due.IsZero() && due.Before(cutoff) {
				out.Overdue = append(out.Overdue, p.ID)
			} else if !scheduled && ((!from.IsZero() && !from.Before(end)) || dateFrom > day) {
				out.Upcoming = append(out.Upcoming, p.ID)
			}
			if p.ItemKind != "event" && from.IsZero() && (scheduled || dateFrom == "") {
				out.Unscheduled++
			}
		}
		// Only explicit time blocks and all-day events reserve the available window.
		if out.TimeKnown {
			if from.IsZero() && p.ItemKind == "event" && dateFrom != "" {
				from, _ = time.ParseInLocation("2006-01-02", dateFrom, loc)
				last, _ := time.ParseInLocation("2006-01-02", dateTo, loc)
				to = last.AddDate(0, 0, 1)
			}
			if p.Status == "done" {
				completed := parseDayTime(p.CompletedAt)
				if completed.IsZero() {
					completed = now
				}
				to = minDayTime(to, completed)
			}
			if !from.IsZero() && to.After(from) && from.Before(windowEnd) && to.After(windowStart) {
				busy = append(busy, dayWindow{Start: maxDayTime(from, windowStart), End: minDayTime(to, windowEnd)})
			}
		}
	}
	sort.Slice(busy, func(i, j int) bool { return busy[i].Start.Before(busy[j].Start) })
	cursor := windowStart
	for _, block := range busy {
		if block.Start.After(cursor) {
			out.Free = append(out.Free, dayWindow{Start: cursor, End: block.Start, Minutes: int(block.Start.Sub(cursor).Minutes())})
		}
		cursor = maxDayTime(cursor, block.End)
	}
	if out.TimeKnown && cursor.Before(windowEnd) {
		out.Free = append(out.Free, dayWindow{Start: cursor, End: windowEnd, Minutes: int(windowEnd.Sub(cursor).Minutes())})
	}
	for _, window := range out.Free {
		out.FreeMinutes += window.Minutes
		if window.End.After(now) {
			remainingStart := maxDayTime(window.Start, now)
			minutes := int(window.End.Sub(remainingStart).Minutes())
			out.RemainingFree = append(out.RemainingFree, dayWindow{Start: remainingStart, End: window.End, Minutes: minutes})
			out.RemainingFreeMinutes += minutes
		}
	}
	// Deterministic order follows timestamps where available, then the original stable order.
	order := map[string]time.Time{}
	for _, p := range plans {
		v, _ := time.ParseInLocation("2006-01-02", p.StartDate, loc)
		if p.StartsAt != nil {
			v = parseDayTime(p.StartsAt)
		} else if p.DueAt != nil {
			v = parseDayTime(p.DueAt)
		}
		order[p.ID] = v
	}
	for _, ids := range [][]string{out.Today, out.Overdue, out.Upcoming, out.Events} {
		sort.SliceStable(ids, func(i, j int) bool { return order[ids[i]].Before(order[ids[j]]) })
	}
	return out
}
