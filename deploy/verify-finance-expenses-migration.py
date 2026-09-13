"""Read-only migration 069/070 validation and fail-closed rollback guard.

Only aggregate verification results leave the production host. The baseline
schema digest is independently matched against a synthetic 068 database and a
replay of migrations 001..068; it includes no row values or private data.
"""
from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
import sys


BASELINE_SCHEMA_SHA256 = '3cf90fb131ef5a6a3bf22aa69705bd0c58b17e089fa4082081f6422154a0a971'
BASELINE_MIGRATIONS = ('001_init.sql', '002_question_workflow.sql', '003_traceable_outputs_and_meetings.sql', '004_record_priority.sql', '005_collaboration_hierarchy_activity.sql', '006_research_comparison.sql', '007_workflow_comfort.sql', '008_decision_and_research_semantics.sql', '009_team_chat.sql', '010_chat_message_history.sql', '011_chat_message_idempotency.sql', '012_business_memory_and_safe_undo.sql', '013_blockers_and_knowledge_provenance.sql', '014_productivity_and_quality.sql', '015_planning_cycles.sql', '016_personal_workspace_foundation.sql', '017_profile_avatars.sql', '018_workspace_crm_constructor.sql', '019_team_projects_invites_preferences.sql', '020_interface_layout.sql', '021_project_composer.sql', '022_device_interface_preferences.sql', '023_interface_presets.sql', '024_personal_calendar.sql', '025_page_record_types.sql', '026_personal_note_schedule.sql', '027_team_lifecycle.sql', '028_team_activity.sql', '029_tessavie_brand.sql', '030_personal_inbox.sql', '031_notebook_title_origin.sql', '032_personal_criterion_scores.sql', '033_graph_layouts.sql', '034_offline_create_receipts.sql', '035_personal_planning.sql', '036_one_team_per_workspace.sql', '037_habit_tracker.sql', '038_record_batches.sql', '039_note_organization.sql', '040_note_media_history.sql', '041_personal_publications.sql', '042_journey_preferences.sql', '043_personal_day.sql', '044_personal_page_scope.sql', '045_deadline_delivery_sources.sql', '046_homegroup_reading.sql', '047_reminder_preferences.sql', '048_personal_plan_reminders.sql', '049_habit_reminder_delivery.sql', '050_habit_snooze_metadata.sql', '051_personal_waiting.sql', '052_personal_weekly_review.sql', '053_personal_waiting_pings.sql', '054_reminder_digests.sql', '055_reading_reflections.sql', '056_chat_conversations.sql', '057_personal_calendar_work.sql', '058_chat_group_lifecycle.sql', '059_personal_recurrence_templates.sql', '060_collection_field_defaults.sql', '061_chat_personal_pins.sql', '062_chat_personal_archives.sql', '063_task_completion_review.sql', '064_page_app_composition.sql', '065_record_create_requests.sql', '066_personal_finance.sql', '067_personal_finance_counterparties.sql', '068_page_app_sheet_values.sql')
MIGRATIONS = ('069_personal_finance_expenses.sql', '070_page_app_components.sql')
NEW_TABLES = {
    'personal_finance_expenses', 'personal_finance_expense_requests',
    'page_app_components', 'page_app_component_insertions',
}
MIGRATION_SQL = ("-- Spending is distinct from allocation/transfer annotations. Never infer old\n-- expenses from paidMinor: a transfer between one's own accounts is not spending.\nCREATE TABLE personal_finance_expenses (\n id TEXT PRIMARY KEY,\n owner_id INTEGER NOT NULL REFERENCES users(id),\n bucket_id TEXT NOT NULL,\n bucket_name TEXT NOT NULL,\n date TEXT NOT NULL,\n amount_minor INTEGER NOT NULL CHECK(amount_minor > 0 AND amount_minor <= 1000000000000),\n payee TEXT NOT NULL DEFAULT '',\n note TEXT NOT NULL DEFAULT '',\n revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),\n voided INTEGER NOT NULL DEFAULT 0 CHECK(voided IN (0,1)),\n created_at TEXT NOT NULL,\n updated_at TEXT NOT NULL,\n FOREIGN KEY(owner_id,bucket_id) REFERENCES personal_finance_buckets(owner_id,id),\n UNIQUE(owner_id,id)\n);\nCREATE INDEX personal_finance_expenses_owner_date ON personal_finance_expenses(owner_id,date,id);\nCREATE TABLE personal_finance_expense_requests (\n owner_id INTEGER NOT NULL REFERENCES users(id),\n request_id TEXT NOT NULL,\n payload_hash TEXT NOT NULL,\n expense_id TEXT NOT NULL,\n created_at TEXT NOT NULL,\n PRIMARY KEY(owner_id,request_id),\n FOREIGN KEY(owner_id,expense_id) REFERENCES personal_finance_expenses(owner_id,id)\n);\n", "CREATE TABLE page_app_components (\n id TEXT PRIMARY KEY,\n owner_id INTEGER NOT NULL REFERENCES users(id),\n name TEXT NOT NULL,\n description TEXT NOT NULL DEFAULT '',\n definition_json TEXT NOT NULL,\n request_id TEXT NOT NULL,\n request_hash TEXT NOT NULL,\n created_at TEXT NOT NULL,\n UNIQUE(owner_id, request_id)\n);\nCREATE INDEX page_app_components_owner ON page_app_components(owner_id, created_at);\n\nCREATE TABLE page_app_component_insertions (\n owner_id INTEGER NOT NULL REFERENCES users(id),\n request_id TEXT NOT NULL,\n request_hash TEXT NOT NULL,\n page_id TEXT NOT NULL REFERENCES workspace_pages(id) ON DELETE CASCADE,\n component_id TEXT NOT NULL REFERENCES page_app_components(id),\n root_block_id TEXT NOT NULL,\n created_at TEXT NOT NULL,\n PRIMARY KEY(owner_id, request_id)\n);\n")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def connect_readonly(path):
    return sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True, timeout=20)


def identifier(name):
    return '"' + name.replace('"', '""') + '"'


def table_names(db):
    return {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}


def schema_objects(db):
    return {tuple(row) for row in db.execute("SELECT type,name,tbl_name,COALESCE(sql,'') FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")}


def schema_digest(objects):
    # CRLF versus LF is not a schema difference. Other SQL, including constraints
    # and trigger bodies, remains exact; no loose whitespace/token rewriting.
    normalized = sorted((kind, name, table, sql.replace('\r\n', '\n')) for kind, name, table, sql in objects)
    return hashlib.sha256(json.dumps(normalized, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def migration_versions(db):
    return tuple(row[0] for row in db.execute('SELECT version FROM schema_migrations ORDER BY version'))


def table_rows(db, table, exclude_new_migrations=False):
    query = 'SELECT * FROM ' + identifier(table)
    parameters = ()
    if exclude_new_migrations:
        query += ' WHERE version NOT IN (?,?)'
        parameters = MIGRATIONS
    # Preserve SQLite value types, blobs, NULLs and duplicate rows exactly.
    def encode(row):
        return json.dumps([(type(value).__name__, value.hex() if isinstance(value, bytes) else value) for value in row], ensure_ascii=False, separators=(',', ':'))
    return sorted(encode(row) for row in db.execute(query, parameters))


def check_health(db):
    require(db.execute('PRAGMA integrity_check').fetchall() == [('ok',)], 'Database integrity failed')
    require(not db.execute('PRAGMA foreign_key_check').fetchall(), 'Foreign key validation failed')


def validate_baseline(db):
    require(len(table_names(db)) == 123, 'Unexpected baseline table count')
    require(not table_names(db) & NEW_TABLES, 'New tables already in baseline')
    require(migration_versions(db) == BASELINE_MIGRATIONS, 'Unknown baseline migration set')
    require(schema_digest(schema_objects(db)) == BASELINE_SCHEMA_SHA256, 'Unknown baseline schema')
    check_health(db)


def expected_new_objects():
    with closing(sqlite3.connect(':memory:')) as db:
        # Referenced baseline tables are deliberately absent; SQLite accepts the
        # definitions while storing the exact foreign-key/constraint SQL.
        for sql in MIGRATION_SQL:
            db.executescript(sql)
        return schema_objects(db)


def validate_migrated(db):
    require(len(table_names(db)) == 127, 'Unexpected migrated table count')
    require(NEW_TABLES <= table_names(db), 'Partial migration schema')
    require(migration_versions(db) == BASELINE_MIGRATIONS + MIGRATIONS, 'Unknown migrated version set')
    objects = schema_objects(db)
    new = {obj for obj in objects if obj[2] in NEW_TABLES}
    require(new == expected_new_objects(), 'Changed new schema or constraints')
    require(schema_digest(objects - new) == BASELINE_SCHEMA_SHA256, 'Changed baseline schema')
    check_health(db)


def verify(before_path, after_path):
    with closing(connect_readonly(before_path)) as before, closing(connect_readonly(after_path)) as after, closing(sqlite3.connect(':memory:')) as expected:
        validate_baseline(before)
        validate_migrated(after)
        before.backup(expected)
        expected.execute('PRAGMA foreign_keys=ON')
        for sql in MIGRATION_SQL:
            expected.executescript(sql)
        require(schema_objects(after) == schema_objects(expected), 'Unexpected exact schema change')
        require(table_names(after) == table_names(before) | NEW_TABLES, 'Unexpected table set')
        for table in sorted(table_names(before)):
            require(table_rows(before, table) == table_rows(after, table, table == 'schema_migrations'), 'Existing data changed: ' + table)
        for table in NEW_TABLES:
            require(after.execute('SELECT COUNT(*) FROM ' + identifier(table)).fetchone()[0] == 0, 'New feature data unexpectedly seeded')
    print('VERIFIED_OLD_TABLES=123\nTOTAL_TABLES=127\nOLD_DATA_UNCHANGED=ok\nEXACT_SCHEMA_069_070=ok\nMIGRATIONS_069_070=ok\nNEW_TABLES_EMPTY=ok')


def rollback_safe(path):
    with closing(connect_readonly(path)) as db:
        tables = table_names(db)
        if not tables & NEW_TABLES:
            validate_baseline(db)
        else:
            validate_migrated(db)
            for table in NEW_TABLES:
                require(db.execute('SELECT COUNT(*) FROM ' + identifier(table)).fetchone()[0] == 0, 'New feature data exists')
    print('ROLLBACK_SAFE=no_new_expense_or_component_usage')


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--rollback-safe':
        try:
            rollback_safe(sys.argv[2])
        except Exception:
            print('ROLLBACK_BLOCKED=new_feature_usage_or_unverifiable_state', file=sys.stderr)
            raise SystemExit(3)
    elif len(sys.argv) == 3:
        try:
            verify(*sys.argv[1:])
        except Exception:
            print('MIGRATION_VERIFICATION_FAILED=changed_or_unverifiable_state', file=sys.stderr)
            raise SystemExit(2)
    else:
        raise SystemExit('Usage: verify-finance-expenses-migration.py BEFORE AFTER | --rollback-safe DB')
