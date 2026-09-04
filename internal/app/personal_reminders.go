package app

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"time"
)

type personalPlanReminder struct {
	PlanID         string `json:"planId"`
	Title          string `json:"title"`
	PlanUpdatedAt  string `json:"planUpdatedAt"`
	PlanStatus     string `json:"planStatus"`
	RemindAt       string `json:"remindAt"`
	Timezone       string `json:"timezone"`
	Revision       int64  `json:"revision"`
	Cancelled      bool   `json:"cancelled"`
	UpdatedAt      string `json:"updatedAt"`
	NotificationID string `json:"notificationId"`
	ReadAt         string `json:"readAt"`
}

func loadPersonalPlanReminder(ctx context.Context, q personalQueryer, owner int64, planID string) (personalPlanReminder, error) {
	item := personalPlanReminder{PlanID: planID, Timezone: "UTC", Cancelled: true}
	err := q.QueryRowContext(ctx, `SELECT p.title,p.status,p.updated_at,COALESCE(r.remind_at,''),COALESCE(r.timezone,'UTC'),COALESCE(r.revision,0),COALESCE(r.cancelled,1),COALESCE(r.updated_at,''),COALESCE(n.id,''),COALESCE(n.read_at,'')
 FROM personal_plans p LEFT JOIN personal_plan_reminders r ON r.plan_id=p.id AND r.owner_id=p.owner_id
 LEFT JOIN personal_plan_reminder_sources src ON src.plan_id=r.plan_id AND src.revision=r.revision
 LEFT JOIN notifications n ON n.id=src.notification_id AND n.user_id=p.owner_id
 WHERE p.id=? AND p.owner_id=? AND p.status<>'archived'`, planID, owner).Scan(&item.Title, &item.PlanStatus, &item.PlanUpdatedAt, &item.RemindAt, &item.Timezone, &item.Revision, &item.Cancelled, &item.UpdatedAt, &item.NotificationID, &item.ReadAt)
	return item, err
}

func (s *Server) handlePersonalPlanReminder(w http.ResponseWriter, r *http.Request) {
	owner, planID := currentUser(r).ID, r.PathValue("id")
	if r.Method == http.MethodPut {
		var input struct {
			RemindAt              string `json:"remindAt"`
			Timezone              string `json:"timezone"`
			Cancelled             bool   `json:"cancelled"`
			ExpectedRevision      *int64 `json:"expectedRevision"`
			ExpectedPlanUpdatedAt string `json:"expectedPlanUpdatedAt"`
		}
		if !decodeJSON(w, r, &input) {
			return
		}
		if input.ExpectedRevision == nil || *input.ExpectedRevision < 0 || input.ExpectedPlanUpdatedAt == "" {
			writeError(w, 400, "Обновите версию дела и напоминания")
			return
		}
		var at time.Time
		if !input.Cancelled {
			var err error
			at, err = time.Parse(time.RFC3339Nano, input.RemindAt)
			if err != nil || len(input.Timezone) > 64 || input.Timezone == "" || input.Timezone == "Local" {
				writeError(w, 400, "Укажите время и часовой пояс напоминания")
				return
			}
			if _, err = time.LoadLocation(input.Timezone); err != nil {
				writeError(w, 400, "Неизвестный часовой пояс")
				return
			}
			input.RemindAt = at.UTC().Format(time.RFC3339Nano)
		}
		tx, err := s.store.db.BeginTx(r.Context(), nil)
		if err != nil {
			writeError(w, 500, "Не удалось сохранить напоминание")
			return
		}
		defer tx.Rollback()
		old, err := loadPersonalPlanReminder(r.Context(), tx, owner, planID)
		if err == sql.ErrNoRows {
			writeError(w, 404, "Личное дело недоступно")
			return
		}
		if err != nil {
			writeError(w, 500, "Не удалось прочитать напоминание")
			return
		}
		changed := old.Cancelled != input.Cancelled || !input.Cancelled && (old.RemindAt != input.RemindAt || old.Timezone != input.Timezone)
		if changed {
			if old.Revision != *input.ExpectedRevision || old.PlanUpdatedAt != input.ExpectedPlanUpdatedAt {
				writeError(w, 409, "Дело или напоминание изменились. Сравните текущую версию")
				return
			}
			if !input.Cancelled && old.PlanStatus != "planned" {
				writeError(w, 409, "Напоминание можно задать только незавершённому делу")
				return
			}
			if !input.Cancelled && (!at.After(time.Now()) || at.After(time.Now().AddDate(5, 0, 0))) {
				writeError(w, 400, "Выберите будущее время в пределах пяти лет")
				return
			}
			if input.Cancelled {
				input.RemindAt = old.RemindAt
				input.Timezone = old.Timezone
			}
			stamp, revision := nowText(), old.Revision+1
			_, err = tx.ExecContext(r.Context(), `INSERT INTO personal_plan_reminders(plan_id,owner_id,remind_at,timezone,revision,cancelled,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(plan_id) DO UPDATE SET remind_at=excluded.remind_at,timezone=excluded.timezone,revision=excluded.revision,cancelled=excluded.cancelled,updated_at=excluded.updated_at`, planID, owner, input.RemindAt, input.Timezone, revision, input.Cancelled, stamp)
			if err != nil {
				writeError(w, 500, "Не удалось записать напоминание")
				return
			}
			action := "schedule"
			if input.Cancelled {
				action = "cancel"
			}
			if _, err = tx.ExecContext(r.Context(), `INSERT INTO personal_plan_reminder_events(plan_id,revision,action,remind_at,happened_at) VALUES(?,?,?,?,?)`, planID, revision, action, input.RemindAt, stamp); err != nil {
				writeError(w, 500, "Не удалось сохранить историю напоминания")
				return
			}
		}
		if tx.Commit() != nil {
			writeError(w, 500, "Не удалось подтвердить сохранение")
			return
		}
	}
	item, err := loadPersonalPlanReminder(r.Context(), s.store.db, owner, planID)
	if err == sql.ErrNoRows {
		writeError(w, 404, "Личное дело недоступно")
		return
	}
	if err != nil {
		writeError(w, 500, "Не удалось прочитать напоминание")
		return
	}
	writeJSON(w, 200, item)
}

func (s *Server) handlePersonalReminders(w http.ResponseWriter, r *http.Request) {
	owner := currentUser(r).ID
	// Read canonical delivery rows. This endpoint never runs a scheduler.
	rows, err := s.store.db.QueryContext(r.Context(), `SELECT p.id,p.title,p.updated_at,p.status,r.remind_at,r.timezone,r.revision,r.updated_at,COALESCE(n.id,''),COALESCE(n.read_at,'')
 FROM personal_plan_reminders r JOIN personal_plans p ON p.id=r.plan_id AND p.owner_id=r.owner_id
 LEFT JOIN personal_plan_reminder_sources src ON src.plan_id=r.plan_id AND src.revision=r.revision
 LEFT JOIN notifications n ON n.id=src.notification_id AND n.user_id=r.owner_id
 WHERE r.owner_id=? AND r.cancelled=0 AND p.status='planned' AND n.read_at IS NULL
 ORDER BY CASE WHEN n.id IS NOT NULL THEN 0 ELSE 1 END,julianday(r.remind_at),p.id LIMIT 21`, owner)
	if err != nil {
		writeError(w, 500, "Не удалось прочитать личные напоминания")
		return
	}
	items := []personalPlanReminder{}
	for rows.Next() {
		var item personalPlanReminder
		if err = rows.Scan(&item.PlanID, &item.Title, &item.PlanUpdatedAt, &item.PlanStatus, &item.RemindAt, &item.Timezone, &item.Revision, &item.UpdatedAt, &item.NotificationID, &item.ReadAt); err != nil {
			rows.Close()
			writeError(w, 500, "Не удалось прочитать напоминание")
			return
		}
		items = append(items, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		writeError(w, 500, "Не удалось дочитать напоминания")
		return
	}
	p, err := loadReminderPreferences(r.Context(), s.store.db, owner)
	if err != nil {
		writeError(w, 500, "Не удалось прочитать правила доставки")
		return
	}
	hasMore := len(items) > 20
	if hasMore {
		items = items[:20]
	}
	writeJSON(w, 200, map[string]any{"items": items, "hasMore": hasMore, "enabled": p.PersonalEnabled})
}

func deliverPersonalPlanReminders(ctx context.Context, store *Store, now time.Time) error {
	rows, err := store.db.QueryContext(ctx, `SELECT r.plan_id,r.owner_id,r.revision FROM personal_plan_reminders r JOIN personal_plans p ON p.id=r.plan_id AND p.owner_id=r.owner_id WHERE r.cancelled=0 AND p.status='planned' AND julianday(r.remind_at)<=julianday(?) AND NOT EXISTS(SELECT 1 FROM personal_plan_reminder_sources src WHERE src.plan_id=r.plan_id AND src.revision=r.revision) ORDER BY r.remind_at,r.plan_id`, now.UTC().Format(time.RFC3339Nano))
	if err != nil {
		return err
	}
	type source struct {
		plan            string
		owner, revision int64
	}
	candidates := []source{}
	for rows.Next() {
		var item source
		if err = rows.Scan(&item.plan, &item.owner, &item.revision); err != nil {
			rows.Close()
			return err
		}
		candidates = append(candidates, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	created := 0
	preferences := map[int64]reminderPreferences{}
	for _, candidate := range candidates {
		prefs, loaded := preferences[candidate.owner]
		if !loaded {
			prefs, err = loadReminderPreferences(ctx, store.db, candidate.owner)
			if err != nil {
				return err
			}
			preferences[candidate.owner] = prefs
		}
		loc, err := time.LoadLocation(prefs.Timezone)
		if err != nil {
			return err
		}
		if !prefs.PersonalEnabled || reminderQuiet(prefs, now, loc) {
			continue
		}
		made, err := func() (bool, error) {
			tx, err := store.db.BeginTx(ctx, nil)
			if err != nil {
				return false, err
			}
			defer tx.Rollback()
			item, err := loadPersonalPlanReminder(ctx, tx, candidate.owner, candidate.plan)
			if err == sql.ErrNoRows {
				return false, nil
			}
			if err != nil {
				return false, err
			}
			if item.Cancelled || item.Revision != candidate.revision || item.PlanStatus != "planned" || item.NotificationID != "" {
				return false, nil
			}
			at, err := time.Parse(time.RFC3339Nano, item.RemindAt)
			if err != nil {
				return false, err
			}
			if at.After(now) {
				return false, nil
			}
			prefs, err := loadReminderPreferences(ctx, tx, candidate.owner)
			if err != nil {
				return false, err
			}
			loc, err := time.LoadLocation(prefs.Timezone)
			if err != nil {
				return false, err
			}
			if !prefs.PersonalEnabled || reminderQuiet(prefs, now, loc) {
				return false, nil
			}
			id, err := newID()
			if err != nil {
				return false, err
			}
			stamp := now.UTC().Format(time.RFC3339Nano)
			_, err = tx.ExecContext(ctx, `INSERT INTO notifications(id,user_id,type,title,body,entity_type,entity_id,created_at) VALUES(?,?,'personal_reminder','Личное напоминание',?,'personal_plan',?,?)`, id, candidate.owner, item.Title, candidate.plan, stamp)
			if err != nil {
				return false, err
			}
			_, err = tx.ExecContext(ctx, `INSERT INTO personal_plan_reminder_sources(notification_id,plan_id,revision) VALUES(?,?,?)`, id, candidate.plan, item.Revision)
			if err != nil {
				return false, err
			}
			_, err = tx.ExecContext(ctx, `INSERT INTO notification_deliveries(delivery_key,notification_id,created_at) VALUES(?,?,?)`, fmt.Sprintf("personal-plan:%s:%d", candidate.plan, item.Revision), id, stamp)
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

const personalReminderFresh = `(n.type<>'personal_reminder' OR EXISTS(SELECT 1 FROM personal_plan_reminder_sources src JOIN personal_plan_reminders pr ON pr.plan_id=src.plan_id JOIN personal_plans p ON p.id=pr.plan_id WHERE src.notification_id=n.id AND src.revision=pr.revision AND pr.cancelled=0 AND pr.owner_id=n.user_id AND p.owner_id=n.user_id AND p.status='planned'))`
