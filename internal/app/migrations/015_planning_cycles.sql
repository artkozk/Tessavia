CREATE TABLE planning_cycles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    start_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_planning_cycles_single_active
    ON planning_cycles(status)
    WHERE status = 'active';

CREATE INDEX idx_planning_cycles_start_date ON planning_cycles(start_date DESC);
