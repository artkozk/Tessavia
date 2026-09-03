ALTER TABLE personal_notes ADD COLUMN in_inbox INTEGER NOT NULL DEFAULT 0 CHECK (in_inbox IN (0, 1));

CREATE TABLE personal_capture_requests (
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_key TEXT NOT NULL,
    body_hash TEXT NOT NULL,
    note_id TEXT NOT NULL REFERENCES personal_notes(id) ON DELETE CASCADE,
    PRIMARY KEY (owner_id, request_key)
);
