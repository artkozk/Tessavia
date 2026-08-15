CREATE TABLE chat_message_revisions (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES chat_messages(id),
    editor_id INTEGER NOT NULL REFERENCES users(id),
    action TEXT NOT NULL CHECK(action IN ('edit', 'archive')),
    previous_body TEXT NOT NULL DEFAULT '',
    new_body TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE INDEX chat_message_revisions_message_idx ON chat_message_revisions(message_id, created_at);
