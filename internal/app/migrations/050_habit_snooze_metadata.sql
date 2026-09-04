ALTER TABLE personal_habit_checkins ADD COLUMN snoozed_at TEXT NOT NULL DEFAULT '';
ALTER TABLE personal_habit_checkins ADD COLUMN snoozed_from TEXT NOT NULL DEFAULT '';
