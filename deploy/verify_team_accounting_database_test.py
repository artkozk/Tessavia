"""Synthetic tests for exact 076->077 data preservation and safe rollback."""
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
SPEC = importlib.util.spec_from_file_location('accounting_verifier', ROOT / 'deploy/verify-team-accounting-database.py')
V = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(V)


class TeamAccountingDatabaseChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory(prefix='tessavie-cashbook-verifier-')
        cls.baseline = Path(cls.folder.name) / 'baseline076.db'
        cls.candidate = Path(cls.folder.name) / 'candidate077.db'
        with closing(sqlite3.connect(cls.baseline)) as db:
            db.execute('CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
            for name in V.EXPECTED_BASELINE:
                db.executescript((ROOT / 'internal/app/migrations' / name).read_text(encoding='utf-8-sig'))
                db.execute('INSERT INTO schema_migrations VALUES(?,?)', (name, '2026-09-15T00:00:00Z'))
            db.execute("INSERT INTO users(id,email,username,password_hash,created_at,updated_at) VALUES(1,'synthetic@example.test','synthetic','synthetic','2026-09-15','2026-09-15')")
            db.execute("INSERT INTO workspaces(id,name,slug,kind,owner_id,delete_policy,created_at,updated_at) VALUES('team','Synthetic team','synthetic-team','team',1,'archive_only','2026-09-15','2026-09-15')")
            for prefix, key, owner in (('personal', 'owner_id', 1), ('workspace', 'workspace_id', 'team')):
                db.execute(f"INSERT INTO {prefix}_finance_buckets(id,{key},name,created_at,updated_at) VALUES('account',?,'Old account','2026-09-15','2026-09-15')", (owner,))
                db.execute(f"INSERT INTO {prefix}_finance_sources(id,{key},name,deduct_workers,allocations_json,created_at,updated_at) VALUES('source',?,'Old source',0,'[]','2026-09-15','2026-09-15')", (owner,))
                db.execute(f"INSERT INTO {prefix}_finance_entries(id,{key},source_id,source_name,deduct_workers,date,gross_minor,worker_minor,base_minor,allocations_json,created_at,updated_at) VALUES('entry',?,'source','Old source',0,'2026-09-15',12300,0,12300,'[]','2026-09-15','2026-09-15')", (owner,))
                db.execute(f"INSERT INTO {prefix}_finance_expenses(id,{key},bucket_id,bucket_name,date,amount_minor,created_at,updated_at) VALUES('expense',?,'account','Old account','2026-09-15',2300,'2026-09-15','2026-09-15')", (owner,))
                db.execute(f"INSERT INTO {prefix}_finance_requests({key},request_id,payload_hash,entry_id,created_at) VALUES(?,'old-request','old-hash','entry','2026-09-15')", (owner,))
            db.execute("INSERT INTO workspace_pages(id,workspace_id,name,created_by,created_at,updated_at) VALUES('page','team','Old media page',1,'2026-09-15','2026-09-15')")
            db.execute("INSERT INTO page_app_definitions VALUES('page',?,1,'2026-09-15')", (json.dumps({'version': 1, 'blocks': []}),))
            db.execute("INSERT INTO media_variants(id,context_kind,target_id,block_id,name,created_by,created_at,updated_at,revision,archived) VALUES('archive','page','page','media','Existing private archive',1,'2026-09-15','2026-09-15',1,1)")
            db.commit()
            assert V.validate(db) == 76
        shutil.copyfile(cls.baseline, cls.candidate)
        with closing(sqlite3.connect(cls.candidate)) as db:
            body = (ROOT / 'internal/app/migrations' / V.MIGRATION).read_text(encoding='utf-8-sig').replace('\r\n', '\n')
            assert hashlib.sha256(body.encode()).hexdigest() == V.MIGRATION_SHA256[V.MIGRATION]
            db.executescript(body)
            db.execute('INSERT INTO schema_migrations VALUES(?,?)', (V.MIGRATION, '2026-09-15T01:00:00Z'))
            db.commit()
            assert V.validate(db) == 77

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

    def receipt(self):
        self.alter("INSERT INTO workspace_finance_receipts VALUES('team','entry','contribution')")

    def source(self):
        self.alter("INSERT INTO workspace_finance_cashbook_sources VALUES('team','source','contribution','account')")

    def test_additive_migration_preserves_all148_old_tables_and_starts_two_empty(self):
        self.check()
        with closing(sqlite3.connect(self.before)) as db:
            self.assertEqual(len(V.old.table_names(db)), 148)
        with closing(sqlite3.connect(self.after)) as db:
            self.assertEqual(len(V.old.table_names(db)), 150)

    def test_missing_future_and_partial_receipts_rejected(self):
        for sql in ("DELETE FROM schema_migrations WHERE version='076_media_variants.sql'", "INSERT INTO schema_migrations VALUES('078_unknown.sql','now')"):
            with self.subTest(sql=sql):
                shutil.copyfile(self.candidate, self.after)
                self.alter(sql)
                with self.assertRaisesRegex(ValueError, 'Unknown or partial migration receipts'):
                    self.check()

    def test_exact_modes_and_unknown_mode_rejected(self):
        with redirect_stdout(io.StringIO()):
            V.validate_only(self.before, '--baseline')
            V.validate_only(self.after, '--validate-only')
            for path, mode in ((self.before, '--validate-only'), (self.after, '--baseline'), (self.after, '--typo')):
                with self.assertRaises(ValueError):
                    V.validate_only(path, mode)

    def test_personal_and_team_amounts_rules_and_idempotency_receipts_unchanged(self):
        for prefix in ('personal', 'workspace'):
            for table, change in (('finance_entries', 'gross_minor=12301,base_minor=12301'), ('finance_expenses', 'amount_minor=1'), ('finance_sources', "allocations_json='[{}]'"), ('finance_requests', "payload_hash='changed'")):
                with self.subTest(table=prefix + '_' + table):
                    shutil.copyfile(self.candidate, self.after)
                    self.alter(f'UPDATE {prefix}_{table} SET {change}')
                    with self.assertRaisesRegex(ValueError, 'Persisted data changed: ' + prefix + '_' + table):
                        self.check()

    def test_existing_media_archive_cannot_be_changed_by_migration(self):
        self.alter("UPDATE media_variants SET archived=0")
        with self.assertRaisesRegex(ValueError, 'Persisted data changed: media_variants'):
            self.check()

    def test_prior_migration_timestamps_and_internal_sequence_preserved(self):
        for sql, error in (("UPDATE schema_migrations SET applied_at='changed' WHERE version='076_media_variants.sql'", 'Old receipts changed'), ("UPDATE schema_migrations SET applied_at='' WHERE version='077_workspace_cashbook.sql'", 'New receipt missing'), ("UPDATE sqlite_sequence SET seq=99 WHERE name='users'", 'sqlite_sequence')):
            with self.subTest(sql=sql):
                shutil.copyfile(self.candidate, self.after)
                self.alter(sql)
                with self.assertRaisesRegex(ValueError, error):
                    self.check()

    def test_old_schema_extra_index_and_new_unreviewed_schema_rejected(self):
        self.alter('CREATE INDEX unreviewed ON users(username)')
        with self.assertRaisesRegex(ValueError, 'Pre-existing 076 schema changed'):
            self.check()
        shutil.copyfile(self.candidate, self.after)
        self.alter('ALTER TABLE workspace_finance_receipts ADD COLUMN unreviewed TEXT')
        with self.assertRaisesRegex(ValueError, 'Unreviewed workspace cashbook schema'):
            self.check()

    def test_both_new_tables_cannot_be_backfilled(self):
        for add in (self.receipt, self.source):
            with self.subTest(table=add.__name__):
                shutil.copyfile(self.candidate, self.after)
                add()
                with self.assertRaisesRegex(ValueError, 'Migration populated new table'):
                    self.check()

    def test_foreign_workspace_or_unknown_parent_rejected(self):
        self.alter("INSERT INTO workspace_finance_receipts VALUES('other','entry','revenue')")
        with self.assertRaisesRegex(ValueError, 'Foreign keys invalid'):
            self.check()

    def test_enum_and_cross_scope_source_rejected_by_schema(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.alter("INSERT INTO workspace_finance_receipts VALUES('team','entry','invented')")
        self.alter("INSERT INTO workspace_finance_cashbook_sources VALUES('team','source','other','unknown')")
        with self.assertRaisesRegex(ValueError, 'Foreign keys invalid'):
            self.check()

    def test_rollback_allows_existing076_archive_but_not_either_new_semantic_table(self):
        # The chosen previous binary 712e53c already enforces archive privacy.
        with redirect_stdout(io.StringIO()):
            V.validate_only(self.before, '--rollback-safe')
            V.validate_only(self.after, '--rollback-safe')
        for add in (self.receipt, self.source):
            with self.subTest(table=add.__name__):
                shutil.copyfile(self.candidate, self.after)
                add()
                self.alter('UPDATE workspace_finance_entries SET voided=1')
                snapshot = self.after.read_bytes()
                with redirect_stdout(io.StringIO()), self.assertRaisesRegex(ValueError, 'cannot preserve simple receipt semantics'):
                    V.validate_only(self.after, '--rollback-safe')
                self.assertEqual(self.after.read_bytes(), snapshot)

    def test_current150_table_snapshot_preserves_new_metadata_and_amounts(self):
        self.receipt()
        self.source()
        shutil.copyfile(self.after, self.before)
        self.check()
        self.alter("UPDATE workspace_finance_receipts SET receipt_kind='revenue'")
        with self.assertRaisesRegex(ValueError, 'Persisted data changed: workspace_finance_receipts'):
            self.check()


if __name__ == '__main__':
    unittest.main()
