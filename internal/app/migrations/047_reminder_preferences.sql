CREATE TABLE reminder_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    deadline_enabled INTEGER NOT NULL DEFAULT 1 CHECK(deadline_enabled IN (0,1)),
    timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
    quiet_start TEXT NOT NULL DEFAULT '',
    quiet_end TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);
CREATE TABLE reminder_project_preferences (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    deadline_enabled INTEGER NOT NULL CHECK(deadline_enabled IN (0,1)),
    PRIMARY KEY(user_id,workspace_id)
);
ALTER TABLE deadline_delivery_sources ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Europe/Moscow';
