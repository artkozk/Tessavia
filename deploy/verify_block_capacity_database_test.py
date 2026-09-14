"""Synthetic acceptance coverage for an application-only production rollback."""
from contextlib import closing, redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / 'deploy/verify-block-capacity-database.py'
SPEC = importlib.util.spec_from_file_location('block_capacity_verifier', SCRIPT)
VERIFIER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFIER)


class UnchangedDatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixtures = tempfile.TemporaryDirectory(prefix='tessavia-block-capacity-verifier-')
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

    def validate(self):
        with closing(VERIFIER.connect_readonly(self.after)) as db:
            return VERIFIER.validate(db)

    def seed_trash(self, event_id='removed_one', workspace='fixture-workspace', page='fixture-page'):
        blocks = [
            {'id': 'group', 'kind': 'group', 'title': 'Fixture group', 'text': '', 'width': 12},
            {'id': 'tracker', 'kind': 'tracker', 'parentId': 'group', 'title': 'Tracker', 'text': '', 'width': 12,
             'items': [{'id': 'one', 'label': 'Read'}]},
            {'id': 'sheet', 'kind': 'sheet', 'parentId': 'group', 'title': 'Sheet', 'text': '', 'width': 12,
             'sheet': {'rows': [{'id': 'units', 'kind': 'input', 'label': 'Units'}]}},
        ]
        details = {'title': 'Fixture group', 'blockCount': 3, 'revision': 2, 'rootBlockId': 'group',
                   'clientRequestId': 'fixture_request_' + event_id, 'requestHash': 'a' * 64,
                   'snapshot': {'version': 1, 'rootBlockId': 'group', 'blocks': blocks, 'positions': [0, 1, 2]}}
        with closing(sqlite3.connect(self.after)) as db:
            db.execute('PRAGMA foreign_keys=ON')
            db.execute("INSERT OR IGNORE INTO workspaces(id,name,slug,kind,owner_id,created_at,updated_at) VALUES(?,?,?,'personal',1,'2026-09-14','2026-09-14')", (workspace, workspace, workspace))
            db.execute("INSERT OR IGNORE INTO workspace_pages(id,workspace_id,name,created_by,created_at,updated_at) VALUES(?,?,?,1,'2026-09-14','2026-09-14')", (page, workspace, page))
            db.execute("INSERT OR IGNORE INTO page_app_definitions(page_id,definition_json,revision,updated_at) VALUES(?,?,2,'2026-09-14')", (page, json.dumps({'version': 1, 'blocks': []})))
            db.execute("INSERT OR IGNORE INTO page_app_marks(page_id,block_id,item_id,user_id,checked,updated_at) VALUES(?,'tracker','one',1,1,'2026-09-14')", (page,))
            db.execute("INSERT OR IGNORE INTO page_app_sheet_values(page_id,block_id,user_id,values_json,revision,updated_at) VALUES(?,'sheet',1,?,1,'2026-09-14')", (page, json.dumps({'units': '987654.123456'})))
            db.execute("INSERT INTO activity(id,actor_id,entity_type,entity_id,action,details_json,workspace_id,created_at) VALUES(?,1,'workspace_page',?,'app_blocks_removed',?,?,'2026-09-14')", (event_id, page, json.dumps(details), workspace))
            db.commit()
        return details

    def add_restore(self, original='removed_one', event_id='restored_one', actor=1):
        with closing(sqlite3.connect(self.after)) as db:
            db.execute('PRAGMA foreign_keys=ON')
            page, workspace, raw = db.execute('SELECT entity_id,workspace_id,details_json FROM activity WHERE id=?', (original,)).fetchone()
            details = json.loads(raw)
            snapshot = details.pop('snapshot')
            details.update(trashId=original, revision=3, clientRequestId='fixture_request_' + event_id, requestHash='b' * 64)
            db.execute("UPDATE page_app_definitions SET definition_json=?,revision=3 WHERE page_id=?", (json.dumps({'version': 1, 'blocks': snapshot['blocks']}), page))
            db.execute("INSERT INTO activity(id,actor_id,entity_type,entity_id,action,details_json,workspace_id,created_at) VALUES(?,?,'workspace_page',?,'app_blocks_restored',?,?,'2026-09-14')", (event_id, actor, page, json.dumps(details), workspace))
            db.execute("INSERT INTO activity_undos VALUES(?,?,?,'2026-09-14')", (original, actor, event_id))
            db.commit()

    def update_receipt(self, details, event_id='removed_one'):
        self.execute('UPDATE activity SET details_json=? WHERE id=?', (json.dumps(details), event_id))

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

    def test_active_trash_validates_and_unchanged_startup_passes_but_rollback_blocks(self):
        self.seed_trash()
        shutil.copyfile(self.after, self.before)
        original = self.after.read_bytes()
        self.verify()
        self.assertEqual(self.validate(), 1)
        with self.assertRaises(VERIFIER.PendingBlockTrash):
            self.rollback()
        self.assertEqual(self.after.read_bytes(), original)

    def test_fully_restored_trash_allows_binary_only_rollback(self):
        self.seed_trash()
        self.add_restore()
        self.assertEqual(self.validate(), 0)
        self.rollback()
        with closing(sqlite3.connect(self.after)) as db:
            self.assertEqual(db.execute("SELECT checked FROM page_app_marks WHERE block_id='tracker'").fetchone(), (1,))
            self.assertEqual(json.loads(db.execute("SELECT values_json FROM page_app_sheet_values WHERE block_id='sheet'").fetchone()[0]), {'units': '987654.123456'})

    def test_other_workspace_pending_trash_blocks_global_rollback(self):
        self.seed_trash()
        self.add_restore()
        self.seed_trash('removed_elsewhere', 'other-workspace', 'other-page')
        self.assertEqual(self.validate(), 1)
        with self.assertRaises(VERIFIER.PendingBlockTrash):
            self.rollback()

    def test_archived_page_does_not_bypass_pending_guard(self):
        self.seed_trash()
        self.execute("UPDATE workspace_pages SET archived_at='2026-09-14'")
        with self.assertRaises(VERIFIER.PendingBlockTrash):
            self.rollback()

    def test_current_page_cannot_reuse_archived_identity(self):
        details = self.seed_trash()
        self.execute('UPDATE page_app_definitions SET definition_json=?', (json.dumps({'version': 1, 'blocks': [details['snapshot']['blocks'][0]]}),))
        with self.assertRaises(ValueError):
            self.validate()

    def test_overlapping_pending_archive_ids_are_rejected(self):
        self.seed_trash()
        self.seed_trash('removed_duplicate')
        with self.assertRaises(ValueError):
            self.validate()

    def test_corrupt_snapshot_variants_fail_closed(self):
        details = self.seed_trash()
        edits = [
            lambda d: d.pop('snapshot'),
            lambda d: d['snapshot'].update(version=2),
            lambda d: d['snapshot'].update(rootBlockId='not-the-root'),
            lambda d: d['snapshot'].update(positions=[0, 0, 2]),
            lambda d: d['snapshot'].update(positions=[0, 1, 40]),
            lambda d: d['snapshot'].update(positions=[0, True, 2]),
            lambda d: d.update(blockCount=2),
            lambda d: d.update(revision=True),
            lambda d: d['snapshot']['blocks'][1].update(id='group'),
            lambda d: d['snapshot']['blocks'][1].update(parentId='missing'),
            lambda d: d['snapshot']['blocks'][0].update(parentId='tracker'),
            lambda d: d['snapshot']['blocks'][1].update(kind='javascript'),
            lambda d: d['snapshot']['blocks'][1].update(marks={'one': True}),
            lambda d: d['snapshot']['blocks'][1]['items'][0].update(checked=True),
            lambda d: d.update(requestHash='invalid'),
            lambda d: d.update(clientRequestId='short'),
        ]
        for index, edit in enumerate(edits):
            with self.subTest(index=index):
                changed = json.loads(json.dumps(details))
                edit(changed)
                self.update_receipt(changed)
                with self.assertRaises(ValueError):
                    self.validate()
        self.update_receipt(details)
        self.assertEqual(self.validate(), 1)

    def test_malformed_receipt_json_and_duplicate_keys_rejected(self):
        details = self.seed_trash()
        for raw in ('not-json', 'null', '[]', json.dumps(details)[:-1] + ',"revision":3}'):
            with self.subTest(raw=raw[:20]):
                self.execute("UPDATE activity SET details_json=? WHERE id='removed_one'", (raw,))
                with self.assertRaises((ValueError, TypeError)):
                    self.validate()

    def test_corrupt_completed_snapshot_is_not_ignored(self):
        details = self.seed_trash()
        self.add_restore()
        details['snapshot']['blocks'] = []
        self.update_receipt(details)
        with self.assertRaises(ValueError):
            self.rollback()

    def test_fake_or_missing_restore_link_cannot_unlock_rollback(self):
        self.seed_trash()
        self.add_restore()
        self.execute('DELETE FROM activity_undos')
        with self.assertRaises(ValueError):
            self.rollback()

    def test_restore_actor_must_match_undo_actor(self):
        self.seed_trash()
        self.add_restore()
        self.execute("INSERT INTO users(id,email,username,password_hash,created_at,updated_at) VALUES(2,'other@example.test','other','synthetic','2026-09-14','2026-09-14')")
        self.execute('UPDATE activity_undos SET undone_by=2')
        with self.assertRaises(ValueError):
            self.rollback()

    def test_different_admin_may_restore_with_matching_receipt(self):
        self.seed_trash()
        self.execute("INSERT INTO users(id,email,username,password_hash,created_at,updated_at) VALUES(2,'other@example.test','other','synthetic','2026-09-14','2026-09-14')")
        self.add_restore(actor=2)
        self.rollback()

    def test_restore_scope_and_original_id_are_verified(self):
        self.seed_trash()
        self.add_restore()
        self.seed_trash('other_removed', 'other-workspace', 'other-page')
        self.execute("UPDATE activity SET workspace_id='other-workspace',entity_id='other-page' WHERE id='restored_one'")
        with self.assertRaises(ValueError):
            self.validate()

    def test_unknown_action_and_wrong_entity_fail_closed(self):
        self.seed_trash()
        self.execute("UPDATE activity SET action='app_blocks_purged' WHERE id='removed_one'")
        with self.assertRaises(ValueError):
            self.validate()
        self.execute("UPDATE activity SET action='app_blocks_removed',entity_type='task' WHERE id='removed_one'")
        with self.assertRaises(ValueError):
            self.validate()

    def test_duplicate_request_receipts_are_rejected(self):
        details = self.seed_trash()
        self.seed_trash('removed_duplicate')
        self.update_receipt(details, 'removed_duplicate')
        with self.assertRaises(ValueError):
            self.validate()

    def test_same_block_ids_in_different_pages_are_independent(self):
        self.seed_trash()
        self.seed_trash('other_removed', 'other-workspace', 'other-page')
        self.assertEqual(self.validate(), 2)

    def test_validate_only_cli_allows_pending_and_rollback_message_is_private(self):
        self.seed_trash()
        validated = subprocess.run([sys.executable, str(SCRIPT), '--validate-only', str(self.after)], capture_output=True, text=True)
        self.assertEqual(validated.returncode, 0, validated.stderr)
        self.assertIn('DATABASE_VALIDATION=ok', validated.stdout)
        blocked = subprocess.run([sys.executable, str(SCRIPT), '--rollback-safe', str(self.after)], capture_output=True, text=True)
        self.assertEqual(blocked.returncode, 3)
        self.assertEqual(blocked.stdout, '')
        self.assertEqual(blocked.stderr.strip(), 'ROLLBACK_BLOCKED=pending_block_trash_keep_candidate_and_latest_data')

    def test_invalid_trash_cli_never_prints_payload(self):
        details = self.seed_trash()
        details['snapshot']['blocks'][0]['PRIVATE_SENTINEL'] = 'secret'
        self.update_receipt(details)
        result = subprocess.run([sys.executable, str(SCRIPT), '--validate-only', str(self.after)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, '')
        self.assertEqual(result.stderr.strip(), 'DATABASE_VALIDATION_FAILED=unknown_schema_or_invalid_block_trash')


if __name__ == '__main__':
    unittest.main()
