ALTER TABLE personal_notes ADD COLUMN scheduled_date TEXT;
CREATE INDEX personal_notes_schedule ON personal_notes(owner_id, scheduled_date) WHERE archived_at IS NULL;
