ALTER TABLE records
ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'
CHECK (priority IN ('low', 'normal', 'high', 'critical'));

CREATE INDEX records_priority_due_idx
ON records(status, priority, due_at, updated_at DESC);
