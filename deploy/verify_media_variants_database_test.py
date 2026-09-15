"""Prove additive media migration, current-data rollback and strict archives."""
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
SPEC = importlib.util.spec_from_file_location('media_variants_verifier', ROOT / 'deploy/verify-media-variants-database.py')
V = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(V)


class MediaVariantsDatabaseChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory(prefix='tessavie-media-variants-db-')
        cls.baseline = Path(cls.folder.name) / 'baseline075.db'
        cls.candidate = Path(cls.folder.name) / 'candidate076.db'
        with closing(sqlite3.connect(cls.baseline)) as db:
            db.execute('CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
            for name in V.EXPECTED_BASELINE:
                db.executescript((ROOT / 'internal/app/migrations' / name).read_text(encoding='utf-8-sig'))
                db.execute('INSERT INTO schema_migrations VALUES(?,?)', (name, '2026-09-15T00:00:00Z'))
            db.execute("INSERT INTO users(id,email,username,password_hash,created_at,updated_at) VALUES(1,'fixture@example.test','fixture','synthetic','2026-09-15','2026-09-15')")
            db.execute("INSERT INTO workspaces(id,name,slug,kind,owner_id,delete_policy,created_at,updated_at) VALUES('team','Fixture team','fixture-team','team',1,'archive_only','2026-09-15','2026-09-15')")
            db.execute("INSERT INTO workspace_pages(id,workspace_id,name,created_by,created_at,updated_at) VALUES('page','team','Synthetic page',1,'2026-09-15','2026-09-15')")
            db.execute("INSERT INTO page_app_definitions VALUES('page',?,1,'2026-09-15')", (json.dumps({'version': 1, 'blocks': []}),))
            db.execute("INSERT INTO records(id,type,title,status,author_id,owner_id,created_at,updated_at,workspace_id) VALUES('record','task','Synthetic record','in_progress',1,1,'2026-09-15','2026-09-15','team')")
            db.execute("INSERT INTO record_attachments(id,record_id,uploader_id,original_name,stored_name,content_type,size_bytes,sha256,created_at) VALUES('record-file','record',1,'original.png','record-file.png','image/png',128,?,'2026-09-15')", ('a' * 64,))
            for file_id, block in (('file', 'media'), ('foreign-file', 'different-block')):
                db.execute("INSERT INTO page_media_attachments(id,page_id,block_id,uploader_id,original_name,stored_name,content_type,size_bytes,sha256,request_key,created_at,updated_at) VALUES(?,'page',?,1,'original.png',?,'image/png',128,?,?,'2026-09-15','2026-09-15')", (file_id, block, file_id + '.png', 'a' * 64, 'request-' + file_id))
            for prefix, scope_key, scope in (('personal', 'owner_id', 1), ('workspace', 'workspace_id', 'team')):
                db.execute(f"INSERT INTO {prefix}_finance_buckets(id,{scope_key},name,created_at,updated_at) VALUES('account',?,'Synthetic savings','2026-09-15','2026-09-15')", (scope,))
                db.execute(f"INSERT INTO {prefix}_finance_expenses(id,{scope_key},bucket_id,bucket_name,date,amount_minor,created_at,updated_at) VALUES('expense',?,'account','Synthetic savings','2026-09-15',12300,'2026-09-15','2026-09-15')", (scope,))
            db.commit()
            assert V.validate(db) == 75
        shutil.copyfile(cls.baseline, cls.candidate)
        with closing(sqlite3.connect(cls.candidate)) as db:
            for name, expected in V.MIGRATION_SHA256.items():
                source = (ROOT / 'internal/app/migrations' / name).read_text(encoding='utf-8-sig').replace('\r\n', '\n')
                assert hashlib.sha256(source.encode()).hexdigest() == expected, 'Reviewed migration changed'
                db.executescript(source)
                db.execute('INSERT INTO schema_migrations VALUES(?,?)', (name, '2026-09-15T01:00:00Z'))
            db.commit()
            assert V.validate(db) == 76

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

    def variant(self, variant_id='variant', user=1):
        self.alter("INSERT INTO media_variants(id,context_kind,target_id,block_id,name,created_by,created_at,updated_at,revision) VALUES(?,'page','page','media','Logo concept',?,'2026-09-15','2026-09-15',1)", (variant_id, user))

    def version(self):
        self.alter("INSERT INTO media_versions(id,variant_id,attachment_kind,attachment_id,ordinal,note,created_by,created_at) VALUES('version','variant','page','file',1,'Original sketch',1,'2026-09-15')")

    def event(self):
        self.alter("INSERT INTO media_variant_events(variant_id,action,revision,actor_id,details_json,created_at) VALUES('variant','created',1,1,'{}','2026-09-15')")

    def receipt(self):
        self.alter("INSERT INTO media_variant_requests VALUES(1,'page','page','media','request',?,'variant','2026-09-15')", ('b' * 64,))

    def attachment_receipt(self):
        self.alter("INSERT INTO record_attachment_requests VALUES(1,'record','request',?,'record-file','2026-09-15')", ('b' * 64,))

    def test_exact_additive_075_to_076_starts_five_tables_empty(self):
        self.check()

    def test_missing_or_unreviewed_receipt_is_rejected(self):
        for sql in ("DELETE FROM schema_migrations WHERE version='075_finance_organization.sql'", "INSERT INTO schema_migrations VALUES('077_unknown.sql','today')"):
            with self.subTest(sql=sql):
                shutil.copyfile(self.candidate, self.after)
                self.alter(sql)
                with self.assertRaisesRegex(ValueError, 'Unknown or partial migration receipts'):
                    self.check()

    def test_modes_require_exact_versions(self):
        with redirect_stdout(io.StringIO()):
            V.validate_only(self.before, '--baseline')
            V.validate_only(self.after, '--validate-only')
            with self.assertRaisesRegex(ValueError, 'exact schema 075 baseline'):
                V.validate_only(self.after, '--baseline')
            with self.assertRaisesRegex(ValueError, 'exact schema 076'):
                V.validate_only(self.before, '--validate-only')

    def test_existing_attachment_and_financial_rewrites_are_rejected(self):
        for table, change in (('page_media_attachments', "original_name='rewritten.png'"), ('record_attachments', 'size_bytes=1'), ('personal_finance_expenses', 'amount_minor=1'), ('workspace_finance_expenses', 'amount_minor=1')):
            with self.subTest(table=table):
                shutil.copyfile(self.candidate, self.after)
                self.alter('UPDATE ' + table + ' SET ' + change)
                with self.assertRaisesRegex(ValueError, 'Persisted data changed: ' + table):
                    self.check()

    def test_old_receipts_and_new_timestamp_are_preserved(self):
        self.alter("UPDATE schema_migrations SET applied_at='rewritten' WHERE version='075_finance_organization.sql'")
        with self.assertRaisesRegex(ValueError, 'Old receipts changed'):
            self.check()
        shutil.copyfile(self.candidate, self.after)
        self.alter("UPDATE schema_migrations SET applied_at='' WHERE version='076_media_variants.sql'")
        with self.assertRaisesRegex(ValueError, 'New receipt missing'):
            self.check()

    def test_internal_sequence_change_is_rejected(self):
        self.alter("UPDATE sqlite_sequence SET seq=seq+10 WHERE name='users'")
        with self.assertRaisesRegex(ValueError, 'Persisted data changed: sqlite_sequence'):
            self.check()

    def test_old_schema_and_every_new_guard_are_pinned(self):
        self.alter('CREATE INDEX accidental_index ON users(username)')
        with self.assertRaisesRegex(ValueError, 'Pre-existing 075 schema changed'):
            self.check()
        with closing(sqlite3.connect(self.candidate)) as db:
            guards = db.execute("SELECT type,name FROM sqlite_master WHERE type IN ('index','trigger') AND sql IS NOT NULL").fetchall()
        for kind, name in guards:
            if name not in V.NEW_OBJECTS:
                continue
            with self.subTest(guard=name):
                shutil.copyfile(self.candidate, self.after)
                self.alter(f'DROP {kind} {name}')
                with self.assertRaisesRegex(ValueError, 'Unreviewed media variants schema'):
                    self.check()

    def test_new_variant_and_attachment_receipt_cannot_be_backfilled(self):
        for add in (self.variant, self.attachment_receipt):
            with self.subTest(add=add.__name__):
                shutil.copyfile(self.candidate, self.after)
                add()
                with self.assertRaisesRegex(ValueError, 'Migration populated new table'):
                    self.check()

    def test_child_tables_cannot_be_backfilled_or_hide_sequence_changes(self):
        for add in (self.version, self.receipt, self.event):
            with self.subTest(add=add.__name__):
                shutil.copyfile(self.candidate, self.after)
                self.variant()
                add()
                with self.assertRaisesRegex(ValueError, 'Migration populated new table|Persisted data changed: sqlite_sequence'):
                    self.check()

    def test_foreign_key_corruption_is_rejected(self):
        self.variant(user=999)
        with self.assertRaisesRegex(ValueError, 'Foreign keys invalid'):
            self.check()

    def test_latest_data_rollback_preserves_versions_selection_receipts_and_history(self):
        self.variant()
        self.version()
        self.event()
        self.receipt()
        self.attachment_receipt()
        self.alter("UPDATE media_variants SET selected_version_id='version'")
        shutil.copyfile(self.after, self.before)
        self.check()
        with redirect_stdout(io.StringIO()):
            V.validate_only(self.after, '--rollback-safe')
        self.alter("UPDATE media_variants SET name='Changed after snapshot'")
        with self.assertRaisesRegex(ValueError, 'Persisted data changed: media_variants'):
            self.check()

    def test_version_history_and_receipts_are_immutable(self):
        self.variant()
        self.version()
        self.event()
        self.receipt()
        self.attachment_receipt()
        for table, column in (('media_versions', 'note'), ('media_variant_events', 'details_json'), ('media_variant_requests', 'payload_hash'), ('record_attachment_requests', 'payload_hash')):
            for sql in (f"UPDATE {table} SET {column}={column}", 'DELETE FROM ' + table):
                with self.subTest(sql=sql), self.assertRaisesRegex(sqlite3.IntegrityError, 'append only|immutable'):
                    self.alter(sql)

    def test_archived_page_variant_blocks_old_binary_without_changing_data(self):
        self.variant()
        self.version()
        self.event()
        self.receipt()
        self.alter("UPDATE media_variants SET archived=1")
        shutil.copyfile(self.after, self.before)
        # Valid current data remains valid; migration and current-row checks
        # must not demand that an owner unarchive their private material.
        self.check()
        with redirect_stdout(io.StringIO()):
            V.validate_only(self.after, '--validate-only')
            with self.assertRaisesRegex(ValueError, 'previous binary cannot protect archived page media variants'):
                V.validate_only(self.after, '--rollback-safe')
        self.check()
        self.alter("UPDATE media_variants SET archived=0")
        with redirect_stdout(io.StringIO()):
            V.validate_only(self.after, '--rollback-safe')

    def test_cross_block_attachment_and_foreign_selection_are_rejected(self):
        self.variant()
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'scope mismatch'):
            self.alter("INSERT INTO media_versions VALUES('version','variant','page','foreign-file',1,'',1,'2026-09-15')")
        self.version()
        self.variant('other')
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'another variant'):
            self.alter("UPDATE media_variants SET selected_version_id='version' WHERE id='other'")

    def test_portable_archives_do_not_acquire_media_ids_or_new_kinds(self):
        for block in ({'id': 'archived-block', 'kind': 'media', 'variantIds': ['variant']}, {'id': 'archived-block', 'kind': 'media-version'}):
            with self.subTest(block=block):
                shutil.copyfile(self.candidate, self.after)
                details = {'title': 'Archived media', 'blockCount': 1, 'revision': 2, 'rootBlockId': 'archived-block', 'clientRequestId': 'synthetic-request-12345', 'requestHash': 'a' * 64, 'snapshot': {'version': 1, 'rootBlockId': 'archived-block', 'blocks': [block], 'positions': [0]}}
                self.alter("INSERT INTO activity(id,actor_id,entity_type,entity_id,action,details_json,created_at,workspace_id) VALUES('trash',1,'workspace_page','page','app_blocks_removed',?,'2026-09-15','team')", (json.dumps(details),))
                with closing(V.old.connect_readonly(self.after)) as db:
                    with self.assertRaisesRegex(ValueError, 'Unknown archive block fields|Invalid archived block identity'):
                        V.validate(db)


if __name__ == '__main__':
    unittest.main()
