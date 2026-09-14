package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"time"
)

var errRecurrenceHorizonLimit = errors.New("Слишком много повторений: выберите меньший период календаря")

type calendarRecurrence struct {
	PersonalPlan
	CalendarKind string `json:"calendarKind"`
}

func recurrenceRules(ctx context.Context, q calendarQueryer, owner int64) ([]PersonalRecurrenceRule, error) {
	rows, err := q.QueryContext(ctx, `SELECT r.series_id,r.cadence,r.interval_count,r.timezone,r.start_date,r.until_date,r.active,r.updated_at,t.plan_json,t.needs_review FROM personal_recurrence_rules r JOIN personal_recurrence_templates t ON t.series_id=r.series_id AND t.owner_id=r.owner_id WHERE r.owner_id=? ORDER BY r.series_id`, owner)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []PersonalRecurrenceRule{}
	for rows.Next() {
		var r PersonalRecurrenceRule
		var body string
		if err = rows.Scan(&r.SeriesID, &r.Cadence, &r.Interval, &r.Timezone, &r.StartDate, &r.UntilDate, &r.Active, &r.UpdatedAt, &body, &r.NeedsReview); err != nil {
			return nil, err
		}
		if err = json.Unmarshal([]byte(body), &r.Template); err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

func recurrenceBounds(p PersonalPlan, loc *time.Location) (time.Time, time.Time) {
	a, b := parseDayTime(p.StartsAt), parseDayTime(p.EndsAt)
	if !a.IsZero() && b.After(a) {
		return a, b
	}
	from, to := p.StartDate, p.EndDate
	if from == "" {
		from = p.OccurrenceDate
		to = from
	}
	if to == "" {
		to = from
	}
	a, _ = time.ParseInLocation("2006-01-02", from, loc)
	b, _ = time.ParseInLocation("2006-01-02", to, loc)
	return a, b.AddDate(0, 0, 1)
}

func readCalendarRecurrences(ctx context.Context, q calendarQueryer, owner int64, start, end time.Time, loc *time.Location) ([]calendarRecurrence, error) {
	rules, err := recurrenceRules(ctx, q, owner)
	if err != nil {
		return nil, err
	}
	rows, err := q.QueryContext(ctx, `SELECT series_id,scheduled_date FROM personal_recurrence_instances WHERE owner_id=?`, owner)
	if err != nil {
		return nil, err
	}
	existing := map[string]bool{}
	for rows.Next() {
		var series, date string
		if err = rows.Scan(&series, &date); err != nil {
			rows.Close()
			return nil, err
		}
		existing[series+":"+date] = true
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	out := []calendarRecurrence{}
	for _, rule := range rules {
		if !rule.Active || rule.Template == nil {
			continue
		}
		template := *rule.Template
		a, b := recurrenceBounds(template, loc)
		base, err := time.Parse("2006-01-02", template.OccurrenceDate)
		if err != nil {
			return nil, err
		}
		// Shift the query by the template's relative extent, including cross-day events.
		aDay, _ := time.Parse("2006-01-02", a.In(loc).Format("2006-01-02"))
		bDay, _ := time.Parse("2006-01-02", b.In(loc).Format("2006-01-02"))
		earliest := start.AddDate(0, 0, -int((bDay.Unix()-base.Unix())/86400)-2).Format("2006-01-02")
		latest := end.AddDate(0, 0, -int((aDay.Unix()-base.Unix())/86400)+2).Format("2006-01-02")
		date, err := nextPersonalSeriesDate(rule, earliest)
		if err != nil {
			return nil, err
		}
		for count := 0; date <= latest && (rule.UntilDate == "" || date <= rule.UntilDate); count++ {
			if count > 1000 || len(out) >= 2000 {
				return nil, errRecurrenceHorizonLimit
			}
			if !existing[rule.SeriesID+":"+date] {
				plan, e := projectPersonalRecurrence(template, date, rule.Timezone)
				if e != nil {
					return nil, e
				}
				left, right := recurrenceBounds(plan, loc)
				if left.Before(end) && right.After(start) {
					plan.ID = "recurrence:" + rule.SeriesID + ":" + date
					plan.SeriesID = rule.SeriesID
					copy := rule
					copy.Template = nil
					plan.Recurrence = &copy
					out = append(out, calendarRecurrence{plan, "recurrence"})
				}
			}
			date, err = nextPersonalSeriesDate(rule, date)
			if err != nil {
				return nil, err
			}
		}
	}
	return out, nil
}

func (s *Server) handleMaterializePersonalRecurrence(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Date                    string `json:"date"`
		ExpectedSeriesUpdatedAt string `json:"expectedSeriesUpdatedAt"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if !validDate(input.Date) {
		writeError(w, 400, "Выберите дату повторения")
		return
	}
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "Не удалось открыть повторение")
		return
	}
	defer tx.Rollback()
	owner, series := currentUser(r).ID, r.PathValue("id")
	rules, err := recurrenceRules(r.Context(), tx, owner)
	if err != nil {
		writeError(w, 500, "Не удалось прочитать серию")
		return
	}
	var rule *PersonalRecurrenceRule
	for i := range rules {
		if rules[i].SeriesID == series {
			rule = &rules[i]
			break
		}
	}
	if rule == nil {
		writeError(w, 404, "Серия недоступна")
		return
	}
	var id string
	err = tx.QueryRowContext(r.Context(), `SELECT plan_id FROM personal_recurrence_instances WHERE owner_id=? AND series_id=? AND scheduled_date=?`, owner, series, input.Date).Scan(&id)
	if err == nil {
		var plan PersonalPlan
		err = scanPersonalPlan(tx.QueryRowContext(r.Context(), `SELECT `+personalPlanSelect+` FROM personal_plans WHERE id=? AND owner_id=?`, id, owner), &plan)
		if err != nil {
			writeError(w, 500, "Не удалось открыть дело")
			return
		}
		plan.Recurrence = rule
		writeJSON(w, 200, plan)
		return
	}
	if err != sql.ErrNoRows {
		writeError(w, 500, "Не удалось проверить повторение")
		return
	}
	if !rule.Active || rule.UpdatedAt != input.ExpectedSeriesUpdatedAt {
		writeError(w, 409, "Серия изменилась. Обновите календарь и проверьте повторение")
		return
	}
	day, _ := time.Parse("2006-01-02", input.Date)
	expected, err := nextPersonalSeriesDate(*rule, day.AddDate(0, 0, -1).Format("2006-01-02"))
	if err != nil || expected != input.Date || rule.UntilDate != "" && input.Date > rule.UntilDate {
		writeError(w, 400, "Эта дата не входит в серию")
		return
	}
	plan, err := projectPersonalRecurrence(*rule.Template, input.Date, rule.Timezone)
	if err == nil {
		plan.ID, err = newID()
	}
	if err != nil {
		writeError(w, 500, "Не удалось подготовить повторение")
		return
	}
	plan.SeriesID = series
	if err = validatePersonalPlanReferences(r.Context(), tx, owner, &plan, rule.Template); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	now := nowText()
	err = insertPersonalRecurrenceInstance(r.Context(), tx, owner, plan, input.Date, now)
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, 500, "Не удалось сохранить повторение. Повторите открытие")
		return
	}
	plan.CreatedAt, plan.UpdatedAt, plan.Recurrence = now, now, rule
	writeJSON(w, 201, plan)
}
