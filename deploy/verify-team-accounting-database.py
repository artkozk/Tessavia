"""Read-only pinned 076 -> 077 migration and current-data rollback checks.

No receipt backfill is allowed. Old rows, receipts and sqlite_sequence must
match exactly, and both new tables start empty. Reviewed SQL digests are
derived from repository migrations, never adopted from a production database.
"""
from contextlib import closing
import importlib.util
from pathlib import Path
import sys

SPEC = importlib.util.spec_from_file_location('media_variants_076_for_accounting', Path(__file__).with_name('verify-media-variants-database.py'))
previous = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(previous)
old = previous.old
MIGRATION = '077_workspace_cashbook.sql'
EXPECTED_BASELINE = previous.EXPECTED_BASELINE + (previous.MIGRATION,)
BASELINE_SCHEMA_SHA256 = 'ace3dc223ecdd2ed3a42aba98ec43e219e7c452be3d4e20b1b0fb28c978d9722'
ADDITIONS_SCHEMA_SHA256 = 'a4c6a16f47935ef4a3e74555db633996e2dc4d32975a020cfd880fbe6343a78e'
MIGRATION_SHA256 = {MIGRATION: '1c28c840dadb4c47f4b9031f62aefae54a8f40153eba21582acbde57bf945c39'}
NEW_TABLES = {'workspace_finance_receipts', 'workspace_finance_cashbook_sources'}
NEW_OBJECTS = NEW_TABLES


def validate(db):
    versions = tuple(row[0] for row in db.execute('SELECT version FROM schema_migrations ORDER BY version'))
    if versions == EXPECTED_BASELINE:
        old.require(previous.validate(db) == 76, 'Expected exact schema 076 baseline')
        return 76
    old.require(versions == EXPECTED_BASELINE + (MIGRATION,), 'Unknown or partial migration receipts')
    objects = old.schema_objects(db)
    baseline = [obj for obj in objects if obj[1] not in NEW_OBJECTS]
    additions = [obj for obj in objects if obj[1] in NEW_OBJECTS]
    old.require(old.schema_digest(baseline) == BASELINE_SCHEMA_SHA256, 'Pre-existing 076 schema changed')
    old.require(old.schema_digest(additions) == ADDITIONS_SCHEMA_SHA256, 'Unreviewed workspace cashbook schema')
    old.require(len(old.table_names(db)) == 150, 'Unknown table count')
    old.require(db.execute('PRAGMA integrity_check').fetchall() == [('ok',)], 'Integrity check failed')
    old.require(not db.execute('PRAGMA foreign_key_check').fetchall(), 'Foreign keys invalid')
    # This release adds no portable data fields; keep the existing constructor
    # definition/trash validation rather than accepting arbitrary stored IDs.
    previous.previous.validate_finance_block_trash(db)
    return 77


def verify(before_path, after_path):
    with closing(old.connect_readonly(before_path)) as before, closing(old.connect_readonly(after_path)) as after:
        source, target = validate(before), validate(after)
        old.require(target == 77, 'Candidate must have exact schema 077')
        tables = old.table_names(before, include_internal=True)
        expected = tables | NEW_TABLES if source == 76 else tables
        old.require(old.table_names(after, include_internal=True) == expected, 'Unexpected table set')
        for table in sorted(tables):
            if table == 'schema_migrations' and source == 76:
                rows = after.execute('SELECT version,applied_at FROM schema_migrations WHERE version<>? ORDER BY version', (MIGRATION,)).fetchall()
                old.require(rows == before.execute('SELECT version,applied_at FROM schema_migrations ORDER BY version').fetchall(), 'Old receipts changed')
                receipt = after.execute('SELECT applied_at FROM schema_migrations WHERE version=?', (MIGRATION,)).fetchone()
                old.require(receipt and isinstance(receipt[0], str) and receipt[0], 'New receipt missing')
            else:
                old.require(old.table_rows(before, table) == old.table_rows(after, table), 'Persisted data changed: ' + table)
        if source == 76:
            for table in sorted(NEW_TABLES):
                old.require(after.execute('SELECT count(*) FROM ' + old.identifier(table)).fetchone()[0] == 0, 'Migration populated new table: ' + table)
    print('EXACT_SCHEMA_077=ok\nPREEXISTING_148_TABLES_UNCHANGED=ok\nPRIOR_MIGRATION_RECEIPTS_UNCHANGED=ok')
    print('EMPTY_ADDITIONS_077=ok' if source == 76 else 'CURRENT_150_TABLES_UNCHANGED=ok')


def validate_only(path, mode='--validate-only'):
    with closing(old.connect_readonly(path)) as db:
        version = validate(db)
        if mode == '--baseline':
            old.require(version == 76, 'Expected exact schema 076 baseline')
        elif mode == '--validate-only':
            old.require(version == 77, 'Expected exact schema 077')
        elif mode == '--rollback-safe' and version == 77:
            # 712e53c understands media archive privacy but not the protected
            # direct-receipt sources introduced here. Keep the current runtime
            # once either new semantic table contains data, even voided rows.
            for table in sorted(NEW_TABLES):
                old.require(not db.execute('SELECT 1 FROM ' + old.identifier(table) + ' LIMIT 1').fetchone(),
                            'Rollback blocked: previous binary cannot preserve simple receipt semantics; current binary and data must be retained')
        elif mode not in ('--baseline', '--validate-only', '--rollback-safe'):
            raise ValueError('Unknown validation mode')
    print('VALIDATED_SCHEMA=' + str(version))
    if mode == '--rollback-safe':
        print('ROLLBACK_BEHAVIOR=latest_data_retained_simple_receipts_unavailable')


if __name__ == '__main__':
    try:
        if len(sys.argv) == 3 and sys.argv[1] in ('--validate-only', '--rollback-safe', '--baseline'):
            validate_only(sys.argv[2], sys.argv[1])
        elif len(sys.argv) == 3 and not sys.argv[1].startswith('--'):
            verify(*sys.argv[1:])
        else:
            raise ValueError('Usage: verify-team-accounting-database.py BEFORE AFTER | --baseline DB | --validate-only DB | --rollback-safe DB')
    except Exception as error:
        print('TEAM_ACCOUNTING_DATABASE_CHECK_FAILED=' + str(error), file=sys.stderr)
        raise SystemExit(2)
