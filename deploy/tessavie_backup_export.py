#!/usr/bin/env python3
"""Publish encrypted-only backups and serve a restricted SSH read protocol."""
import contextlib
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import tempfile

SOURCE = Path('/var/backups/business-control')
EXPORT = Path('/var/spool/tessavie-backup-export')
GROUP = 'tessavie-backup-reader'
NAME = re.compile(r'business-control-[0-9]{8}-[0-9]{6}\.tar\.gz\.enc\Z')
SHA = re.compile(r'[0-9a-f]{64}\Z')
MAX_COUNT, MAX_FILE, MAX_TOTAL = 128, 512 * 1024**2, 1024**3
FREE_FLOOR = 512 * 1024**2
MANIFEST = 'manifest.json'


def directory(path):
    if not stat.S_ISDIR(path.lstat().st_mode):
        raise ValueError('Expected a real directory')


def own(path, mode, gid):
    os.chown(path, 0, gid, follow_symlinks=False)
    os.chmod(path, mode, follow_symlinks=False)


@contextlib.contextmanager
def opened(path):
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode):
        raise ValueError('Only regular files are allowed')
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    with os.fdopen(fd, 'rb') as stream:
        current = os.fstat(stream.fileno())
        if (before.st_dev, before.st_ino) != (current.st_dev, current.st_ino):
            raise ValueError('File changed while opening')
        yield stream


def fingerprint(stream):
    s = os.fstat(stream.fileno())
    return (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)


def digest(stream, target=None):
    result, size = hashlib.sha256(), 0
    while chunk := stream.read(1024 * 1024):
        size += len(chunk)
        if size > MAX_FILE:
            raise ValueError('Archive exceeds the file budget')
        result.update(chunk)
        if target is not None:
            target.write(chunk)
    return size, result.hexdigest()


def describe(path):
    with opened(path) as stream:
        before = fingerprint(stream)
        if not 0 < before[2] <= MAX_FILE:
            raise ValueError('Invalid archive size')
        size, sha = digest(stream)
        if before != fingerprint(stream):
            raise ValueError('Archive changed during verification')
        return {'name': path.name, 'size': size, 'sha256': sha,
                'mtime_unix': before[3] // 10**9}, before


def validate_manifest(value):
    if not isinstance(value, dict) or set(value) != {'version', 'entries'} or type(value['version']) is not int or value['version'] != 1:
        raise ValueError('Invalid manifest format')
    entries = value['entries']
    if not isinstance(entries, list) or not 0 < len(entries) <= MAX_COUNT:
        raise ValueError('Invalid manifest count')
    names, total = set(), 0
    for entry in entries:
        if not isinstance(entry, dict) or set(entry) != {'name', 'size', 'sha256', 'mtime_unix'}:
            raise ValueError('Invalid manifest entry')
        name, size, sha, mtime = (entry[k] for k in ('name', 'size', 'sha256', 'mtime_unix'))
        if not isinstance(name, str) or not NAME.fullmatch(name) or name in names:
            raise ValueError('Invalid or duplicate archive name')
        datetime.strptime(name[len('business-control-'):-len('.tar.gz.enc')], '%Y%m%d-%H%M%S')
        if type(size) is not int or not 0 < size <= MAX_FILE:
            raise ValueError('Invalid archive size')
        if not isinstance(sha, str) or not SHA.fullmatch(sha) or type(mtime) is not int or mtime <= 0:
            raise ValueError('Invalid archive metadata')
        names.add(name)
        total += size
    if total > MAX_TOTAL:
        raise ValueError('Archive set exceeds the total budget')
    return value


def read_manifest(destination):
    directory(destination)
    with opened(destination / MANIFEST) as stream:
        data = stream.read(128 * 1024 + 1)
    if len(data) > 128 * 1024:
        raise ValueError('Manifest is too large')
    return validate_manifest(json.loads(data))


def sync_directory(path):
    if os.name == 'posix':
        fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


@contextlib.contextmanager
def temporary(destination, gid):
    fd, name = tempfile.mkstemp(prefix='.export-', suffix='.partial', dir=destination)
    path = Path(name)
    try:
        with os.fdopen(fd, 'wb') as stream:
            own(path, 0o440, gid)
            yield stream, path
            if not stream.closed:
                stream.flush()
                os.fsync(stream.fileno())
    finally:
        path.unlink(missing_ok=True)


def copy_archive(source, destination, entry, expected, gid):
    with temporary(destination, gid) as (output, temporary_path):
        with opened(source / entry['name']) as stream:
            if fingerprint(stream) != expected:
                raise ValueError('Source changed after planning')
            size, sha = digest(stream, output)
            if fingerprint(stream) != expected or (size, sha) != (entry['size'], entry['sha256']):
                raise ValueError('Source changed while copying')
        output.flush()
        os.fsync(output.fileno())
        output.close()
        # A hard link publishes atomically and refuses to replace any existing name.
        os.link(temporary_path, destination / entry['name'], follow_symlinks=False)


@contextlib.contextmanager
def export_lock(destination, gid):
    import fcntl
    lock = destination / '.export.lock'
    fd = os.open(lock, os.O_CREAT | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise ValueError('Invalid export lock')
        own(lock, 0o600, gid)
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        os.close(fd)


def export_archives(source=SOURCE, destination=EXPORT, gid=None):
    """Root publisher; explicit paths are for isolated tests, never SSH input."""
    if gid is None:
        import grp
        gid = grp.getgrnam(GROUP).gr_gid
    directory(source)
    candidates = sorted(p for p in source.iterdir() if NAME.fullmatch(p.name))
    if not 0 < len(candidates) <= MAX_COUNT:
        raise ValueError('Source count exceeds budget or is empty')
    # Check size budgets before reading archive bodies or changing publication.
    sizes = [p.lstat().st_size for p in candidates]
    if any(not 0 < size <= MAX_FILE for size in sizes) or sum(sizes) > MAX_TOTAL:
        raise ValueError('Source sizes exceed budget')
    planned = [describe(path) for path in candidates]
    manifest = validate_manifest({'version': 1, 'entries': [item[0] for item in planned]})
    destination.mkdir(mode=0o750, exist_ok=True)
    directory(destination)
    own(destination, 0o750, gid)
    with export_lock(destination, gid):
        existing = {}
        for path in destination.iterdir():
            if path.name in (MANIFEST, '.export.lock'):
                with opened(path):
                    pass
            elif NAME.fullmatch(path.name):
                existing[path.name] = describe(path)[0]
            else:
                raise ValueError('Unexpected object in export directory')
        missing = []
        for entry, expected in planned:
            old = existing.get(entry['name'])
            if old and (old['size'], old['sha256']) != (entry['size'], entry['sha256']):
                raise ValueError('Published archive name changed content')
            if old is None:
                missing.append((entry, expected))
        if shutil.disk_usage(destination).free < FREE_FLOOR + sum(e['size'] for e, _ in missing) + 1024**2:
            raise ValueError('Insufficient free-space reserve')
        for entry, expected in missing:
            copy_archive(source, destination, entry, expected, gid)
        with temporary(destination, gid) as (stream, path):
            stream.write((json.dumps(manifest, sort_keys=True) + '\n').encode())
            stream.flush()
            os.fsync(stream.fileno())
            stream.close()
            os.replace(path, destination / MANIFEST)
        sync_directory(destination)
        # Only disposable encrypted export duplicates are removed, after publication.
        wanted = {entry['name'] for entry in manifest['entries']}
        for name in existing.keys() - wanted:
            path = destination / name
            with opened(path):
                pass
            path.unlink()
        sync_directory(destination)
    return manifest


def serve(command, destination=EXPORT, output=None):
    output = sys.stdout.buffer if output is None else output
    if command != 'list-v1' and not re.fullmatch(r'get-v1 (business-control-[0-9]{8}-[0-9]{6}\.tar\.gz\.enc)', command):
        raise ValueError('Unsupported backup command')
    manifest = read_manifest(destination)
    if command == 'list-v1':
        output.write((json.dumps(manifest, sort_keys=True) + '\n').encode())
        return
    name = command[len('get-v1 '):]
    entry = next((entry for entry in manifest['entries'] if entry['name'] == name), None)
    if entry is None:
        raise ValueError('Archive is not published')
    with opened(destination / name) as stream:
        before = fingerprint(stream)
        if digest(stream) != (entry['size'], entry['sha256']) or fingerprint(stream) != before:
            raise ValueError('Published archive verification failed')
        stream.seek(0)
        remaining = entry['size']
        while remaining:
            chunk = stream.read(min(remaining, 1024 * 1024))
            if not chunk:
                raise ValueError('Archive was truncated while serving')
            output.write(chunk)
            remaining -= len(chunk)
        if stream.read(1):
            raise ValueError('Archive grew while serving')
        if fingerprint(stream) != before:
            raise ValueError('Archive changed while serving')


def main():
    if sys.argv[1:] == ['read']:
        serve(os.environ.get('SSH_ORIGINAL_COMMAND', ''))
    elif sys.argv[1:] == ['export'] and os.geteuid() == 0:
        result = export_archives()
        print(json.dumps({'exported_count': len(result['entries']),
                          'exported_bytes': sum(e['size'] for e in result['entries'])}))
    else:
        raise ValueError('Use export as root, or read via the restricted SSH key')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError) as error:
        print('Backup export refused: ' + str(error), file=sys.stderr)
        sys.exit(1)
