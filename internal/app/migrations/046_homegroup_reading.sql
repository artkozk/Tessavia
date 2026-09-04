-- Applied after the concurrent personal workspace and reminder releases (041-045).
CREATE TABLE reading_spaces (
 workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),
 timezone TEXT NOT NULL DEFAULT 'Europe/Moscow' CHECK(timezone='Europe/Moscow'),
 created_at TEXT NOT NULL
);
CREATE TABLE reading_groups (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES reading_spaces(workspace_id),
 name TEXT NOT NULL,
 leader_id INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 UNIQUE(workspace_id,id), UNIQUE(workspace_id,name)
);
CREATE TABLE reading_members (
 workspace_id TEXT NOT NULL REFERENCES reading_spaces(workspace_id),
 user_id INTEGER NOT NULL REFERENCES users(id),
 group_id TEXT NOT NULL,
 joined_at TEXT NOT NULL,
 PRIMARY KEY(workspace_id,user_id),
 FOREIGN KEY(workspace_id,group_id) REFERENCES reading_groups(workspace_id,id)
);
CREATE TABLE reading_entries (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES reading_spaces(workspace_id),
 user_id INTEGER NOT NULL REFERENCES users(id),
 group_id TEXT NOT NULL,
 day TEXT NOT NULL,
 book INTEGER NOT NULL CHECK(book BETWEEN 1 AND 66),
 chapter INTEGER NOT NULL CHECK(chapter BETWEEN 1 AND 150),
 complete INTEGER NOT NULL CHECK(complete IN (0,1)),
 stream TEXT NOT NULL CHECK(stream IN ('personal','group')),
 note TEXT NOT NULL DEFAULT '',
 shared INTEGER NOT NULL DEFAULT 0 CHECK(shared IN (0,1)),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 cancelled_at TEXT,
 UNIQUE(workspace_id,user_id,day,book,chapter),
 FOREIGN KEY(workspace_id,group_id) REFERENCES reading_groups(workspace_id,id)
);
CREATE INDEX reading_entries_user ON reading_entries(workspace_id,user_id,day);
CREATE INDEX reading_entries_group ON reading_entries(workspace_id,group_id,day);
CREATE TABLE reading_entry_events (
 id INTEGER PRIMARY KEY,
 entry_id TEXT NOT NULL REFERENCES reading_entries(id),
 actor_id INTEGER NOT NULL REFERENCES users(id),
 action TEXT NOT NULL CHECK(action IN ('edit','cancel','restore')),
 happened_at TEXT NOT NULL
);
CREATE TABLE reading_plans (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES reading_spaces(workspace_id),
 group_id TEXT NOT NULL,
 author_id INTEGER NOT NULL REFERENCES users(id),
 title TEXT NOT NULL,
 reference TEXT NOT NULL DEFAULT '',
 questions TEXT NOT NULL DEFAULT '',
 book INTEGER NOT NULL CHECK(book BETWEEN 1 AND 66),
 first_chapter INTEGER NOT NULL,
 last_chapter INTEGER NOT NULL,
 meeting_day TEXT NOT NULL,
 created_at TEXT NOT NULL,
 cancelled_at TEXT,
 cancel_reason TEXT NOT NULL DEFAULT '',
 FOREIGN KEY(workspace_id,group_id) REFERENCES reading_groups(workspace_id,id)
);
CREATE INDEX reading_plans_group ON reading_plans(workspace_id,group_id,meeting_day);
