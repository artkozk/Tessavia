ALTER TABLE reminder_preferences ADD COLUMN habits_enabled INTEGER NOT NULL DEFAULT 1 CHECK(habits_enabled IN (0,1));
CREATE TABLE habit_reminder_preferences (
    habit_id TEXT PRIMARY KEY REFERENCES personal_habits(id),
    owner_id INTEGER NOT NULL REFERENCES users(id),
    reminder_time TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK(revision>0),
    updated_at TEXT NOT NULL
);
CREATE TABLE habit_reminder_sources (
    notification_id TEXT PRIMARY KEY REFERENCES notifications(id),
    habit_id TEXT NOT NULL REFERENCES personal_habits(id),
    day TEXT NOT NULL,
    period_from TEXT NOT NULL,
    valid_until TEXT NOT NULL,
    invalidated INTEGER NOT NULL DEFAULT 0 CHECK(invalidated IN (0,1))
);
CREATE INDEX habit_reminder_sources_habit_day ON habit_reminder_sources(habit_id,day);
CREATE TRIGGER habit_notice_checkin_insert AFTER INSERT ON personal_habit_checkins BEGIN
 UPDATE habit_reminder_sources SET invalidated=1 WHERE habit_id=NEW.habit_id AND NEW.checkin_date BETWEEN period_from AND day;
END;
CREATE TRIGGER habit_notice_checkin_update AFTER UPDATE ON personal_habit_checkins BEGIN
 UPDATE habit_reminder_sources SET invalidated=1 WHERE habit_id=NEW.habit_id AND NEW.checkin_date BETWEEN period_from AND day;
END;
CREATE TRIGGER habit_notice_checkin_delete AFTER DELETE ON personal_habit_checkins BEGIN
 UPDATE habit_reminder_sources SET invalidated=1 WHERE habit_id=OLD.habit_id AND OLD.checkin_date BETWEEN period_from AND day;
END;
CREATE TRIGGER habit_notice_pause_insert AFTER INSERT ON personal_habit_pauses BEGIN
 UPDATE habit_reminder_sources SET invalidated=1 WHERE habit_id=NEW.habit_id AND day>=NEW.start_date AND (NEW.end_date='' OR day<=NEW.end_date);
END;
CREATE TRIGGER habit_notice_pause_update AFTER UPDATE ON personal_habit_pauses BEGIN
 UPDATE habit_reminder_sources SET invalidated=1 WHERE habit_id=NEW.habit_id AND ((day>=NEW.start_date AND (NEW.end_date='' OR day<=NEW.end_date)) OR (day>=OLD.start_date AND (OLD.end_date='' OR day<=OLD.end_date)));
END;
CREATE TRIGGER habit_notice_pause_delete AFTER DELETE ON personal_habit_pauses BEGIN
 UPDATE habit_reminder_sources SET invalidated=1 WHERE habit_id=OLD.habit_id AND day>=OLD.start_date AND (OLD.end_date='' OR day<=OLD.end_date);
END;
CREATE TRIGGER habit_notice_move_insert AFTER INSERT ON personal_habit_moves BEGIN
 UPDATE habit_reminder_sources SET invalidated=1 WHERE habit_id=NEW.habit_id AND day IN (NEW.source_date,NEW.target_date);
END;
CREATE TRIGGER habit_notice_move_update AFTER UPDATE ON personal_habit_moves BEGIN
 UPDATE habit_reminder_sources SET invalidated=1 WHERE habit_id=NEW.habit_id AND day IN (NEW.source_date,NEW.target_date,OLD.source_date,OLD.target_date);
END;
CREATE TRIGGER habit_notice_move_delete AFTER DELETE ON personal_habit_moves BEGIN
 UPDATE habit_reminder_sources SET invalidated=1 WHERE habit_id=OLD.habit_id AND day IN (OLD.source_date,OLD.target_date);
END;
CREATE TRIGGER habit_notice_rule_insert AFTER INSERT ON personal_habit_rules BEGIN
 UPDATE habit_reminder_sources SET invalidated=1 WHERE habit_id=NEW.habit_id AND day>=NEW.effective_date;
END;
CREATE TRIGGER habit_notice_rule_update AFTER UPDATE ON personal_habit_rules BEGIN
 UPDATE habit_reminder_sources SET invalidated=1 WHERE habit_id=NEW.habit_id AND (day>=NEW.effective_date OR day>=OLD.effective_date);
END;
CREATE TRIGGER habit_notice_rule_delete AFTER DELETE ON personal_habit_rules BEGIN
 UPDATE habit_reminder_sources SET invalidated=1 WHERE habit_id=OLD.habit_id AND day>=OLD.effective_date;
END;
CREATE TRIGGER habit_notice_archive AFTER UPDATE OF archived_at ON personal_habits WHEN OLD.archived_at IS NOT NEW.archived_at BEGIN
 UPDATE habit_reminder_sources SET invalidated=1 WHERE habit_id=NEW.id;
END;
CREATE TRIGGER habit_notice_preferences_insert AFTER INSERT ON habit_reminder_preferences BEGIN
 UPDATE habit_reminder_sources SET invalidated=1 WHERE habit_id=NEW.habit_id;
END;
CREATE TRIGGER habit_notice_preferences_update AFTER UPDATE ON habit_reminder_preferences BEGIN
 UPDATE habit_reminder_sources SET invalidated=1 WHERE habit_id=NEW.habit_id;
END;
