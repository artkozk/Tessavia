CREATE TABLE personal_create_requests (
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_key TEXT NOT NULL,
    entity_kind TEXT NOT NULL CHECK(entity_kind IN ('note', 'plan')),
    payload_hash TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(owner_id, request_key)
);

ALTER TABLE chat_messages ADD COLUMN client_payload_hash TEXT NOT NULL DEFAULT '';
