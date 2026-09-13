"""Synthetic acceptance coverage for an application-only production rollback."""
from contextlib import closing, redirect_stdout
import importlib.util
import io
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / 'deploy/verify-field-conversion-database.py'
SPEC = importlib.util.spec_from_file_location('field_conversion_verifier', SCRIPT)
VERIFIER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFIER)


class UnchangedDatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixtures = tempfile.TemporaryDirectory(prefix='tessavia-field-conversion-verifier-')
        cls.baseline = Path(cls.fixtures.name) / 'baseline.db'
        with closing(sqlite3.connect(cls.baseline)) as db:
            db.execute('PRAGMA foreign_keys=ON')
            db.execute('CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
            for migration in VERIFIER.EXPECTED_MIGRATIONS:
                db.executescript((ROOT / 'internal/app/migrations' / migration).read_text(encoding='utf-8-sig'))
                db.execute('INSERT INTO schema_migrations VALUES(?,?)', (migration, '2026-09-14T00:00:00Z'))
            db.execute("INSERT INTO users(id,email,username,password_hash,created_at,updated_at) VALUES(1,'fixture@example.test','fixture','synthetic','2026-09-14','2026-09-14')")
            db.execute("INSERT INTO personal_finance_buckets(id,owner_id,name,created_at,updated_at) VALUES('bucket',1,'Fixture bucket','2026-09-14','2026-09-14')")
            db.execute("INSERT INTO personal_finance_expenses(id,owner_id,bucket_id,bucket_name,date,amount_minor,created_at,updated_at) VALUES('expense',1,'bucket','Fixture bucket','2026-09-14',125050,'2026-09-14','2026-09-14')")
            db.execute("INSERT INTO page_app_components(id,owner_id,name,definition_json,request_id,request_hash,created_at) VALUES('component',1,'Fixture component','{}','fixture-request','fixture-hash','2026-09-14')")
            db.execute("INSERT INTO personal_habits(id,owner_id,title,start_date,created_at,updated_at) VALUES('habit',1,'Fixture habit','2026-09-14','2026-09-14','2026-09-14')")
            db.execute("INSERT INTO personal_habit_checkins(id,habit_id,owner_id,checkin_date,value,amount,note,created_at,updated_at) VALUES('mark','habit',1,'2026-09-14',0,0,'','2026-09-14','2026-09-14')")
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

    def execute(self, sql, values=()):
        with closing(sqlite3.connect(self.after)) as db:
            db.execute(sql, values)
            db.commit()

    def verify(self):
        with redirect_stdout(io.StringIO()):
            VERIFIER.verify(self.before, self.after)

    def rollback(self):
        with redirect_stdout(io.StringIO()):
            VERIFIER.rollback_safe(self.after)

    def test_known_schema_matches_reviewed_migrations(self):
        actual = tuple(p.name for p in sorted((ROOT / 'internal/app/migrations').glob('*.sql')) if p.name[:3] <= '070')
        self.assertEqual(VERIFIER.EXPECTED_MIGRATIONS, actual)
        with closing(sqlite3.connect(self.before)) as db:
            self.assertEqual(VERIFIER.EXPECTED_SCHEMA_SHA256, VERIFIER.schema_digest(VERIFIER.schema_objects(db)))

    def test_same_schema_all_rows_and_populated_features_pass(self):
        self.verify()
        self.rollback()

    def test_changed_habit_mark_rejected_by_dry_run(self):
        self.execute("UPDATE personal_habit_checkins SET value=1,amount=1 WHERE id='mark'")
        with self.assertRaises(ValueError):
            self.verify()
        # This is an existing supported value, so a binary-only rollback retains it.
        self.rollback()

    def test_changed_expense_rejected_by_dry_run_but_compatible_for_rollback(self):
        self.execute("UPDATE personal_finance_expenses SET amount_minor=120000,revision=2")
        with self.assertRaises(ValueError):
            self.verify()
        self.rollback()

    def test_deleted_row_rejected(self):
        self.execute('DELETE FROM page_app_components')
        with self.assertRaises(ValueError):
            self.verify()

    def test_receipt_timestamp_cannot_silently_change(self):
        self.execute("UPDATE schema_migrations SET applied_at='changed' WHERE version='070_page_app_components.sql'")
        with self.assertRaises(ValueError):
            self.verify()

    def test_unknown_receipt_blocks_rollback(self):
        self.execute("INSERT INTO schema_migrations VALUES('071_unknown.sql','2026-09-14')")
        with self.assertRaises(ValueError):
            self.rollback()

    def test_missing_receipt_blocks_rollback(self):
        self.execute("DELETE FROM schema_migrations WHERE version='070_page_app_components.sql'")
        with self.assertRaises(ValueError):
            self.rollback()

    def test_changed_schema_without_table_count_change_blocks_rollback(self):
        self.execute('CREATE INDEX unknown_expense_index ON personal_finance_expenses(note)')
        with self.assertRaises(ValueError):
            self.rollback()

    def test_unknown_trigger_blocks_dry_run_and_rollback(self):
        self.execute('CREATE TRIGGER unknown_trigger AFTER UPDATE ON personal_finance_expenses BEGIN SELECT 1; END')
        with self.assertRaises(ValueError):
            self.verify()
        with self.assertRaises(ValueError):
            self.rollback()

    def test_unknown_table_blocks_rollback(self):
        self.execute('CREATE TABLE unknown_table(value)')
        with self.assertRaises(ValueError):
            self.rollback()

    def test_foreign_key_corruption_blocks_rollback(self):
        self.execute('UPDATE personal_finance_expenses SET owner_id=999')
        with self.assertRaises(ValueError):
            self.rollback()

    def test_blob_and_text_with_same_characters_are_not_equal(self):
        self.execute("UPDATE users SET password_hash=? WHERE id=1", (b'synthetic',))
        with self.assertRaises(ValueError):
            self.verify()

    def test_encoder_preserves_duplicate_rows_null_and_number_types(self):
        with closing(sqlite3.connect(':memory:')) as db:
            db.execute('CREATE TABLE typed_values(value)')
            db.executemany('INSERT INTO typed_values VALUES(?)', [(None,), (0,), (0.0,), ('0',), (b'0',), ('0',)])
            rows = VERIFIER.table_rows(db, 'typed_values')
            self.assertEqual(len(rows), 6)
            self.assertEqual(len(set(rows)), 5)

    def test_missing_file_is_not_created(self):
        missing = Path(self.temp.name) / 'absent & unicode ж.db'
        with self.assertRaises(sqlite3.OperationalError):
            VERIFIER.connect_readonly(missing)
        self.assertFalse(missing.exists())

    def test_success_does_not_modify_database_bytes(self):
        original = self.after.read_bytes()
        self.verify()
        self.rollback()
        self.assertEqual(original, self.after.read_bytes())

    def test_failure_prints_no_private_values_or_database_paths(self):
        self.execute("UPDATE users SET username='PRIVATE_VALUE_NOT_TO_PRINT' WHERE id=1")
        result = subprocess.run([sys.executable, str(SCRIPT), str(self.before), str(self.after)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, '')
        self.assertEqual(result.stderr.strip(), 'DATABASE_VERIFICATION_FAILED=changed_or_unverifiable_state')


if __name__ == '__main__':
    unittest.main()
