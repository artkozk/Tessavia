"""Meaningful rejection tests for the exact finance/media additive rollout."""
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
SPEC = importlib.util.spec_from_file_location('finance_media_verifier', ROOT / 'deploy/verify-team-finance-media-database.py')
V = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(V)


class TeamFinanceMediaDatabaseChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory(prefix='tessavie-finance-media-db-')
        cls.baseline = Path(cls.folder.name) / 'baseline072.db'
        cls.candidate = Path(cls.folder.name) / 'candidate074.db'
        with closing(sqlite3.connect(cls.baseline)) as db:
            db.execute('CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
            for name in V.EXPECTED_BASELINE:
                db.executescript((ROOT / 'internal/app/migrations' / name).read_text(encoding='utf-8-sig'))
                db.execute('INSERT INTO schema_migrations VALUES(?,?)', (name, '2026-09-15T00:00:00Z'))
            db.execute("INSERT INTO users(id,email,username,password_hash,created_at,updated_at) VALUES(1,'fixture@example.test','fixture','synthetic','2026-09-15','2026-09-15')")
            db.execute("INSERT INTO workspaces(id,name,slug,kind,owner_id,delete_policy,created_at,updated_at) VALUES('team','Fixture team','fixture-team','team',1,'archive_only','2026-09-15','2026-09-15')")
            db.execute("INSERT INTO workspace_pages(id,workspace_id,name,created_by,created_at,updated_at) VALUES('page','team','Synthetic page',1,'2026-09-15','2026-09-15')")
            db.execute("INSERT INTO page_app_definitions VALUES('page',?,1,'2026-09-15')", (json.dumps({'version': 1, 'blocks': []}),))
            db.execute("INSERT INTO personal_finance_buckets(id,owner_id,name,created_at,updated_at) VALUES('private-money',1,'Synthetic private savings','2026-09-15','2026-09-15')")
            db.commit()
            assert V.validate(db) == 72
        shutil.copyfile(cls.baseline, cls.candidate)
        with closing(sqlite3.connect(cls.candidate)) as db:
            for name in V.MIGRATIONS:
                source = (ROOT / 'internal/app/migrations' / name).read_text(encoding='utf-8-sig').replace('\r\n', '\n')
                assert hashlib.sha256(source.encode()).hexdigest() == V.MIGRATION_SHA256[name], 'Reviewed migration changed'
                db.executescript(source)
                db.execute('INSERT INTO schema_migrations VALUES(?,?)', (name, '2026-09-15T01:00:00Z'))
            db.commit()
            assert V.validate(db) == 74

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

    def test_exact_additive_072_to_074_starts_nine_tables_empty(self):
        self.check()

    def test_missing_media_migration_or_unreviewed_next_migration_is_rejected(self):
        for sql in ("DELETE FROM schema_migrations WHERE version='074_page_media.sql'", "INSERT INTO schema_migrations VALUES('075_unknown.sql','today')"):
            with self.subTest(sql=sql):
                shutil.copyfile(self.candidate, self.after)
                self.alter(sql)
                with self.assertRaisesRegex(ValueError, 'Unknown or partial migration receipts'):
                    self.check()

    def test_baseline_requires_exact_072_and_postcheck_requires_exact_074(self):
        with redirect_stdout(io.StringIO()):
            V.validate_only(self.before, '--baseline')
            V.validate_only(self.after, '--validate-only')
            with self.assertRaisesRegex(ValueError, 'exact schema 072 baseline'):
                V.validate_only(self.after, '--baseline')
            with self.assertRaisesRegex(ValueError, 'exact schema 074'):
                V.validate_only(self.before, '--validate-only')

    def test_personal_finance_change_is_rejected(self):
        self.alter("UPDATE personal_finance_buckets SET name='rewritten' WHERE id='private-money'")
        with self.assertRaisesRegex(ValueError, 'Persisted data changed: personal_finance_buckets'):
            self.check()

    def test_old_receipt_timestamp_rewrite_is_rejected(self):
        self.alter("UPDATE schema_migrations SET applied_at='rewritten' WHERE version='072_widget_devices.sql'")
        with self.assertRaisesRegex(ValueError, 'Old receipts changed'):
            self.check()

    def test_internal_autoincrement_sequence_change_is_rejected(self):
        self.alter("UPDATE sqlite_sequence SET seq=seq+10 WHERE name='users'")
        with self.assertRaisesRegex(ValueError, 'Persisted data changed: sqlite_sequence'):
            self.check()

    def test_unreviewed_changes_to_old_or_new_schema_are_rejected(self):
        for sql, error in (("CREATE INDEX accidental_old_index ON users(username)", 'Pre-existing 072 schema changed'), ('DROP TRIGGER workspace_finance_payer_owner_insert', 'Unreviewed finance/media schema'), ('DROP INDEX page_media_block_idx', 'Unreviewed finance/media schema')):
            with self.subTest(sql=sql):
                shutil.copyfile(self.candidate, self.after)
                self.alter(sql)
                with self.assertRaisesRegex(ValueError, error):
                    self.check()

    def test_seeded_team_finances_or_copied_personal_accounts_are_rejected(self):
        self.alter("INSERT INTO workspace_finance_buckets(id,workspace_id,name,created_at,updated_at) VALUES('copied','team','Synthetic private savings','2026-09-15','2026-09-15')")
        with self.assertRaisesRegex(ValueError, 'Migration populated new table: workspace_finance_buckets'):
            self.check()

    def test_seeded_media_rows_are_rejected(self):
        self.media_row()
        with self.assertRaisesRegex(ValueError, 'Migration populated new table: page_media_attachments'):
            self.check()

    def test_media_foreign_key_corruption_is_rejected(self):
        self.media_row(page='missing')
        with self.assertRaisesRegex(ValueError, 'Foreign keys invalid'):
            self.check()

    def media_row(self, page='page'):
        self.alter("INSERT INTO page_media_attachments(id,page_id,block_id,uploader_id,original_name,stored_name,content_type,size_bytes,sha256,request_key,created_at,updated_at) VALUES('file',?,'media',1,'fixture.png','fixture-file.png','image/png',128,?,'fixture-request','2026-09-15','2026-09-15')", (page, 'a' * 64))

    def trash(self, kind='media', extra=None):
        block = {'id': 'media-block', 'kind': kind, 'title': 'Draft gallery', **(extra or {})}
        details = {'title': 'Draft gallery', 'blockCount': 1, 'revision': 2, 'rootBlockId': 'media-block', 'clientRequestId': 'synthetic-request-12345', 'requestHash': 'a' * 64, 'snapshot': {'version': 1, 'rootBlockId': 'media-block', 'blocks': [block], 'positions': [0]}}
        self.alter("INSERT INTO activity(id,actor_id,entity_type,entity_id,action,details_json,created_at,workspace_id) VALUES('trash-media',1,'workspace_page','page','app_blocks_removed',?,'2026-09-15','team')", (json.dumps(details),))

    def test_current_data_rollback_accepts_media_archive_and_preserves_new_rows(self):
        self.media_row()
        self.trash()
        shutil.copyfile(self.after, self.before)
        self.check()
        with redirect_stdout(io.StringIO()):
            V.validate_only(self.after, '--rollback-safe')
        self.alter("UPDATE page_media_attachments SET removed_at='2026-09-16'")
        with self.assertRaisesRegex(ValueError, 'Persisted data changed: page_media_attachments'):
            self.check()

    def test_media_enum_exception_does_not_accept_unknown_block_kinds_or_private_attachment_fields(self):
        for kind, extra, error in (('arbitrary-plugin', None, 'Invalid archived block identity'), ('media', {'attachmentIds': ['private-file']}, 'Unknown archive block fields')):
            with self.subTest(kind=kind, extra=extra):
                shutil.copyfile(self.candidate, self.after)
                self.trash(kind, extra)
                with closing(V.old.connect_readonly(self.after)) as db:
                    with self.assertRaisesRegex(ValueError, error):
                        V.validate(db)
        self.assertNotIn('media', V.old.BLOCK_KINDS)

    def test_media_archive_still_enforces_reserved_identity_and_receipt_fields(self):
        self.trash()
        self.alter("UPDATE page_app_definitions SET definition_json=? WHERE page_id='page'", (json.dumps({'version': 1, 'blocks': [{'id': 'media-block', 'kind': 'media'}]}),))
        with closing(V.old.connect_readonly(self.after)) as db:
            with self.assertRaisesRegex(ValueError, 'Reserved archived identity reused'):
                V.validate(db)


if __name__ == '__main__':
    unittest.main()
