-- Explicit device consent, tied to a revocable login. Credentials never enter exports.
CREATE TABLE push_subscriptions (
 id TEXT PRIMARY KEY,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_hash TEXT NOT NULL UNIQUE REFERENCES sessions(token_hash) ON DELETE CASCADE,
 endpoint TEXT NOT NULL UNIQUE,
 p256dh TEXT NOT NULL,
 auth TEXT NOT NULL,
 vapid_public_key TEXT NOT NULL,
 name TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 created_at TEXT NOT NULL,
 last_status TEXT NOT NULL DEFAULT 'enabled',
 last_attempt_at TEXT NOT NULL DEFAULT '',
 last_success_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions(user_id);
CREATE TABLE push_deliveries (
 id TEXT PRIMARY KEY,
 subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
 notification_id TEXT REFERENCES notifications(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','accepted','cancelled','failed')),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TEXT NOT NULL,
 lease_until TEXT NOT NULL DEFAULT '',
 lease_token TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 UNIQUE(subscription_id,notification_id)
);
CREATE INDEX push_deliveries_due_idx ON push_deliveries(status,next_attempt_at);
-- Consent and the event are serialized by SQLite. Old inbox rows are never backfilled,
-- even after VACUUM, a device reconnect, or changing read/unread state.
CREATE TRIGGER push_notification_created AFTER INSERT ON notifications BEGIN
 INSERT INTO push_deliveries(id,subscription_id,notification_id,next_attempt_at,created_at,expires_at)
 SELECT lower(hex(randomblob(16))),p.id,NEW.id,NEW.created_at,NEW.created_at,strftime('%Y-%m-%dT%H:%M:%fZ',NEW.created_at,'+1 day')
 FROM push_subscriptions p JOIN sessions se ON se.token_hash=p.session_hash AND se.user_id=p.user_id
 WHERE p.user_id=NEW.user_id AND p.enabled=1 AND julianday(se.expires_at)>julianday('now') AND NEW.read_at IS NULL;
END;
