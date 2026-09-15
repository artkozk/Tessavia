-- Media belongs to the live page/block, never to portable definitions or kits.
CREATE TABLE page_media_attachments (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL REFERENCES workspace_pages(id),
    block_id TEXT NOT NULL,
    uploader_id INTEGER NOT NULL REFERENCES users(id),
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL UNIQUE,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 15728640),
    sha256 TEXT NOT NULL,
    request_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    removed_at TEXT,
    UNIQUE(page_id, block_id, uploader_id, request_key)
);
CREATE INDEX page_media_block_idx ON page_media_attachments(page_id, block_id, created_at, id);
