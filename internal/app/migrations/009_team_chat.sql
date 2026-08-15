CREATE TABLE chat_threads (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK(kind IN ('team', 'record')),
    title TEXT NOT NULL,
    record_id TEXT REFERENCES records(id),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX chat_threads_team_unique ON chat_threads(kind) WHERE kind = 'team';
CREATE UNIQUE INDEX chat_threads_record_unique ON chat_threads(record_id) WHERE record_id IS NOT NULL;

CREATE TABLE chat_members (
    thread_id TEXT NOT NULL REFERENCES chat_threads(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    last_read_at TEXT NOT NULL DEFAULT '',
    joined_at TEXT NOT NULL,
    PRIMARY KEY(thread_id, user_id)
);

CREATE TABLE chat_attachments (
    id TEXT PRIMARY KEY,
    uploader_id INTEGER NOT NULL REFERENCES users(id),
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL UNIQUE,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
    sha256 TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES chat_threads(id),
    author_id INTEGER NOT NULL REFERENCES users(id),
    reply_to_id TEXT REFERENCES chat_messages(id),
    linked_record_id TEXT REFERENCES records(id),
    attachment_id TEXT REFERENCES chat_attachments(id),
    message_type TEXT NOT NULL DEFAULT 'text' CHECK(message_type IN ('text', 'file', 'voice', 'call', 'system')),
    body TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    edited_at TEXT,
    archived_at TEXT
);

CREATE INDEX chat_messages_thread_idx ON chat_messages(thread_id, created_at, id);

CREATE TABLE chat_reactions (
    message_id TEXT NOT NULL REFERENCES chat_messages(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    emoji TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(message_id, user_id, emoji)
);

CREATE TABLE chat_favorites (
    message_id TEXT NOT NULL REFERENCES chat_messages(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    PRIMARY KEY(message_id, user_id)
);

CREATE TABLE chat_calls (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES chat_threads(id),
    started_by INTEGER NOT NULL REFERENCES users(id),
    status TEXT NOT NULL CHECK(status IN ('ringing', 'active', 'declined', 'ended', 'missed')),
    offer_sdp TEXT NOT NULL,
    answer_sdp TEXT NOT NULL DEFAULT '',
    started_at TEXT NOT NULL,
    answered_at TEXT,
    ended_at TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK(duration_seconds >= 0)
);

CREATE INDEX chat_calls_thread_idx ON chat_calls(thread_id, started_at DESC);

CREATE TABLE chat_call_candidates (
    id TEXT PRIMARY KEY,
    call_id TEXT NOT NULL REFERENCES chat_calls(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    candidate_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX chat_call_candidates_call_idx ON chat_call_candidates(call_id, created_at);
