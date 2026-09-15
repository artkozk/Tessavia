"""Read-only pinned 075 -> 076 migration and current-data rollback checks.

No attachment backfill is allowed. Old rows, receipts and sqlite_sequence must
match exactly, and all five new tables start empty. Reviewed SQL digests are
derived from repository migrations, never adopted from a production database.
"""
from contextlib import closing
import importlib.util
from pathlib import Path
import sys

SPEC = importlib.util.spec_from_file_location('finance_constructor_075_for_media', Path(__file__).with_name('verify-finance-constructor-database.py'))
previous = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(previous)
old = previous.old
MIGRATION = '076_media_variants.sql'
EXPECTED_BASELINE = previous.EXPECTED_BASELINE + (previous.MIGRATION,)
BASELINE_SCHEMA_SHA256 = 'a699cfd67dc3cf1dc79025cd5fe35b69d7d6acb1ff9994e30702c0f1df590b65'
ADDITIONS_SCHEMA_SHA256 = '7a2bf96ac12f71ad3355ac056b199755bf4ee534456c093824c896d99e44e054'
MIGRATION_SHA256 = {MIGRATION: '577efac5cbd49c40414d16dc4eb0a7908c22cea90109b2d4bb3ef6b6ed4f278a'}
NEW_TABLES = {'media_variants', 'media_versions', 'media_variant_events', 'media_variant_requests', 'record_attachment_requests'}
NEW_OBJECTS = NEW_TABLES | {
    'media_variants_scope', 'media_variant_events_history',
    'media_versions_scope_insert', 'media_versions_immutable_update', 'media_versions_immutable_delete',
    'media_variant_events_immutable_update', 'media_variant_events_immutable_delete',
    'media_variants_scope_immutable', 'media_variants_selected_scope',
    'media_variant_requests_scope', 'record_attachment_requests_scope',
    'media_variants_parent_scope', 'media_variants_initial_selection',
    'media_variant_requests_immutable_update', 'media_variant_requests_immutable_delete',
    'record_attachment_requests_immutable_update', 'record_attachment_requests_immutable_delete',
}


def validate(db):
    versions = tuple(row[0] for row in db.execute('SELECT version FROM schema_migrations ORDER BY version'))
    if versions == EXPECTED_BASELINE:
        old.require(previous.validate(db) == 75, 'Expected exact schema 075 baseline')
        return 75
    old.require(versions == EXPECTED_BASELINE + (MIGRATION,), 'Unknown or partial migration receipts')
    objects = old.schema_objects(db)
    baseline = [obj for obj in objects if obj[1] not in NEW_OBJECTS]
    additions = [obj for obj in objects if obj[1] in NEW_OBJECTS]
    old.require(old.schema_digest(baseline) == BASELINE_SCHEMA_SHA256, 'Pre-existing 075 schema changed')
    old.require(old.schema_digest(additions) == ADDITIONS_SCHEMA_SHA256, 'Unreviewed media variants schema')
    old.require(len(old.table_names(db)) == 148, 'Unknown table count')
    old.require(db.execute('PRAGMA integrity_check').fetchall() == [('ok',)], 'Integrity check failed')
    old.require(not db.execute('PRAGMA foreign_key_check').fetchall(), 'Foreign keys invalid')
    # This feature adds no portable block fields or kinds. In particular, media
    # variant IDs must not leak into reusable sets or archived page definitions.
    previous.validate_finance_block_trash(db)
    return 76


def verify(before_path, after_path):
    with closing(old.connect_readonly(before_path)) as before, closing(old.connect_readonly(after_path)) as after:
        source, target = validate(before), validate(after)
        old.require(target == 76, 'Candidate must have exact schema 076')
        tables = old.table_names(before, include_internal=True)
        expected = tables | NEW_TABLES if source == 75 else tables
        old.require(old.table_names(after, include_internal=True) == expected, 'Unexpected table set')
        for table in sorted(tables):
            if table == 'schema_migrations' and source == 75:
                rows = after.execute('SELECT version,applied_at FROM schema_migrations WHERE version<>? ORDER BY version', (MIGRATION,)).fetchall()
                old.require(rows == before.execute('SELECT version,applied_at FROM schema_migrations ORDER BY version').fetchall(), 'Old receipts changed')
                receipt = after.execute('SELECT applied_at FROM schema_migrations WHERE version=?', (MIGRATION,)).fetchone()
                old.require(receipt and isinstance(receipt[0], str) and receipt[0], 'New receipt missing')
            else:
                old.require(old.table_rows(before, table) == old.table_rows(after, table), 'Persisted data changed: ' + table)
        if source == 75:
            for table in sorted(NEW_TABLES):
                old.require(after.execute('SELECT count(*) FROM ' + old.identifier(table)).fetchone()[0] == 0, 'Migration populated new table: ' + table)
    print('EXACT_SCHEMA_076=ok\nPREEXISTING_143_TABLES_UNCHANGED=ok\nPRIOR_MIGRATION_RECEIPTS_UNCHANGED=ok')
    print('EMPTY_ADDITIONS_076=ok' if source == 75 else 'CURRENT_148_TABLES_UNCHANGED=ok')


def validate_only(path, mode='--validate-only'):
    with closing(old.connect_readonly(path)) as db:
        version = validate(db)
        if mode == '--baseline':
            old.require(version == 75, 'Expected exact schema 075 baseline')
        elif mode == '--validate-only':
            old.require(version == 76, 'Expected exact schema 076')
        elif mode == '--rollback-safe' and version == 76:
            # e5ecd4b can read the old page attachment table but does not know
            # the archive visibility rule introduced for media variants. Data
            # retention alone is insufficient if rollback would expose files.
            old.require(not db.execute("SELECT 1 FROM media_variants WHERE context_kind='page' AND archived=1 LIMIT 1").fetchone(),
                        'Rollback blocked: previous binary cannot protect archived page media variants; current binary and data must be retained')
    print('VALIDATED_SCHEMA=' + str(version))
    if mode == '--rollback-safe':
        print('ROLLBACK_BEHAVIOR=latest_data_retained_media_version_history_and_selection_unavailable')


if __name__ == '__main__':
    try:
        if len(sys.argv) == 3 and sys.argv[1] in ('--validate-only', '--rollback-safe', '--baseline'):
            validate_only(sys.argv[2], sys.argv[1])
        elif len(sys.argv) == 3 and not sys.argv[1].startswith('--'):
            verify(*sys.argv[1:])
        else:
            raise ValueError('Usage: verify-media-variants-database.py BEFORE AFTER | --baseline DB | --validate-only DB | --rollback-safe DB')
    except Exception as error:
        print('MEDIA_VARIANTS_DATABASE_CHECK_FAILED=' + str(error), file=sys.stderr)
        raise SystemExit(2)
