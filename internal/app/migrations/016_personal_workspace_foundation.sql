ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN birth_date TEXT;
ALTER TABLE users ADD COLUMN life_expectancy_years INTEGER NOT NULL DEFAULT 100 CHECK (life_expectancy_years BETWEEN 1 AND 150);

CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('team', 'personal')),
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    delete_policy TEXT NOT NULL DEFAULT 'archive_only' CHECK (delete_policy IN ('archive_only', 'trash_30_days', 'permanent_by_admin')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE workspace_members (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'guest')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
    joined_at TEXT NOT NULL,
    PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX workspace_members_user_idx ON workspace_members(user_id, status, workspace_id);

CREATE TABLE personal_notes (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX personal_notes_owner_idx ON personal_notes(owner_id, archived_at, pinned DESC, updated_at DESC);

CREATE TABLE personal_plans (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    due_at TEXT,
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'done', 'archived')),
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX personal_plans_owner_idx ON personal_plans(owner_id, status, due_at, updated_at DESC);

CREATE TABLE personal_habits (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    schedule_kind TEXT NOT NULL DEFAULT 'daily' CHECK (schedule_kind IN ('daily', 'weekdays', 'weekly_target')),
    target_per_week INTEGER NOT NULL DEFAULT 7 CHECK (target_per_week BETWEEN 1 AND 7),
    unit TEXT NOT NULL DEFAULT 'раз',
    start_date TEXT NOT NULL,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX personal_habits_owner_idx ON personal_habits(owner_id, archived_at, updated_at DESC);

CREATE TABLE personal_habit_checkins (
    id TEXT PRIMARY KEY,
    habit_id TEXT NOT NULL REFERENCES personal_habits(id) ON DELETE CASCADE,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    checkin_date TEXT NOT NULL,
    value INTEGER NOT NULL DEFAULT 1 CHECK (value BETWEEN 0 AND 1000000),
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (habit_id, checkin_date)
);

CREATE INDEX personal_habit_checkins_owner_idx ON personal_habit_checkins(owner_id, checkin_date DESC, habit_id);

CREATE TABLE personal_links (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN ('note', 'plan', 'habit')),
    source_id TEXT NOT NULL,
    target_type TEXT NOT NULL CHECK (target_type IN ('record', 'note', 'plan', 'habit')),
    target_id TEXT NOT NULL,
    relation_type TEXT NOT NULL DEFAULT 'related' CHECK (relation_type IN ('related', 'supports', 'part_of', 'prepares_for')),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL,
    removed_at TEXT,
    CHECK (source_type <> target_type OR source_id <> target_id)
);

CREATE INDEX personal_links_owner_source_idx ON personal_links(owner_id, source_type, source_id, created_at DESC);
CREATE UNIQUE INDEX personal_links_active_unique_idx ON personal_links(owner_id, source_type, source_id, target_type, target_id, relation_type) WHERE active = 1;

INSERT INTO workspaces(id, name, slug, kind, owner_id, delete_policy, created_at, updated_at)
SELECT 'bizflow-team', 'Команда BizFlow', 'team', 'team', id, 'archive_only', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM users ORDER BY id LIMIT 1;

INSERT INTO workspace_members(workspace_id, user_id, role, status, joined_at)
SELECT 'bizflow-team', u.id, CASE WHEN u.id = w.owner_id THEN 'owner' ELSE 'member' END, 'active', CURRENT_TIMESTAMP
FROM users u JOIN workspaces w ON w.id = 'bizflow-team';

INSERT INTO workspaces(id, name, slug, kind, owner_id, delete_policy, created_at, updated_at)
SELECT 'personal-' || id, 'Личное пространство', 'personal-' || id, 'personal', id, 'archive_only', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM users;

INSERT INTO workspace_members(workspace_id, user_id, role, status, joined_at)
SELECT 'personal-' || id, id, 'owner', 'active', CURRENT_TIMESTAMP FROM users;

CREATE TRIGGER users_after_insert_workspaces
AFTER INSERT ON users
BEGIN
    INSERT OR IGNORE INTO workspaces(id, name, slug, kind, owner_id, delete_policy, created_at, updated_at)
    VALUES('bizflow-team', 'Команда BizFlow', 'team', 'team', NEW.id, 'archive_only', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

    INSERT OR IGNORE INTO workspace_members(workspace_id, user_id, role, status, joined_at)
    SELECT 'bizflow-team', NEW.id, CASE WHEN owner_id = NEW.id THEN 'owner' ELSE 'member' END, 'active', CURRENT_TIMESTAMP
    FROM workspaces WHERE id = 'bizflow-team';

    INSERT OR IGNORE INTO workspaces(id, name, slug, kind, owner_id, delete_policy, created_at, updated_at)
    VALUES('personal-' || NEW.id, 'Личное пространство', 'personal-' || NEW.id, 'personal', NEW.id, 'archive_only', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

    INSERT OR IGNORE INTO workspace_members(workspace_id, user_id, role, status, joined_at)
    VALUES('personal-' || NEW.id, NEW.id, 'owner', 'active', CURRENT_TIMESTAMP);
END;
