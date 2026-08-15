CREATE TABLE record_comments (
    id TEXT PRIMARY KEY,
    record_id TEXT NOT NULL REFERENCES records(id),
    author_id INTEGER NOT NULL REFERENCES users(id),
    parent_id TEXT REFERENCES record_comments(id),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX record_comments_record_idx ON record_comments(record_id, created_at);

CREATE TABLE checklist_items (
    id TEXT PRIMARY KEY,
    record_id TEXT NOT NULL REFERENCES records(id),
    title TEXT NOT NULL,
    owner_id INTEGER REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'completed', 'cancelled')),
    proof_text TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER NOT NULL REFERENCES users(id),
    completed_by INTEGER REFERENCES users(id),
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX checklist_items_record_idx ON checklist_items(record_id, status, sort_order, created_at);

CREATE TABLE task_review_events (
    id TEXT PRIMARY KEY,
    record_id TEXT NOT NULL REFERENCES records(id),
    actor_id INTEGER NOT NULL REFERENCES users(id),
    action TEXT NOT NULL CHECK(action IN ('submitted', 'accepted', 'rework')),
    reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE INDEX task_review_events_record_idx ON task_review_events(record_id, created_at DESC);

CREATE TABLE record_attachments (
    id TEXT PRIMARY KEY,
    record_id TEXT NOT NULL REFERENCES records(id),
    uploader_id INTEGER NOT NULL REFERENCES users(id),
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL UNIQUE,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
    sha256 TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX record_attachments_record_idx ON record_attachments(record_id, created_at DESC);

CREATE TABLE recurrence_rules (
    record_id TEXT PRIMARY KEY REFERENCES records(id),
    cadence TEXT NOT NULL CHECK(cadence IN ('none', 'daily', 'weekly', 'monthly')),
    interval_count INTEGER NOT NULL DEFAULT 1 CHECK(interval_count BETWEEN 1 AND 365),
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    updated_by INTEGER NOT NULL REFERENCES users(id),
    updated_at TEXT NOT NULL
);

CREATE TABLE saved_views (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    view_mode TEXT NOT NULL CHECK(view_mode IN ('list', 'hierarchy', 'kanban', 'calendar')),
    filters_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX saved_views_user_name_idx ON saved_views(user_id, name);

CREATE TABLE notification_deliveries (
    delivery_key TEXT PRIMARY KEY,
    notification_id TEXT NOT NULL REFERENCES notifications(id),
    created_at TEXT NOT NULL
);
