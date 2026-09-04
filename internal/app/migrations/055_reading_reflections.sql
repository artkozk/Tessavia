CREATE TABLE reading_reflections (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES reading_spaces(workspace_id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id TEXT NOT NULL,
    day TEXT NOT NULL CHECK(length(day) = 10),
    book INTEGER,
    chapter INTEGER,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    shared INTEGER NOT NULL DEFAULT 0 CHECK(shared IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK(
        (book IS NULL AND chapter IS NULL)
        OR (book BETWEEN 1 AND 66 AND chapter BETWEEN 1 AND 150)
    ),
    FOREIGN KEY(workspace_id, group_id) REFERENCES reading_groups(workspace_id, id)
);

CREATE INDEX reading_reflections_owner_idx
    ON reading_reflections(workspace_id, user_id, created_at DESC, id DESC);

CREATE INDEX reading_reflections_group_idx
    ON reading_reflections(workspace_id, group_id, shared, created_at DESC, id DESC);

CREATE TABLE reading_reflection_events (
    id INTEGER PRIMARY KEY,
    reflection_id TEXT NOT NULL REFERENCES reading_reflections(id) ON DELETE CASCADE,
    actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action TEXT NOT NULL CHECK(action IN ('edit', 'share', 'make_private')),
    happened_at TEXT NOT NULL
);
