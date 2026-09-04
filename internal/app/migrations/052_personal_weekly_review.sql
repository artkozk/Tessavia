CREATE TABLE personal_review_choices (
 id TEXT PRIMARY KEY,
 owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 week_start TEXT NOT NULL,
 source_kind TEXT NOT NULL CHECK(source_kind IN ('plan','waiting','record')),
 source_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('next_week','skip','postpone','fix')),
 note TEXT NOT NULL DEFAULT '',
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(owner_id,week_start,source_kind,source_id)
);
CREATE INDEX personal_review_choices_owner_week
ON personal_review_choices(owner_id,week_start,updated_at DESC);

CREATE TABLE personal_review_choice_events (
 id INTEGER PRIMARY KEY,
 choice_id TEXT NOT NULL REFERENCES personal_review_choices(id) ON DELETE CASCADE,
 owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 old_action TEXT NOT NULL,
 new_action TEXT NOT NULL,
 request_key TEXT NOT NULL,
 happened_at TEXT NOT NULL,
 UNIQUE(owner_id,request_key)
);
CREATE INDEX personal_review_choice_events_choice
ON personal_review_choice_events(choice_id,id DESC);
