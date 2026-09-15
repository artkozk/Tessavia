"""Read-only exact 074 -> 075 rollout and latest-data rollback verification.

Digests are pinned to reviewed repository SQL, never learned from live data.
The four organization tables start empty; all 139 old tables, receipts and
internal sequences remain unchanged. Portable finance blocks contain display
configuration only, and retain the existing strict archive identity checks.
"""
from contextlib import closing
import importlib.util
from pathlib import Path
import sys

SPEC = importlib.util.spec_from_file_location('team_finance_074_for_constructor', Path(__file__).with_name('verify-team-finance-media-database.py'))
previous = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(previous)
old = previous.old
MIGRATION = '075_finance_organization.sql'
EXPECTED_BASELINE = previous.EXPECTED_BASELINE + previous.MIGRATIONS
BASELINE_SCHEMA_SHA256 = '4e59edce63b4362cbd6fc1b7c6d41a94bfca7cf3197c03b0d454e2d6ee4ee1d3'
ADDITIONS_SCHEMA_SHA256 = '264f8da57a4363797b60b153672c379863b3d447701d09469c965876f55d0c25'
MIGRATION_SHA256 = {MIGRATION: '23996e34871bfd5e38760287a601ca0648173b470e536b44a7699695a6225dee'}
NEW_TABLES = {
    'personal_finance_categories', 'personal_finance_organization',
    'workspace_finance_categories', 'workspace_finance_organization',
}
NEW_OBJECTS = NEW_TABLES | {
    'personal_finance_categories_name', 'personal_finance_organization_category',
    'workspace_finance_categories_name', 'workspace_finance_organization_category',
    'personal_finance_organization_operation_insert', 'personal_finance_organization_operation_update',
    'workspace_finance_organization_operation_insert', 'workspace_finance_organization_operation_update',
}
FINANCE_FLAGS = {'showTotal', 'showAccounts', 'showRecent', 'showActions'}
FINANCE_LABELS = {'totalLabel', 'accountsLabel', 'recentLabel', 'openLabel', 'incomeLabel', 'expenseLabel'}
FINANCE_KEYS = FINANCE_FLAGS | FINANCE_LABELS | {'recentLimit', 'display'}


def validate_finance_config(block):
    if not isinstance(block, dict) or 'finance' not in block:
        return
    config = block['finance']
    # Changing a block type preserves its inactive, valid configuration, just
    # like sheet configuration. It must remain portable on every known kind.
    old.require(isinstance(config, dict) and set(config) <= FINANCE_KEYS, 'Unknown archived finance config')
    for key, value in config.items():
        if key in FINANCE_FLAGS:
            old.require(type(value) is bool, 'Invalid archived finance flag')
        elif key in FINANCE_LABELS:
            old.require(isinstance(value, str) and len(value) <= 80 and value == value.strip(), 'Invalid archived finance label')
        elif key == 'recentLimit':
            old.require(old.valid_int(value, 0, 10), 'Invalid archived finance recent limit')
        elif key == 'display':
            old.require(isinstance(value, str) and value in ('', 'cards', 'compact'), 'Invalid archived finance display')


def validate_finance_block_trash(db):
    # Inspect only the new configuration before widening the previous enum and
    # key set. Arbitrary keys, monetary values, IDs and source bindings cannot
    # use this exception to enter a portable archive or bypass receipt checks.
    for (raw,) in db.execute("SELECT details_json FROM activity WHERE action='app_blocks_removed'"):
        details = old.exact_json(raw)
        snapshot = details.get('snapshot') if isinstance(details, dict) else None
        blocks = snapshot.get('blocks') if isinstance(snapshot, dict) else None
        if isinstance(blocks, list):
            for block in blocks:
                validate_finance_config(block)
    kinds, keys = old.BLOCK_KINDS, old.BLOCK_KEYS
    try:
        old.BLOCK_KINDS = kinds | {'media', 'finance'}
        old.BLOCK_KEYS = keys | {'finance'}
        return old.validate_block_trash(db)
    finally:
        old.BLOCK_KINDS, old.BLOCK_KEYS = kinds, keys


def validate(db):
    versions = tuple(row[0] for row in db.execute('SELECT version FROM schema_migrations ORDER BY version'))
    if versions == EXPECTED_BASELINE:
        old.require(previous.validate(db) == 74, 'Expected exact schema 074 baseline')
        return 74
    old.require(versions == EXPECTED_BASELINE + (MIGRATION,), 'Unknown or partial migration receipts')
    objects = old.schema_objects(db)
    baseline = [obj for obj in objects if obj[1] not in NEW_OBJECTS]
    additions = [obj for obj in objects if obj[1] in NEW_OBJECTS]
    old.require(old.schema_digest(baseline) == BASELINE_SCHEMA_SHA256, 'Pre-existing 074 schema changed')
    old.require(old.schema_digest(additions) == ADDITIONS_SCHEMA_SHA256, 'Unreviewed finance organization schema')
    old.require(len(old.table_names(db)) == 143, 'Unknown table count')
    old.require(db.execute('PRAGMA integrity_check').fetchall() == [('ok',)], 'Integrity check failed')
    old.require(not db.execute('PRAGMA foreign_key_check').fetchall(), 'Foreign keys invalid')
    validate_finance_block_trash(db)
    return 75


def verify(before_path, after_path):
    with closing(old.connect_readonly(before_path)) as before, closing(old.connect_readonly(after_path)) as after:
        source, target = validate(before), validate(after)
        old.require(target == 75, 'Candidate must have exact schema 075')
        tables = old.table_names(before, include_internal=True)
        expected = tables | NEW_TABLES if source == 74 else tables
        old.require(old.table_names(after, include_internal=True) == expected, 'Unexpected table set')
        for table in sorted(tables):
            if table == 'schema_migrations' and source == 74:
                rows = after.execute('SELECT version,applied_at FROM schema_migrations WHERE version<>? ORDER BY version', (MIGRATION,)).fetchall()
                old.require(rows == before.execute('SELECT version,applied_at FROM schema_migrations ORDER BY version').fetchall(), 'Old receipts changed')
                receipt = after.execute('SELECT applied_at FROM schema_migrations WHERE version=?', (MIGRATION,)).fetchone()
                old.require(receipt and isinstance(receipt[0], str) and receipt[0], 'New receipt missing')
            else:
                old.require(old.table_rows(before, table) == old.table_rows(after, table), 'Persisted data changed: ' + table)
        if source == 74:
            for table in sorted(NEW_TABLES):
                old.require(after.execute('SELECT count(*) FROM ' + old.identifier(table)).fetchone()[0] == 0, 'Migration populated new table: ' + table)
    print('EXACT_SCHEMA_075=ok\nPREEXISTING_139_TABLES_UNCHANGED=ok\nPRIOR_MIGRATION_RECEIPTS_UNCHANGED=ok')
    print('EMPTY_ADDITIONS_075=ok' if source == 74 else 'CURRENT_143_TABLES_UNCHANGED=ok')


def validate_only(path, mode='--validate-only'):
    with closing(old.connect_readonly(path)) as db:
        version = validate(db)
        if mode == '--baseline':
            old.require(version == 74, 'Expected exact schema 074 baseline')
        elif mode == '--validate-only':
            old.require(version == 75, 'Expected exact schema 075')
    print('VALIDATED_SCHEMA=' + str(version))
    if mode == '--rollback-safe':
        print('ROLLBACK_BEHAVIOR=latest_data_retained_finance_constructor_groups_and_links_unavailable')


if __name__ == '__main__':
    try:
        if len(sys.argv) == 3 and sys.argv[1] in ('--validate-only', '--rollback-safe', '--baseline'):
            validate_only(sys.argv[2], sys.argv[1])
        elif len(sys.argv) == 3 and not sys.argv[1].startswith('--'):
            verify(*sys.argv[1:])
        else:
            raise ValueError('Usage: verify-finance-constructor-database.py BEFORE AFTER | --baseline DB | --validate-only DB | --rollback-safe DB')
    except Exception as error:
        print('FINANCE_CONSTRUCTOR_DATABASE_CHECK_FAILED=' + str(error), file=sys.stderr)
        raise SystemExit(2)
