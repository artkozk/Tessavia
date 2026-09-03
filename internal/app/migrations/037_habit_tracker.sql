-- Existing facts, IDs, links and legacy columns remain intact.
ALTER TABLE personal_habits ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE personal_habits ADD COLUMN color_key TEXT NOT NULL DEFAULT 'green';
ALTER TABLE personal_habits ADD COLUMN icon_key TEXT NOT NULL DEFAULT 'checkSquare';
ALTER TABLE personal_habits ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Europe/Moscow';
ALTER TABLE personal_habits ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE personal_habit_checkins ADD COLUMN result_state TEXT NOT NULL DEFAULT 'measured';
ALTER TABLE personal_habit_checkins ADD COLUMN amount REAL;
UPDATE personal_habit_checkins SET amount = value;
CREATE TABLE personal_habit_rules (
 habit_id TEXT NOT NULL REFERENCES personal_habits(id) ON DELETE CASCADE,
 effective_date TEXT NOT NULL,
 config TEXT NOT NULL,
 PRIMARY KEY(habit_id,effective_date)
);
INSERT INTO personal_habit_rules(habit_id,effective_date,config)
 SELECT id,start_date,json_object('mode','build','cadence',CASE schedule_kind WHEN 'weekly_target' THEN 'weekly' ELSE schedule_kind END,
 'target',1,'periodTarget',target_per_week,'periodMeasure','days','interval',1,'weekdays',json('[1,2,3,4,5]'),'unit',unit,'endDate','') FROM personal_habits;
CREATE TABLE personal_habit_pauses (
 id TEXT PRIMARY KEY,
 habit_id TEXT NOT NULL REFERENCES personal_habits(id) ON DELETE CASCADE,
 start_date TEXT NOT NULL,
 end_date TEXT NOT NULL DEFAULT '',
 reason TEXT NOT NULL DEFAULT 'pause'
);
CREATE INDEX personal_habit_pauses_habit ON personal_habit_pauses(habit_id,start_date);
INSERT INTO personal_habit_pauses(id,habit_id,start_date,reason)
 SELECT lower(hex(randomblob(16))),id,date(archived_at,'+3 hours'),'archive' FROM personal_habits WHERE archived_at IS NOT NULL;
CREATE TABLE personal_habit_moves (
 habit_id TEXT NOT NULL REFERENCES personal_habits(id) ON DELETE CASCADE,
 source_date TEXT NOT NULL,
 target_date TEXT NOT NULL,
 PRIMARY KEY(habit_id,source_date),
 UNIQUE(habit_id,target_date)
);
