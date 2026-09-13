"""Synthetic SQLite acceptance tests for the production read-only verifier."""
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


ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location('finance_expenses_verifier', ROOT / 'deploy/verify-finance-expenses-migration.py')
VERIFIER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFIER)


class MigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixtures = tempfile.TemporaryDirectory(prefix='tessavia-expense-verifier-')
        cls.baseline = Path(cls.fixtures.name) / 'baseline.db'
        with closing(sqlite3.connect(cls.baseline)) as db:
            db.execute('PRAGMA foreign_keys=ON')
            db.execute('CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
            for migration in VERIFIER.BASELINE_MIGRATIONS:
                db.executescript((ROOT / 'internal/app/migrations' / migration).read_text(encoding='utf-8-sig'))
                db.execute('INSERT INTO schema_migrations VALUES(?,?)', (migration, '2026-09-13T00:00:00Z'))
            db.execute("INSERT INTO users(id,email,username,password_hash,created_at,updated_at) VALUES(1,'fixture@example.test','fixture','synthetic','2026-09-13','2026-09-13')")
            db.execute("INSERT INTO workspaces(id,name,slug,kind,owner_id,created_at,updated_at) VALUES('own','Fixture','fixture','personal',1,'2026-09-13','2026-09-13')")
            db.execute("INSERT INTO workspace_pages(id,workspace_id,name,created_by,created_at,updated_at) VALUES('page','own','Fixture page',1,'2026-09-13','2026-09-13')")
            db.execute("INSERT INTO personal_finance_buckets(id,owner_id,name,created_at,updated_at) VALUES('bucket',1,'Fixture bucket','2026-09-13','2026-09-13')")
            rules = json.dumps([{'bucketId': 'bucket', 'basisPoints': 10000}])
            db.execute("INSERT INTO personal_finance_sources(id,owner_id,name,allocations_json,created_at,updated_at) VALUES('source',1,'Fixture source',?,'2026-09-13','2026-09-13')", (rules,))
            allocations = json.dumps([{'bucketId': 'bucket', 'bucketName': 'Fixture bucket', 'basisPoints': 10000, 'amountMinor': 10000, 'paidMinor': 7500}])
            db.execute("INSERT INTO personal_finance_entries(id,owner_id,source_id,source_name,deduct_workers,date,gross_minor,worker_minor,base_minor,allocations_json,created_at,updated_at) VALUES('income',1,'source','Fixture source',0,'2026-09-13',10000,0,10000,?,'2026-09-13','2026-09-13')", (allocations,))
            db.execute("INSERT INTO personal_finance_requests(owner_id,request_id,payload_hash,entry_id,created_at) VALUES(1,'old-request','unchanged-hash','income','2026-09-13')")
            db.commit()

    @classmethod
    def tearDownClass(cls):
        cls.fixtures.cleanup()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=self.fixtures.name)
        self.addCleanup(self.temp.cleanup)
        self.before = Path(self.temp.name) / 'before.db'
        self.after = Path(self.temp.name) / 'after.db'
        shutil.copyfile(self.baseline, self.before)
        shutil.copyfile(self.baseline, self.after)
        with closing(sqlite3.connect(self.after)) as db:
            for migration, sql in zip(VERIFIER.MIGRATIONS, VERIFIER.MIGRATION_SQL):
                db.executescript(sql)
                db.execute('INSERT INTO schema_migrations VALUES(?,?)', (migration, '2026-09-14T00:00:00Z'))
            db.commit()

    def execute(self, sql, parameters=()):
        with closing(sqlite3.connect(self.after)) as db:
            db.execute(sql, parameters)
            db.commit()

    def verify(self):
        with redirect_stdout(io.StringIO()):
            VERIFIER.verify(self.before, self.after)

    def rollback(self, path=None):
        with redirect_stdout(io.StringIO()):
            VERIFIER.rollback_safe(path or self.after)

    def seed_expense(self):
        self.execute("INSERT INTO personal_finance_expenses(id,owner_id,bucket_id,bucket_name,date,amount_minor,created_at,updated_at) VALUES('expense',1,'bucket','Fixture bucket','2026-09-14',123,'2026-09-14','2026-09-14')")

    def seed_component(self):
        self.execute("INSERT INTO page_app_components(id,owner_id,name,definition_json,request_id,request_hash,created_at) VALUES('component',1,'Fixture component','{}','component-request','hash','2026-09-14')")

    def test_reviewed_sql_matches_migrations_and_baseline(self):
        actual_versions = tuple(p.name for p in sorted((ROOT / 'internal/app/migrations').glob('*.sql')) if p.name[:3] <= '068')
        self.assertEqual(actual_versions, VERIFIER.BASELINE_MIGRATIONS)
        for migration, sql in zip(VERIFIER.MIGRATIONS, VERIFIER.MIGRATION_SQL):
            self.assertEqual((ROOT / 'internal/app/migrations' / migration).read_text(encoding='utf-8-sig'), sql)
        with closing(sqlite3.connect(self.before)) as db:
            self.assertEqual(VERIFIER.schema_digest(VERIFIER.schema_objects(db)), VERIFIER.BASELINE_SCHEMA_SHA256)

    def test_additive_migration_and_empty_rollback_pass(self):
        self.verify()
        self.rollback()
        self.rollback(self.before)

    def test_old_transfer_annotations_are_unchanged(self):
        self.execute("UPDATE personal_finance_entries SET allocations_json='[]' WHERE id='income'")
        with self.assertRaises(ValueError): self.verify()

    def test_old_request_hash_is_unchanged(self):
        self.execute("UPDATE personal_finance_requests SET payload_hash='rewritten'")
        with self.assertRaises(ValueError): self.verify()

    def test_existing_receipt_timestamp_cannot_change(self):
        self.execute("UPDATE schema_migrations SET applied_at='changed' WHERE version='068_page_app_sheet_values.sql'")
        with self.assertRaises(ValueError): self.verify()

    def test_expense_usage_blocks_rollback_and_seeded_copy(self):
        self.seed_expense()
        with self.assertRaises(ValueError): self.rollback()
        with self.assertRaises(ValueError): self.verify()

    def test_expense_request_usage_blocks_rollback(self):
        self.seed_expense()
        self.execute("INSERT INTO personal_finance_expense_requests(owner_id,request_id,payload_hash,expense_id,created_at) VALUES(1,'expense-request','hash','expense','2026-09-14')")
        with self.assertRaises(ValueError): self.rollback()

    def test_component_usage_blocks_rollback_and_seeded_copy(self):
        self.seed_component()
        with self.assertRaises(ValueError): self.rollback()
        with self.assertRaises(ValueError): self.verify()

    def test_component_insertion_usage_blocks_rollback(self):
        self.seed_component()
        self.execute("INSERT INTO page_app_component_insertions(owner_id,request_id,request_hash,page_id,component_id,root_block_id,created_at) VALUES(1,'insert-request','hash','page','component','root','2026-09-14')")
        with self.assertRaises(ValueError): self.rollback()

    def test_partial_schema_blocks_rollback(self):
        self.execute('DROP TABLE page_app_component_insertions')
        with self.assertRaises(ValueError): self.rollback()
        with self.assertRaises(ValueError): self.verify()

    def test_missing_receipt_blocks_rollback(self):
        self.execute("DELETE FROM schema_migrations WHERE version='070_page_app_components.sql'")
        with self.assertRaises(ValueError): self.rollback()

    def test_unknown_receipt_blocks_rollback(self):
        self.execute("INSERT INTO schema_migrations VALUES('071_unknown.sql','2026-09-14')")
        with self.assertRaises(ValueError): self.rollback()

    def test_extra_table_blocks_rollback(self):
        self.execute('CREATE TABLE unknown_feature (id TEXT)')
        with self.assertRaises(ValueError): self.rollback()

    def test_unexpected_new_index_blocks_rollback(self):
        self.execute('CREATE INDEX unexpected_expense_index ON personal_finance_expenses(payee)')
        with self.assertRaises(ValueError): self.rollback()

    def test_changed_constraint_blocks_rollback(self):
        # Synthetic fixture only. Stored DDL is intentionally tampered with;
        # the read-only production verifier never uses writable_schema.
        with closing(sqlite3.connect(self.after)) as db:
            db.execute('PRAGMA writable_schema=ON')
            db.execute("UPDATE sqlite_master SET sql=replace(sql,'amount_minor > 0','amount_minor >= 0') WHERE name='personal_finance_expenses'")
            db.execute('PRAGMA writable_schema=OFF')
            db.commit()
        with self.assertRaises(ValueError): self.rollback()

    def test_changed_old_schema_blocks_rollback(self):
        self.execute('CREATE INDEX unexpected_user_index ON users(email)')
        with self.assertRaises(ValueError): self.rollback()

    def test_foreign_key_damage_blocks_verification(self):
        self.execute("UPDATE personal_finance_buckets SET owner_id=999 WHERE id='bucket'")
        with self.assertRaises(ValueError): self.rollback()
        with self.assertRaises(ValueError): self.verify()

    def test_read_only_and_missing_file_not_created(self):
        before_hash = hashlib.sha256(self.before.read_bytes()).hexdigest()
        after_hash = hashlib.sha256(self.after.read_bytes()).hexdigest()
        self.verify()
        self.rollback()
        self.assertEqual(before_hash, hashlib.sha256(self.before.read_bytes()).hexdigest())
        self.assertEqual(after_hash, hashlib.sha256(self.after.read_bytes()).hexdigest())
        missing = Path(self.temp.name) / 'missing.db'
        with self.assertRaises(sqlite3.OperationalError): self.rollback(missing)
        self.assertFalse(missing.exists())


if __name__ == '__main__':
    unittest.main()
