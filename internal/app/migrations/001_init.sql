CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
);

CREATE INDEX sessions_token_hash_idx ON sessions(token_hash);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE records (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('goal', 'task', 'idea', 'criterion', 'research', 'decision', 'disagreement', 'document')),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('draft', 'inbox', 'review', 'main', 'rejected', 'planned', 'in_progress', 'blocked', 'completed', 'postponed', 'cancelled', 'archived')),
    author_id INTEGER NOT NULL REFERENCES users(id),
    owner_id INTEGER NOT NULL REFERENCES users(id),
    decision_maker_id INTEGER REFERENCES users(id),
    due_at TEXT,
    estimate_minutes INTEGER NOT NULL DEFAULT 0 CHECK (estimate_minutes >= 0),
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    progress_note TEXT NOT NULL DEFAULT '',
    result TEXT NOT NULL DEFAULT '',
    completed_at TEXT,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX records_type_status_idx ON records(type, status, updated_at DESC);
CREATE INDEX records_owner_idx ON records(owner_id, type, status, due_at);
CREATE INDEX records_due_at_idx ON records(status, due_at);

CREATE TABLE section_definitions (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    scope_type TEXT CHECK (scope_type IS NULL OR scope_type IN ('goal', 'task', 'idea', 'criterion', 'research', 'decision', 'disagreement', 'document')),
    kind TEXT NOT NULL DEFAULT 'universal' CHECK (kind IN ('universal', 'template')),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE record_sections (
    id TEXT PRIMARY KEY,
    record_id TEXT NOT NULL REFERENCES records(id) ON DELETE RESTRICT,
    definition_id TEXT REFERENCES section_definitions(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER NOT NULL REFERENCES users(id),
    updated_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(record_id, definition_id)
);

CREATE INDEX record_sections_record_idx ON record_sections(record_id, sort_order, created_at);

CREATE TABLE record_links (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES records(id) ON DELETE RESTRICT,
    target_id TEXT NOT NULL REFERENCES records(id) ON DELETE RESTRICT,
    relation_type TEXT NOT NULL DEFAULT 'related',
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    removed_by INTEGER REFERENCES users(id),
    removed_at TEXT,
    CHECK (source_id <> target_id)
);

CREATE UNIQUE INDEX record_links_active_unique_idx ON record_links(source_id, target_id, relation_type) WHERE active = 1;
CREATE INDEX record_links_source_idx ON record_links(source_id, active);
CREATE INDEX record_links_target_idx ON record_links(target_id, active);

CREATE TABLE criterion_scores (
    id TEXT PRIMARY KEY,
    record_id TEXT NOT NULL REFERENCES records(id) ON DELETE RESTRICT,
    criterion_id TEXT NOT NULL REFERENCES records(id) ON DELETE RESTRICT,
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 10),
    note TEXT NOT NULL DEFAULT '',
    evaluated_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(record_id, criterion_id),
    CHECK (record_id <> criterion_id)
);

CREATE INDEX criterion_scores_record_idx ON criterion_scores(record_id, updated_at DESC);

CREATE TABLE task_proofs (
    id TEXT PRIMARY KEY,
    record_id TEXT NOT NULL REFERENCES records(id) ON DELETE RESTRICT,
    author_id INTEGER NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL CHECK (kind IN ('text', 'link')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX task_proofs_record_idx ON task_proofs(record_id, created_at);

CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    read_at TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX notifications_user_idx ON notifications(user_id, read_at, created_at DESC);

CREATE TABLE activity (
    id TEXT PRIMARY KEY,
    actor_id INTEGER NOT NULL REFERENCES users(id),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    details_json TEXT NOT NULL DEFAULT '{}',
    reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE INDEX activity_created_idx ON activity(created_at DESC);
CREATE INDEX activity_entity_idx ON activity(entity_type, entity_id, created_at DESC);

INSERT INTO section_definitions(id, key, name, scope_type, kind, active, sort_order, created_at, updated_at) VALUES
    ('default-goals', 'idea_goals', 'Цели', 'idea', 'universal', 1, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('default-criteria', 'idea_criteria', 'Критерии отбора', 'idea', 'universal', 1, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('default-parameters', 'idea_parameters', 'Дополнительные параметры', 'idea', 'universal', 1, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('default-arguments', 'idea_arguments', 'Аргументы', 'idea', 'universal', 1, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('default-limitations', 'idea_limitations', 'Ограничения', 'idea', 'universal', 1, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('default-research', 'idea_research', 'Необходимые исследования', 'idea', 'universal', 1, 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('default-questions', 'idea_questions', 'Вопросы без ответа', 'idea', 'universal', 1, 70, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('default-related', 'idea_related', 'Связанные записи', 'idea', 'universal', 1, 80, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('default-decisions', 'idea_decisions', 'Решения по идее', 'idea', 'universal', 1, 90, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('default-goal-success', 'goal_success', 'Критерии достижения', 'goal', 'universal', 1, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('default-task-plan', 'task_plan', 'План выполнения', 'task', 'universal', 1, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('default-decision-reason', 'decision_reason', 'Основание решения', 'decision', 'universal', 1, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('default-disagreement-sides', 'disagreement_sides', 'Позиции сторон', 'disagreement', 'universal', 1, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('default-disagreement-arguments', 'disagreement_arguments', 'Аргументы сторон', 'disagreement', 'universal', 1, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('default-disagreement-resolution', 'disagreement_resolution', 'Принятое решение', 'disagreement', 'universal', 1, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
