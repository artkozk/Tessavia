"""Read-only verification of the additive 071 -> 072 widget migration.

The pinned 071 validator remains unchanged. All pre-existing schema objects,
rows and migration receipts must survive. Rollback retains current 072 data.
"""
from contextlib import closing
import importlib.util
from pathlib import Path
import sqlite3
import sys


BASE = Path(__file__).with_name('verify-mobile-gestures-today-database.py')
spec = importlib.util.spec_from_file_location('exact_071', BASE)
old = importlib.util.module_from_spec(spec)
spec.loader.exec_module(old)
MIGRATION = '072_widget_devices.sql'
NEW_OBJECTS = {'widget_devices', 'widget_devices_owner_idx', 'widget_devices_password_changed'}
# Filled from the reviewed migration by the release generator; not learned from production.
WIDGET_SCHEMA_SHA256 = '3080cdebfada23e058ec6d3edcc7defbcabf73c16c7bf7bfdcbc31c04105dcee'


def validate(db):
    versions = tuple(row[0] for row in db.execute('SELECT version FROM schema_migrations ORDER BY version'))
    if versions == old.EXPECTED_MIGRATIONS:
        old.validate(db)
        return 71
    old.require(versions == old.EXPECTED_MIGRATIONS + (MIGRATION,), 'Unknown migration receipts')
    objects = old.schema_objects(db)
    baseline = [obj for obj in objects if obj[1] not in NEW_OBJECTS]
    additions = [obj for obj in objects if obj[1] in NEW_OBJECTS]
    old.require(old.schema_digest(baseline) == old.EXPECTED_SCHEMA_SHA256, 'Pre-existing schema changed')
    old.require(old.schema_digest(additions) == WIDGET_SCHEMA_SHA256, 'Unreviewed widget schema')
    old.require(len(old.table_names(db)) == 130, 'Unknown tables')
    old.require(db.execute('PRAGMA integrity_check').fetchall() == [('ok',)], 'Integrity check failed')
    old.require(not db.execute('PRAGMA foreign_key_check').fetchall(), 'Foreign keys invalid')
    old.validate_block_trash(db)
    return 72


def verify(before_path, after_path):
    with closing(old.connect_readonly(before_path)) as before, closing(old.connect_readonly(after_path)) as after:
        source, target = validate(before), validate(after)
        old.require(target == 72, 'Candidate migration missing')
        tables = old.table_names(before, include_internal=True)
        old.require(old.table_names(after, include_internal=True) == tables | {'widget_devices'}, 'Unexpected table set')
        for table in sorted(tables):
            if table == 'schema_migrations' and source == 71:
                rows = after.execute('SELECT version,applied_at FROM schema_migrations WHERE version<>? ORDER BY version', (MIGRATION,)).fetchall()
                old.require(rows == before.execute('SELECT version,applied_at FROM schema_migrations ORDER BY version').fetchall(), 'Old receipts changed')
                added = after.execute('SELECT applied_at FROM schema_migrations WHERE version=?', (MIGRATION,)).fetchone()
                old.require(added and isinstance(added[0], str) and bool(added[0]), 'New receipt missing')
            else:
                old.require(old.table_rows(before, table) == old.table_rows(after, table), 'Persisted data changed: ' + table)
        if source == 71:
            old.require(after.execute('SELECT count(*) FROM widget_devices').fetchone()[0] == 0, 'Migration created a device')
    print('EXACT_SCHEMA_072=ok\nPREEXISTING_DATA_UNCHANGED=ok\nWIDGET_MIGRATION_ONLY=ok')


def validate_only(path, baseline=False):
    with closing(old.connect_readonly(path)) as db:
        version = validate(db)
        if baseline:
            old.require(version == 71, 'Expected rollout baseline 071')
    print('VALIDATED_SCHEMA=' + str(version))


if __name__ == '__main__':
    try:
        if len(sys.argv) == 3 and sys.argv[1] in ('--validate-only', '--rollback-safe', '--baseline'):
            validate_only(sys.argv[2], baseline=sys.argv[1] == '--baseline')
        elif len(sys.argv) == 3 and not sys.argv[1].startswith('--'):
            verify(*sys.argv[1:])
        else:
            raise ValueError('Usage: verify-android-widget-database.py BEFORE AFTER | --baseline DB | --validate-only DB | --rollback-safe DB')
    except Exception as error:
        print('WIDGET_DATABASE_CHECK_FAILED=' + str(error), file=sys.stderr)
        raise SystemExit(2)
