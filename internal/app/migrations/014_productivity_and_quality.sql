CREATE TABLE user_work_capacity (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    weekly_minutes INTEGER NOT NULL DEFAULT 0 CHECK (weekly_minutes >= 0 AND weekly_minutes <= 10080),
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_records_updated_at ON records(updated_at);
CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity(created_at);
