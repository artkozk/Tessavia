CREATE TABLE user_graph_layouts (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    view_key TEXT NOT NULL,
    data_json TEXT NOT NULL,
    version INTEGER NOT NULL CHECK(version > 0),
    updated_at TEXT NOT NULL,
    PRIMARY KEY(user_id, workspace_id, view_key)
);
