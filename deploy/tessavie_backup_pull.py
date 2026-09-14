#!/usr/bin/env python3
"""Pull verified encrypted backups through a restricted SSH reader; never prune."""
import argparse
import contextlib
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import tempfile
import threading

MIB = 1024 ** 2
GIB = 1024 ** 3
NAME = re.compile(r"business-control-(\d{8}-\d{6})\.tar\.gz\.enc\Z")
SHA = re.compile(r"[0-9a-f]{64}\Z")
DEFAULTS = {"max_entries": 128, "max_file_bytes": 512 * MIB,
            "max_vault_bytes": 2 * GIB, "min_free_bytes": 2 * GIB,
            "timeout_seconds": 300, "max_source_age_seconds": 48 * 3600}
CEILINGS = {"max_entries": 4096, "max_file_bytes": 1024 * GIB,
            "max_vault_bytes": 1024 * 1024 * GIB, "min_free_bytes": 1024 * GIB,
            "timeout_seconds": 300, "max_source_age_seconds": 365 * 86400}


class BackupError(Exception):
    """Messages are fixed codes, safe for journal/status output."""


def safe_path(value, directory=False):
    path = Path(value)
    if not path.is_absolute() or ".." in path.parts:
        raise BackupError("unsafe_path")
    for part in [*reversed(path.parents), path]:
        if part.is_symlink():
            raise BackupError("symlink_path")
    if directory and not path.is_dir():
        raise BackupError("missing_directory")
    if directory and os.name == "posix" and path.stat().st_mode & 0o022:
        raise BackupError("writable_shared_directory")
    return path


def regular_fd(path, flags=os.O_RDONLY, mode=0o600):
    fd = os.open(path, flags | getattr(os, "O_NOFOLLOW", 0), mode)
    if not stat.S_ISREG(os.fstat(fd).st_mode):
        os.close(fd)
        raise BackupError("not_regular_file")
    return fd


def read_json(path, limit=1024 * 1024):
    with os.fdopen(regular_fd(safe_path(path)), "rb") as stream:
        raw = stream.read(limit + 1)
    if len(raw) > limit:
        raise BackupError("json_too_large")
    return json.loads(raw)


def config_from(path):
    path = safe_path(path)
    st = path.stat()
    if st.st_uid != 0 or st.st_mode & 0o022:
        raise BackupError("insecure_config")
    config = read_json(path)
    if not isinstance(config, dict):
        raise BackupError("invalid_config")
    if (config.get("source_host") != "159.194.231.150" or
            config.get("source_port") != 22 or
            config.get("source_user") != "tessavie-backup-reader"):
        raise BackupError("unexpected_source")
    for key, value in DEFAULTS.items():
        config.setdefault(key, value)
        if type(config[key]) is not int or not 1 <= config[key] <= CEILINGS[key]:
            raise BackupError("invalid_limit")
    for key in ("identity_file", "known_hosts", "vault_dir", "state_path"):
        safe_path(config[key])
    return config


class SSHTransport:
    def __init__(self, config):
        self.timeout = config["timeout_seconds"]
        self.args = ["ssh", "-F", "/dev/null", "-T", "-p", str(config["source_port"]),
                     "-i", config["identity_file"], "-o", "BatchMode=yes",
                     "-o", "StrictHostKeyChecking=yes", "-o", "IdentitiesOnly=yes",
                     "-o", "UserKnownHostsFile=" + config["known_hosts"],
                     "-o", "GlobalKnownHostsFile=/dev/null", "-o", "ConnectTimeout=10",
                     "-o", "ClearAllForwardings=yes", "-o", "ForwardAgent=no",
                     "-o", "ForwardX11=no", "-o", "ServerAliveInterval=15",
                     "-o", "ServerAliveCountMax=2",
                     config["source_user"] + "@" + config["source_host"]]

    @contextlib.contextmanager
    def stream(self, command):
        proc = subprocess.Popen(self.args + [command], stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        expired = threading.Event()
        def expire():
            expired.set()
            try:
                proc.kill()
            except ProcessLookupError:
                pass
        timer = threading.Timer(self.timeout, expire)
        timer.daemon = True
        timer.start()
        try:
            yield proc.stdout
            code = proc.wait(timeout=self.timeout)
            if expired.is_set():
                raise BackupError("ssh_timeout")
            if code:
                raise BackupError("ssh_failed")
        finally:
            timer.cancel()
            if proc.poll() is None:
                proc.kill()
            proc.wait()
            proc.stdout.close()


def manifest(transport, config):
    with transport.stream("list-v1") as stream:
        raw = stream.read(1024 * 1024 + 1)
    if len(raw) > 1024 * 1024:
        raise BackupError("manifest_too_large")
    data = json.loads(raw)
    if (not isinstance(data, dict) or type(data.get("version")) is not int or data["version"] != 1 or
            not isinstance(data.get("entries"), list) or
            not 1 <= len(data["entries"]) <= config["max_entries"]):
        raise BackupError("invalid_manifest")
    seen = set()
    for entry in data["entries"]:
        if not isinstance(entry, dict):
            raise BackupError("invalid_entry")
        name, size, digest, modified = (entry.get(key) for key in
                                        ("name", "size", "sha256", "mtime_unix"))
        match = NAME.fullmatch(name) if isinstance(name, str) else None
        if (not match or name in seen or type(size) is not int or
                not 0 < size <= config["max_file_bytes"] or
                not isinstance(digest, str) or not SHA.fullmatch(digest) or
                type(modified) not in (int, float) or
                not math.isfinite(modified) or modified <= 0):
            raise BackupError("invalid_entry")
        try:
            timestamp = dt.datetime.strptime(match[1], "%Y%m%d-%H%M%S").replace(tzinfo=dt.timezone.utc)
        except ValueError:
            raise BackupError("invalid_archive_date") from None
        if timestamp > dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=10):
            raise BackupError("future_archive")
        seen.add(name)
    return sorted(data["entries"], key=lambda entry: entry["name"])


def digest_file(path):
    with os.fdopen(regular_fd(safe_path(path)), "rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def pull(config, transport):
    vault = safe_path(config["vault_dir"], directory=True)
    entries = manifest(transport, config)  # Validate every remote name before writes.
    occupied = 0
    for path in vault.iterdir():
        st = path.lstat()
        if not stat.S_ISREG(st.st_mode):
            raise BackupError("unexpected_vault_entry")
        occupied += st.st_size  # Include unknown files and abandoned partials.
    missing = []
    for entry in entries:
        path = vault / entry["name"]
        if path.exists():
            if path.stat().st_size != entry["size"] or digest_file(path) != entry["sha256"]:
                raise BackupError("existing_archive_conflict")
        else:
            missing.append(entry)
    needed = sum(entry["size"] for entry in missing)
    if occupied + needed > config["max_vault_bytes"]:
        raise BackupError("vault_budget_exceeded")
    if shutil.disk_usage(vault).free - needed < config["min_free_bytes"]:
        raise BackupError("free_space_reserve")
    downloaded = 0
    for entry in missing:
        if shutil.disk_usage(vault).free - entry["size"] < config["min_free_bytes"]:
            raise BackupError("free_space_reserve")
        fd, temporary = tempfile.mkstemp(prefix=".pull-", suffix=".partial", dir=vault)
        try:
            size, digest = 0, hashlib.sha256()
            with os.fdopen(fd, "wb") as output:
                with transport.stream("get-v1 " + entry["name"]) as stream:
                    while True:
                        block = stream.read(1024 * 1024)
                        if not block:
                            break
                        size += len(block)
                        if size > entry["size"]:
                            raise BackupError("download_size_mismatch")
                        output.write(block)
                        digest.update(block)
                if size != entry["size"] or digest.hexdigest() != entry["sha256"]:
                    raise BackupError("download_verification_failed")
                output.flush()
                os.fsync(output.fileno())
            # Hardlink publishes atomically and fails if another file already exists.
            os.link(temporary, vault / entry["name"], follow_symlinks=False)
            sync_directory(vault)
            downloaded += 1
        finally:
            os.unlink(temporary)  # Only the exclusive temporary file created above.
    latest = entries[-1]
    latest_time = dt.datetime.strptime(NAME.fullmatch(latest["name"])[1],
                                      "%Y%m%d-%H%M%S").replace(tzinfo=dt.timezone.utc)
    age = max(0, int((dt.datetime.now(dt.timezone.utc) - latest_time).total_seconds()))
    return {"downloaded": downloaded, "source_archives": len(entries),
            "retained_bytes": occupied + needed, "newest_source_archive": latest["name"],
            "newest_source_archive_time": latest_time.isoformat(),
            "source_age_seconds": age,
            "source_fresh": age <= config["max_source_age_seconds"]}


def write_status(path, value):
    path = safe_path(path)
    safe_path(path.parent, directory=True)
    fd, temporary = tempfile.mkstemp(prefix=".status-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            json.dump(value, output, sort_keys=True)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        sync_directory(path.parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def run(config, transport):
    import fcntl  # Runtime-only: isolated transport tests also run on Windows.
    state = safe_path(config["state_path"])
    safe_path(state.parent, directory=True)
    lock_fd = regular_fd(state.parent / "pull.lock", os.O_WRONLY | os.O_CREAT)
    try:
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise BackupError("already_running") from None
        previous = read_json(state) if state.exists() else {}
        if not isinstance(previous, dict):
            raise BackupError("invalid_previous_status")
        status = {"version": 1, "checked_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                  "last_success_at": previous.get("last_success_at"),
                  "newest_source_archive": previous.get("newest_source_archive"),
                  "newest_source_archive_time": previous.get("newest_source_archive_time")}
        try:
            status.update(pull(config, transport))
            if not status["source_fresh"]:
                raise BackupError("source_archive_stale")
            status.update(ok=True, last_success_at=dt.datetime.now(dt.timezone.utc).isoformat())
        except Exception as error:
            status.update(ok=False, error=str(error) if isinstance(error, BackupError) else "operation_failed")
            write_status(state, status)
            print(json.dumps(status, sort_keys=True))
            return 1
        write_status(state, status)
        print(json.dumps(status, sort_keys=True))
        return 0
    finally:
        os.close(lock_fd)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="/etc/tessavie-backup-pull.json")
    args = parser.parse_args()
    def interrupted(signum, frame):
        raise BackupError("interrupted")
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        config = config_from(args.config)
        return run(config, SSHTransport(config))
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error) if isinstance(error, BackupError) else "configuration_or_state_failed"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
