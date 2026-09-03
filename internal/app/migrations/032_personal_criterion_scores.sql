-- Preserve existing votes exactly; only their uniqueness changes.
CREATE TABLE criterion_scores_personal (
    id TEXT PRIMARY KEY,
    record_id TEXT NOT NULL REFERENCES records(id) ON DELETE RESTRICT,
    criterion_id TEXT NOT NULL REFERENCES records(id) ON DELETE RESTRICT,
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 10),
    note TEXT NOT NULL DEFAULT '',
    evaluated_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(record_id, criterion_id, evaluated_by),
    CHECK(record_id <> criterion_id)
);
INSERT INTO criterion_scores_personal (id, record_id, criterion_id, score, note, evaluated_by, created_at, updated_at)
    SELECT id, record_id, criterion_id, score, note, evaluated_by, created_at, updated_at FROM criterion_scores;
DROP TABLE criterion_scores;
ALTER TABLE criterion_scores_personal RENAME TO criterion_scores;
CREATE INDEX criterion_scores_record_idx ON criterion_scores(record_id, updated_at DESC);

ALTER TABLE records ADD COLUMN criterion_weight REAL NOT NULL DEFAULT 1
    CHECK(criterion_weight >= 0 AND criterion_weight <= 100);

CREATE TABLE criterion_decisions (
    record_id TEXT NOT NULL REFERENCES records(id) ON DELETE RESTRICT,
    criterion_id TEXT NOT NULL REFERENCES records(id) ON DELETE RESTRICT,
    score INTEGER NOT NULL CHECK(score >= 0 AND score <= 10),
    reason TEXT NOT NULL,
    decided_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    needs_review INTEGER NOT NULL DEFAULT 0 CHECK(needs_review IN (0, 1)),
    PRIMARY KEY(record_id,criterion_id),
    CHECK(record_id <> criterion_id)
);
