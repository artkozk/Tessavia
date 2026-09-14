#!/usr/bin/env python3
"""Linux/root fixture: real SQLite, tar and OpenSSL, never production inputs."""
import hashlib
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tempfile
import unittest


@unittest.skipUnless(os.name == 'posix' and os.geteuid() == 0, 'Linux root fixture')
class PublicationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='tessavie-publication-test-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.db = self.root / 'fixture.db'
        with sqlite3.connect(self.db) as conn:
            conn.execute('CREATE TABLE sample (value TEXT)')
            conn.execute("INSERT INTO sample VALUES ('fixture')")
        self.uploads = self.root / 'uploads'
        self.uploads.mkdir()
        (self.uploads / 'example.txt').write_text('synthetic attachment')
        self.key = self.root / 'fixture.key'
        self.key.write_bytes(os.urandom(48).hex().encode())
        self.key.chmod(0o600)
        self.backups = self.root / 'backups'
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        clock = self.bin / 'date'
        clock.write_text('#!/bin/sh\nprintf "20260914-000000\\n"\n')
        clock.chmod(0o700)
        self.env = dict(os.environ, BUSINESS_DATABASE_PATH=str(self.db),
                        BUSINESS_UPLOAD_PATH=str(self.uploads),
                        BUSINESS_BACKUP_DIRECTORY=str(self.backups),
                        BUSINESS_BACKUP_KEY_FILE=str(self.key),
                        PATH=str(self.bin) + os.pathsep + os.environ['PATH'])
        self.script = Path(__file__).with_name('business-control-backup.sh')

    def run_backup(self):
        return subprocess.run(['bash', str(self.script)], env=self.env,
                              capture_output=True, timeout=30)

    def test_archive_decrypts_and_sqlite_and_attachment_survive(self):
        self.assertEqual(self.run_backup().returncode, 0)
        archives = list(self.backups.glob('*.enc'))
        self.assertEqual(len(archives), 1)
        self.assertEqual(archives[0].stat().st_mode & 0o777, 0o600)
        plain = self.root / 'verified.tar.gz'
        subprocess.run(['openssl', 'enc', '-d', '-aes-256-cbc', '-pbkdf2',
                        '-iter', '200000', '-in', str(archives[0]), '-out', str(plain),
                        '-pass', 'file:' + str(self.key)], check=True, capture_output=True)
        out = self.root / 'restore'
        out.mkdir()
        subprocess.run(['tar', '-xzf', str(plain), '-C', str(out)], check=True)
        subprocess.run(['sha256sum', '-c', 'MANIFEST.sha256'], cwd=out,
                       check=True, capture_output=True)
        with sqlite3.connect(out / 'business-control.db') as conn:
            self.assertEqual(conn.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
            self.assertEqual(conn.execute('SELECT value FROM sample').fetchone()[0], 'fixture')
        self.assertEqual((out / 'uploads/example.txt').read_text(), 'synthetic attachment')
        self.assertFalse(list(self.backups.glob('.business-control-*')))

    def test_collision_preserves_first_archive_and_cleans_staging(self):
        self.assertEqual(self.run_backup().returncode, 0)
        archive = next(self.backups.glob('*.enc'))
        original = hashlib.sha256(archive.read_bytes()).hexdigest()
        with sqlite3.connect(self.db) as conn:
            conn.execute("INSERT INTO sample VALUES ('newer data')")
        self.assertNotEqual(self.run_backup().returncode, 0)
        self.assertEqual(hashlib.sha256(archive.read_bytes()).hexdigest(), original)
        self.assertEqual(len(list(self.backups.glob('*.enc'))), 1)
        self.assertFalse(list(self.backups.glob('.business-control-*')))

    def test_missing_key_publishes_nothing(self):
        self.key.unlink()
        self.assertNotEqual(self.run_backup().returncode, 0)
        self.assertFalse(list(self.backups.iterdir()))


if __name__ == '__main__':
    for executable in ('bash', 'sqlite3', 'tar', 'openssl', 'sha256sum'):
        if not shutil.which(executable):
            raise SystemExit('Missing fixture dependency: ' + executable)
    unittest.main()
