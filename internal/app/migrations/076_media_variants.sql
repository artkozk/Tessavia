-- Add immutable media version chains without rewriting existing attachments.
CREATE TABLE media_variants (
 id TEXT PRIMARY KEY,
 context_kind TEXT NOT NULL CHECK(context_kind IN ('record','note','page')),
 target_id TEXT NOT NULL,
 block_id TEXT NOT NULL DEFAULT '',
 name TEXT NOT NULL,
 created_by INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>=0),
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 selected_version_id TEXT NOT NULL DEFAULT '',
 CHECK((context_kind='page' AND block_id<>'') OR (context_kind<>'page' AND block_id=''))
);
CREATE INDEX media_variants_scope ON media_variants(context_kind,target_id,block_id,created_at,id);
CREATE TABLE media_versions (
 id TEXT PRIMARY KEY,
 variant_id TEXT NOT NULL REFERENCES media_variants(id),
 attachment_kind TEXT NOT NULL CHECK(attachment_kind IN ('record','note','page')),
 attachment_id TEXT NOT NULL,
 ordinal INTEGER NOT NULL CHECK(ordinal>0 AND ordinal<=100),
 note TEXT NOT NULL DEFAULT '' CHECK(length(note)<=2000),
 created_by INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 UNIQUE(attachment_kind,attachment_id),
 UNIQUE(variant_id,ordinal)
);
CREATE TABLE media_variant_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 variant_id TEXT NOT NULL REFERENCES media_variants(id),
 action TEXT NOT NULL CHECK(action IN ('imported','created','version_added','renamed','selected','archived','restored')),
 revision INTEGER NOT NULL CHECK(revision>=0),
 actor_id INTEGER NOT NULL REFERENCES users(id),
 details_json TEXT NOT NULL CHECK(json_valid(details_json)),
 created_at TEXT NOT NULL
);
CREATE INDEX media_variant_events_history ON media_variant_events(variant_id,id);
CREATE TABLE media_variant_requests (
 owner_id INTEGER NOT NULL REFERENCES users(id),
 context_kind TEXT NOT NULL CHECK(context_kind IN ('record','note','page')),
 target_id TEXT NOT NULL,
 block_id TEXT NOT NULL DEFAULT '',
 request_key TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 variant_id TEXT NOT NULL REFERENCES media_variants(id),
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,context_kind,target_id,block_id,request_key)
);
CREATE TABLE record_attachment_requests (
 owner_id INTEGER NOT NULL REFERENCES users(id),
 record_id TEXT NOT NULL REFERENCES records(id),
 request_key TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 attachment_id TEXT NOT NULL REFERENCES record_attachments(id),
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,record_id,request_key)
);

CREATE TRIGGER media_versions_scope_insert BEFORE INSERT ON media_versions
WHEN NOT EXISTS (
 SELECT 1 FROM media_variants v WHERE v.id=NEW.variant_id AND v.context_kind=NEW.attachment_kind
 AND ((v.context_kind='record' AND EXISTS(SELECT 1 FROM record_attachments a WHERE a.id=NEW.attachment_id AND a.record_id=v.target_id))
 OR (v.context_kind='note' AND EXISTS(SELECT 1 FROM personal_note_attachments a WHERE a.id=NEW.attachment_id AND a.note_id=v.target_id))
 OR (v.context_kind='page' AND EXISTS(SELECT 1 FROM page_media_attachments a WHERE a.id=NEW.attachment_id AND a.page_id=v.target_id AND a.block_id=v.block_id)))
)
BEGIN SELECT RAISE(ABORT,'media version attachment scope mismatch'); END;
CREATE TRIGGER media_versions_immutable_update BEFORE UPDATE ON media_versions
BEGIN SELECT RAISE(ABORT,'media versions are append only'); END;
CREATE TRIGGER media_versions_immutable_delete BEFORE DELETE ON media_versions
BEGIN SELECT RAISE(ABORT,'media versions are append only'); END;
CREATE TRIGGER media_variant_events_immutable_update BEFORE UPDATE ON media_variant_events
BEGIN SELECT RAISE(ABORT,'media history is append only'); END;
CREATE TRIGGER media_variant_events_immutable_delete BEFORE DELETE ON media_variant_events
BEGIN SELECT RAISE(ABORT,'media history is append only'); END;
CREATE TRIGGER media_variants_scope_immutable BEFORE UPDATE OF context_kind,target_id,block_id,created_by,created_at ON media_variants
WHEN OLD.context_kind<>NEW.context_kind OR OLD.target_id<>NEW.target_id OR OLD.block_id<>NEW.block_id OR OLD.created_by<>NEW.created_by OR OLD.created_at<>NEW.created_at
BEGIN SELECT RAISE(ABORT,'media variant scope is immutable'); END;
CREATE TRIGGER media_variants_selected_scope BEFORE UPDATE OF selected_version_id ON media_variants
WHEN NEW.selected_version_id<>'' AND NOT EXISTS(SELECT 1 FROM media_versions WHERE id=NEW.selected_version_id AND variant_id=NEW.id)
BEGIN SELECT RAISE(ABORT,'selected media version belongs to another variant'); END;
CREATE TRIGGER media_variant_requests_scope BEFORE INSERT ON media_variant_requests
WHEN NOT EXISTS(SELECT 1 FROM media_variants WHERE id=NEW.variant_id AND context_kind=NEW.context_kind AND target_id=NEW.target_id AND block_id=NEW.block_id)
BEGIN SELECT RAISE(ABORT,'media variant receipt scope mismatch'); END;
CREATE TRIGGER record_attachment_requests_scope BEFORE INSERT ON record_attachment_requests
WHEN NOT EXISTS(SELECT 1 FROM record_attachments WHERE id=NEW.attachment_id AND record_id=NEW.record_id AND uploader_id=NEW.owner_id)
BEGIN SELECT RAISE(ABORT,'record attachment receipt scope mismatch'); END;
CREATE TRIGGER media_variants_parent_scope BEFORE INSERT ON media_variants
WHEN (NEW.context_kind='record' AND NOT EXISTS(SELECT 1 FROM records WHERE id=NEW.target_id))
 OR (NEW.context_kind='note' AND NOT EXISTS(SELECT 1 FROM personal_notes WHERE id=NEW.target_id))
 OR (NEW.context_kind='page' AND NOT EXISTS(SELECT 1 FROM workspace_pages WHERE id=NEW.target_id))
BEGIN SELECT RAISE(ABORT,'media variant parent missing'); END;
CREATE TRIGGER media_variants_initial_selection BEFORE INSERT ON media_variants
WHEN NEW.selected_version_id<>''
BEGIN SELECT RAISE(ABORT,'new media variant cannot select a foreign version'); END;
CREATE TRIGGER media_variant_requests_immutable_update BEFORE UPDATE ON media_variant_requests
BEGIN SELECT RAISE(ABORT,'media receipts are immutable'); END;
CREATE TRIGGER media_variant_requests_immutable_delete BEFORE DELETE ON media_variant_requests
BEGIN SELECT RAISE(ABORT,'media receipts are immutable'); END;
CREATE TRIGGER record_attachment_requests_immutable_update BEFORE UPDATE ON record_attachment_requests
BEGIN SELECT RAISE(ABORT,'attachment receipts are immutable'); END;
CREATE TRIGGER record_attachment_requests_immutable_delete BEFORE DELETE ON record_attachment_requests
BEGIN SELECT RAISE(ABORT,'attachment receipts are immutable'); END;
