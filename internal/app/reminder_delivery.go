package app

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"
)

// RunReminderWorker keeps delivery work outside every user's HTTP read path.
// The store and receipts are shared; a restart or another worker cannot duplicate a delivery.
func RunReminderWorker(ctx context.Context, store *Store) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		if ctx.Err() != nil {
			return
		}
		tick, cancel := context.WithTimeout(ctx, 10*time.Second)
		if err := deliverDeadlineReminders(tick, store, time.Now()); err != nil && ctx.Err() == nil {
			log.Printf("deadline reminder tick: %v", err)
		}
		cancel()
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

const reminderRecordAccess = `EXISTS (
 SELECT 1 FROM workspace_members m JOIN workspaces w ON w.id=m.workspace_id
 WHERE m.workspace_id=r.workspace_id AND m.user_id=r.owner_id AND m.status='active'
 AND w.archived_at IS NULL AND (w.team_id IS NULL OR EXISTS (
 SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id=t.id
 WHERE t.id=w.team_id AND t.deleted_at IS NULL AND tm.user_id=r.owner_id AND tm.status='active')))`
const reminderActiveRecord = `r.status NOT IN ('completed','cancelled','archived','rejected','postponed')`

// Calendar days are compared in the delivery zone, never in UTC-sized 24h buckets.
func deadlineWindow(now, due time.Time, loc *time.Location) (kind, title string, until time.Time) {
	local := now.In(loc)
	due = due.In(loc)
	midnight := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc)
	tomorrow := midnight.AddDate(0, 0, 1)
	switch {
	case !due.After(local):
		return "overdue", "Срок просрочен", tomorrow
	case due.Before(tomorrow):
		return "due_today", "Срок сегодня", due
	case due.Before(tomorrow.AddDate(0, 0, 1)):
		return "due_tomorrow", "Срок завтра", tomorrow
	default:
		return "", "", time.Time{}
	}
}

func deliverDeadlineReminders(ctx context.Context, store *Store, now time.Time) error {
	// Broad UTC bound covers tomorrow in every supported zone; the exact window is per owner.
	upper := now.Add(72 * time.Hour)
	rows, err := store.db.QueryContext(ctx, `SELECT r.id,r.type,r.business_kind,r.subtype,r.record_kind,r.title,r.owner_id,r.due_at,r.updated_at,r.workspace_id
 FROM records r WHERE r.owner_id IS NOT NULL AND julianday(r.due_at)<julianday(?) AND `+reminderActiveRecord+` AND `+reminderRecordAccess+` ORDER BY r.due_at,r.id`, upper.UTC().Format(time.RFC3339Nano))
	if err != nil {
		return err
	}
	type source struct {
		id, typ, business, subtype, recordKind, title, due, version, workspace string
		owner                                                                  int64
	}
	candidates := []source{}
	for rows.Next() {
		var item source
		if err = rows.Scan(&item.id, &item.typ, &item.business, &item.subtype, &item.recordKind, &item.title, &item.owner, &item.due, &item.version, &item.workspace); err != nil {
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
	// Skip already delivered candidates without a write transaction per record.
	dayStart := now.UTC().Add(-48 * time.Hour).Truncate(24 * time.Hour)
	seen := map[string]bool{}
	delivered, err := store.db.QueryContext(ctx, `SELECT delivery_key FROM notification_deliveries WHERE created_at>=?`, dayStart.UTC().Format(time.RFC3339Nano))
	if err != nil {
		return err
	}
	for delivered.Next() {
		var key string
		if err = delivered.Scan(&key); err != nil {
			delivered.Close()
			return err
		}
		seen[key] = true
	}
	err = delivered.Err()
	delivered.Close()
	if err != nil {
		return err
	}
	created := 0
	preferences := map[int64]reminderPreferences{}
	projects := map[string]bool{}
	for _, item := range candidates {
		if err = ctx.Err(); err != nil {
			return err
		}
		due, parseErr := time.Parse(time.RFC3339Nano, item.due)
		if parseErr != nil {
			continue
		}
		p, loaded := preferences[item.owner]
		if !loaded {
			p, err = loadReminderPreferences(ctx, store.db, item.owner)
			if err != nil {
				return err
			}
			preferences[item.owner] = p
		}
		if !p.DeadlineEnabled {
			continue
		}
		loc, err := time.LoadLocation(p.Timezone)
		if err != nil {
			return err
		}
		if reminderQuiet(p, now, loc) {
			continue
		}
		local := now.In(loc)
		kind, title, until := deadlineWindow(now, due, loc)
		if kind == "" {
			continue
		}
		key := fmt.Sprintf("deadline-v2:%s:%d:%s:%s:%s", item.id, item.owner, due.UTC().Format(time.RFC3339Nano), kind, local.Format("2006-01-02"))
		if p.Timezone != "Europe/Moscow" {
			key += ":" + p.Timezone
		}
		if seen[key] {
			continue
		}
		projectKey := fmt.Sprintf("%d:%s", item.owner, item.workspace)
		enabled, checked := projects[projectKey]
		if !checked {
			enabled, err = reminderProjectEnabled(ctx, store.db, item.owner, item.workspace)
			if err != nil {
				return err
			}
			projects[projectKey] = enabled
		}
		if !enabled {
			continue
		}
		made, err := func() (bool, error) {
			tx, err := store.db.BeginTx(ctx, nil)
			if err != nil {
				return false, err
			}
			defer tx.Rollback()
			current, err := loadReminderPreferences(ctx, tx, item.owner)
			if err != nil {
				return false, err
			}
			if current.UpdatedAt != p.UpdatedAt || !current.DeadlineEnabled || reminderQuiet(current, now, loc) {
				return false, nil
			}
			enabled, err := reminderProjectEnabled(ctx, tx, item.owner, item.workspace)
			if err != nil || !enabled {
				return false, err
			}
			var fresh int
			err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM records r WHERE r.id=? AND r.owner_id=? AND r.due_at=? AND r.updated_at=? AND `+reminderActiveRecord+` AND `+reminderRecordAccess, item.id, item.owner, item.due, item.version).Scan(&fresh)
			if err != nil || fresh == 0 {
				return false, err
			}
			var existing int
			if err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM notification_deliveries WHERE delivery_key=?`, key).Scan(&existing); err != nil || existing > 0 {
				return false, err
			}
			id, err := newID()
			if err != nil {
				return false, err
			}
			typ := item.typ
			if item.business != "" {
				typ = item.business
			} else if item.subtype == "question_set" {
				typ = "question_set"
			} else if item.recordKind == "meeting" {
				typ = "meeting"
			}
			stamp := now.UTC().Format(time.RFC3339Nano)
			body := fmt.Sprintf("«%s» · %s", item.title, due.In(loc).Format("02.01.2006 15:04"))
			if _, err = tx.ExecContext(ctx, `INSERT INTO notifications(id,user_id,type,title,body,entity_type,entity_id,created_at) VALUES(?,?,'deadline',?,?,?,?,?)`, id, item.owner, title, body, typ, item.id, stamp); err != nil {
				return false, err
			}
			if _, err = tx.ExecContext(ctx, `INSERT INTO deadline_delivery_sources(notification_id,due_at,kind,valid_until,timezone) VALUES(?,?,?,?,?)`, id, due.UTC().Format(time.RFC3339Nano), kind, until.UTC().Format(time.RFC3339Nano), p.Timezone); err != nil {
				return false, err
			}
			if _, err = tx.ExecContext(ctx, `INSERT INTO notification_deliveries(delivery_key,notification_id,created_at) VALUES(?,?,?)`, key, id, stamp); err != nil {
				return false, err
			}
			return true, tx.Commit()
		}()
		if err != nil && err != sql.ErrNoRows {
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

// Old messages remain in history, but an unknown or changed deadline is not a live alert.
const notificationFresh = `(n.type<>'deadline' OR EXISTS (
 SELECT 1 FROM deadline_delivery_sources ds JOIN records r ON r.id=n.entity_id
 WHERE ds.notification_id=n.id AND r.owner_id=n.user_id AND ` + reminderActiveRecord + `
 AND ds.timezone=COALESCE((SELECT timezone FROM reminder_preferences WHERE user_id=n.user_id),'Europe/Moscow')
 AND julianday(r.due_at)=julianday(ds.due_at) AND julianday(ds.valid_until)>julianday('now')))`
