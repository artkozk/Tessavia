ALTER TABLE records ADD COLUMN business_kind TEXT NOT NULL DEFAULT ''
    CHECK (business_kind IN ('', 'risk', 'hypothesis', 'experiment', 'inbox'));

CREATE INDEX records_business_kind_status_idx
    ON records(business_kind, status, updated_at DESC);

CREATE TABLE record_business_details (
    record_id TEXT PRIMARY KEY REFERENCES records(id) ON DELETE RESTRICT,
    probability INTEGER NOT NULL DEFAULT 0 CHECK (probability >= 0 AND probability <= 5),
    impact INTEGER NOT NULL DEFAULT 0 CHECK (impact >= 0 AND impact <= 5),
    mitigation_md TEXT NOT NULL DEFAULT '',
    occurred INTEGER NOT NULL DEFAULT 0 CHECK (occurred IN (0, 1)),
    metric TEXT NOT NULL DEFAULT '',
    success_threshold TEXT NOT NULL DEFAULT '',
    experiment_method_md TEXT NOT NULL DEFAULT '',
    verdict TEXT NOT NULL DEFAULT '' CHECK (verdict IN ('', 'pending', 'confirmed', 'rejected', 'inconclusive')),
    decision_state TEXT NOT NULL DEFAULT '' CHECK (decision_state IN ('', 'active', 'review', 'superseded')),
    effective_at TEXT,
    review_at TEXT,
    supersedes_id TEXT REFERENCES records(id) ON DELETE RESTRICT,
    updated_by INTEGER NOT NULL REFERENCES users(id),
    updated_at TEXT NOT NULL
);

CREATE INDEX record_business_details_review_idx
    ON record_business_details(decision_state, review_at);

CREATE INDEX record_business_details_supersedes_idx
    ON record_business_details(supersedes_id);

INSERT INTO record_business_details(record_id, decision_state, effective_at, updated_by, updated_at)
SELECT id, 'active', COALESCE(completed_at, created_at), owner_id, updated_at
FROM records
WHERE type = 'decision';

CREATE TABLE activity_undos (
    activity_id TEXT PRIMARY KEY REFERENCES activity(id) ON DELETE RESTRICT,
    undone_by INTEGER NOT NULL REFERENCES users(id),
    undo_activity_id TEXT NOT NULL REFERENCES activity(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL
);
