CREATE TABLE personal_waiting_pings (
    id TEXT PRIMARY KEY,
    waiting_id TEXT NOT NULL REFERENCES personal_waiting(id) ON DELETE CASCADE,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    notification_id TEXT NOT NULL UNIQUE REFERENCES notifications(id) ON DELETE CASCADE,
    include_title INTEGER NOT NULL DEFAULT 0 CHECK (include_title IN (0, 1)),
    message TEXT NOT NULL,
    request_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (owner_id, request_key)
);

CREATE INDEX personal_waiting_pings_waiting_idx
    ON personal_waiting_pings(waiting_id, owner_id, created_at DESC, id DESC);

CREATE INDEX personal_waiting_pings_recipient_idx
    ON personal_waiting_pings(recipient_id, workspace_id, created_at DESC);
