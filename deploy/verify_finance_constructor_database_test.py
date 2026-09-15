"""Reject data loss, unreviewed migrations and unsafe portable finance blocks."""
from contextlib import closing, redirect_stdout
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import sqlite3
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('finance_constructor_verifier', ROOT / 'deploy/verify-finance-constructor-database.py')
V = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(V)


class FinanceConstructorDatabaseChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory(prefix='tessavie-finance-constructor-db-')
        cls.baseline = Path(cls.folder.name) / 'baseline074.db'
        cls.candidate = Path(cls.folder.name) / 'candidate075.db'
        with closing(sqlite3.connect(cls.baseline)) as db:
            db.execute('CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
            for name in V.EXPECTED_BASELINE:
                db.executescript((ROOT / 'internal/app/migrations' / name).read_text(encoding='utf-8-sig'))
                db.execute('INSERT INTO schema_migrations VALUES(?,?)', (name, '2026-09-15T00:00:00Z'))
            db.execute("INSERT INTO users(id,email,username,password_hash,created_at,updated_at) VALUES(1,'fixture@example.test','fixture','synthetic','2026-09-15','2026-09-15')")
            db.execute("INSERT INTO workspaces(id,name,slug,kind,owner_id,delete_policy,created_at,updated_at) VALUES('team','Fixture team','fixture-team','team',1,'archive_only','2026-09-15','2026-09-15')")
            db.execute("INSERT INTO workspace_pages(id,workspace_id,name,created_by,created_at,updated_at) VALUES('page','team','Synthetic page',1,'2026-09-15','2026-09-15')")
            db.execute("INSERT INTO page_app_definitions VALUES('page',?,1,'2026-09-15')", (json.dumps({'version': 1, 'blocks': []}),))
            for prefix, scope_key, scope in (('personal', 'owner_id', 1), ('workspace', 'workspace_id', 'team')):
                db.execute(f"INSERT INTO {prefix}_finance_buckets(id,{scope_key},name,created_at,updated_at) VALUES('account',?,'Synthetic savings','2026-09-15','2026-09-15')", (scope,))
                db.execute(f"INSERT INTO {prefix}_finance_expenses(id,{scope_key},bucket_id,bucket_name,date,amount_minor,created_at,updated_at) VALUES('expense',?,'account','Synthetic savings','2026-09-15',12300,'2026-09-15','2026-09-15')", (scope,))
            db.commit()
            assert V.validate(db) == 74
        shutil.copyfile(cls.baseline, cls.candidate)
        with closing(sqlite3.connect(cls.candidate)) as db:
            for name, expected in V.MIGRATION_SHA256.items():
                source = (ROOT / 'internal/app/migrations' / name).read_text(encoding='utf-8-sig').replace('\r\n', '\n')
                assert hashlib.sha256(source.encode()).hexdigest() == expected, 'Reviewed migration changed'
                db.executescript(source)
                db.execute('INSERT INTO schema_migrations VALUES(?,?)', (name, '2026-09-15T01:00:00Z'))
            db.commit()
            assert V.validate(db) == 75

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=self.folder.name)
        self.addCleanup(self.temp.cleanup)
        self.before = Path(self.temp.name) / 'before.db'
        self.after = Path(self.temp.name) / 'after.db'
        shutil.copyfile(self.baseline, self.before)
        shutil.copyfile(self.candidate, self.after)

    def alter(self, sql, args=()):
        with closing(sqlite3.connect(self.after)) as db:
            db.execute(sql, args)
            db.commit()

    def check(self):
        with redirect_stdout(io.StringIO()):
            V.verify(self.before, self.after)

    def validate_after(self):
        with closing(V.old.connect_readonly(self.after)) as db:
            return V.validate(db)

    def test_exact_additive_074_to_075_starts_four_tables_empty(self):
        self.check()

    def test_missing_or_unreviewed_next_receipt_is_rejected(self):
        for sql in ("DELETE FROM schema_migrations WHERE version='074_page_media.sql'", "INSERT INTO schema_migrations VALUES('076_unknown.sql','today')"):
            with self.subTest(sql=sql):
                shutil.copyfile(self.candidate, self.after)
                self.alter(sql)
                with self.assertRaisesRegex(ValueError, 'Unknown or partial migration receipts'):
                    self.check()

    def test_baseline_and_postcheck_require_exact_versions(self):
        with redirect_stdout(io.StringIO()):
            V.validate_only(self.before, '--baseline')
            V.validate_only(self.after, '--validate-only')
            with self.assertRaisesRegex(ValueError, 'exact schema 074 baseline'):
                V.validate_only(self.after, '--baseline')
            with self.assertRaisesRegex(ValueError, 'exact schema 075'):
                V.validate_only(self.before, '--validate-only')

    def test_personal_and_team_expense_rewrites_are_rejected(self):
        for prefix in ('personal', 'workspace'):
            with self.subTest(prefix=prefix):
                shutil.copyfile(self.candidate, self.after)
                self.alter(f"UPDATE {prefix}_finance_expenses SET amount_minor=amount_minor+1")
                with self.assertRaisesRegex(ValueError, f'Persisted data changed: {prefix}_finance_expenses'):
                    self.check()

    def test_old_receipt_timestamp_rewrite_is_rejected(self):
        self.alter("UPDATE schema_migrations SET applied_at='rewritten' WHERE version='074_page_media.sql'")
        with self.assertRaisesRegex(ValueError, 'Old receipts changed'):
            self.check()

    def test_new_receipt_requires_timestamp(self):
        self.alter("UPDATE schema_migrations SET applied_at='' WHERE version='075_finance_organization.sql'")
        with self.assertRaisesRegex(ValueError, 'New receipt missing'):
            self.check()

    def test_internal_autoincrement_sequence_change_is_rejected(self):
        self.alter("UPDATE sqlite_sequence SET seq=seq+10 WHERE name='users'")
        with self.assertRaisesRegex(ValueError, 'Persisted data changed: sqlite_sequence'):
            self.check()

    def test_old_schema_and_new_scope_guards_cannot_change(self):
        for sql, error in (("CREATE INDEX accidental_index ON users(username)", 'Pre-existing 074 schema changed'), ('DROP TRIGGER personal_finance_organization_operation_insert', 'Unreviewed finance organization schema'), ('DROP TRIGGER workspace_finance_organization_operation_update', 'Unreviewed finance organization schema'), ('DROP INDEX workspace_finance_categories_name', 'Unreviewed finance organization schema')):
            with self.subTest(sql=sql):
                shutil.copyfile(self.candidate, self.after)
                self.alter(sql)
                with self.assertRaisesRegex(ValueError, error):
                    self.check()

    def add_category(self, prefix='personal', scope=None):
        key = 'owner_id' if prefix == 'personal' else 'workspace_id'
        scope = (1 if prefix == 'personal' else 'team') if scope is None else scope
        self.alter(f"INSERT INTO {prefix}_finance_categories(id,{key},name,created_at,updated_at) VALUES('category',?,'Travel','2026-09-15','2026-09-15')", (scope,))

    def add_organization(self, prefix='personal'):
        key, scope = ('owner_id', 1) if prefix == 'personal' else ('workspace_id', 'team')
        self.alter(f"INSERT INTO {prefix}_finance_organization({key},operation_kind,operation_id,links_json,updated_at) VALUES(?,'expense','expense','[]','2026-09-15')", (scope,))

    def test_all_four_additions_must_be_empty_at_migration(self):
        for prefix in ('personal', 'workspace'):
            for kind, add in (('categories', self.add_category), ('organization', self.add_organization)):
                with self.subTest(prefix=prefix, kind=kind):
                    shutil.copyfile(self.candidate, self.after)
                    add(prefix)
                    with self.assertRaisesRegex(ValueError, f'Migration populated new table: {prefix}_finance_{kind}'):
                        self.check()

    def test_category_foreign_key_corruption_is_rejected(self):
        self.add_category(scope=999)
        with self.assertRaisesRegex(ValueError, 'Foreign keys invalid'):
            self.check()

    def trash(self, kind='finance', extra=None):
        block = {'id': 'archived-block', 'kind': kind, 'title': 'Portable budget', **(extra or {})}
        details = {'title': 'Portable budget', 'blockCount': 1, 'revision': 2, 'rootBlockId': 'archived-block', 'clientRequestId': 'synthetic-request-12345', 'requestHash': 'a' * 64, 'snapshot': {'version': 1, 'rootBlockId': 'archived-block', 'blocks': [block], 'positions': [0]}}
        self.alter("INSERT INTO activity(id,actor_id,entity_type,entity_id,action,details_json,created_at,workspace_id) VALUES('trash-finance',1,'workspace_page','page','app_blocks_removed',?,'2026-09-15','team')", (json.dumps(details),))

    def test_latest_data_rollback_preserves_groups_and_links_and_finance_archives(self):
        self.add_category()
        self.add_organization()
        self.alter("UPDATE personal_finance_organization SET category_id='category',links_json=?", (json.dumps([{'kind': 'personal_plan', 'id': 'plan'}]),))
        self.trash(extra={'finance': {'showAccounts': False, 'recentLimit': 10, 'display': 'compact', 'totalLabel': 'My budget'}})
        shutil.copyfile(self.after, self.before)
        self.check()
        with redirect_stdout(io.StringIO()):
            V.validate_only(self.after, '--rollback-safe')
        self.alter("UPDATE personal_finance_organization SET links_json='[]'")
        with self.assertRaisesRegex(ValueError, 'Persisted data changed: personal_finance_organization'):
            self.check()

    def test_finance_default_and_inactive_configuration_and_media_are_accepted(self):
        for kind, extra in (('finance', {}), ('finance', {'finance': {}}), ('finance', {'finance': {'recentLimit': 0, 'display': '', 'incomeLabel': ''}}), ('text', {'finance': {'showTotal': True}}), ('media', {})):
            with self.subTest(kind=kind, extra=extra):
                shutil.copyfile(self.candidate, self.after)
                self.trash(kind, extra)
                self.assertEqual(self.validate_after(), 75)

    def test_finance_config_rejects_data_ids_sources_nulls_and_unknown_keys(self):
        for config in (None, [], {'sourceWorkspaceId': 'team'}, {'accountIds': ['account']}, {'totalMinor': 12300}, {'newFlag': True}):
            with self.subTest(config=config):
                shutil.copyfile(self.candidate, self.after)
                self.trash(extra={'finance': config})
                with self.assertRaisesRegex(ValueError, 'Unknown archived finance config'):
                    self.validate_after()
        self.assertNotIn('finance', V.old.BLOCK_KEYS)
        self.assertNotIn('finance', V.old.BLOCK_KINDS)

    def test_finance_display_flags_limits_and_labels_are_strictly_typed(self):
        for config, error in (({'showTotal': 1}, 'flag'), ({'showActions': 'false'}, 'flag'), ({'recentLimit': True}, 'recent limit'), ({'recentLimit': 11}, 'recent limit'), ({'recentLimit': -1}, 'recent limit'), ({'recentLimit': 1.5}, 'recent limit'), ({'display': 'table'}, 'display'), ({'display': None}, 'display'), ({'totalLabel': 'я' * 81}, 'label'), ({'openLabel': 5}, 'label'), ({'incomeLabel': ' label '}, 'label')):
            with self.subTest(config=config):
                shutil.copyfile(self.candidate, self.after)
                self.trash(extra={'finance': config})
                with self.assertRaisesRegex(ValueError, 'Invalid archived finance ' + error):
                    self.validate_after()

    def test_finance_exception_does_not_accept_other_block_fields_or_kinds(self):
        for kind, extra, error in (('plugin', None, 'Invalid archived block identity'), ('finance', {'amounts': [1200]}, 'Unknown archive block fields'), ('media', {'attachmentIds': ['private-file']}, 'Unknown archive block fields')):
            with self.subTest(kind=kind, extra=extra):
                shutil.copyfile(self.candidate, self.after)
                self.trash(kind, extra)
                with self.assertRaisesRegex(ValueError, error):
                    self.validate_after()

    def test_finance_archive_still_reserves_identity_and_requires_receipts(self):
        self.trash()
        self.alter("UPDATE page_app_definitions SET definition_json=? WHERE page_id='page'", (json.dumps({'version': 1, 'blocks': [{'id': 'archived-block', 'kind': 'finance'}]}),))
        with self.assertRaisesRegex(ValueError, 'Reserved archived identity reused'):
            self.validate_after()
        shutil.copyfile(self.candidate, self.after)
        self.trash()
        self.alter("UPDATE activity SET details_json=json_set(details_json,'$.requestHash','invalid')")
        with self.assertRaisesRegex(ValueError, 'Invalid trash request hash'):
            self.validate_after()


if __name__ == '__main__':
    unittest.main()
