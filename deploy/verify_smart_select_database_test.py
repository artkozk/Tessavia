"""Verify a UI-only release cannot mutate existing 072 data, including grants."""
from contextlib import closing, redirect_stdout
import importlib.util
import io
from pathlib import Path
import shutil
import sqlite3
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('smart_select_verifier', ROOT / 'deploy/verify-smart-select-database.py')
VERIFIER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFIER)


class SmartSelectDatabaseChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory(prefix='tessavie-smart-select-db-')
        cls.baseline = Path(cls.folder.name) / 'baseline072.db'
        cls.baseline071 = Path(cls.folder.name) / 'baseline071.db'
        with closing(sqlite3.connect(cls.baseline071)) as db:
            db.execute('CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
            for name in VERIFIER.old.EXPECTED_MIGRATIONS:
                db.executescript((ROOT / 'internal/app/migrations' / name).read_text(encoding='utf-8-sig'))
                db.execute('INSERT INTO schema_migrations VALUES(?,?)', (name, '2026-09-14T00:00:00Z'))
            db.execute("INSERT INTO users(id,email,username,password_hash,created_at,updated_at) VALUES(1,'fixture@example.test','fixture','synthetic','2026-09-14','2026-09-14')")
            db.execute("INSERT INTO workspaces(id,name,slug,kind,owner_id,delete_policy,created_at,updated_at) VALUES('fixture-space','Fixture','fixture-space','team',1,'archive_only','2026-09-14','2026-09-14')")
            db.execute("INSERT INTO workspace_pages(id,workspace_id,name,created_by,created_at,updated_at) VALUES('fixture-page','fixture-space','Synthetic page',1,'2026-09-14','2026-09-14')")
            db.commit()
            VERIFIER.old.validate(db)
        shutil.copyfile(cls.baseline071, cls.baseline)
        with closing(sqlite3.connect(cls.baseline)) as db:
            migration = VERIFIER.widgets.MIGRATION
            db.executescript((ROOT / 'internal/app/migrations' / migration).read_text(encoding='utf-8-sig'))
            db.execute('INSERT INTO schema_migrations VALUES(?,?)', (migration, '2026-09-14T01:00:00Z'))
            db.execute("""INSERT INTO widget_devices(id,user_id,workspace_id,page_id,block_id,name,
                pairing_hash,pairing_expires_at,token_hash,created_at,redeemed_at,last_used_at,expires_at)
                VALUES('fixture-grant',1,'fixture-space','fixture-page','fixture-block','Synthetic device',
                NULL,'2026-09-14T00:05:00Z',?,'2026-09-14T00:00:00Z','2026-09-14T00:01:00Z',
                '2026-09-14T00:02:00Z','2026-12-13T00:00:00Z')""", ('a' * 64,))
            db.commit()
            VERIFIER.validate(db)

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=self.folder.name)
        self.addCleanup(self.temp.cleanup)
        self.before = Path(self.temp.name) / 'before.db'
        self.after = Path(self.temp.name) / 'after.db'
        shutil.copyfile(self.baseline, self.before)
        shutil.copyfile(self.baseline, self.after)

    def alter(self, sql, args=()):
        with closing(sqlite3.connect(self.after)) as db:
            db.execute(sql, args)
            db.commit()

    def check(self):
        with redirect_stdout(io.StringIO()):
            VERIFIER.verify(self.before, self.after)

    def test_identical_130_tables_and_widget_grant_pass(self):
        self.check()

    def test_071_baseline_is_rejected_even_with_valid_072_candidate(self):
        shutil.copyfile(self.baseline071, self.before)
        with self.assertRaisesRegex(ValueError, 'Expected exact schema 072'):
            self.check()

    def test_071_candidate_is_rejected(self):
        shutil.copyfile(self.baseline071, self.after)
        with self.assertRaisesRegex(ValueError, 'Expected exact schema 072'):
            self.check()

    def test_widget_grant_deletion_is_rejected(self):
        self.alter("DELETE FROM widget_devices WHERE id='fixture-grant'")
        with self.assertRaisesRegex(ValueError, 'Data changed: widget_devices'):
            self.check()

    def test_widget_grant_token_and_last_used_changes_are_rejected(self):
        for field, value in (('token_hash', 'b' * 64), ('last_used_at', '2026-09-15T01:00:00Z')):
            with self.subTest(field=field):
                shutil.copyfile(self.baseline, self.after)
                self.alter('UPDATE widget_devices SET ' + field + '=?', (value,))
                with self.assertRaisesRegex(ValueError, 'Data changed: widget_devices'):
                    self.check()

    def test_legacy_user_data_change_is_rejected(self):
        self.alter("UPDATE users SET username='modified' WHERE id=1")
        with self.assertRaisesRegex(ValueError, 'Data changed: users'):
            self.check()

    def test_072_receipt_time_change_is_rejected(self):
        self.alter("UPDATE schema_migrations SET applied_at='modified' WHERE version='072_widget_devices.sql'")
        with self.assertRaisesRegex(ValueError, 'Data changed: schema_migrations'):
            self.check()

    def test_next_migration_receipt_is_rejected(self):
        self.alter("INSERT INTO schema_migrations VALUES('073_not_a_ui_change.sql','now')")
        with self.assertRaisesRegex(ValueError, 'Unknown migration receipts'):
            self.check()

    def test_revocation_trigger_removal_is_rejected(self):
        self.alter('DROP TRIGGER widget_devices_password_changed')
        with self.assertRaisesRegex(ValueError, 'Unreviewed widget schema'):
            self.check()

    def test_new_schema_objects_are_rejected(self):
        for sql in ('CREATE TABLE accidental_table(id TEXT)', 'CREATE INDEX accidental_index ON users(username)'):
            with self.subTest(sql=sql):
                shutil.copyfile(self.baseline, self.after)
                self.alter(sql)
                with self.assertRaisesRegex(ValueError, 'Pre-existing schema changed'):
                    self.check()

    def test_foreign_key_breakage_is_rejected(self):
        self.alter("UPDATE widget_devices SET user_id=999 WHERE id='fixture-grant'")
        with self.assertRaisesRegex(ValueError, 'Foreign keys invalid'):
            self.check()

    def test_internal_sequence_changes_are_rejected(self):
        with closing(sqlite3.connect(self.after)) as db:
            row = db.execute('SELECT name FROM sqlite_sequence LIMIT 1').fetchone()
            self.assertIsNotNone(row)
            db.execute('UPDATE sqlite_sequence SET seq=seq+5 WHERE name=?', row)
            db.commit()
        with self.assertRaisesRegex(ValueError, 'Data changed: sqlite_sequence'):
            self.check()


if __name__ == '__main__':
    unittest.main()
