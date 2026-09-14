-- Read-only grants for one explicitly selected constructor block.
-- Pairing codes and device tokens are never stored in plaintext.
CREATE TABLE widget_devices (
 id TEXT PRIMARY KEY,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 page_id TEXT NOT NULL REFERENCES workspace_pages(id) ON DELETE CASCADE,
 block_id TEXT NOT NULL,
 name TEXT NOT NULL,
 pairing_hash TEXT UNIQUE,
 pairing_expires_at TEXT NOT NULL,
 token_hash TEXT UNIQUE,
 created_at TEXT NOT NULL,
 redeemed_at TEXT NOT NULL DEFAULT '',
 last_used_at TEXT NOT NULL DEFAULT '',
 expires_at TEXT NOT NULL,
 CHECK ((pairing_hash IS NOT NULL AND token_hash IS NULL) OR
        (pairing_hash IS NULL AND token_hash IS NOT NULL))
);
CREATE INDEX widget_devices_owner_idx ON widget_devices(user_id,created_at);
-- An ordinary web logout does not remove another device's independent consent.
-- Changing the account password does revoke every widget grant, including pending pairing.
CREATE TRIGGER widget_devices_password_changed AFTER UPDATE OF password_hash ON users
WHEN OLD.password_hash <> NEW.password_hash BEGIN
 DELETE FROM widget_devices WHERE user_id=NEW.id;
END;
