ALTER TABLE reminder_preferences ADD COLUMN personal_enabled INTEGER NOT NULL DEFAULT 1 CHECK(personal_enabled IN (0,1));
CREATE TABLE personal_plan_reminders (
    plan_id TEXT PRIMARY KEY REFERENCES personal_plans(id),
    owner_id INTEGER NOT NULL REFERENCES users(id),
    remind_at TEXT NOT NULL DEFAULT '',
    timezone TEXT NOT NULL DEFAULT 'UTC',
    revision INTEGER NOT NULL CHECK(revision>0),
    cancelled INTEGER NOT NULL DEFAULT 0 CHECK(cancelled IN (0,1)),
    updated_at TEXT NOT NULL
);
CREATE INDEX personal_plan_reminders_due ON personal_plan_reminders(cancelled,remind_at);
CREATE TABLE personal_plan_reminder_sources (
    notification_id TEXT PRIMARY KEY REFERENCES notifications(id),
    plan_id TEXT NOT NULL REFERENCES personal_plan_reminders(plan_id),
    revision INTEGER NOT NULL,
    UNIQUE(plan_id,revision)
);
CREATE TABLE personal_plan_reminder_events (
    id INTEGER PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES personal_plan_reminders(plan_id),
    revision INTEGER NOT NULL,
    action TEXT NOT NULL CHECK(action IN ('schedule','cancel','source_changed')),
    remind_at TEXT NOT NULL,
    happened_at TEXT NOT NULL
);
CREATE TRIGGER cancel_personal_reminder_on_plan_change
AFTER UPDATE OF status,due_at,starts_at,ends_at,start_date,end_date,occurrence_date,occurrence_state ON personal_plans
WHEN OLD.status IS NOT NEW.status OR OLD.due_at IS NOT NEW.due_at
 OR OLD.starts_at IS NOT NEW.starts_at OR OLD.ends_at IS NOT NEW.ends_at
 OR OLD.start_date IS NOT NEW.start_date OR OLD.end_date IS NOT NEW.end_date
 OR OLD.occurrence_date IS NOT NEW.occurrence_date OR OLD.occurrence_state IS NOT NEW.occurrence_state
BEGIN
    INSERT INTO personal_plan_reminder_events(plan_id,revision,action,remind_at,happened_at)
        SELECT plan_id,revision+1,'source_changed',remind_at,NEW.updated_at
        FROM personal_plan_reminders WHERE plan_id=NEW.id AND cancelled=0;
    UPDATE personal_plan_reminders SET cancelled=1,revision=revision+1,updated_at=NEW.updated_at
        WHERE plan_id=NEW.id AND cancelled=0;
END;
