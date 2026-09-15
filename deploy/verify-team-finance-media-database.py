"""Read-only, pinned 072 -> 074 additive rollout and current-data rollback checks.

Hashes are computed from reviewed repository migrations, never learned from a
production database. Existing 130 tables, internal sequences and old migration
receipts must be byte/value-equivalent; the nine added tables start empty.
"""
from contextlib import closing
import importlib.util
from pathlib import Path
import sys

SPEC = importlib.util.spec_from_file_location('widgets_072_for_finance', Path(__file__).with_name('verify-android-widget-database.py'))
widgets = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(widgets)
old = widgets.old
MIGRATIONS = ('073_workspace_finance.sql', '074_page_media.sql')
EXPECTED_BASELINE = old.EXPECTED_MIGRATIONS + (widgets.MIGRATION,)
BASELINE_SCHEMA_SHA256 = 'fbdc81f86c4e522948d987b3ddade06a704c79db544d61ee5795da3a74250740'
ADDITIONS_SCHEMA_SHA256 = 'e11023fa949836c2ba84e87691e467d3316ff3b75b17f968b1980483ee3d8729'
# UTF-8, LF-normalized SQL inputs. The generator verifies these exact inputs.
MIGRATION_SHA256 = {
    '073_workspace_finance.sql': 'db0a7b07b1495f1a9c549b7f3ac4823115f12f3543ff401d56f81196a61f05d7',
    '074_page_media.sql': '65ac61f01f4674b30b468c1bdfd646bc68713b502c02511d15aec21410aa947b',
}
NEW_TABLES = {
    'workspace_finance_buckets', 'workspace_finance_sources', 'workspace_finance_entries',
    'workspace_finance_requests', 'workspace_finance_counterparties', 'workspace_finance_expenses',
    'workspace_finance_expense_requests', 'workspace_finance_settings', 'page_media_attachments',
}
NEW_OBJECTS = NEW_TABLES | {
    'workspace_finance_payer_owner_update', 'workspace_finance_payer_owner_insert',
    'workspace_finance_expenses_owner_date', 'workspace_finance_counterparties_owner_name',
    'workspace_finance_entries_owner_date', 'page_media_block_idx',
}


def validate_media_block_trash(db):
    # The reviewed media block adds only one enum value, no attachment IDs or
    # fields to portable block definitions. Retain every previous strict JSON,
    # identity, hierarchy, receipt, undo-link and reserved-ID check.
    kinds = old.BLOCK_KINDS
    try:
        old.BLOCK_KINDS = kinds | {'media'}
        return old.validate_block_trash(db)
    finally:
        old.BLOCK_KINDS = kinds


def validate(db):
    versions = tuple(row[0] for row in db.execute('SELECT version FROM schema_migrations ORDER BY version'))
    if versions == EXPECTED_BASELINE:
        old.require(widgets.validate(db) == 72, 'Expected exact schema 072 baseline')
        return 72
    old.require(versions == EXPECTED_BASELINE + MIGRATIONS, 'Unknown or partial migration receipts')
    objects = old.schema_objects(db)
    baseline = [obj for obj in objects if obj[1] not in NEW_OBJECTS]
    additions = [obj for obj in objects if obj[1] in NEW_OBJECTS]
    old.require(old.schema_digest(baseline) == BASELINE_SCHEMA_SHA256, 'Pre-existing 072 schema changed')
    old.require(old.schema_digest(additions) == ADDITIONS_SCHEMA_SHA256, 'Unreviewed finance/media schema')
    old.require(len(old.table_names(db)) == 139, 'Unknown table count')
    old.require(db.execute('PRAGMA integrity_check').fetchall() == [('ok',)], 'Integrity check failed')
    old.require(not db.execute('PRAGMA foreign_key_check').fetchall(), 'Foreign keys invalid')
    validate_media_block_trash(db)
    return 74


def verify(before_path, after_path):
    with closing(old.connect_readonly(before_path)) as before, closing(old.connect_readonly(after_path)) as after:
        source, target = validate(before), validate(after)
        old.require(target == 74, 'Candidate must have exact schema 074')
        tables = old.table_names(before, include_internal=True)
        expected = tables | NEW_TABLES if source == 72 else tables
        old.require(old.table_names(after, include_internal=True) == expected, 'Unexpected table set')
        for table in sorted(tables):
            if table == 'schema_migrations' and source == 72:
                rows = after.execute('SELECT version,applied_at FROM schema_migrations WHERE version NOT IN (?,?) ORDER BY version', MIGRATIONS).fetchall()
                old.require(rows == before.execute('SELECT version,applied_at FROM schema_migrations ORDER BY version').fetchall(), 'Old receipts changed')
                receipts = after.execute('SELECT version,applied_at FROM schema_migrations WHERE version IN (?,?) ORDER BY version', MIGRATIONS).fetchall()
                old.require(tuple(row[0] for row in receipts) == MIGRATIONS and all(isinstance(row[1], str) and row[1] for row in receipts), 'New receipt missing')
            else:
                old.require(old.table_rows(before, table) == old.table_rows(after, table), 'Persisted data changed: ' + table)
        if source == 72:
            for table in sorted(NEW_TABLES):
                old.require(after.execute('SELECT count(*) FROM ' + old.identifier(table)).fetchone()[0] == 0, 'Migration populated new table: ' + table)
    print('EXACT_SCHEMA_074=ok\nPREEXISTING_130_TABLES_UNCHANGED=ok\nPRIOR_MIGRATION_RECEIPTS_UNCHANGED=ok')
    print('EMPTY_ADDITIONS_073_074=ok' if source == 72 else 'CURRENT_139_TABLES_UNCHANGED=ok')


def validate_only(path, mode='--validate-only'):
    with closing(old.connect_readonly(path)) as db:
        version = validate(db)
        if mode == '--baseline':
            old.require(version == 72, 'Expected exact schema 072 baseline')
        elif mode == '--validate-only':
            old.require(version == 74, 'Expected exact schema 074')
    print('VALIDATED_SCHEMA=' + str(version))
    if mode == '--rollback-safe':
        print('ROLLBACK_BEHAVIOR=latest_data_retained_team_finance_and_page_media_unavailable')


if __name__ == '__main__':
    try:
        if len(sys.argv) == 3 and sys.argv[1] in ('--validate-only', '--rollback-safe', '--baseline'):
            validate_only(sys.argv[2], sys.argv[1])
        elif len(sys.argv) == 3 and not sys.argv[1].startswith('--'):
            verify(*sys.argv[1:])
        else:
            raise ValueError('Usage: verify-team-finance-media-database.py BEFORE AFTER | --baseline DB | --validate-only DB | --rollback-safe DB')
    except Exception as error:
        print('TEAM_FINANCE_MEDIA_DATABASE_CHECK_FAILED=' + str(error), file=sys.stderr)
        raise SystemExit(2)
