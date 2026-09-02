CREATE TABLE workspace_navigation (
    workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    enabled_views_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT INTO workspace_navigation(workspace_id, enabled_views_json, updated_at)
SELECT id, '["dashboard","work","collections","chat","principles","goal","idea","research","validation","outcomes","document","graph","quality","history","structure"]', CURRENT_TIMESTAMP
FROM workspaces WHERE id = 'bizflow-team';

ALTER TABLE user_interface_preferences ADD COLUMN hidden_nav_items_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE user_interface_preferences ADD COLUMN nav_order_json TEXT NOT NULL DEFAULT '[]';

CREATE TABLE workspace_pages (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    collection_id TEXT REFERENCES workspace_collections(id) ON DELETE RESTRICT,
    record_type TEXT NOT NULL DEFAULT '',
    status_filter TEXT NOT NULL DEFAULT 'active',
    owner_filter TEXT NOT NULL DEFAULT 'all',
    view_mode TEXT NOT NULL DEFAULT 'list',
    fields_json TEXT NOT NULL DEFAULT '["description","owner","status","due"]',
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX workspace_pages_scope_idx ON workspace_pages(workspace_id, archived_at, sort_order);

ALTER TABLE section_definitions ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE RESTRICT;
UPDATE section_definitions SET workspace_id = 'bizflow-team'
WHERE created_by IS NOT NULL AND EXISTS (SELECT 1 FROM workspaces WHERE id = 'bizflow-team');
CREATE INDEX section_definitions_workspace_idx ON section_definitions(workspace_id, scope_type);

CREATE TABLE workspace_section_overrides (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    definition_id TEXT NOT NULL REFERENCES section_definitions(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    active INTEGER NOT NULL CHECK (active IN (0, 1)),
    sort_order INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (workspace_id, definition_id)
);
