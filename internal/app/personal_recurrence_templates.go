package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

func recurrenceTemplate(plan PersonalPlan) PersonalPlan {
	plan.ID, plan.CreatedAt, plan.UpdatedAt, plan.SeriesID = "", "", "", ""
	plan.Status, plan.OccurrenceState = "planned", "scheduled"
	plan.CompletedAt, plan.Recurrence = nil, nil
	plan.ActualMinutes = 0
	return plan
}

func samePersonalCalendarFields(a, b PersonalPlan) bool {
	value := func(p *string) string {
		if p == nil {
			return ""
		}
		return *p
	}
	return a.StartDate == b.StartDate && a.EndDate == b.EndDate && value(a.DueAt) == value(b.DueAt) && value(a.StartsAt) == value(b.StartsAt) && value(a.EndsAt) == value(b.EndsAt)
}

func savePersonalRecurrenceTemplate(ctx context.Context, tx *sql.Tx, owner int64, series string, plan PersonalPlan, now string) error {
	previous, err := loadPersonalRecurrenceTemplate(ctx, tx, owner, series)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if err = validatePersonalPlanReferences(ctx, tx, owner, &plan, &previous); err != nil {
		return err
	}
	body, err := json.Marshal(recurrenceTemplate(plan))
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO personal_recurrence_templates(series_id,owner_id,plan_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(series_id) DO UPDATE SET plan_json=excluded.plan_json,needs_review=0,updated_at=excluded.updated_at WHERE personal_recurrence_templates.owner_id=excluded.owner_id`, series, owner, string(body), now)
	return err
}

func loadPersonalRecurrenceTemplate(ctx context.Context, tx *sql.Tx, owner int64, series string) (PersonalPlan, error) {
	var body string
	var plan PersonalPlan
	err := tx.QueryRowContext(ctx, `SELECT plan_json FROM personal_recurrence_templates WHERE series_id=? AND owner_id=?`, series, owner).Scan(&body)
	if err == nil {
		err = json.Unmarshal([]byte(body), &plan)
	}
	return plan, err
}

// Calculate each occurrence from the original rule, never from a moved date
// or a previously clamped February day.
func nextPersonalSeriesDate(rule PersonalRecurrenceRule, after string) (string, error) {
	start, err := time.Parse("2006-01-02", rule.StartDate)
	if err != nil {
		return "", err
	}
	previous, err := time.Parse("2006-01-02", after)
	if err != nil {
		return "", err
	}
	if rule.Interval < 1 {
		return "", errors.New("invalid recurrence interval")
	}
	if previous.Before(start) {
		return rule.StartDate, nil
	}
	var next time.Time
	switch rule.Cadence {
	case "daily", "weekly":
		step := rule.Interval
		if rule.Cadence == "weekly" {
			step *= 7
		}
		days := int((previous.Unix() - start.Unix()) / 86400)
		next = start.AddDate(0, 0, (days/step+1)*step)
	case "monthly":
		months := (previous.Year()-start.Year())*12 + int(previous.Month()-start.Month())
		index := months / rule.Interval
		candidate := func(n int) time.Time {
			first := time.Date(start.Year(), start.Month()+time.Month(n*rule.Interval), 1, 0, 0, 0, 0, time.UTC)
			last := time.Date(first.Year(), first.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day()
			day := start.Day()
			if day > last {
				day = last
			}
			return time.Date(first.Year(), first.Month(), day, 0, 0, 0, 0, time.UTC)
		}
		next = candidate(index)
		if !next.After(previous) {
			next = candidate(index + 1)
		}
	default:
		return "", errors.New("invalid recurrence cadence")
	}
	date := next.Format("2006-01-02")
	if !validDate(date) {
		return "", errors.New("recurrence date outside supported range")
	}
	return date, nil
}

func projectPersonalRecurrence(template PersonalPlan, date, zone string) (PersonalPlan, error) {
	plan := recurrenceTemplate(template)
	from, err := time.Parse("2006-01-02", template.OccurrenceDate)
	if err != nil {
		return plan, err
	}
	to, err := time.Parse("2006-01-02", date)
	if err != nil {
		return plan, err
	}
	days := int((to.Unix() - from.Unix()) / 86400)
	location, err := time.LoadLocation(zone)
	if err != nil {
		return plan, err
	}
	shiftInstant := func(value *string) (*string, error) {
		if value == nil {
			return nil, nil
		}
		instant, err := time.Parse(time.RFC3339Nano, *value)
		if err != nil {
			return nil, err
		}
		shifted := instant.In(location).AddDate(0, 0, days).UTC().Format(time.RFC3339)
		return &shifted, nil
	}
	plan.StartDate, plan.EndDate, err = shiftDateRange(template.StartDate, template.EndDate, template.OccurrenceDate, date)
	if err != nil {
		return plan, err
	}
	plan.DueAt, err = shiftInstant(template.DueAt)
	if err != nil {
		return plan, err
	}
	plan.StartsAt, err = shiftInstant(template.StartsAt)
	if err != nil {
		return plan, err
	}
	plan.EndsAt, err = shiftInstant(template.EndsAt)
	if err != nil {
		return plan, err
	}
	plan.OccurrenceDate = date
	return plan, nil
}

func insertPersonalRecurrenceInstance(ctx context.Context, tx *sql.Tx, owner int64, plan PersonalPlan, scheduled, now string) error {
	previous, err := loadPersonalRecurrenceTemplate(ctx, tx, owner, plan.SeriesID)
	if err != nil {
		return err
	}
	if err = validatePersonalPlanReferences(ctx, tx, owner, &plan, &previous); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO personal_plans(id,owner_id,title,notes,due_at,status,completed_at,created_at,updated_at,start_date,end_date,color_key,title_generated,item_kind,project_id,goal_id,parent_id,planned_minutes,actual_minutes,starts_at,ends_at,series_id,occurrence_date,occurrence_state) VALUES(?,?,?,?,?,'planned',NULL,?,?,?,?,?,?,?,NULLIF(?,''),NULLIF(?,''),NULLIF(?,''),?,0,?,?,?,?,'scheduled')`, plan.ID, owner, plan.Title, plan.Notes, plan.DueAt, now, now, plan.StartDate, plan.EndDate, plan.ColorKey, plan.TitleGenerated, plan.ItemKind, plan.ProjectID, plan.GoalID, plan.ParentID, plan.PlannedMinutes, plan.StartsAt, plan.EndsAt, plan.SeriesID, plan.OccurrenceDate)
	if err == nil {
		_, err = tx.ExecContext(ctx, `INSERT INTO personal_recurrence_instances(plan_id,series_id,owner_id,scheduled_date) VALUES(?,?,?,?)`, plan.ID, plan.SeriesID, owner, scheduled)
	}
	return err
}

func updatePlannedPersonalSeries(ctx context.Context, tx *sql.Tx, owner int64, series string, template PersonalPlan, zone, now string) error {
	rows, err := tx.QueryContext(ctx, `SELECT `+personalPlanSelect+` FROM personal_plans WHERE owner_id=? AND series_id=? AND status='planned'`, owner, series)
	if err != nil {
		return err
	}
	var plans []PersonalPlan
	for rows.Next() {
		var plan PersonalPlan
		if err = scanPersonalPlan(rows, &plan); err != nil {
			break
		}
		plans = append(plans, plan)
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		return err
	}
	for _, existing := range plans {
		plan, err := projectPersonalRecurrence(template, existing.OccurrenceDate, zone)
		if err != nil {
			return err
		}
		if err = validatePersonalPlanReferences(ctx, tx, owner, &plan, &existing); err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `UPDATE personal_plans SET title=?,notes=?,due_at=?,start_date=?,end_date=?,color_key=?,title_generated=?,item_kind=?,project_id=NULLIF(?,''),goal_id=NULLIF(?,''),parent_id=NULLIF(?,''),planned_minutes=?,starts_at=?,ends_at=?,updated_at=? WHERE id=? AND owner_id=?`, plan.Title, plan.Notes, plan.DueAt, plan.StartDate, plan.EndDate, plan.ColorKey, plan.TitleGenerated, plan.ItemKind, plan.ProjectID, plan.GoalID, plan.ParentID, plan.PlannedMinutes, plan.StartsAt, plan.EndsAt, now, existing.ID, owner)
		if err != nil {
			return err
		}
	}
	return nil
}
