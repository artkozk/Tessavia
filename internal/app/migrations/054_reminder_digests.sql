ALTER TABLE reminder_preferences ADD COLUMN daily_digest_enabled INTEGER NOT NULL DEFAULT 0 CHECK(daily_digest_enabled IN (0,1));
ALTER TABLE reminder_preferences ADD COLUMN daily_digest_time TEXT NOT NULL DEFAULT '08:00';
ALTER TABLE reminder_preferences ADD COLUMN weekly_digest_enabled INTEGER NOT NULL DEFAULT 0 CHECK(weekly_digest_enabled IN (0,1));
ALTER TABLE reminder_preferences ADD COLUMN weekly_digest_weekday INTEGER NOT NULL DEFAULT 7 CHECK(weekly_digest_weekday BETWEEN 1 AND 7);
ALTER TABLE reminder_preferences ADD COLUMN weekly_digest_time TEXT NOT NULL DEFAULT '18:00';

CREATE TABLE reminder_digest_sources (
    notification_id TEXT PRIMARY KEY REFERENCES notifications(id) ON DELETE CASCADE,
    digest_kind TEXT NOT NULL CHECK(digest_kind IN ('daily','weekly')),
    local_period TEXT NOT NULL,
    valid_until TEXT NOT NULL,
    timezone TEXT NOT NULL,
    schedule_clock TEXT NOT NULL,
    schedule_weekday INTEGER NOT NULL DEFAULT 0 CHECK(schedule_weekday BETWEEN 0 AND 7)
);
CREATE INDEX reminder_digest_sources_period_idx ON reminder_digest_sources(digest_kind,local_period,valid_until);
