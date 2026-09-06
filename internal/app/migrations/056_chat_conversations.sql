-- Keep the legacy kind constraint and every existing thread/message identity.
-- New direct/group conversations use legacy kind=record with no record_id.
ALTER TABLE chat_threads ADD COLUMN conversation_kind TEXT NOT NULL DEFAULT ''
    CHECK(conversation_kind IN ('', 'direct', 'group'));
ALTER TABLE chat_threads ADD COLUMN direct_key TEXT;
CREATE UNIQUE INDEX chat_direct_pair_unique ON chat_threads(workspace_id, direct_key)
    WHERE direct_key IS NOT NULL;
CREATE TABLE chat_pins (
    thread_id TEXT NOT NULL REFERENCES chat_threads(id),
    message_id TEXT NOT NULL REFERENCES chat_messages(id),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    PRIMARY KEY(thread_id, message_id)
);
