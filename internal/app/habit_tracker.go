package app

import (
	"encoding/json"
	"math"
	"net/http"
	"time"
	_ "time/tzdata"
)

type HabitRule struct {
	ReminderTime  string  `json:"reminderTime"`
	EffectiveDate string  `json:"effectiveDate"`
	Mode          string  `json:"mode"`
	Cadence       string  `json:"cadence"`
	Target        float64 `json:"target"`
	PeriodTarget  float64 `json:"periodTarget"`
	PeriodMeasure string  `json:"periodMeasure"`
	Interval      int     `json:"interval"`
	Weekdays      []int   `json:"weekdays"`
	Unit          string  `json:"unit"`
	EndDate       string  `json:"endDate"`
}
type HabitPause struct {
	ID        string `json:"id"`
	StartDate string `json:"startDate"`
	EndDate   string `json:"endDate"`
	Reason    string `json:"reason"`
}
type HabitMove struct {
	SourceDate string `json:"sourceDate"`
	TargetDate string `json:"targetDate"`
}
type HabitDay struct {
	Date       string        `json:"date"`
	State      string        `json:"state"`
	Planned    bool          `json:"planned"`
	Editable   bool          `json:"editable"`
	Rule       HabitRule     `json:"rule"`
	Checkin    *HabitCheckin `json:"checkin,omitempty"`
	SourceDate string        `json:"sourceDate,omitempty"`
}
type HabitWeekday struct {
	Planned int `json:"planned"`
	Success int `json:"success"`
}
type HabitPeriod struct {
	Start   string  `json:"start"`
	End     string  `json:"end"`
	Actual  float64 `json:"actual"`
	Target  float64 `json:"target"`
	State   string  `json:"state"`
	Measure string  `json:"measure"`
}
type HabitSummary struct {
	Success       int             `json:"success"`
	Failed        int             `json:"failed"`
	Partial       int             `json:"partial"`
	Unmarked      int             `json:"unmarked"`
	Skipped       int             `json:"skipped"`
	Paused        int             `json:"paused"`
	Planned       int             `json:"planned"`
	Percent       *int            `json:"percent"`
	Total         float64         `json:"total"`
	LastLapse     string          `json:"lastLapse"`
	CurrentStreak int             `json:"currentStreak"`
	BestStreak    int             `json:"bestStreak"`
	StreakUnit    string          `json:"streakUnit"`
	Weekdays      [7]HabitWeekday `json:"weekdays"`
}
type HabitTracker struct {
	Habit   PersonalHabit `json:"habit"`
	From    string        `json:"from"`
	To      string        `json:"to"`
	Days    []HabitDay    `json:"days"`
	Summary HabitSummary  `json:"summary"`
	Periods []HabitPeriod `json:"periods"`
}

func habitDate(date string) time.Time { t, _ := time.Parse("2006-01-02", date); return t }
func habitAdd(date string, days int) string {
	return habitDate(date).AddDate(0, 0, days).Format("2006-01-02")
}
func habitToday(h PersonalHabit) string {
	loc, err := time.LoadLocation(h.Timezone)
	if err != nil {
		loc = personalLocation()
	}
	return time.Now().In(loc).Format("2006-01-02")
}
func habitRuleOn(h PersonalHabit, date string) HabitRule {
	rule := h.Rule
	for _, r := range h.Rules {
		if r.EffectiveDate <= date {
			rule = r
		}
	}
	return rule
}
func habitScheduled(h PersonalHabit, rule HabitRule, date string) bool {
	if date < h.StartDate || rule.EndDate != "" && date > rule.EndDate {
		return false
	}
	d := habitDate(date)
	switch rule.Cadence {
	case "weekdays":
		for _, v := range rule.Weekdays {
			if int(d.Weekday()) == v {
				return true
			}
		}
		return false
	case "interval":
		origin := h.StartDate
		if rule.EffectiveDate > origin {
			origin = rule.EffectiveDate
		}
		return int(d.Sub(habitDate(origin)).Hours()/24)%max(1, rule.Interval) == 0
	}
	return true
}
func habitDay(h PersonalHabit, date, today string, checkins map[string]HabitCheckin) HabitDay {
	rule := habitRuleOn(h, date)
	d := HabitDay{Date: date, State: "rest", Rule: rule}
	d.Planned = habitScheduled(h, rule, date)
	for _, move := range h.Moves {
		if move.SourceDate == date {
			d.State = "moved"
			d.Planned = false
			d.SourceDate = move.TargetDate
			return d
		}
		if move.TargetDate == date {
			d.Planned = true
			d.SourceDate = move.SourceDate
			d.Rule = habitRuleOn(h, move.SourceDate)
		}
	}
	if !d.Planned {
		return d
	}
	if date > today {
		d.State = "future"
		return d
	}
	// Existing measured facts survive a pause starting on that same day.
	c, has := checkins[date]
	for _, p := range h.Pauses {
		if date >= p.StartDate && (p.EndDate == "" || date <= p.EndDate) && !has {
			d.State = "paused"
			d.Planned = false
			return d
		}
	}
	d.Editable = h.ArchivedAt == ""
	if !has {
		d.State = "pending"
		return d
	}
	d.Checkin = &c
	if c.State != "measured" {
		d.State = c.State
		if c.State == "snoozed" && date < today {
			d.State = "pending"
		}
		return d
	}
	switch d.Rule.Mode {
	case "quit":
		if c.Value == 0 {
			d.State = "success"
		} else {
			d.State = "failed"
		}
	case "reduce":
		if c.Value <= d.Rule.Target {
			d.State = "success"
		} else {
			d.State = "failed"
		}
	default:
		if c.Value >= d.Rule.Target {
			d.State = "success"
		} else if c.Value > 0 {
			d.State = "partial"
		} else {
			d.State = "failed"
		}
	}
	return d
}
func habitPeriodBounds(date, cadence string) (string, string) {
	d := habitDate(date)
	if cadence == "monthly" {
		start := time.Date(d.Year(), d.Month(), 1, 0, 0, 0, 0, time.UTC)
		return start.Format("2006-01-02"), start.AddDate(0, 1, -1).Format("2006-01-02")
	}
	start := d.AddDate(0, 0, -(int(d.Weekday())+6)%7)
	return start.Format("2006-01-02"), start.AddDate(0, 0, 6).Format("2006-01-02")
}

// One pass over planned civil dates. No 24-hour arithmetic in the user's timezone,
// no success inferred from an absent check-in, no failure for an open period.
func buildHabitTracker(h PersonalHabit, from, to, today string) HabitTracker {
	out := HabitTracker{Habit: h, From: from, To: to, Days: []HabitDay{}, Periods: []HabitPeriod{}}
	all := map[string]HabitCheckin{}
	for _, c := range h.Checkins {
		all[c.Date] = c
	}
	streak, best := 0, 0
	var period *HabitPeriod
	var periodRule HabitRule
	periodPlanned := 0
	finish := func() {
		if period == nil {
			return
		}
		period.State = "pending"
		if periodPlanned == 0 {
			period.State = "rest"
		} else if period.Actual >= period.Target {
			period.State = "success"
			streak++
			best = max(best, streak)
		} else if period.End < today {
			period.State = "failed"
			streak = 0
		}
		if period.End >= from && period.Start <= to {
			out.Periods = append(out.Periods, *period)
		}
		period = nil
		periodPlanned = 0
	}
	previousCadence := ""
	end := to
	if today > end {
		end = today
	}
	for date := h.StartDate; date <= end; date = habitAdd(date, 1) {
		d := habitDay(h, date, today, all)
		cadence := d.Rule.Cadence
		quota := cadence == "weekly" || cadence == "monthly"
		if date <= today && previousCadence != "" && previousCadence != cadence {
			finish()
			streak = 0
			best = 0
		}
		if date <= today {
			previousCadence = cadence
		}
		if quota {
			start, stop := habitPeriodBounds(date, cadence)
			if period == nil || period.Start != start {
				finish()
				period = &HabitPeriod{Start: start, End: stop, Target: d.Rule.PeriodTarget, Measure: d.Rule.PeriodMeasure}
				periodRule = d.Rule
			}
			if d.Planned && d.State != "skipped" && d.State != "future" {
				periodPlanned++
			}
			if d.State == "success" && periodRule.PeriodMeasure == "days" {
				period.Actual++
			}
			if d.Checkin != nil && d.Checkin.State == "measured" && periodRule.PeriodMeasure == "volume" {
				period.Actual += d.Checkin.Value
			}
		} else if date <= today {
			switch d.State {
			case "success":
				streak++
				best = max(best, streak)
			case "failed", "partial":
				if date < today || d.State == "failed" {
					streak = 0
				}
			case "pending", "snoozed":
				if date < today {
					streak = 0
				}
			}
		}
		if date < from || date > to {
			continue
		}
		out.Days = append(out.Days, d)
		if date > today {
			continue
		}
		s := &out.Summary
		switch d.State {
		case "success":
			s.Success++
		case "failed":
			s.Failed++
		case "partial":
			s.Partial++
		case "pending", "snoozed":
			if date < today {
				s.Unmarked++
			}
		case "skipped":
			s.Skipped++
		case "paused":
			s.Paused++
		}
		if d.Checkin != nil && d.Checkin.State == "measured" {
			s.Total += d.Checkin.Value
		}
		if d.State == "failed" && (d.Rule.Mode == "quit" || d.Rule.Mode == "reduce") {
			s.LastLapse = date
		}
		if d.Planned && d.State != "skipped" && (date < today || d.State == "success" || d.State == "failed") {
			s.Planned++
			wd := int(habitDate(date).Weekday())
			s.Weekdays[wd].Planned++
			if d.State == "success" {
				s.Weekdays[wd].Success++
			}
		}
	}
	finish()
	out.Summary.CurrentStreak = streak
	out.Summary.BestStreak = best
	out.Summary.StreakUnit = "плановых дней"
	current := habitRuleOn(h, today)
	if current.Cadence == "weekly" {
		out.Summary.StreakUnit = "недель"
	}
	if current.Cadence == "monthly" {
		out.Summary.StreakUnit = "месяцев"
	}
	numerator, denominator := out.Summary.Success, out.Summary.Planned
	if current.Cadence == "weekly" || current.Cadence == "monthly" {
		numerator, denominator = 0, 0
		for _, p := range out.Periods {
			if p.State == "success" {
				numerator++
				denominator++
			} else if p.State == "failed" {
				denominator++
			}
		}
	}
	if denominator > 0 {
		p := int(math.Round(float64(numerator) * 100 / float64(denominator)))
		out.Summary.Percent = &p
	}
	out.Habit.CurrentStreak = streak
	out.Habit.BestStreak = best
	out.Habit.Checkins = []HabitCheckin{}
	for _, c := range h.Checkins {
		if c.Date >= from && c.Date <= to {
			out.Habit.Checkins = append(out.Habit.Checkins, c)
		}
	}
	return out
}

// Five batched queries regardless of habit count. Notes are windowed; compact
// numeric history is retained for truthful all-time streaks, never sent wholesale.
func (s *Server) loadHabits(r *http.Request, ownerID int64, id, notesFrom string) ([]PersonalHabit, error) {
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT id,title,schedule_kind,target_per_week,unit,start_date,created_at,updated_at,description,color_key,icon_key,timezone,revision,COALESCE(archived_at,'') FROM personal_habits WHERE owner_id=? AND (?='' OR id=?) ORDER BY archived_at IS NOT NULL,created_at DESC`, ownerID, id, id)
	if err != nil {
		return nil, err
	}
	items := []PersonalHabit{}
	indices := map[string]int{}
	for rows.Next() {
		var h PersonalHabit
		if err = rows.Scan(&h.ID, &h.Title, &h.ScheduleKind, &h.TargetPerWeek, &h.Unit, &h.StartDate, &h.CreatedAt, &h.UpdatedAt, &h.Description, &h.ColorKey, &h.IconKey, &h.Timezone, &h.Revision, &h.ArchivedAt); err != nil {
			rows.Close()
			return nil, err
		}
		h.Checkins = []HabitCheckin{}
		h.Rules = []HabitRule{}
		h.Pauses = []HabitPause{}
		h.Moves = []HabitMove{}
		indices[h.ID] = len(items)
		items = append(items, h)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	queries := []string{
		`SELECT c.habit_id,c.effective_date,c.config FROM personal_habit_rules c JOIN personal_habits h ON h.id=c.habit_id WHERE h.owner_id=? AND (?='' OR h.id=?) ORDER BY c.effective_date`,
		`SELECT c.habit_id,c.id,c.start_date,c.end_date,c.reason FROM personal_habit_pauses c JOIN personal_habits h ON h.id=c.habit_id WHERE h.owner_id=? AND (?='' OR h.id=?) ORDER BY c.start_date`,
		`SELECT c.habit_id,c.source_date,c.target_date FROM personal_habit_moves c JOIN personal_habits h ON h.id=c.habit_id WHERE h.owner_id=? AND (?='' OR h.id=?)`,
		`SELECT c.habit_id,c.checkin_date,COALESCE(c.amount,c.value),CASE WHEN c.checkin_date>=? THEN c.note ELSE '' END,c.updated_at,c.result_state FROM personal_habit_checkins c JOIN personal_habits h ON h.id=c.habit_id WHERE h.owner_id=? AND c.owner_id=h.owner_id AND (?='' OR h.id=?) ORDER BY c.checkin_date`,
	}
	for n, q := range queries {
		args := []any{ownerID, id, id}
		if n == 3 {
			args = append([]any{notesFrom}, args...)
		}
		rows, err = s.store.db.QueryContext(r.Context(), q, args...)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var hid string
			switch n {
			case 0:
				var date, raw string
				err = rows.Scan(&hid, &date, &raw)
				var rule HabitRule
				if err == nil {
					err = json.Unmarshal([]byte(raw), &rule)
				}
				rule.EffectiveDate = date
				if err == nil {
					items[indices[hid]].Rules = append(items[indices[hid]].Rules, rule)
				}
			case 1:
				var p HabitPause
				err = rows.Scan(&hid, &p.ID, &p.StartDate, &p.EndDate, &p.Reason)
				if err == nil {
					items[indices[hid]].Pauses = append(items[indices[hid]].Pauses, p)
				}
			case 2:
				var m HabitMove
				err = rows.Scan(&hid, &m.SourceDate, &m.TargetDate)
				if err == nil {
					items[indices[hid]].Moves = append(items[indices[hid]].Moves, m)
				}
			case 3:
				var c HabitCheckin
				err = rows.Scan(&hid, &c.Date, &c.Value, &c.Note, &c.UpdatedAt, &c.State)
				if err == nil {
					items[indices[hid]].Checkins = append(items[indices[hid]].Checkins, c)
				}
			}
			if err != nil {
				rows.Close()
				return nil, err
			}
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, err
		}
	}
	for i := range items {
		h := &items[i]
		h.Rule = habitRuleOn(*h, habitToday(*h))
		h.Today = habitToday(*h)
		for _, p := range h.Pauses {
			if p.StartDate <= h.Today && (p.EndDate == "" || p.EndDate >= h.Today) {
				h.Paused = true
			}
		}
	}
	return items, nil
}

func (s *Server) handleHabitTracker(w http.ResponseWriter, r *http.Request) {
	from, to := r.URL.Query().Get("from"), r.URL.Query().Get("to")
	items, err := s.loadHabits(r, currentUser(r).ID, r.PathValue("id"), from)
	if err != nil {
		writeError(w, 500, "Не удалось загрузить трекер")
		return
	}
	if len(items) != 1 {
		writeError(w, 404, "Привычка не найдена")
		return
	}
	h := items[0]
	today := habitToday(h)
	if from == "" {
		from = today[:7] + "-01"
	}
	if to == "" {
		to = habitDate(from).AddDate(0, 1, -1).Format("2006-01-02")
	}
	if !validDate(from) || !validDate(to) || from > to || habitDate(to).Sub(habitDate(from)) > 366*24*time.Hour {
		writeError(w, 400, "Выберите период до 366 дней")
		return
	}
	writeJSON(w, 200, buildHabitTracker(h, from, to, today))
}

func (s *Server) handleHabitExport(w http.ResponseWriter, r *http.Request) {
	items, err := s.loadHabits(r, currentUser(r).ID, r.PathValue("id"), "")
	if err != nil {
		writeError(w, 500, "Не удалось подготовить экспорт")
		return
	}
	if len(items) != 1 {
		writeError(w, 404, "Привычка не найдена")
		return
	}
	w.Header().Set("Content-Disposition", `attachment; filename="tessavie-habit.json"`)
	writeJSON(w, 200, items[0])
}
