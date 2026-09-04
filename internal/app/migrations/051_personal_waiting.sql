CREATE TABLE personal_waiting (
 id TEXT PRIMARY KEY,
 owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 waiting_for TEXT NOT NULL,
 notes TEXT NOT NULL DEFAULT '',
 since_date TEXT NOT NULL,
 expected_date TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','received','cancelled')),
 plan_id TEXT REFERENCES personal_plans(id) ON DELETE SET NULL,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 closed_at TEXT
);
CREATE INDEX personal_waiting_owner_status_date ON personal_waiting(owner_id,status,expected_date,since_date,id);
CREATE TABLE personal_waiting_events (
 id INTEGER PRIMARY KEY,
 waiting_id TEXT NOT NULL REFERENCES personal_waiting(id) ON DELETE CASCADE,
 owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 action TEXT NOT NULL CHECK(action IN ('create','update','expected_changed','received','cancelled','reopened')),
 old_status TEXT NOT NULL,
 new_status TEXT NOT NULL,
 old_expected_date TEXT NOT NULL,
 new_expected_date TEXT NOT NULL,
 request_key TEXT NOT NULL,
 happened_at TEXT NOT NULL,
 UNIQUE(owner_id,request_key)
);
CREATE INDEX personal_waiting_events_waiting ON personal_waiting_events(waiting_id,id DESC);
