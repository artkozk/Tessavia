CREATE TABLE chat_personal_pins (
    thread_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    pinned_at TEXT NOT NULL,
    PRIMARY KEY(thread_id, user_id),
    FOREIGN KEY(thread_id, user_id) REFERENCES chat_members(thread_id, user_id) ON DELETE CASCADE
);
