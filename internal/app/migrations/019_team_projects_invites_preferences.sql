CREATE TABLE teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE team_members (
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    joined_at TEXT NOT NULL,
    PRIMARY KEY (team_id, user_id)
);

CREATE INDEX team_members_user_idx ON team_members(user_id, status, team_id);

ALTER TABLE workspaces ADD COLUMN team_id TEXT;
ALTER TABLE workspaces ADD COLUMN archived_at TEXT;
CREATE INDEX workspaces_team_idx ON workspaces(team_id, archived_at, created_at);

INSERT INTO teams(id, name, slug, description, owner_id, created_at, updated_at)
SELECT 'team-' || id, name, 'team-' || slug, description, owner_id, created_at, updated_at
FROM workspaces
WHERE kind = 'team';

UPDATE workspaces
SET team_id = 'team-' || id
WHERE kind = 'team';

INSERT INTO team_members(team_id, user_id, role, status, joined_at)
SELECT 'team-' || wm.workspace_id,
       wm.user_id,
       CASE WHEN wm.role = 'owner' THEN 'owner' WHEN wm.role = 'admin' THEN 'admin' ELSE 'member' END,
       CASE WHEN wm.status = 'active' THEN 'active' ELSE 'suspended' END,
       wm.joined_at
FROM workspace_members wm
JOIN workspaces w ON w.id = wm.workspace_id
WHERE w.kind = 'team';

-- The first imported CRM is a project of the existing BizFlow team, not a
-- second organization. Project membership remains unchanged and therefore
-- still controls who can open its records, files, search results and chat.
INSERT OR IGNORE INTO team_members(team_id, user_id, role, status, joined_at)
SELECT 'team-bizflow-team', user_id,
       CASE WHEN role = 'owner' THEN 'admin' ELSE 'member' END,
       CASE WHEN status = 'active' THEN 'active' ELSE 'suspended' END,
       joined_at
FROM workspace_members
WHERE workspace_id = 'crm-first-client'
  AND EXISTS (SELECT 1 FROM teams WHERE id = 'team-bizflow-team');

UPDATE workspaces
SET team_id = 'team-bizflow-team'
WHERE id = 'crm-first-client'
  AND EXISTS (SELECT 1 FROM teams WHERE id = 'team-bizflow-team');

DELETE FROM teams
WHERE id = 'team-crm-first-client'
  AND NOT EXISTS (SELECT 1 FROM workspaces WHERE team_id = 'team-crm-first-client');

CREATE TABLE workspace_invitations (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    code_hash TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    project_ids_json TEXT NOT NULL DEFAULT '[]',
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    expires_at TEXT NOT NULL,
    max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 1000),
    use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
    revoked_at TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX workspace_invitations_team_idx ON workspace_invitations(team_id, revoked_at, expires_at);

CREATE TABLE user_interface_preferences (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    hidden_nav_groups_json TEXT NOT NULL DEFAULT '[]',
    collapsed_nav_groups_json TEXT NOT NULL DEFAULT '[]',
    dashboard_widgets_json TEXT NOT NULL DEFAULT '["focus","capture","capacity","quality"]',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, workspace_id)
);

CREATE TABLE registration_challenges (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL COLLATE NOCASE,
    username TEXT NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    invitation_id TEXT REFERENCES workspace_invitations(id) ON DELETE CASCADE,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX registration_challenges_email_idx ON registration_challenges(email);
CREATE UNIQUE INDEX registration_challenges_username_idx ON registration_challenges(username);
CREATE INDEX registration_challenges_expires_idx ON registration_challenges(expires_at);

DROP TRIGGER users_after_insert_workspaces;

CREATE TRIGGER users_after_insert_personal_workspace
AFTER INSERT ON users
BEGIN
    INSERT OR IGNORE INTO workspaces(id, name, slug, kind, owner_id, delete_policy, created_at, updated_at)
    VALUES('personal-' || NEW.id, 'Личное пространство', 'personal-' || NEW.id, 'personal', NEW.id, 'archive_only', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

    INSERT OR IGNORE INTO workspace_members(workspace_id, user_id, role, status, joined_at)
    VALUES('personal-' || NEW.id, NEW.id, 'owner', 'active', CURRENT_TIMESTAMP);
END;
