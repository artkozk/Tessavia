CREATE TABLE page_app_definitions (
 page_id TEXT PRIMARY KEY REFERENCES workspace_pages(id) ON DELETE CASCADE,
 definition_json TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL
);
CREATE TABLE page_app_marks (
 page_id TEXT NOT NULL REFERENCES workspace_pages(id) ON DELETE CASCADE,
 block_id TEXT NOT NULL,
 item_id TEXT NOT NULL,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 checked INTEGER NOT NULL CHECK(checked IN (0,1)),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(page_id,block_id,item_id,user_id)
);
CREATE TABLE page_app_templates (
 id TEXT PRIMARY KEY,
 owner_id INTEGER NOT NULL REFERENCES users(id),
 name TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 visibility TEXT NOT NULL CHECK(visibility IN ('private','public')),
 definition_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
