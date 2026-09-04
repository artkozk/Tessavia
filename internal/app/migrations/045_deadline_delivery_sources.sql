CREATE TABLE deadline_delivery_sources (
    notification_id TEXT PRIMARY KEY REFERENCES notifications(id) ON DELETE CASCADE,
    due_at TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('overdue','due_today','due_tomorrow')),
    valid_until TEXT NOT NULL
);
CREATE INDEX notification_delivery_day_idx ON notification_deliveries(created_at, delivery_key);
