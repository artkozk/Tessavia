-- A kit contains the calculation schema only. Inputs belong to one user,
-- page and block, and are created exclusively by an explicit write.
CREATE TABLE page_app_sheet_values (
 page_id TEXT NOT NULL REFERENCES workspace_pages(id) ON DELETE CASCADE,
 block_id TEXT NOT NULL,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 values_json TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision > 0),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(page_id,block_id,user_id)
);
