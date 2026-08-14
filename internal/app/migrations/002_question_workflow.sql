ALTER TABLE records
ADD COLUMN subtype TEXT NOT NULL DEFAULT ''
CHECK (subtype IN ('', 'question_set'));

CREATE INDEX records_subtype_status_idx
ON records(subtype, status, updated_at DESC);

CREATE TABLE question_items (
    id TEXT PRIMARY KEY,
    record_id TEXT NOT NULL REFERENCES records(id) ON DELETE RESTRICT,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'archived')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX question_items_record_idx
ON question_items(record_id, status, sort_order, created_at);

CREATE TABLE question_answers (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL REFERENCES question_items(id) ON DELETE RESTRICT,
    author_id INTEGER NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(question_id, author_id)
);

CREATE INDEX question_answers_question_idx
ON question_answers(question_id, updated_at);

CREATE TABLE question_decisions (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL UNIQUE REFERENCES question_items(id) ON DELETE RESTRICT,
    content TEXT NOT NULL,
    source_answer_id TEXT REFERENCES question_answers(id) ON DELETE RESTRICT,
    decided_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX question_decisions_question_idx
ON question_decisions(question_id, updated_at);
