ALTER TABLE record_business_details ADD COLUMN applicability TEXT NOT NULL DEFAULT '';
ALTER TABLE record_business_details ADD COLUMN source_excerpt_md TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_record_links_active_dependency
ON record_links(source_id, relation_type, active);
