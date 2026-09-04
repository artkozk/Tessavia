CREATE TABLE personal_note_versions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 note_id TEXT NOT NULL REFERENCES personal_notes(id) ON DELETE CASCADE,
 saved_at TEXT NOT NULL,
 action TEXT NOT NULL,
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 pinned INTEGER NOT NULL,
 scheduled_date TEXT,
 in_inbox INTEGER NOT NULL,
 title_generated INTEGER NOT NULL,
 folder_id TEXT,
 tags_json TEXT NOT NULL,
 daily_date TEXT NOT NULL,
 archived_at TEXT
);
CREATE INDEX personal_note_versions_note ON personal_note_versions(note_id,id DESC);
INSERT INTO personal_note_versions(note_id,saved_at,action,title,body,pinned,scheduled_date,in_inbox,title_generated,folder_id,tags_json,daily_date,archived_at) SELECT id,updated_at,'baseline',title,body,pinned,scheduled_date,in_inbox,title_generated,folder_id,tags_json,daily_date,archived_at FROM personal_notes;
CREATE TRIGGER personal_note_history_insert AFTER INSERT ON personal_notes
BEGIN
 INSERT INTO personal_note_versions(note_id,saved_at,action,title,body,pinned,scheduled_date,in_inbox,title_generated,folder_id,tags_json,daily_date,archived_at) VALUES(NEW.id,NEW.updated_at,'created',NEW.title,NEW.body,NEW.pinned,NEW.scheduled_date,NEW.in_inbox,NEW.title_generated,NEW.folder_id,NEW.tags_json,NEW.daily_date,NEW.archived_at);
END;
CREATE TRIGGER personal_note_history_update AFTER UPDATE ON personal_notes
WHEN OLD.title IS NOT NEW.title OR OLD.body IS NOT NEW.body OR OLD.pinned IS NOT NEW.pinned OR OLD.scheduled_date IS NOT NEW.scheduled_date OR OLD.in_inbox IS NOT NEW.in_inbox OR OLD.title_generated IS NOT NEW.title_generated OR OLD.folder_id IS NOT NEW.folder_id OR OLD.tags_json IS NOT NEW.tags_json OR OLD.daily_date IS NOT NEW.daily_date OR OLD.archived_at IS NOT NEW.archived_at
BEGIN
 INSERT INTO personal_note_versions(note_id,saved_at,action,title,body,pinned,scheduled_date,in_inbox,title_generated,folder_id,tags_json,daily_date,archived_at) VALUES(NEW.id,NEW.updated_at,CASE WHEN OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN 'archived' WHEN OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN 'unarchived' ELSE 'saved' END,NEW.title,NEW.body,NEW.pinned,NEW.scheduled_date,NEW.in_inbox,NEW.title_generated,NEW.folder_id,NEW.tags_json,NEW.daily_date,NEW.archived_at);
END;
CREATE TABLE personal_note_attachments (
 id TEXT PRIMARY KEY,
 note_id TEXT NOT NULL REFERENCES personal_notes(id) ON DELETE CASCADE,
 original_name TEXT NOT NULL,
 stored_name TEXT NOT NULL UNIQUE,
 content_type TEXT NOT NULL,
 size_bytes INTEGER NOT NULL CHECK(size_bytes>0),
 sha256 TEXT NOT NULL,
 request_key TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 removed_at TEXT,
 UNIQUE(note_id,request_key)
);
CREATE INDEX personal_note_attachments_note ON personal_note_attachments(note_id,created_at,id);
