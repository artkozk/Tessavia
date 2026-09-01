ALTER TABLE workspaces ADD COLUMN description TEXT NOT NULL DEFAULT '';

ALTER TABLE records ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'bizflow-team';
ALTER TABLE records ADD COLUMN collection_id TEXT;
ALTER TABLE records ADD COLUMN stage_id TEXT;

CREATE INDEX records_workspace_status_idx ON records(workspace_id, status, updated_at DESC);
CREATE INDEX records_collection_stage_idx ON records(workspace_id, collection_id, stage_id, updated_at DESC);

CREATE TABLE workspace_collections (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    card_label TEXT NOT NULL DEFAULT 'Карточка',
    default_record_type TEXT NOT NULL DEFAULT 'task' CHECK (default_record_type IN ('task', 'idea', 'document')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER NOT NULL REFERENCES users(id),
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(workspace_id, name)
);

CREATE INDEX workspace_collections_workspace_idx
    ON workspace_collections(workspace_id, archived_at, sort_order, name);

CREATE TABLE collection_stages (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL REFERENCES workspace_collections(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'active' CHECK (category IN ('backlog', 'active', 'review', 'done')),
    color_key TEXT NOT NULL DEFAULT 'neutral' CHECK (color_key IN ('neutral', 'red', 'amber', 'green', 'blue', 'violet')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(collection_id, name)
);

CREATE INDEX collection_stages_collection_idx
    ON collection_stages(collection_id, archived_at, sort_order, name);

CREATE TABLE collection_fields (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL REFERENCES workspace_collections(id) ON DELETE CASCADE,
    field_key TEXT NOT NULL,
    name TEXT NOT NULL,
    field_type TEXT NOT NULL CHECK (field_type IN ('text', 'long_text', 'number', 'money', 'date', 'datetime', 'select', 'multi_select', 'user', 'checkbox', 'url', 'email', 'phone', 'relation')),
    required INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0, 1)),
    show_on_card INTEGER NOT NULL DEFAULT 0 CHECK (show_on_card IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(collection_id, field_key),
    UNIQUE(collection_id, name)
);

CREATE INDEX collection_fields_collection_idx
    ON collection_fields(collection_id, archived_at, sort_order, name);

CREATE TABLE collection_field_options (
    id TEXT PRIMARY KEY,
    field_id TEXT NOT NULL REFERENCES collection_fields(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color_key TEXT NOT NULL DEFAULT 'neutral' CHECK (color_key IN ('neutral', 'red', 'amber', 'green', 'blue', 'violet')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(field_id, name)
);

CREATE INDEX collection_field_options_field_idx
    ON collection_field_options(field_id, archived_at, sort_order, name);

CREATE TABLE record_field_values (
    record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    field_id TEXT NOT NULL REFERENCES collection_fields(id) ON DELETE CASCADE,
    value_json TEXT NOT NULL DEFAULT 'null',
    updated_by INTEGER NOT NULL REFERENCES users(id),
    updated_at TEXT NOT NULL,
    PRIMARY KEY(record_id, field_id)
);

CREATE INDEX record_field_values_field_idx ON record_field_values(field_id, updated_at DESC);

ALTER TABLE saved_views ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'bizflow-team';
ALTER TABLE saved_views ADD COLUMN collection_id TEXT;
DROP INDEX saved_views_user_name_idx;
CREATE UNIQUE INDEX saved_views_workspace_user_name_idx ON saved_views(workspace_id, user_id, name);

ALTER TABLE planning_cycles ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'bizflow-team';
DROP INDEX idx_planning_cycles_single_active;
CREATE UNIQUE INDEX idx_planning_cycles_single_active_workspace
    ON planning_cycles(workspace_id, status)
    WHERE status = 'active';
CREATE INDEX planning_cycles_workspace_idx ON planning_cycles(workspace_id, start_date DESC);

ALTER TABLE chat_threads ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'bizflow-team';
DROP INDEX chat_threads_team_unique;
CREATE UNIQUE INDEX chat_threads_team_workspace_unique
    ON chat_threads(workspace_id, kind)
    WHERE kind = 'team';
CREATE INDEX chat_threads_workspace_idx ON chat_threads(workspace_id, updated_at DESC);

ALTER TABLE activity ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'bizflow-team';
CREATE INDEX activity_workspace_created_idx ON activity(workspace_id, created_at DESC);
