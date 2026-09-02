CREATE TABLE interface_presets (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
    payload_json TEXT NOT NULL,
    use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
    published_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX interface_presets_catalog_idx
ON interface_presets(visibility, updated_at DESC, id);

CREATE INDEX interface_presets_owner_idx
ON interface_presets(owner_id, updated_at DESC, id);

CREATE TABLE interface_preset_applications (
    id TEXT PRIMARY KEY,
    preset_id TEXT REFERENCES interface_presets(id) ON DELETE SET NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    devices_json TEXT NOT NULL,
    previous_payload_json TEXT NOT NULL,
    applied_payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    undone_at TEXT
);

CREATE INDEX interface_preset_applications_user_idx
ON interface_preset_applications(user_id, workspace_id, created_at DESC);
