ALTER TABLE teams ADD COLUMN deleted_at TEXT;
CREATE INDEX teams_deleted_idx ON teams(owner_id, deleted_at);
