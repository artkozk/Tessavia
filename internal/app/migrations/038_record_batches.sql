CREATE TABLE record_batches (
 id TEXT PRIMARY KEY,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 request_hash TEXT NOT NULL,
 receipt_json TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX record_batches_latest ON record_batches(user_id, workspace_id, created_at DESC);
