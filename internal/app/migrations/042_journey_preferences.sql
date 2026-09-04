-- Help belongs to the account, never to a team or a shared interface preset.
CREATE TABLE user_journey_preferences (
    owner_id INTEGER PRIMARY KEY REFERENCES users(id),
    tips_enabled INTEGER NOT NULL DEFAULT 1 CHECK(tips_enabled IN (0,1)),
    dismissed_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
);
