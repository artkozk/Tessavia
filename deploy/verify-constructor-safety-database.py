"""Read-only, fail-closed validation for the explicit constructor-safety release.

Schema 070 and all prior table values remain unchanged during startup. Rollback
keeps the latest database, including new financial operations and habit marks;
it never restores the older backup or requires new feature tables to be empty.
Only technical verification markers leave the production host.
"""
from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
import sys


EXPECTED_SCHEMA_SHA256 = '6db033c897760b40216219477e67db9c4d4f642e66dd84d17a05c6bf6309d094'
EXPECTED_TABLE_COUNT = 127
# Filled from the reviewed migration filenames through 070, not the live server.
EXPECTED_MIGRATIONS = ('001_init.sql', '002_question_workflow.sql', '003_traceable_outputs_and_meetings.sql', '004_record_priority.sql', '005_collaboration_hierarchy_activity.sql', '006_research_comparison.sql', '007_workflow_comfort.sql', '008_decision_and_research_semantics.sql', '009_team_chat.sql', '010_chat_message_history.sql', '011_chat_message_idempotency.sql', '012_business_memory_and_safe_undo.sql', '013_blockers_and_knowledge_provenance.sql', '014_productivity_and_quality.sql', '015_planning_cycles.sql', '016_personal_workspace_foundation.sql', '017_profile_avatars.sql', '018_workspace_crm_constructor.sql', '019_team_projects_invites_preferences.sql', '020_interface_layout.sql', '021_project_composer.sql', '022_device_interface_preferences.sql', '023_interface_presets.sql', '024_personal_calendar.sql', '025_page_record_types.sql', '026_personal_note_schedule.sql', '027_team_lifecycle.sql', '028_team_activity.sql', '029_tessavie_brand.sql', '030_personal_inbox.sql', '031_notebook_title_origin.sql', '032_personal_criterion_scores.sql', '033_graph_layouts.sql', '034_offline_create_receipts.sql', '035_personal_planning.sql', '036_one_team_per_workspace.sql', '037_habit_tracker.sql', '038_record_batches.sql', '039_note_organization.sql', '040_note_media_history.sql', '041_personal_publications.sql', '042_journey_preferences.sql', '043_personal_day.sql', '044_personal_page_scope.sql', '045_deadline_delivery_sources.sql', '046_homegroup_reading.sql', '047_reminder_preferences.sql', '048_personal_plan_reminders.sql', '049_habit_reminder_delivery.sql', '050_habit_snooze_metadata.sql', '051_personal_waiting.sql', '052_personal_weekly_review.sql', '053_personal_waiting_pings.sql', '054_reminder_digests.sql', '055_reading_reflections.sql', '056_chat_conversations.sql', '057_personal_calendar_work.sql', '058_chat_group_lifecycle.sql', '059_personal_recurrence_templates.sql', '060_collection_field_defaults.sql', '061_chat_personal_pins.sql', '062_chat_personal_archives.sql', '063_task_completion_review.sql', '064_page_app_composition.sql', '065_record_create_requests.sql', '066_personal_finance.sql', '067_personal_finance_counterparties.sql', '068_page_app_sheet_values.sql', '069_personal_finance_expenses.sql', '070_page_app_components.sql')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def connect_readonly(path):
    db = sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True, timeout=20)
    db.execute('BEGIN')
    return db


def identifier(name):
    return '"' + name.replace('"', '""') + '"'


def table_names(db, include_internal=False):
    query = "SELECT name FROM sqlite_master WHERE type='table'"
    if not include_internal:
        query += " AND name NOT LIKE 'sqlite_%'"
    return {row[0] for row in db.execute(query)}


def schema_objects(db):
    return sorted((kind, name, table, sql.replace('\r\n', '\n')) for kind, name, table, sql in db.execute(
        "SELECT type,name,tbl_name,COALESCE(sql,'') FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"))


def schema_digest(objects):
    return hashlib.sha256(json.dumps(objects, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def table_rows(db, table):
    # Lists (rather than dicts/sets) preserve column order and duplicate rows.
    # Tagged values distinguish NULL, blobs, integers, reals and text exactly.
    def encode(row):
        return json.dumps([(type(value).__name__, value.hex() if isinstance(value, bytes) else value)
                           for value in row], ensure_ascii=False, separators=(',', ':'))
    return sorted(encode(row) for row in db.execute('SELECT * FROM ' + identifier(table)))


def validate(db):
    require(len(table_names(db)) == EXPECTED_TABLE_COUNT, 'Unexpected table count')
    require(schema_digest(schema_objects(db)) == EXPECTED_SCHEMA_SHA256, 'Unknown schema')
    require(tuple(row[0] for row in db.execute('SELECT version FROM schema_migrations ORDER BY version'))
            == EXPECTED_MIGRATIONS, 'Unknown migration receipts')
    require(db.execute('PRAGMA integrity_check').fetchall() == [('ok',)], 'Database integrity failed')
    require(not db.execute('PRAGMA foreign_key_check').fetchall(), 'Foreign key validation failed')


def verify(before_path, after_path):
    with closing(connect_readonly(before_path)) as before, closing(connect_readonly(after_path)) as after:
        validate(before)
        validate(after)
        require(schema_objects(before) == schema_objects(after), 'Schema changed')
        tables = table_names(before, include_internal=True)
        require(tables == table_names(after, include_internal=True), 'Internal table set changed')
        for table in sorted(tables):
            require(table_rows(before, table) == table_rows(after, table), 'Persisted table changed')
    print('UNCHANGED_TABLES=127\nEXACT_SCHEMA_070=ok\nALL_DATA_UNCHANGED=ok\nNO_MIGRATIONS=ok')


def rollback_safe(path):
    with closing(connect_readonly(path)) as db:
        validate(db)
    print('ROLLBACK_SAFE=schema_070_latest_data_retained')


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--rollback-safe':
        try:
            rollback_safe(sys.argv[2])
        except Exception:
            print('ROLLBACK_BLOCKED=unknown_schema_or_unverifiable_state', file=sys.stderr)
            raise SystemExit(3)
    elif len(sys.argv) == 3:
        try:
            verify(*sys.argv[1:])
        except Exception:
            print('DATABASE_VERIFICATION_FAILED=changed_or_unverifiable_state', file=sys.stderr)
            raise SystemExit(2)
    else:
        raise SystemExit('Usage: verify-constructor-safety-database.py BEFORE AFTER | --rollback-safe DB')
