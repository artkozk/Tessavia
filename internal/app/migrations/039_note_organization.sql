CREATE TABLE personal_note_folders (
 id TEXT PRIMARY KEY,
 owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 name_key TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 archived_at TEXT
);
CREATE UNIQUE INDEX personal_note_folder_name ON personal_note_folders(owner_id,name_key) WHERE archived_at IS NULL;
ALTER TABLE personal_notes ADD COLUMN folder_id TEXT REFERENCES personal_note_folders(id);
ALTER TABLE personal_notes ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE personal_notes ADD COLUMN daily_date TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX personal_note_daily ON personal_notes(owner_id,daily_date) WHERE daily_date<>'' AND archived_at IS NULL;
CREATE INDEX personal_note_folder ON personal_notes(owner_id,folder_id) WHERE archived_at IS NULL;
CREATE TABLE personal_note_templates (
 id TEXT PRIMARY KEY,
 owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 folder_id TEXT REFERENCES personal_note_folders(id),
 tags_json TEXT NOT NULL DEFAULT '[]',
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 archived_at TEXT
);
CREATE INDEX personal_note_templates_owner ON personal_note_templates(owner_id,updated_at DESC) WHERE archived_at IS NULL;
