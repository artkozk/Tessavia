CREATE TABLE record_create_requests (
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 user_id INTEGER NOT NULL REFERENCES users(id),
 request_key TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 record_id TEXT NOT NULL REFERENCES records(id) DEFERRABLE INITIALLY DEFERRED,
 created_at TEXT NOT NULL,
 PRIMARY KEY (workspace_id,user_id,request_key)
);
