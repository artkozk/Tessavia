-- Only the built-in team's unchanged display names belong to the brand.
-- Stable IDs keep project links, memberships, saved filters and exports valid.
-- Do not rewrite user-authored records or names chosen by administrators.
UPDATE workspaces
SET name = 'Команда Tessavie', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'bizflow-team' AND name = 'Команда BizFlow';

UPDATE teams
SET name = 'Команда Tessavie', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'team-bizflow-team' AND name = 'Команда BizFlow';
