-- Preserve the old rows; copy only missing private page layouts to their owner.
CREATE TEMP TABLE personal_page_scope_import AS
WITH owners AS (
    SELECT w.owner_id AS user_id, w.id AS workspace_id,
           row_number() OVER (PARTITION BY w.owner_id ORDER BY w.created_at, w.id) AS rank
    FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = w.owner_id AND m.status = 'active'
    WHERE w.kind = 'personal' AND w.archived_at IS NULL
), sources AS (
    SELECT p.user_id, o.workspace_id, p.workspace_id AS source_id,
           'desktop' AS device, p.updated_at AS stamp, j.key, j.value
    FROM user_interface_preferences p
    JOIN workspaces w ON w.id = p.workspace_id AND w.kind = 'team'
    JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = p.user_id AND m.status = 'active'
    JOIN owners o ON o.user_id = p.user_id AND o.rank = 1
    JOIN json_each(p.layout_json, '$.pages') j
    WHERE j.key IN ('personal', 'calendar:personal', 'day:personal') AND j.type = 'object'
      AND w.archived_at IS NULL AND (w.team_id IS NULL OR EXISTS (
          SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id=t.id
          WHERE t.id=w.team_id AND t.deleted_at IS NULL AND tm.user_id=p.user_id AND tm.status='active'))
    UNION ALL
    SELECT p.user_id, o.workspace_id, p.workspace_id,
           'mobile', coalesce(json_extract(nullif(p.mobile_preferences_json, ''), '$.updatedAt'), p.updated_at), j.key, j.value
    FROM user_interface_preferences p
    JOIN workspaces w ON w.id = p.workspace_id AND w.kind = 'team'
    JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = p.user_id AND m.status = 'active'
    JOIN owners o ON o.user_id = p.user_id AND o.rank = 1
    JOIN json_each(nullif(p.mobile_preferences_json, ''), '$.layout.pages') j
    WHERE j.key IN ('personal', 'calendar:personal', 'day:personal') AND j.type = 'object'
      AND w.archived_at IS NULL AND (w.team_id IS NULL OR EXISTS (
          SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id=t.id
          WHERE t.id=w.team_id AND t.deleted_at IS NULL AND tm.user_id=p.user_id AND tm.status='active'))
), ranked AS (
    SELECT *, row_number() OVER (PARTITION BY user_id, device, key ORDER BY stamp DESC, source_id DESC) AS rank
    FROM sources
)
SELECT r.user_id, r.workspace_id, r.device, json_group_object(r.key, json(r.value)) AS pages
FROM ranked r
LEFT JOIN user_interface_preferences target ON target.user_id = r.user_id AND target.workspace_id = r.workspace_id
WHERE r.rank = 1 AND json_type(
    CASE r.device WHEN 'desktop' THEN target.layout_json ELSE nullif(target.mobile_preferences_json, '') END,
    CASE r.device WHEN 'desktop' THEN '$.pages.' ELSE '$.layout.pages.' END || '"' || r.key || '"'
) IS NULL
GROUP BY r.user_id, r.workspace_id, r.device;

INSERT INTO user_interface_preferences(user_id, workspace_id, updated_at)
SELECT DISTINCT user_id, workspace_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM personal_page_scope_import WHERE true
ON CONFLICT(user_id, workspace_id) DO NOTHING;

UPDATE user_interface_preferences AS p
SET layout_json = json_set(p.layout_json, '$.pages', json_patch(coalesce(json_extract(p.layout_json, '$.pages'), '{}'), i.pages)),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM personal_page_scope_import i
WHERE p.user_id = i.user_id AND p.workspace_id = i.workspace_id AND i.device = 'desktop';

UPDATE user_interface_preferences AS p
SET mobile_preferences_json = json_set(coalesce(nullif(p.mobile_preferences_json, ''), '{}'),
        '$.layout.pages', json_patch(coalesce(json_extract(nullif(p.mobile_preferences_json, ''), '$.layout.pages'), '{}'), i.pages),
        '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM personal_page_scope_import i
WHERE p.user_id = i.user_id AND p.workspace_id = i.workspace_id AND i.device = 'mobile';

DROP TABLE personal_page_scope_import;
