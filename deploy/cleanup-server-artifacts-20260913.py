#!/usr/bin/env python3
"""Reviewed, one-shot release/tmp cleanup. Never deletes databases or backups.

Default creates a plan. --apply-plan accepts that exact unchanged plan only.
Run on the authorised production host; see the accompanying operations report.
"""
import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess

RELEASES = Path('/opt/business-control/releases')
CURRENT = Path('/opt/business-control/current')
BACKUPS = Path('/var/lib/business-control/backups')
TMP = Path('/tmp')
REPORTS = Path('/var/log/business-control-maintenance')
NAME = re.compile(r'^\d{8}-[a-zA-Z0-9_-]+-([0-9a-f]{7,40})$')


def fingerprint(path):
    s = path.lstat()
    return [s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_mode]


def elf(path):
    if not stat.S_ISREG(path.lstat().st_mode):
        return False
    with path.open('rb') as f:
        return f.read(4) == b'\x7fELF'


def occupied_paths():
    result = set()
    for proc in Path('/proc').glob('[0-9]*'):
        for entry in [proc / 'exe', proc / 'cwd', *list((proc / 'fd').glob('*'))]:
            try:
                result.add(os.readlink(entry).removesuffix(' (deleted)'))
            except OSError:
                pass
        try:
            for line in (proc / 'maps').read_text().splitlines():
                parts = line.split(None, 5)
                if len(parts) == 6 and parts[5].startswith('/'):
                    result.add(parts[5].removesuffix(' (deleted)'))
        except OSError:
            pass
    return result


def in_use(path, occupied):
    name = str(path)
    return any(x == name or x.startswith(name + '/') for x in occupied)


def check_services():
    state = subprocess.check_output(
        ['systemctl', 'show', 'business-control-backup.service', '-p', 'ActiveState', '--value'],
        text=True).strip()
    if state not in ('inactive', 'failed'):
        raise RuntimeError('Backup is active; retry after its completion')
    if subprocess.check_output(['systemctl', 'is-active', 'business-control.service'], text=True).strip() != 'active':
        raise RuntimeError('Production service must be active')


def inspect_release(path):
    if path.is_symlink() or not path.is_dir() or path.resolve().parent != RELEASES:
        return None
    children = list(path.iterdir())
    binary = path / 'business-control'
    if children != [binary] or not elf(binary):
        return None
    return {'path': str(path), 'directory_stat': fingerprint(path),
            'file_stat': fingerprint(binary), 'allocated_bytes': binary.stat().st_blocks * 512 + path.stat().st_blocks * 512,
            'commit_hint': NAME.fullmatch(path.name).group(1) if NAME.fullmatch(path.name) else None}


def build_plan(now, pins=()):
    check_services()
    for root in (RELEASES, BACKUPS, TMP):
        if root.is_symlink() or root.resolve() != root:
            raise RuntimeError('Unexpected root path')
    current = CURRENT.resolve(strict=True)
    if current.parent != RELEASES:
        raise RuntimeError('Current release is outside expected root')
    occupied = occupied_paths()
    dirs = sorted([p for p in RELEASES.iterdir() if p.is_dir() and not p.is_symlink()], key=lambda p: p.stat().st_mtime)
    keep = {str(current): ['current']}
    def protect(path, reason):
        if path.parent != RELEASES or path.is_symlink() or not path.is_dir():
            raise RuntimeError('Invalid protected release path')
        keep.setdefault(str(path), []).append(reason)
    for pin in pins:
        protect(Path(pin), 'explicit operator pin')
    for p in dirs:
        if in_use(p, occupied):
            protect(p, 'open executable, mapping or descriptor')
        if p.stat().st_mtime >= now - 72 * 3600:
            protect(p, 'last 72 hours')
    days = {}
    for p in dirs:
        if p.stat().st_mtime >= now - 14 * 86400:
            days[dt.datetime.fromtimestamp(p.stat().st_mtime, dt.timezone.utc).date().isoformat()] = p
    for day, p in days.items():
        protect(p, 'last release on UTC day ' + day)
    bundles = sorted([p for p in BACKUPS.iterdir() if p.is_dir() and not p.is_symlink()], key=lambda p: p.stat().st_mtime, reverse=True)[:7]
    if len(bundles) != 7:
        raise RuntimeError('Expected seven recent cutover bundles')
    for bundle in bundles:
        for name in ['cutover.db', 'cutover-uploads.tar.gz', 'SHA256SUMS', 'previous-release.txt', 'candidate-commit.txt']:
            if not (bundle / name).is_file() or (bundle / name).is_symlink():
                raise RuntimeError('Incomplete recent cutover bundle: ' + bundle.name)
        protect(Path((bundle / 'previous-release.txt').read_text().strip()), 'cutover ' + bundle.name)
        commit = (bundle / 'candidate-commit.txt').read_text().strip()
        if not re.fullmatch(r'[0-9a-f]{40}', commit):
            raise RuntimeError('Invalid candidate commit')
        matches = [p for p in dirs if NAME.fullmatch(p.name) and commit.startswith(NAME.fullmatch(p.name).group(1))]
        if not matches:
            raise RuntimeError('Candidate binary missing for ' + bundle.name)
        for p in matches:
            protect(p, 'candidate of ' + bundle.name)
    candidates, skipped = [], []
    for p in dirs:
        if str(p) in keep:
            continue
        item = inspect_release(p)
        if item is None or item['commit_hint'] is None:
            skipped.append(p.name)
        else:
            item['kind'] = 'release'
            candidates.append(item)
    for p in sorted(TMP.iterdir()):
        if not p.name.startswith('business-control-') or p.is_symlink() or not p.is_file():
            continue
        if p.stat().st_mtime >= now - 7 * 86400 or in_use(p, occupied) or not elf(p):
            continue
        candidates.append({'kind': 'tmp_elf', 'path': str(p), 'file_stat': fingerprint(p), 'allocated_bytes': p.stat().st_blocks * 512})
    return {'version': 1, 'policy_time_unix': now, 'explicit_pins': list(pins), 'current': str(current),
            'current_binary_sha256': hashlib.sha256((current / 'business-control').read_bytes()).hexdigest(),
            'preserved_releases': keep, 'recent_bundles': [p.name for p in bundles],
            'skipped_unknown_releases': skipped, 'candidates': candidates,
            'all_backups_preserved': True}


def summary(plan):
    return {kind: {'count': sum(x['kind'] == kind for x in plan['candidates']),
                   'allocated_bytes': sum(x['allocated_bytes'] for x in plan['candidates'] if x['kind'] == kind)}
            for kind in ['release', 'tmp_elf']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    parser.add_argument('--apply-plan')
    parser.add_argument('--pin-release', action='append', default=[])
    args = parser.parse_args()
    output = Path(args.output)
    if output.parent != REPORTS or output.resolve() != output or output.suffix != '.json' or output.exists():
        raise RuntimeError('Output must be a new JSON file in the maintenance directory')
    if args.apply_plan:
        source = Path(args.apply_plan)
        if source.parent != REPORTS or source.resolve() != source or source.suffix != '.json' or not source.is_file():
            raise RuntimeError('Plan must be a regular JSON file in the maintenance directory')
    with contextlib.ExitStack() as stack:
        for name in ['/run/business-control-deploy.lock', '/run/lock/business-control-deploy.lock']:
            handle = stack.enter_context(open(name, 'a'))
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if not args.apply_plan:
            now = dt.datetime.now(dt.timezone.utc).timestamp()
            plan = build_plan(now, sorted(set(args.pin_release)))
            Path(args.output).write_text(json.dumps(plan, indent=2) + '\n')
            print(json.dumps({'mode': 'plan', 'current': plan['current'], 'preserved_release_count': len(plan['preserved_releases']), 'skipped': len(plan['skipped_unknown_releases']), 'candidates': summary(plan)}))
            return
        plan = json.loads(Path(args.apply_plan).read_text())
        if args.pin_release or build_plan(plan['policy_time_unix'], plan['explicit_pins']) != plan:
            raise RuntimeError('State changed since plan; no deletion performed')
        receipt = {'current': plan['current'], 'before_free_bytes': os.statvfs('/').f_bavail * os.statvfs('/').f_frsize, 'deleted': []}
        Path(args.output).write_text(json.dumps(receipt, indent=2) + '\n')
        for item in plan['candidates']:
            check_services()
            if str(CURRENT.resolve()) != plan['current'] or in_use(Path(item['path']), occupied_paths()):
                raise RuntimeError('Active paths changed; remaining candidates preserved')
            path = Path(item['path'])
            if item['kind'] == 'release':
                inspected = inspect_release(path)
                if inspected != {k: v for k, v in item.items() if k != 'kind'}:
                    raise RuntimeError('Release fingerprint changed')
                (path / 'business-control').unlink()
                path.rmdir()  # Never recursive: an unexpected new file aborts deletion.
            else:
                if path.parent != TMP or path.is_symlink() or fingerprint(path) != item['file_stat'] or not elf(path):
                    raise RuntimeError('Temporary binary fingerprint changed')
                path.unlink()
            receipt['deleted'].append(item)
            Path(args.output).write_text(json.dumps(receipt, indent=2) + '\n')
        receipt['after_free_bytes'] = os.statvfs('/').f_bavail * os.statvfs('/').f_frsize
        receipt['all_backups_preserved'] = True
        Path(args.output).write_text(json.dumps(receipt, indent=2) + '\n')
        print(json.dumps({'mode': 'applied', 'deleted': summary(plan), 'before_free_bytes': receipt['before_free_bytes'], 'after_free_bytes': receipt['after_free_bytes']}))


if __name__ == '__main__':
    main()
