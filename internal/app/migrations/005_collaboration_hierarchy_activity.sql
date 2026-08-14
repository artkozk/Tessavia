ALTER TABLE records
ADD COLUMN workstream TEXT NOT NULL DEFAULT 'business'
CHECK (workstream IN ('business', 'platform', 'operations'));

ALTER TABLE records
ADD COLUMN edit_policy TEXT NOT NULL DEFAULT 'shared'
CHECK (edit_policy IN ('shared', 'owner_only'));

ALTER TABLE records
ADD COLUMN parent_id TEXT REFERENCES records(id) ON DELETE RESTRICT;

ALTER TABLE records
ADD COLUMN is_root INTEGER NOT NULL DEFAULT 0
CHECK (is_root IN (0, 1));

ALTER TABLE records
ADD COLUMN actual_minutes INTEGER NOT NULL DEFAULT 0
CHECK (actual_minutes >= 0);

CREATE INDEX records_workstream_status_idx
ON records(workstream, status, priority, due_at, updated_at DESC);

CREATE INDEX records_parent_idx
ON records(parent_id, status, updated_at DESC);

CREATE TABLE user_activity_daily (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_date TEXT NOT NULL,
    active_seconds INTEGER NOT NULL DEFAULT 0 CHECK (active_seconds >= 0),
    interactions INTEGER NOT NULL DEFAULT 0 CHECK (interactions >= 0),
    last_seen_at TEXT NOT NULL,
    PRIMARY KEY(user_id, activity_date)
);

CREATE INDEX user_activity_daily_seen_idx
ON user_activity_daily(last_seen_at DESC);
