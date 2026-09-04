package app

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

type digestQueryer interface {
	personalQueryer
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

type reminderDigestSummary struct {
	Plans, Records, Habits, Waiting int
}

func digestWeekday(value time.Time) int {
	if value.Weekday() == time.Sunday {
		return 7
	}
	return int(value.Weekday())
}

func digestScheduleTime(day time.Time, clock string, loc *time.Location) time.Time {
	hour, minute := 0, 0
	fmt.Sscanf(clock, "%02d:%02d", &hour, &minute)
	return time.Date(day.Year(), day.Month(), day.Day(), hour, minute, 0, 0, loc)
}

func digestDue(kind string, p reminderPreferences, now time.Time, loc *time.Location) bool {
	local := now.In(loc)
	if reminderQuiet(p, now, loc) {
		return false
	}
	switch kind {
	case "daily":
		return p.DailyDigestEnabled && !local.Before(digestScheduleTime(local, p.DailyDigestTime, loc))
	case "weekly":
		return p.WeeklyDigestEnabled && digestWeekday(local) == p.WeeklyDigestWeekday && !local.Before(digestScheduleTime(local, p.WeeklyDigestTime, loc))
	default:
		return false
	}
}

func digestPeriod(kind string, p reminderPreferences, now time.Time, loc *time.Location) (string, time.Time) {
	local := now.In(loc)
	if kind == "daily" {
		return local.Format("2006-01-02"), digestScheduleTime(local.AddDate(0, 0, 1), p.DailyDigestTime, loc)
	}
	start := monday(time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc))
	return start.Format("2006-01-02"), digestScheduleTime(local.AddDate(0, 0, 7), p.WeeklyDigestTime, loc)
}

func countDigestHabits(ctx context.Context, q digestQueryer, owner int64, now time.Time) (int, error) {
	rows, err := q.QueryContext(ctx, `SELECT id FROM personal_habits WHERE owner_id=? AND archived_at IS NULL ORDER BY id`, owner)
	if err != nil {
		return 0, err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return 0, err
		}
		ids = append(ids, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return 0, err
	}
	count := 0
	for _, id := range ids {
		snapshot, loadErr := loadReminderHabit(ctx, q, owner, id, now)
		if loadErr != nil {
			return 0, loadErr
		}
		loc, loadErr := time.LoadLocation(snapshot.habit.Timezone)
		if loadErr != nil {
			return 0, loadErr
		}
		day := now.In(loc).Format("2006-01-02")
		checks := map[string]HabitCheckin{}
		for _, check := range snapshot.habit.Checkins {
			checks[check.Date] = check
		}
		entry := habitDay(snapshot.habit, day, day, checks)
		if entry.Planned && oneOf(entry.State, "pending", "partial", "snoozed") {
			count++
		}
	}
	return count, nil
}

func dailyDigestSummary(ctx context.Context, q digestQueryer, owner int64, p reminderPreferences, now time.Time, loc *time.Location) (reminderDigestSummary, error) {
	var out reminderDigestSummary
	day := now.In(loc).Format("2006-01-02")
	next := digestScheduleTime(now.In(loc).AddDate(0, 0, 1), "00:00", loc).UTC().Format(time.RFC3339Nano)
	if p.PersonalEnabled {
		if err := q.QueryRowContext(ctx, `SELECT COUNT(*) FROM personal_plans WHERE owner_id=? AND status NOT IN ('done','skipped','archived') AND start_date<>'' AND start_date<=? AND (end_date='' OR end_date>=?)`, owner, day, day).Scan(&out.Plans); err != nil {
			return out, err
		}
	}
	if p.DeadlineEnabled {
		if err := q.QueryRowContext(ctx, `SELECT COUNT(*) FROM records r WHERE r.owner_id=? AND r.due_at IS NOT NULL AND julianday(r.due_at)<julianday(?) AND `+reminderActiveRecord+` AND `+reminderRecordAccess+` AND COALESCE((SELECT deadline_enabled FROM reminder_project_preferences pref WHERE pref.user_id=r.owner_id AND pref.workspace_id=r.workspace_id),1)=1`, owner, next).Scan(&out.Records); err != nil {
			return out, err
		}
	}
	if p.HabitsEnabled {
		count, err := countDigestHabits(ctx, q, owner, now)
		if err != nil {
			return out, err
		}
		out.Habits = count
	}
	if err := q.QueryRowContext(ctx, `SELECT COUNT(*) FROM personal_waiting WHERE owner_id=? AND status='waiting' AND expected_date<>'' AND expected_date<=?`, owner, day).Scan(&out.Waiting); err != nil {
		return out, err
	}
	return out, nil
}

func weeklyDigestSummary(ctx context.Context, q digestQueryer, owner int64, p reminderPreferences, now time.Time, loc *time.Location) (reminderDigestSummary, error) {
	var out reminderDigestSummary
	local := now.In(loc)
	start := monday(time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc))
	next := start.AddDate(0, 0, 7)
	startUTC, nextUTC := start.UTC().Format(time.RFC3339Nano), next.UTC().Format(time.RFC3339Nano)
	if p.PersonalEnabled {
		if err := q.QueryRowContext(ctx, `SELECT COUNT(*) FROM personal_plans WHERE owner_id=? AND status='done' AND completed_at>=? AND completed_at<?`, owner, startUTC, nextUTC).Scan(&out.Plans); err != nil {
			return out, err
		}
	}
	if p.DeadlineEnabled {
		if err := q.QueryRowContext(ctx, `SELECT COUNT(*) FROM records r WHERE r.owner_id=? AND r.status='completed' AND r.completed_at>=? AND r.completed_at<? AND `+reminderRecordAccess+` AND COALESCE((SELECT deadline_enabled FROM reminder_project_preferences pref WHERE pref.user_id=r.owner_id AND pref.workspace_id=r.workspace_id),1)=1`, owner, startUTC, nextUTC).Scan(&out.Records); err != nil {
			return out, err
		}
	}
	if p.HabitsEnabled {
		if err := q.QueryRowContext(ctx, `SELECT COUNT(DISTINCT h.id) FROM personal_habits h JOIN personal_habit_checkins c ON c.habit_id=h.id AND c.owner_id=h.owner_id WHERE h.owner_id=? AND c.checkin_date>=? AND c.checkin_date<?`, owner, start.Format("2006-01-02"), next.Format("2006-01-02")).Scan(&out.Habits); err != nil {
			return out, err
		}
	}
	if err := q.QueryRowContext(ctx, `SELECT COUNT(*) FROM personal_waiting WHERE owner_id=? AND status='waiting'`, owner).Scan(&out.Waiting); err != nil {
		return out, err
	}
	return out, nil
}

func digestScheduleEqual(kind string, a, b reminderPreferences) bool {
	if a.Timezone != b.Timezone || a.QuietStart != b.QuietStart || a.QuietEnd != b.QuietEnd || a.DeadlineEnabled != b.DeadlineEnabled || a.PersonalEnabled != b.PersonalEnabled || a.HabitsEnabled != b.HabitsEnabled {
		return false
	}
	if kind == "daily" {
		return a.DailyDigestEnabled == b.DailyDigestEnabled && a.DailyDigestTime == b.DailyDigestTime
	}
	return a.WeeklyDigestEnabled == b.WeeklyDigestEnabled && a.WeeklyDigestWeekday == b.WeeklyDigestWeekday && a.WeeklyDigestTime == b.WeeklyDigestTime
}

func deliverReminderDigest(ctx context.Context, store *Store, owner int64, kind string, snapshot reminderPreferences, now time.Time) (bool, error) {
	loc, err := time.LoadLocation(snapshot.Timezone)
	if err != nil || !digestDue(kind, snapshot, now, loc) {
		return false, err
	}
	period, validUntil := digestPeriod(kind, snapshot, now, loc)
	key := fmt.Sprintf("digest-%s-v1:%d:%s", kind, owner, period)
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	current, err := loadReminderPreferences(ctx, tx, owner)
	if err != nil || !digestScheduleEqual(kind, snapshot, current) || !digestDue(kind, current, now, loc) {
		return false, err
	}
	var exists int
	if err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM notification_deliveries WHERE delivery_key=?`, key).Scan(&exists); err != nil || exists > 0 {
		return false, err
	}
	var summary reminderDigestSummary
	if kind == "daily" {
		summary, err = dailyDigestSummary(ctx, tx, owner, current, now, loc)
	} else {
		summary, err = weeklyDigestSummary(ctx, tx, owner, current, now, loc)
	}
	if err != nil {
		return false, err
	}
	id, err := newID()
	if err != nil {
		return false, err
	}
	title, body, typ, entity := "Сводка на сегодня", fmt.Sprintf("Личных дел: %d · сроков проектов: %d · привычек: %d · ожиданий: %d", summary.Plans, summary.Records, summary.Habits, summary.Waiting), "daily_digest", "daily:"+period
	clock := current.DailyDigestTime
	if kind == "weekly" {
		title = "Недельный обзор готов"
		body = fmt.Sprintf("За неделю: личных дел выполнено %d · карточек завершено %d · привычек с отметками %d · активных ожиданий %d", summary.Plans, summary.Records, summary.Habits, summary.Waiting)
		typ, entity, clock = "weekly_digest", "weekly:"+period, current.WeeklyDigestTime
	}
	stamp := now.UTC().Format(time.RFC3339Nano)
	if _, err = tx.ExecContext(ctx, `INSERT INTO notifications(id,user_id,type,title,body,entity_type,entity_id,created_at) VALUES(?,?,?,?,?,'personal_digest',?,?)`, id, owner, typ, title, body, entity, stamp); err != nil {
		return false, err
	}
	weekday := 0
	if kind == "weekly" {
		weekday = current.WeeklyDigestWeekday
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO reminder_digest_sources(notification_id,digest_kind,local_period,valid_until,timezone,schedule_clock,schedule_weekday) VALUES(?,?,?,?,?,?,?)`, id, kind, period, validUntil.UTC().Format(time.RFC3339Nano), current.Timezone, clock, weekday); err != nil {
		return false, err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO notification_deliveries(delivery_key,notification_id,created_at) VALUES(?,?,?)`, key, id, stamp); err != nil {
		return false, err
	}
	return true, tx.Commit()
}

func deliverReminderDigests(ctx context.Context, store *Store, now time.Time) error {
	rows, err := store.db.QueryContext(ctx, `SELECT user_id FROM reminder_preferences WHERE daily_digest_enabled=1 OR weekly_digest_enabled=1 ORDER BY user_id`)
	if err != nil {
		return err
	}
	owners := []int64{}
	for rows.Next() {
		var owner int64
		if err = rows.Scan(&owner); err != nil {
			rows.Close()
			return err
		}
		owners = append(owners, owner)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	created := 0
	for _, owner := range owners {
		p, loadErr := loadReminderPreferences(ctx, store.db, owner)
		if loadErr != nil {
			return loadErr
		}
		for _, kind := range []string{"daily", "weekly"} {
			made, deliverErr := deliverReminderDigest(ctx, store, owner, kind, p, now)
			if deliverErr != nil {
				return deliverErr
			}
			if made {
				created++
				if created >= 100 {
					return nil
				}
			}
		}
	}
	return nil
}

const digestReminderFresh = `(n.type NOT IN ('daily_digest','weekly_digest') OR EXISTS (
 SELECT 1 FROM reminder_digest_sources source JOIN reminder_preferences preference ON preference.user_id=n.user_id
 WHERE source.notification_id=n.id AND julianday(source.valid_until)>julianday('now') AND source.timezone=preference.timezone
 AND ((source.digest_kind='daily' AND preference.daily_digest_enabled=1 AND source.schedule_clock=preference.daily_digest_time)
 OR (source.digest_kind='weekly' AND preference.weekly_digest_enabled=1 AND source.schedule_clock=preference.weekly_digest_time AND source.schedule_weekday=preference.weekly_digest_weekday))))`
