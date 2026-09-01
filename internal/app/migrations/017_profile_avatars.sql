ALTER TABLE users ADD COLUMN avatar_stored_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN avatar_content_type TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN avatar_size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (avatar_size_bytes >= 0);
ALTER TABLE users ADD COLUMN avatar_updated_at TEXT NOT NULL DEFAULT '';
