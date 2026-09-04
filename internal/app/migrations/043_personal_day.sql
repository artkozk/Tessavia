-- A day's focus and working window are private account data, not project state.
CREATE TABLE personal_day_settings (
 owner_id INTEGER PRIMARY KEY REFERENCES users(id),
 timezone TEXT NOT NULL,
 starts_at TEXT NOT NULL DEFAULT '',
 ends_at TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL
);
CREATE TABLE personal_day_focus (
 owner_id INTEGER NOT NULL REFERENCES users(id),
 day TEXT NOT NULL,
 plan_id TEXT REFERENCES personal_plans(id),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,day)
);
