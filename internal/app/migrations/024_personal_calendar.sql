ALTER TABLE personal_plans ADD COLUMN start_date TEXT NOT NULL DEFAULT '';
ALTER TABLE personal_plans ADD COLUMN end_date TEXT NOT NULL DEFAULT '';
ALTER TABLE personal_plans ADD COLUMN color_key TEXT NOT NULL DEFAULT 'green';

-- Introduce a new module without resetting existing project or device preferences.
UPDATE workspace_navigation
SET enabled_views_json = json_insert(enabled_views_json, '$[#]', 'calendar')
WHERE NOT EXISTS (SELECT 1 FROM json_each(enabled_views_json) WHERE value = 'calendar');
