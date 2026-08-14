ALTER TABLE records
ADD COLUMN record_kind TEXT NOT NULL DEFAULT ''
CHECK (record_kind IN ('', 'preference', 'limitation', 'rule', 'insight', 'meeting'));

CREATE INDEX records_kind_status_idx
ON records(record_kind, status, updated_at DESC);

CREATE TABLE record_derivations (
    id TEXT PRIMARY KEY,
    output_record_id TEXT NOT NULL UNIQUE REFERENCES records(id) ON DELETE RESTRICT,
    source_record_id TEXT NOT NULL REFERENCES records(id) ON DELETE RESTRICT,
    source_question_id TEXT REFERENCES question_items(id) ON DELETE RESTRICT,
    source_decision_id TEXT REFERENCES question_decisions(id) ON DELETE RESTRICT,
    source_excerpt TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
);

CREATE INDEX record_derivations_source_record_idx
ON record_derivations(source_record_id, created_at DESC);

CREATE INDEX record_derivations_source_question_idx
ON record_derivations(source_question_id, created_at DESC);
