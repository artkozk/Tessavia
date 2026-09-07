CREATE TABLE personal_recurrence_templates (
    series_id TEXT PRIMARY KEY REFERENCES personal_recurrence_rules(series_id) ON DELETE CASCADE,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_json TEXT NOT NULL CHECK(json_valid(plan_json)),
    needs_review INTEGER NOT NULL DEFAULT 0 CHECK(needs_review IN (0,1)),
    updated_at TEXT NOT NULL
);
CREATE TABLE personal_recurrence_instances (
    plan_id TEXT PRIMARY KEY REFERENCES personal_plans(id) ON DELETE CASCADE,
    series_id TEXT NOT NULL REFERENCES personal_recurrence_rules(series_id) ON DELETE CASCADE,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scheduled_date TEXT NOT NULL,
    UNIQUE(owner_id,series_id,scheduled_date)
);
INSERT INTO personal_recurrence_templates(series_id,owner_id,plan_json,needs_review,updated_at)
SELECT r.series_id,r.owner_id,json_object(
    'title',p.title,'notes',p.notes,'dueAt',p.due_at,'startDate',p.start_date,'endDate',p.end_date,
    'colorKey',p.color_key,'titleGenerated',json(CASE WHEN p.title_generated=1 THEN 'true' ELSE 'false' END),
    'itemKind',p.item_kind,'projectId',COALESCE(p.project_id,''),'goalId',COALESCE(p.goal_id,''),
    'parentId',COALESCE(p.parent_id,''),'plannedMinutes',p.planned_minutes,
    'startsAt',p.starts_at,'endsAt',p.ends_at,'occurrenceDate',CASE WHEN p.occurrence_date='' THEN r.start_date ELSE p.occurrence_date END),1,r.updated_at
FROM personal_recurrence_rules r JOIN personal_plans p ON p.id=(
    SELECT p2.id FROM personal_plans p2 WHERE p2.owner_id=r.owner_id AND p2.series_id=r.series_id
    ORDER BY CASE WHEN p2.id=p2.series_id THEN 0 ELSE 1 END,p2.created_at,p2.id LIMIT 1
);
INSERT INTO personal_recurrence_instances(plan_id,series_id,owner_id,scheduled_date)
SELECT p.id,p.series_id,p.owner_id,p.occurrence_date FROM personal_plans p JOIN personal_recurrence_rules r ON r.series_id=p.series_id AND r.owner_id=p.owner_id WHERE p.series_id<>'' AND p.occurrence_date<>'';
DROP INDEX personal_plans_series_occurrence_idx;
CREATE INDEX personal_plans_series_occurrence_idx ON personal_plans(owner_id,series_id,occurrence_date) WHERE series_id<>'';
