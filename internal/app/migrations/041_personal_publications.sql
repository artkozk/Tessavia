-- Private receipts retain immutable previews and prevent duplicate team copies.
-- No source foreign key: deleting the original must not erase a completed receipt.
CREATE TABLE personal_publications (
 id TEXT PRIMARY KEY,
 owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 request_key TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 payload_json TEXT NOT NULL,
 record_id TEXT,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 UNIQUE(owner_id, request_key)
);
