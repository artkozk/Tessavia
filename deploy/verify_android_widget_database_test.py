"""Synthetic migration/rollback rejection tests; never opens production data."""
from contextlib import closing, redirect_stdout
import importlib.util
import io
from pathlib import Path
import shutil
import sqlite3
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('widget_verifier', ROOT / 'deploy/verify-android-widget-database.py')
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


class WidgetMigrationChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory(prefix='tessavie-widget-migration-')
        cls.baseline = Path(cls.folder.name) / 'baseline.db'
        with closing(sqlite3.connect(cls.baseline)) as db:
            db.execute('CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
            for name in verifier.old.EXPECTED_MIGRATIONS:
                db.executescript((ROOT / 'internal/app/migrations' / name).read_text(encoding='utf-8-sig'))
                db.execute('INSERT INTO schema_migrations VALUES(?,?)', (name, '2026-09-14T00:00:00Z'))
            db.execute("INSERT INTO users(id,email,username,password_hash,created_at,updated_at) VALUES(1,'fixture@example.test','widgetfixture','synthetic','2026-09-14','2026-09-14')")
            db.commit()
            verifier.old.validate(db)

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

    def migrate(self):
        with closing(sqlite3.connect(self.after)) as db:
            db.executescript((ROOT / 'internal/app/migrations' / verifier.MIGRATION).read_text(encoding='utf-8-sig'))
            db.execute('INSERT INTO schema_migrations VALUES(?,?)', (verifier.MIGRATION, '2026-09-14T01:00:00Z'))
            db.commit()

    def check(self):
        with redirect_stdout(io.StringIO()):
            verifier.verify(self.before, self.after)

    def alter(self, sql):
        with closing(sqlite3.connect(self.after)) as db:
            db.execute(sql)
            db.commit()

    def test_only_additive_migration_passes(self):
        self.migrate()
        self.check()

    def test_candidate_without_migration_rejected(self):
        with self.assertRaisesRegex(ValueError, 'migration missing'):
            self.check()

    def test_rollback_keeps_current_072(self):
        self.migrate()
        shutil.copyfile(self.after, self.before)
        self.check()

    def test_old_record_changed_rejected(self):
        self.migrate()
        self.alter("UPDATE users SET username='changed' WHERE id=1")
        with self.assertRaisesRegex(ValueError, 'Persisted data changed'):
            self.check()

    def test_old_receipt_changed_rejected(self):
        self.migrate()
        self.alter("UPDATE schema_migrations SET applied_at='changed' WHERE version='071_web_push.sql'")
        with self.assertRaisesRegex(ValueError, 'receipts changed'):
            self.check()

    def test_new_table_rejected(self):
        self.migrate()
        self.alter('CREATE TABLE accidental_change(id TEXT)')
        with self.assertRaisesRegex(ValueError, 'schema changed'):
            self.check()

    def test_revocation_trigger_removal_rejected(self):
        self.migrate()
        self.alter('DROP TRIGGER widget_devices_password_changed')
        with self.assertRaisesRegex(ValueError, 'widget schema'):
            self.check()

    def test_unreviewed_migration_rejected(self):
        self.migrate()
        self.alter("INSERT INTO schema_migrations VALUES('073_surprise.sql','x')")
        with self.assertRaisesRegex(ValueError, 'migration receipts'):
            self.check()

    def test_baseline_does_not_accept_072(self):
        self.migrate()
        with self.assertRaisesRegex(ValueError, 'baseline 071'):
            verifier.validate_only(self.after, baseline=True)


if __name__ == '__main__':
    unittest.main()
