#!/usr/bin/env python3
"""Linux safety tests; every write/delete is confined to a temporary fixture.

Run beside cleanup-server-artifacts-20260913.py:
    python3 cleanup_server_artifacts_test.py -v
No SSH, systemd operation, production lock, or production data is used.
"""
import contextlib
import importlib.util
import io
import json
import mmap
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest import mock


@unittest.skipUnless(sys.platform == 'linux', 'Requires Linux /proc and fcntl')
class CleanupSafetyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = Path(__file__).with_name('cleanup-server-artifacts-20260913.py')
        spec = importlib.util.spec_from_file_location('cleanup_under_test', source)
        cls.cleanup = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.cleanup)

    def setUp(self):
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.base = Path(self.stack.enter_context(
            tempfile.TemporaryDirectory(prefix='tessavie-cleanup-safety-'))).resolve()
        self.releases = self.base / 'releases'
        self.backups = self.base / 'backups'
        self.tmp = self.base / 'tmp'
        for directory in (self.releases, self.backups, self.tmp):
            directory.mkdir()
        self.now = time.time()
        self.current = self.release('20260801-current-1111111')
        self.previous = self.release('20260801-previous-2222222')
        self.candidate_commit = 'abcdef012345' + '6' * 28
        self.candidate = self.release('20260801-candidate-' + self.candidate_commit[:12])
        self.eligible = self.release('20260801-disposable-3333333')
        self.current_link = self.base / 'current'
        self.current_link.symlink_to(self.current, target_is_directory=True)
        for number in range(7):
            bundle = self.backups / ('pre-release-%02d' % number)
            bundle.mkdir()
            for name, content in {
                'cutover.db': b'backup database sentinel',
                'cutover-uploads.tar.gz': b'backup uploads sentinel',
                'SHA256SUMS': b'fixture manifest, no restore test implied',
                'previous-release.txt': str(self.previous).encode(),
                'candidate-commit.txt': self.candidate_commit.encode(),
                'business-control.env': b'fixture configuration sentinel',
            }.items():
                (bundle / name).write_bytes(content)
            os.utime(bundle, (self.now - number * 60, self.now - number * 60))
        self.stack.enter_context(mock.patch.multiple(
            self.cleanup, RELEASES=self.releases, CURRENT=self.current_link,
            BACKUPS=self.backups, TMP=self.tmp, REPORTS=self.base))
        self.stack.enter_context(mock.patch.object(self.cleanup, 'check_services'))
        original_open = open
        lock_names = {
            '/run/business-control-deploy.lock': self.base / 'deploy.lock',
            '/run/lock/business-control-deploy.lock': self.base / 'legacy-deploy.lock',
        }

        def fixture_lock_open(name, *args, **kwargs):
            # Exercise real flock, but never acquire either production lock.
            return original_open(lock_names.get(str(name), name), *args, **kwargs)

        self.stack.enter_context(mock.patch.object(
            self.cleanup, 'open', fixture_lock_open, create=True))
        self.assertEqual(self.cleanup.RELEASES, self.base / 'releases')
        self.assertEqual(self.cleanup.BACKUPS, self.base / 'backups')
        self.assertEqual(self.cleanup.TMP, self.base / 'tmp')

    def age(self, path, days=30):
        stamp = self.now - days * 86400
        os.utime(path, (stamp, stamp))

    def release(self, name):
        directory = self.releases / name
        directory.mkdir()
        binary = directory / 'business-control'
        binary.write_bytes(b'\x7fELF' + b'fixture executable content' * 16)
        self.age(binary)
        self.age(directory)
        return directory

    def tmp_file(self, name, content=b'\x7fELFfixture', days=30):
        path = self.tmp / name
        path.write_bytes(content)
        self.age(path, days)
        return path

    def plan(self, pins=()):
        return self.cleanup.build_plan(self.now, list(pins))

    def candidate_paths(self, plan):
        return {item['path'] for item in plan['candidates']}

    def backup_snapshot(self):
        return {str(p.relative_to(self.backups)): p.read_bytes()
                for p in self.backups.rglob('*') if p.is_file()}

    def apply(self, plan):
        plan_path = self.base / 'plan.json'
        receipt = self.base / 'receipt.json'
        plan_path.write_text(json.dumps(plan))
        argv = ['cleanup', '--apply-plan', str(plan_path), '--output', str(receipt)]
        with mock.patch.object(sys, 'argv', argv), contextlib.redirect_stdout(io.StringIO()):
            self.cleanup.main()
        return json.loads(receipt.read_text())

    def test_current_open_file_mapping_and_explicit_pin_are_retained(self):
        opened = self.release('20260801-open-4444444')
        mapped = self.release('20260801-mapped-5555555')
        pinned = self.release('20260801-pin-6666666')
        with (opened / 'business-control').open('rb'), \
                (mapped / 'business-control').open('rb') as source:
            with mmap.mmap(source.fileno(), 0, access=mmap.ACCESS_READ):
                # Suppress /proc symlink reads to prove that the maps parser
                # independently detects this mapping, even without fd evidence.
                with mock.patch.object(self.cleanup.os, 'readlink', side_effect=OSError):
                    mapping_paths = self.cleanup.occupied_paths()
                self.assertIn(str(mapped / 'business-control'), mapping_paths)
                plan = self.plan([str(pinned)])
        candidates = self.candidate_paths(plan)
        for retained in (self.current, opened, mapped, pinned):
            self.assertNotIn(str(retained), candidates)
            self.assertIn(str(retained), plan['preserved_releases'])
        self.assertIn(str(self.eligible), candidates)

    def test_twelve_character_candidate_commit_is_retained(self):
        plan = self.plan()
        self.assertNotIn(str(self.candidate), self.candidate_paths(plan))
        self.assertIn(str(self.candidate), plan['preserved_releases'])
        self.assertIn(str(self.previous), plan['preserved_releases'])

    def test_missing_candidate_aborts_without_touching_data(self):
        marker = self.backups / 'pre-release-00' / 'candidate-commit.txt'
        marker.write_text('9' * 40)
        before = self.backup_snapshot()
        with self.assertRaisesRegex(RuntimeError, 'Candidate binary missing'):
            self.plan()
        self.assertEqual(before, self.backup_snapshot())
        self.assertTrue((self.eligible / 'business-control').exists())

    def test_extra_files_and_symlinks_never_become_candidates(self):
        extra = self.release('20260801-extra-7777777')
        (extra / 'do-not-delete.db').write_bytes(b'important fixture')
        self.age(extra)
        linked_binary = self.release('20260801-link-8888888')
        (linked_binary / 'business-control').unlink()
        (linked_binary / 'business-control').symlink_to(self.eligible / 'business-control')
        self.age(linked_binary)
        linked_directory = self.releases / '20260801-alias-9999999'
        linked_directory.symlink_to(self.eligible, target_is_directory=True)
        unknown = self.release('historical-unknown-name')
        tmp_link = self.tmp / 'business-control-linked'
        tmp_link.symlink_to(self.eligible / 'business-control')
        candidates = self.candidate_paths(self.plan())
        for retained in (extra, linked_binary, linked_directory, unknown, tmp_link):
            self.assertNotIn(str(retained), candidates)

    def test_tampered_plan_cannot_redirect_deletion_into_backup(self):
        plan = self.plan()
        before = self.backup_snapshot()
        plan['candidates'][0]['path'] = str(self.backups / 'pre-release-00')
        with self.assertRaisesRegex(RuntimeError, 'State changed since plan'):
            self.apply(plan)
        self.assertEqual(before, self.backup_snapshot())
        self.assertTrue((self.eligible / 'business-control').exists())
        self.assertFalse((self.base / 'receipt.json').exists())

    def test_changed_file_after_plan_aborts_before_any_deletion(self):
        plan = self.plan()
        binary = self.eligible / 'business-control'
        binary.write_bytes(binary.read_bytes() + b'changed after review')
        with self.assertRaisesRegex(RuntimeError, 'State changed since plan'):
            self.apply(plan)
        self.assertTrue(binary.exists())
        self.assertFalse((self.base / 'receipt.json').exists())

    def test_apply_removes_only_approved_old_artifacts_and_preserves_all_backups(self):
        old_tmp = self.tmp_file('business-control-old-build')
        recent_tmp = self.tmp_file('business-control-new-build', days=1)
        text_tmp = self.tmp_file('business-control-old-notes', b'important notes')
        unrelated_tmp = self.tmp_file('other-program-old-build')
        before = self.backup_snapshot()
        plan = self.plan()
        self.assertEqual(self.candidate_paths(plan), {str(self.eligible), str(old_tmp)})
        receipt = self.apply(plan)
        self.assertFalse(self.eligible.exists())
        self.assertFalse(old_tmp.exists())
        self.assertEqual(before, self.backup_snapshot())
        for retained in (self.current / 'business-control', self.previous / 'business-control',
                         self.candidate / 'business-control', recent_tmp, text_tmp, unrelated_tmp):
            self.assertTrue(retained.exists())
        self.assertEqual(len(receipt['deleted']), 2)
        self.assertTrue(receipt['all_backups_preserved'])

    def test_file_opened_after_rebuild_is_preserved_at_deletion_boundary(self):
        plan = self.plan()
        before = self.backup_snapshot()
        with mock.patch.object(self.cleanup, 'occupied_paths', side_effect=[
                set(), {str(self.eligible / 'business-control')}]), \
                self.assertRaisesRegex(RuntimeError, 'Active paths changed'):
            self.apply(plan)
        self.assertTrue((self.eligible / 'business-control').exists())
        self.assertEqual(before, self.backup_snapshot())
        self.assertEqual(json.loads((self.base / 'receipt.json').read_text())['deleted'], [])

    def test_output_cannot_overwrite_backup_or_existing_report(self):
        backup_file = self.backups / 'pre-release-00' / 'cutover.db'
        existing = self.base / 'old-report.json'
        existing.write_text('preserved report')
        for path in (backup_file, existing):
            before = path.read_bytes()
            with mock.patch.object(sys, 'argv', ['cleanup', '--output', str(path)]):
                with self.assertRaisesRegex(RuntimeError, 'Output must be a new JSON file'):
                    self.cleanup.main()
            self.assertEqual(path.read_bytes(), before)
        self.assertTrue((self.eligible / 'business-control').exists())


if __name__ == '__main__':
    unittest.main()
