ALTER TABLE user_interface_preferences ADD COLUMN layout_json TEXT NOT NULL DEFAULT '{}';

CREATE INDEX notifications_history_idx ON notifications(user_id, created_at DESC, id DESC);
