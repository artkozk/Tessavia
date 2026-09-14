#!/usr/bin/env python3
"""Isolated backup client tests; no production files, SSH, or root required."""
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import tessavie_backup_pull as client

A = "business-control-20260912-021501.tar.gz.enc"
B = "business-control-20260913-021501.tar.gz.enc"


class FakeTransport:
    def __init__(self, files, entries=None, interrupt=False):
        self.files, self.interrupt, self.downloads = files, interrupt, []
        self.entries = entries if entries is not None else [
            {"name": name, "size": len(data), "sha256": hashlib.sha256(data).hexdigest(),
             "mtime_unix": 1789265701} for name, data in files.items()]

    @contextlib.contextmanager
    def stream(self, command):
        if command == "list-v1":
            yield io.BytesIO(json.dumps({"version": 1, "entries": self.entries}).encode())
        else:
            name = command.removeprefix("get-v1 ")
            self.downloads.append(name)
            yield io.BytesIO(self.files[name])
            if self.interrupt:
                raise client.BackupError("ssh_failed")


class PullTests(unittest.TestCase):
    def setUp(self):
        clock = patch.object(client.dt, "datetime", wraps=client.dt.datetime)
        fixed_now = client.dt.datetime(2026, 9, 14, 12, tzinfo=client.dt.timezone.utc)
        clock.start().now.return_value = fixed_now
        self.addCleanup(clock.stop)
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.vault = self.root / "vault"
        self.vault.mkdir()
        self.config = {**client.DEFAULTS, "vault_dir": str(self.vault),
                       "min_free_bytes": 1, "max_source_age_seconds": 365 * 86400,
                       "state_path": str(self.root / "status.json")}
        # Directory fsync is Linux-only. The data protocol remains testable on Windows.
        if os.name == "nt":
            self.addCleanup(patch.stopall)
            patch.object(client, "sync_directory").start()

    def assert_clean(self):
        self.assertFalse(list(self.vault.glob("*.partial")))

    def test_verified_idempotent_no_mirror_deletions(self):
        first = FakeTransport({A: b"older", B: b"latest"})
        result = client.pull(self.config, first)
        self.assertEqual(result["downloaded"], 2)
        second = FakeTransport({B: b"latest"})
        self.assertEqual(client.pull(self.config, second)["downloaded"], 0)
        self.assertEqual(second.downloads, [])
        self.assertEqual((self.vault / A).read_bytes(), b"older")
        self.assertEqual(result["newest_source_archive_time"], "2026-09-13T02:15:01+00:00")
        self.assert_clean()

    def test_bad_hash_cannot_publish(self):
        transport = FakeTransport({A: b"data"})
        transport.entries[0]["sha256"] = "0" * 64
        with self.assertRaisesRegex(client.BackupError, "download_verification_failed"):
            client.pull(self.config, transport)
        self.assertEqual(list(self.vault.iterdir()), [])

    def test_interruption_cannot_publish(self):
        with self.assertRaisesRegex(client.BackupError, "ssh_failed"):
            client.pull(self.config, FakeTransport({A: b"data"}, interrupt=True))
        self.assertEqual(list(self.vault.iterdir()), [])

    def test_wrong_size_cannot_publish(self):
        for size in (2, 8):
            transport = FakeTransport({A: b"data"})
            transport.entries[0]["size"] = size
            with self.assertRaises(client.BackupError):
                client.pull(self.config, transport)
            self.assertEqual(list(self.vault.iterdir()), [])

    def test_existing_name_different_hash_never_overwritten(self):
        (self.vault / A).write_bytes(b"keep")
        transport = FakeTransport({A: b"evil"})
        with self.assertRaisesRegex(client.BackupError, "existing_archive_conflict"):
            client.pull(self.config, transport)
        self.assertEqual((self.vault / A).read_bytes(), b"keep")
        self.assertEqual(transport.downloads, [])

    def test_all_names_checked_before_first_download(self):
        for name in ("../outside", "/tmp/outside", "business-control-20260231-021501.tar.gz.enc",
                     A + "\n", "business-control-20260912-021501.tar.gz.enc;id"):
            transport = FakeTransport({A: b"valid", name: b"evil"})
            with self.assertRaises(client.BackupError):
                client.pull(self.config, transport)
            self.assertEqual(transport.downloads, [])
            self.assertEqual(list(self.vault.iterdir()), [])

    def test_unknown_files_count_toward_budget_and_survive(self):
        unknown = self.vault / "unknown.enc"
        unknown.write_bytes(b"keep")
        self.config["max_vault_bytes"] = 7
        transport = FakeTransport({A: b"data"})
        with self.assertRaisesRegex(client.BackupError, "vault_budget_exceeded"):
            client.pull(self.config, transport)
        self.assertEqual(unknown.read_bytes(), b"keep")
        self.assertEqual(transport.downloads, [])

    def test_free_space_checked_before_download(self):
        transport = FakeTransport({A: b"data"})
        self.config["min_free_bytes"] = 10
        with patch.object(client.shutil, "disk_usage", return_value=type("Disk", (), {"free": 12})()):
            with self.assertRaisesRegex(client.BackupError, "free_space_reserve"):
                client.pull(self.config, transport)
        self.assertEqual(transport.downloads, [])

    def test_symlink_archive_rejected(self):
        target = self.root / "protected"
        target.write_bytes(b"keep")
        try:
            (self.vault / A).symlink_to(target)
        except OSError:
            self.skipTest("Symlink creation not permitted on this OS")
        with self.assertRaisesRegex(client.BackupError, "unexpected_vault_entry"):
            client.pull(self.config, FakeTransport({A: b"evil"}))
        self.assertEqual(target.read_bytes(), b"keep")

    def test_symlink_parent_rejected(self):
        alias = self.root / "alias"
        try:
            alias.symlink_to(self.vault, target_is_directory=True)
        except OSError:
            self.skipTest("Symlink creation not permitted on this OS")
        self.config["vault_dir"] = str(alias)
        with self.assertRaisesRegex(client.BackupError, "symlink_path"):
            client.pull(self.config, FakeTransport({A: b"data"}))

    def test_empty_or_duplicate_manifest_rejected(self):
        transport = FakeTransport({A: b"data"})
        for entries in ([], transport.entries * 2):
            with self.assertRaises(client.BackupError):
                client.pull(self.config, FakeTransport({}, entries=entries))

    def test_concurrent_destination_creation_never_overwritten(self):
        outer = self
        class RacingTransport(FakeTransport):
            @contextlib.contextmanager
            def stream(self, command):
                with super().stream(command) as stream:
                    yield stream
                if command.startswith("get-v1"):
                    (outer.vault / A).write_bytes(b"keep")
        with self.assertRaises(FileExistsError):
            client.pull(self.config, RacingTransport({A: b"data"}))
        self.assertEqual((self.vault / A).read_bytes(), b"keep")
        self.assert_clean()

    @unittest.skipIf(os.name == "nt", "fcntl lock requires Linux")
    def test_stale_source_keeps_download_but_reports_failure(self):
        self.config["max_source_age_seconds"] = 1
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(client.run(self.config, FakeTransport({A: b"data"})), 1)
        status = json.loads(Path(self.config["state_path"]).read_text())
        self.assertFalse(status["ok"])
        self.assertFalse(status["source_fresh"])
        self.assertEqual(status["error"], "source_archive_stale")
        self.assertIsNone(status["last_success_at"])
        self.assertEqual((self.vault / A).read_bytes(), b"data")

    @unittest.skipIf(os.name == "nt", "fcntl lock requires Linux")
    def test_failure_status_preserves_last_success(self):
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(client.run(self.config, FakeTransport({A: b"good"})), 0)
            first = json.loads(Path(self.config["state_path"]).read_text())
            self.assertEqual(client.run(self.config, FakeTransport({A: b"evil"})), 1)
        failed = json.loads(Path(self.config["state_path"]).read_text())
        self.assertFalse(failed["ok"])
        self.assertEqual(failed["last_success_at"], first["last_success_at"])
        self.assertEqual(failed["newest_source_archive_time"], first["newest_source_archive_time"])
        self.assertEqual(failed["error"], "existing_archive_conflict")


if __name__ == "__main__":
    unittest.main()
