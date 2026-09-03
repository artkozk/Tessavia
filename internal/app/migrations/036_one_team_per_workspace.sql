-- A team is one independent group and owns exactly one collaborative workspace.
-- Preserve workspace ids so records, boards, files, chat and user preferences do
-- not move or need to be copied when a legacy multi-workspace team is split.
CREATE TEMP TABLE workspace_team_split AS
WITH ranked_workspaces AS (
    SELECT
        workspace.id,
        workspace.team_id,
        ROW_NUMBER() OVER (
            PARTITION BY workspace.team_id
            ORDER BY
                CASE WHEN workspace.team_id = 'team-' || workspace.id THEN 0 ELSE 1 END,
                workspace.created_at,
                workspace.id
        ) AS team_position
    FROM workspaces workspace
    WHERE workspace.kind = 'team'
      AND workspace.team_id IS NOT NULL
)
SELECT
    ranked.id AS workspace_id,
    ranked.team_id AS source_team_id,
    'team-space-' || ranked.id AS target_team_id
FROM ranked_workspaces ranked
WHERE ranked.team_position > 1;

INSERT INTO teams(id, name, slug, description, owner_id, created_at, updated_at, deleted_at)
SELECT split.target_team_id,
       workspace.name,
       'team-space-' || workspace.slug,
       workspace.description,
       workspace.owner_id,
       workspace.created_at,
       workspace.updated_at,
       source.deleted_at
FROM workspace_team_split split
JOIN workspaces workspace ON workspace.id = split.workspace_id
JOIN teams source ON source.id = split.source_team_id;

INSERT INTO team_members(team_id, user_id, role, status, joined_at)
SELECT split.target_team_id,
       member.user_id,
       CASE
           WHEN member.user_id = workspace.owner_id THEN 'owner'
           WHEN member.role = 'admin' THEN 'admin'
           ELSE 'member'
       END,
       CASE WHEN member.status = 'active' THEN 'active' ELSE 'suspended' END,
       member.joined_at
FROM workspace_team_split split
JOIN workspaces workspace ON workspace.id = split.workspace_id
JOIN workspace_members member ON member.workspace_id = workspace.id;

INSERT OR IGNORE INTO team_members(team_id, user_id, role, status, joined_at)
SELECT split.target_team_id,
       workspace.owner_id,
       'owner',
       'active',
       workspace.created_at
FROM workspace_team_split split
JOIN workspaces workspace ON workspace.id = split.workspace_id;

INSERT INTO team_activity(id, team_id, actor_id, action, reason, details_json, created_at)
SELECT 'workspace-team-split-' || split.workspace_id,
       split.target_team_id,
       workspace.owner_id,
       'team_split',
       'Самостоятельное рабочее пространство выделено из общей команды',
       '{"sourceTeamId":"' || split.source_team_id || '","workspaceId":"' || split.workspace_id || '"}',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM workspace_team_split split
JOIN workspaces workspace ON workspace.id = split.workspace_id;

UPDATE workspace_invitations
SET revoked_at = COALESCE(revoked_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
WHERE team_id IN (SELECT DISTINCT source_team_id FROM workspace_team_split);

UPDATE workspaces
SET team_id = (
    SELECT split.target_team_id
    FROM workspace_team_split split
    WHERE split.workspace_id = workspaces.id
)
WHERE id IN (SELECT workspace_id FROM workspace_team_split);

UPDATE team_members AS membership
SET status = 'suspended'
WHERE membership.team_id IN (SELECT DISTINCT source_team_id FROM workspace_team_split)
  AND membership.status = 'active'
  AND NOT EXISTS (
      SELECT 1
      FROM workspaces workspace
      JOIN workspace_members access
        ON access.workspace_id = workspace.id
       AND access.user_id = membership.user_id
       AND access.status = 'active'
      WHERE workspace.team_id = membership.team_id
        AND workspace.kind = 'team'
  );

UPDATE team_members AS membership
SET role = CASE
    WHEN membership.user_id = (SELECT owner_id FROM teams WHERE id = membership.team_id) THEN 'owner'
    WHEN EXISTS (
        SELECT 1 FROM workspaces workspace
        JOIN workspace_members access ON access.workspace_id = workspace.id
        WHERE workspace.team_id = membership.team_id
          AND access.user_id = membership.user_id
          AND access.status = 'active'
          AND access.role = 'admin'
    ) THEN 'admin'
    ELSE 'member'
END
WHERE membership.team_id IN (SELECT DISTINCT source_team_id FROM workspace_team_split)
  AND membership.status = 'active';

DROP TABLE workspace_team_split;

CREATE TRIGGER one_team_workspace_insert
BEFORE INSERT ON workspaces
WHEN NEW.kind = 'team'
 AND NEW.team_id IS NOT NULL
 AND EXISTS (
     SELECT 1 FROM workspaces existing
     WHERE existing.kind = 'team' AND existing.team_id = NEW.team_id
       AND existing.id <> NEW.id
 )
BEGIN
    SELECT RAISE(ABORT, 'a team already has a workspace');
END;

CREATE TRIGGER one_team_workspace_update
BEFORE UPDATE OF team_id, kind ON workspaces
WHEN NEW.kind = 'team'
 AND NEW.team_id IS NOT NULL
 AND EXISTS (
     SELECT 1 FROM workspaces existing
     WHERE existing.kind = 'team'
       AND existing.team_id = NEW.team_id
       AND existing.id <> OLD.id
 )
BEGIN
    SELECT RAISE(ABORT, 'a team already has a workspace');
END;
