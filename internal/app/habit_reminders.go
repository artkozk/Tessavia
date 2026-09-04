package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"time"
)

type habitReminderPreference struct {
	HabitID       string `json:"habitId"`
	Title         string `json:"title"`
	Timezone      string `json:"timezone"`
	Time          string `json:"time"`
	Revision      int    `json:"revision"`
	HabitRevision int    `json:"habitRevision"`
	Inherited     bool   `json:"inherited"`
}
type reminderHabit struct {
	habit    PersonalHabit
	owner    int64
	time     string
	revision int
}

// One compact snapshot; historical note text and all-time streaks are unnecessary for delivery.
func loadReminderHabit(ctx context.Context, q personalQueryer, owner int64, id string, now time.Time) (reminderHabit, error) {
	var out reminderHabit
	var rules, pauses, moves, checks string
	h := &out.habit
	out.owner = owner
	err := q.QueryRowContext(ctx, `SELECT h.id,h.title,h.start_date,h.timezone,h.revision,COALESCE(h.archived_at,''),COALESCE(pref.reminder_time,''),COALESCE(pref.revision,0),
 COALESCE((SELECT json_group_array(json_object('date',effective_date,'rule',json(config))) FROM personal_habit_rules WHERE habit_id=h.id),'[]'),
 COALESCE((SELECT json_group_array(json_object('startDate',start_date,'endDate',end_date)) FROM personal_habit_pauses WHERE habit_id=h.id),'[]'),
 COALESCE((SELECT json_group_array(json_object('sourceDate',source_date,'targetDate',target_date)) FROM personal_habit_moves WHERE habit_id=h.id),'[]'),
 COALESCE((SELECT json_group_array(json_object('date',checkin_date,'value',COALESCE(amount,value),'state',result_state,'updatedAt',updated_at)) FROM personal_habit_checkins WHERE habit_id=h.id AND owner_id=h.owner_id AND checkin_date>=?),'[]')
 FROM personal_habits h LEFT JOIN habit_reminder_preferences pref ON pref.habit_id=h.id AND pref.owner_id=h.owner_id WHERE h.id=? AND h.owner_id=?`, now.UTC().AddDate(0, 0, -35).Format("2006-01-02"), id, owner).Scan(&h.ID, &h.Title, &h.StartDate, &h.Timezone, &h.Revision, &h.ArchivedAt, &out.time, &out.revision, &rules, &pauses, &moves, &checks)
	if err != nil {
		return out, err
	}
	var versions []struct {
		Date string    `json:"date"`
		Rule HabitRule `json:"rule"`
	}
	if err = json.Unmarshal([]byte(rules), &versions); err != nil {
		return out, err
	}
	for _, version := range versions {
		version.Rule.EffectiveDate = version.Date
		h.Rules = append(h.Rules, version.Rule)
	}
	sort.Slice(h.Rules, func(i, j int) bool { return h.Rules[i].EffectiveDate < h.Rules[j].EffectiveDate })
	if err = json.Unmarshal([]byte(pauses), &h.Pauses); err != nil {
		return out, err
	}
	if err = json.Unmarshal([]byte(moves), &h.Moves); err != nil {
		return out, err
	}
	if err = json.Unmarshal([]byte(checks), &h.Checkins); err != nil {
		return out, err
	}
	return out, nil
}

func habitReminderOn(snapshot reminderHabit, now time.Time) (day, clock, cycle, periodFrom string, until time.Time, eligible bool) {
	h := snapshot.habit
	loc, err := time.LoadLocation(h.Timezone)
	if err != nil || h.ArchivedAt != "" {
		return
	}
	local := now.In(loc)
	day = local.Format("2006-01-02")
	periodFrom = day
	checks := map[string]HabitCheckin{}
	for _, check := range h.Checkins {
		checks[check.Date] = check
	}
	d := habitDay(h, day, day, checks)
	clock = habitRuleOn(h, day).ReminderTime
	if snapshot.revision > 0 {
		clock = snapshot.time
	}
	if !validDayClock(clock) || !d.Editable || !d.Planned || !oneOf(d.State, "pending", "partial", "snoozed") {
		return
	}
	for _, pause := range h.Pauses {
		if day >= pause.StartDate && (pause.EndDate == "" || day <= pause.EndDate) {
			return
		}
	}
	if oneOf(d.Rule.Cadence, "weekly", "monthly") {
		periodFrom, _ = habitPeriodBounds(day, d.Rule.Cadence)
		actual := 0.0
		for date := periodFrom; date <= day; date = habitAdd(date, 1) {
			entry := habitDay(h, date, day, checks)
			if d.Rule.PeriodMeasure == "days" && entry.State == "success" {
				actual++
			}
			if d.Rule.PeriodMeasure == "volume" && entry.Checkin != nil && entry.Checkin.State == "measured" {
				actual += entry.Checkin.Value
			}
		}
		if actual >= d.Rule.PeriodTarget {
			return
		}
	}
	if local.Format("15:04") < clock {
		return
	}
	cycle = fmt.Sprintf("habit-v1:%s:%s:%s:%d", h.ID, day, clock, snapshot.revision)
	if d.State == "snoozed" && d.Checkin != nil {
		at, err := time.Parse(time.RFC3339Nano, d.Checkin.UpdatedAt)
		if err != nil || now.Before(at.Add(time.Hour)) {
			return
		}
		cycle += ":snoozed:" + d.Checkin.UpdatedAt
	}
	until = time.Date(local.Year(), local.Month(), local.Day()+1, 0, 0, 0, 0, loc)
	eligible = true
	return
}

func (s *Server) handleHabitReminderPreference(w http.ResponseWriter, r *http.Request) {
	owner, id := currentUser(r).ID, r.PathValue("id")
	now := time.Now()
	if r.Method == http.MethodPut {
		var input struct {
			Time                  string `json:"time"`
			ExpectedRevision      *int   `json:"expectedRevision"`
			ExpectedHabitRevision int    `json:"expectedHabitRevision"`
		}
		if !decodeJSON(w, r, &input) {
			return
		}
		if input.ExpectedRevision == nil || *input.ExpectedRevision < 0 || input.ExpectedHabitRevision < 1 || input.Time != "" && !validDayClock(input.Time) {
			writeError(w, 400, "Укажите время или очистите поле и обновите версию привычки")
			return
		}
		tx, err := s.store.db.BeginTx(r.Context(), nil)
		if err != nil {
			writeError(w, 500, "Не удалось сохранить время")
			return
		}
		defer tx.Rollback()
		snapshot, err := loadReminderHabit(r.Context(), tx, owner, id, now)
		if err == sql.ErrNoRows || err == nil && snapshot.habit.ArchivedAt != "" {
			writeError(w, 404, "Привычка недоступна")
			return
		}
		if err != nil {
			writeError(w, 500, "Не удалось прочитать привычку")
			return
		}
		if snapshot.revision == 0 || snapshot.time != input.Time {
			if snapshot.revision != *input.ExpectedRevision || snapshot.habit.Revision != input.ExpectedHabitRevision {
				writeError(w, 409, "Привычка или время изменились. Сравните текущую версию")
				return
			}
			_, err = tx.ExecContext(r.Context(), `INSERT INTO habit_reminder_preferences(habit_id,owner_id,reminder_time,revision,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(habit_id) DO UPDATE SET reminder_time=excluded.reminder_time,revision=excluded.revision,updated_at=excluded.updated_at`, id, owner, input.Time, snapshot.revision+1, nowText())
			if err != nil {
				writeError(w, 500, "Не удалось сохранить напоминание")
				return
			}
		}
		if tx.Commit() != nil {
			writeError(w, 500, "Не удалось подтвердить сохранение")
			return
		}
	}
	snapshot, err := loadReminderHabit(r.Context(), s.store.db, owner, id, now)
	if err == sql.ErrNoRows || err == nil && snapshot.habit.ArchivedAt != "" {
		writeError(w, 404, "Привычка недоступна")
		return
	}
	if err != nil {
		writeError(w, 500, "Не удалось прочитать время напоминания")
		return
	}
	loc, err := time.LoadLocation(snapshot.habit.Timezone)
	if err != nil {
		writeError(w, 500, "Не удалось прочитать часовой пояс")
		return
	}
	clock := snapshot.time
	if snapshot.revision == 0 {
		clock = habitRuleOn(snapshot.habit, now.In(loc).Format("2006-01-02")).ReminderTime
	}
	writeJSON(w, 200, habitReminderPreference{HabitID: id, Title: snapshot.habit.Title, Timezone: snapshot.habit.Timezone, Time: clock, Revision: snapshot.revision, HabitRevision: snapshot.habit.Revision, Inherited: snapshot.revision == 0})
}

func deliverHabitReminders(ctx context.Context, store *Store, now time.Time) error {
	rows, err := store.db.QueryContext(ctx, `SELECT h.id,h.owner_id FROM personal_habits h LEFT JOIN habit_reminder_preferences pref ON pref.habit_id=h.id AND pref.owner_id=h.owner_id WHERE h.archived_at IS NULL AND ((pref.habit_id IS NOT NULL AND pref.reminder_time<>'') OR (pref.habit_id IS NULL AND EXISTS(SELECT 1 FROM personal_habit_rules hr WHERE hr.habit_id=h.id AND COALESCE(json_extract(hr.config,'$.reminderTime'),'')<>''))) ORDER BY h.owner_id,h.id`)
	if err != nil {
		return err
	}
	type source struct {
		id    string
		owner int64
	}
	items := []source{}
	for rows.Next() {
		var item source
		if err = rows.Scan(&item.id, &item.owner); err != nil {
			rows.Close()
			return err
		}
		items = append(items, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	seen := map[string]bool{}
	rows, err = store.db.QueryContext(ctx, `SELECT delivery_key FROM notification_deliveries WHERE created_at>=? AND delivery_key LIKE 'habit-v1:%'`, now.UTC().Add(-48*time.Hour).Format(time.RFC3339Nano))
	if err != nil {
		return err
	}
	for rows.Next() {
		var key string
		if err = rows.Scan(&key); err != nil {
			rows.Close()
			return err
		}
		seen[key] = true
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	preferences := map[int64]reminderPreferences{}
	created := 0
	for _, item := range items {
		if err = ctx.Err(); err != nil {
			return err
		}
		prefs, loaded := preferences[item.owner]
		if !loaded {
			prefs, err = loadReminderPreferences(ctx, store.db, item.owner)
			if err != nil {
				return err
			}
			preferences[item.owner] = prefs
		}
		loc, err := time.LoadLocation(prefs.Timezone)
		if err != nil {
			return err
		}
		if !prefs.HabitsEnabled || reminderQuiet(prefs, now, loc) {
			continue
		}
		snapshot, err := loadReminderHabit(ctx, store.db, item.owner, item.id, now)
		if err == sql.ErrNoRows {
			continue
		}
		if err != nil {
			return err
		}
		_, _, cycle, _, _, eligible := habitReminderOn(snapshot, now)
		if !eligible || seen[cycle] {
			continue
		}
		made, err := func() (bool, error) {
			tx, err := store.db.BeginTx(ctx, nil)
			if err != nil {
				return false, err
			}
			defer tx.Rollback()
			snapshot, err := loadReminderHabit(ctx, tx, item.owner, item.id, now)
			if err == sql.ErrNoRows {
				return false, nil
			}
			if err != nil {
				return false, err
			}
			day, _, key, from, until, eligible := habitReminderOn(snapshot, now)
			if !eligible || key != cycle {
				return false, nil
			}
			prefs, err := loadReminderPreferences(ctx, tx, item.owner)
			if err != nil {
				return false, err
			}
			loc, err := time.LoadLocation(prefs.Timezone)
			if err != nil {
				return false, err
			}
			if !prefs.HabitsEnabled || reminderQuiet(prefs, now, loc) {
				return false, nil
			}
			var exists int
			if err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM notification_deliveries WHERE delivery_key=?`, key).Scan(&exists); err != nil || exists > 0 {
				return false, err
			}
			id, err := newID()
			if err != nil {
				return false, err
			}
			stamp := now.UTC().Format(time.RFC3339Nano)
			_, err = tx.ExecContext(ctx, `INSERT INTO notifications(id,user_id,type,title,body,entity_type,entity_id,created_at) VALUES(?,?,'habit_reminder','Отметить результат привычки',?,'personal_habit',?,?)`, id, item.owner, snapshot.habit.Title, item.id, stamp)
			if err != nil {
				return false, err
			}
			_, err = tx.ExecContext(ctx, `INSERT INTO habit_reminder_sources(notification_id,habit_id,day,period_from,valid_until) VALUES(?,?,?,?,?)`, id, item.id, day, from, until.UTC().Format(time.RFC3339Nano))
			if err != nil {
				return false, err
			}
			_, err = tx.ExecContext(ctx, `INSERT INTO notification_deliveries(delivery_key,notification_id,created_at) VALUES(?,?,?)`, key, id, stamp)
			if err != nil {
				return false, err
			}
			return true, tx.Commit()
		}()
		if err != nil {
			return err
		}
		if made {
			created++
			if created >= 100 {
				return nil
			}
		}
	}
	return nil
}

const habitReminderFresh = `(n.type<>'habit_reminder' OR EXISTS(SELECT 1 FROM habit_reminder_sources src JOIN personal_habits h ON h.id=src.habit_id WHERE src.notification_id=n.id AND src.invalidated=0 AND h.owner_id=n.user_id AND h.archived_at IS NULL AND julianday(src.valid_until)>julianday('now')))`

type todayHabitReminder struct {
	HabitID        string `json:"habitId"`
	NotificationID string `json:"notificationId"`
	Title          string `json:"title"`
	CreatedAt      string `json:"createdAt"`
}

func loadTodayHabitReminders(ctx context.Context, db *sql.DB, owner int64) ([]todayHabitReminder, bool, error) {
	rows, err := db.QueryContext(ctx, `SELECT n.entity_id,n.id,h.title,n.created_at FROM notifications n JOIN personal_habits h ON h.id=n.entity_id AND h.owner_id=n.user_id WHERE n.user_id=? AND n.type='habit_reminder' AND n.entity_type='personal_habit' AND n.read_at IS NULL AND `+habitReminderFresh+` ORDER BY n.created_at DESC,n.id LIMIT 7`, owner)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	items := []todayHabitReminder{}
	for rows.Next() {
		var item todayHabitReminder
		if err = rows.Scan(&item.HabitID, &item.NotificationID, &item.Title, &item.CreatedAt); err != nil {
			return nil, false, err
		}
		items = append(items, item)
	}
	more := len(items) > 6
	if more {
		items = items[:6]
	}
	return items, more, rows.Err()
}
