CREATE TABLE page_app_components (
 id TEXT PRIMARY KEY,
 owner_id INTEGER NOT NULL REFERENCES users(id),
 name TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 definition_json TEXT NOT NULL,
 request_id TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(owner_id, request_id)
);
CREATE INDEX page_app_components_owner ON page_app_components(owner_id, created_at);

CREATE TABLE page_app_component_insertions (
 owner_id INTEGER NOT NULL REFERENCES users(id),
 request_id TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 page_id TEXT NOT NULL REFERENCES workspace_pages(id) ON DELETE CASCADE,
 component_id TEXT NOT NULL REFERENCES page_app_components(id),
 root_block_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id, request_id)
);
