CREATE TABLE chat_group_settings (
    thread_id TEXT PRIMARY KEY REFERENCES chat_threads(id),
    version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0)
);
CREATE TABLE chat_group_roles (
    thread_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner','admin')),
    PRIMARY KEY(thread_id,user_id),
    FOREIGN KEY(thread_id,user_id) REFERENCES chat_members(thread_id,user_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX chat_group_one_owner ON chat_group_roles(thread_id) WHERE role='owner';
INSERT INTO chat_group_settings(thread_id) SELECT id FROM chat_threads WHERE conversation_kind='group';
INSERT INTO chat_group_roles(thread_id,user_id,role)
SELECT t.id,t.created_by,'owner' FROM chat_threads t JOIN chat_members m ON m.thread_id=t.id AND m.user_id=t.created_by WHERE t.conversation_kind='group';
