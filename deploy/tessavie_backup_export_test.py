"""Isolated refusal/publication tests; no production paths or network access."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('backup_export', Path(__file__).with_name('tessavie_backup_export.py'))
export = importlib.util.module_from_spec(spec)
spec.loader.exec_module(export)


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source, self.target = self.root / 'source', self.root / 'export'
        self.source.mkdir()
        self.name = 'business-control-20260914-021500.tar.gz.enc'
        (self.source / self.name).write_bytes(b'encrypted fixture')
        self.ownership = patch.object(export, 'own', lambda *args: None)
        self.ownership.start()
        self.addCleanup(self.ownership.stop)
        if os.name != 'posix':
            lock = patch.object(export, 'export_lock', lambda *args: contextlib.nullcontext())
            lock.start()
            self.addCleanup(lock.stop)

    def publish(self):
        return export.export_archives(self.source, self.target, gid=0)

    def test_roundtrip_and_repeat_preserve_archive(self):
        first = self.publish()
        before = (self.target / self.name).stat()
        self.assertEqual(self.publish(), first)
        self.assertEqual((self.target / self.name).stat().st_mtime_ns, before.st_mtime_ns)
        output = io.BytesIO()
        export.serve('get-v1 ' + self.name, self.target, output)
        self.assertEqual(output.getvalue(), b'encrypted fixture')
        listing = io.BytesIO()
        export.serve('list-v1', self.target, listing)
        self.assertEqual(json.loads(listing.getvalue()), first)

    def test_reject_arbitrary_commands_without_output(self):
        self.publish()
        for command in ('', 'sh', 'list-v1 extra', 'get-v1 ../manifest.json',
                        'get-v1 ' + self.name + '\n', 'get-v1 ' + self.name + ';id',
                        'get-v1  ' + self.name, 'get-v1 ' + self.name + ' extra'):
            with self.subTest(command=command):
                output = io.BytesIO()
                with self.assertRaises(ValueError):
                    export.serve(command, self.target, output)
                self.assertEqual(output.getvalue(), b'')

    def test_budgets_leave_existing_manifest_untouched(self):
        self.publish()
        before = (self.target / export.MANIFEST).read_bytes()
        for field, value in [('MAX_COUNT', 0), ('MAX_FILE', 1), ('MAX_TOTAL', 1), ('FREE_FLOOR', 10**30)]:
            with self.subTest(field=field), patch.object(export, field, value):
                with self.assertRaises(ValueError):
                    self.publish()
            self.assertEqual((self.target / export.MANIFEST).read_bytes(), before)

    def test_changed_source_name_is_not_overwritten(self):
        self.publish()
        before = (self.target / self.name).read_bytes()
        (self.source / self.name).write_bytes(b'different encrypted content')
        with self.assertRaises(ValueError):
            self.publish()
        self.assertEqual((self.target / self.name).read_bytes(), before)

    def test_interrupted_copy_does_not_publish_partial_manifest(self):
        self.publish()
        before = (self.target / export.MANIFEST).read_bytes()
        new = 'business-control-20260915-021500.tar.gz.enc'
        (self.source / new).write_bytes(b'another fixture')
        original = export.digest

        def interrupted(stream, target=None):
            if target is not None:
                target.write(b'partial')
                raise OSError('simulated disconnected source')
            return original(stream, target)

        with patch.object(export, 'digest', interrupted), self.assertRaises(OSError):
            self.publish()
        self.assertEqual((self.target / export.MANIFEST).read_bytes(), before)
        self.assertFalse((self.target / new).exists())
        self.assertFalse(list(self.target.glob('*.partial')))

    def test_export_retention_removes_only_export_duplicates(self):
        self.publish()
        (self.source / self.name).unlink()
        new = 'business-control-20260915-021500.tar.gz.enc'
        (self.source / new).write_bytes(b'new fixture')
        self.publish()
        self.assertFalse((self.target / self.name).exists())
        self.assertTrue((self.source / new).exists())
        self.assertTrue((self.target / new).exists())

    def test_source_changed_after_plan_keeps_previous_manifest(self):
        self.publish()
        before = (self.target / export.MANIFEST).read_bytes()
        new = 'business-control-20260915-021500.tar.gz.enc'
        (self.source / new).write_bytes(b'original fixture')
        original = export.copy_archive

        def changed(source, destination, entry, expected, gid):
            (source / entry['name']).write_bytes(b'changed after planning')
            return original(source, destination, entry, expected, gid)

        with patch.object(export, 'copy_archive', changed), self.assertRaises(ValueError):
            self.publish()
        self.assertEqual((self.target / export.MANIFEST).read_bytes(), before)
        self.assertFalse((self.target / new).exists())

    def test_unexpected_export_object_blocks_updates(self):
        self.publish()
        (self.target / 'keep-me.txt').write_text('not an export')
        with self.assertRaises(ValueError):
            self.publish()
        self.assertTrue((self.target / 'keep-me.txt').exists())

    def test_tampered_archive_not_served(self):
        self.publish()
        (self.target / self.name).write_bytes(b'corrupted')
        output = io.BytesIO()
        with self.assertRaises(ValueError):
            export.serve('get-v1 ' + self.name, self.target, output)
        self.assertEqual(output.getvalue(), b'')

    def test_manifest_duplicate_and_unsafe_entry_rejected(self):
        manifest = self.publish()
        manifest['entries'].append(dict(manifest['entries'][0]))
        with self.assertRaises(ValueError):
            export.validate_manifest(manifest)
        manifest['entries'].pop()
        manifest['entries'][0]['name'] = '../private-key'
        with self.assertRaises(ValueError):
            export.validate_manifest(manifest)

    @unittest.skipUnless(os.name == 'posix', 'POSIX symlink protections')
    def test_source_export_manifest_and_directory_symlinks_rejected(self):
        outside = self.root / 'private'
        outside.write_bytes(b'sensitive fixture')
        source = self.source / self.name
        source.unlink()
        source.symlink_to(outside)
        with self.assertRaises(ValueError):
            self.publish()
        source.unlink()
        source.write_bytes(b'encrypted fixture')
        self.publish()
        for name in (self.name, export.MANIFEST):
            path = self.target / name
            data = path.read_bytes()
            path.unlink()
            path.symlink_to(outside)
            with self.assertRaises(ValueError):
                self.publish()
            path.unlink()
            path.write_bytes(data)
        linked = self.root / 'linked'
        linked.symlink_to(self.target, target_is_directory=True)
        with self.assertRaises(ValueError):
            export.serve('list-v1', linked, io.BytesIO())


if __name__ == '__main__':
    unittest.main()
