CREATE TABLE personal_projects (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    color_key TEXT NOT NULL DEFAULT 'green' CHECK (color_key IN ('green','blue','amber','purple','red','neutral')),
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done','archived')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX personal_projects_owner_idx
ON personal_projects(owner_id, status, updated_at DESC);

CREATE TABLE personal_goals (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT REFERENCES personal_projects(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    horizon TEXT NOT NULL DEFAULT 'month' CHECK (horizon IN ('month','twelve_weeks','custom')),
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    planned_minutes INTEGER NOT NULL DEFAULT 0 CHECK (planned_minutes BETWEEN 0 AND 525600),
    actual_minutes INTEGER NOT NULL DEFAULT 0 CHECK (actual_minutes BETWEEN 0 AND 525600),
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done','archived')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX personal_goals_owner_idx
ON personal_goals(owner_id, status, start_date, end_date, updated_at DESC);
CREATE INDEX personal_goals_project_idx
ON personal_goals(owner_id, project_id, status);

ALTER TABLE personal_plans ADD COLUMN item_kind TEXT NOT NULL DEFAULT 'task'
    CHECK (item_kind IN ('task','event'));
ALTER TABLE personal_plans ADD COLUMN project_id TEXT
    REFERENCES personal_projects(id) ON DELETE SET NULL;
ALTER TABLE personal_plans ADD COLUMN goal_id TEXT
    REFERENCES personal_goals(id) ON DELETE SET NULL;
ALTER TABLE personal_plans ADD COLUMN parent_id TEXT
    REFERENCES personal_plans(id) ON DELETE SET NULL;
ALTER TABLE personal_plans ADD COLUMN planned_minutes INTEGER NOT NULL DEFAULT 0
    CHECK (planned_minutes BETWEEN 0 AND 525600);
ALTER TABLE personal_plans ADD COLUMN actual_minutes INTEGER NOT NULL DEFAULT 0
    CHECK (actual_minutes BETWEEN 0 AND 525600);
ALTER TABLE personal_plans ADD COLUMN starts_at TEXT;
ALTER TABLE personal_plans ADD COLUMN ends_at TEXT;
ALTER TABLE personal_plans ADD COLUMN series_id TEXT NOT NULL DEFAULT '';
ALTER TABLE personal_plans ADD COLUMN occurrence_date TEXT NOT NULL DEFAULT '';
ALTER TABLE personal_plans ADD COLUMN occurrence_state TEXT NOT NULL DEFAULT 'single'
    CHECK (occurrence_state IN ('single','scheduled','moved','skipped'));

CREATE INDEX personal_plans_project_idx
ON personal_plans(owner_id, project_id, status, updated_at DESC);
CREATE INDEX personal_plans_goal_idx
ON personal_plans(owner_id, goal_id, status, updated_at DESC);
CREATE INDEX personal_plans_parent_idx
ON personal_plans(owner_id, parent_id, status, updated_at DESC);
CREATE UNIQUE INDEX personal_plans_series_occurrence_idx
ON personal_plans(owner_id, series_id, occurrence_date)
WHERE series_id <> '';

CREATE TABLE personal_recurrence_rules (
    series_id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cadence TEXT NOT NULL CHECK (cadence IN ('daily','weekly','monthly')),
    interval_count INTEGER NOT NULL DEFAULT 1 CHECK (interval_count BETWEEN 1 AND 365),
    timezone TEXT NOT NULL,
    start_date TEXT NOT NULL,
    until_date TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX personal_recurrence_owner_idx
ON personal_recurrence_rules(owner_id, active, start_date, until_date);
