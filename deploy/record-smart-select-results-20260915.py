"""Record the single smart-select task only after exact deployed-release checks.

Default mode is read-only for cards; --apply appends evidence and completes only
6e4ab145a88d1433c217b3cd5840d2dc. The short-lived local session is always removed.
Reuse the audited append/CAS/proof helpers; no parent or unrelated task writes.

Required --acceptance JSON contains true goTests/goVet/schemaUnchanged/
rollbackTrial/selectUnitTests, actual integer nodeTests/buildInputs/verifierTests,
viewports [320,390,1280], a factual browserSummary and physicalPhoneVerified:false.
It is the operator's record of completed checks, not a substitute for running them.
"""
import argparse
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('native_result_helpers', ROOT / 'record-native-widget-results-20260915.py')
helpers = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(helpers)
require = helpers.require
TASK_ID = '6e4ab145a88d1433c217b3cd5840d2dc'
PARENT_ID = '17b1c09b1f9d54518a4459e57715cff1'
TASK_TITLE = 'P1 · Выпадающие списки рядом с полем на телефоне и компьютере'
REQUEST_MARKER = '[request:smart-select-position-20260915]'
RESULT_MARKER = '[release:smart-select-position-20260915]'
CACHE = '20260915-smart-select-1'
PREVIOUS = '/opt/business-control/releases/20260914-android-widget-8304391'
WORKSPACE = 'bizflow-team'
OPERATOR = 1


def validate_acceptance(value):
    require(isinstance(value, dict), 'Acceptance must be an object')
    for name in ('goTests', 'goVet', 'schemaUnchanged', 'rollbackTrial', 'selectUnitTests'):
        require(value.get(name) is True, 'Missing completed check: ' + name)
    for name, minimum in (('nodeTests', 621), ('buildInputs', 522), ('verifierTests', 12)):
        require(type(value.get(name)) is int and value[name] >= minimum, 'Missing actual check count: ' + name)
    require(isinstance(value.get('viewports'), list) and set(value['viewports']) == {320, 390, 1280}, 'Expected 320/390/1280 viewport checks')
    require(isinstance(value.get('browserSummary'), str) and 40 <= len(value['browserSummary'].strip()) <= 4000, 'Describe actual browser scenarios')
    require(value.get('physicalPhoneVerified') is False, 'This scoped recorder cannot certify a physical phone')
    return value


def validate_identity(release, commit, sha256, backup):
    require(re.fullmatch(r'[a-f0-9]{40}', commit), 'Expected full source commit')
    require(re.fullmatch(r'[a-f0-9]{64}', sha256), 'Expected binary SHA256')
    match = re.fullmatch(r'/opt/business-control/releases/20260915-smart-select-([a-f0-9]{7,40})', release)
    require(match and commit.startswith(match.group(1)), 'Release does not identify this smart-select commit')
    require(re.fullmatch(r'/var/lib/business-control/backups/pre-smart-select-[0-9]{8}T[0-9]{6}Z', str(backup)), 'Unexpected same-host backup path')


def sha_file(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def read_bytes(opener, url):
    with opener.open(url, timeout=25) as response:
        return response.read()


def verify_release(opener, db, release, commit, sha256, backup):
    validate_identity(release, commit, sha256, backup)
    require(str(Path('/opt/business-control/current').resolve()) == release, 'Current release changed')
    require(sha_file(Path(release, 'business-control')) == sha256, 'Current binary differs')
    backup = Path(backup)
    require(backup.resolve() == backup, 'Backup path is not canonical')
    require((backup / 'candidate-commit.txt').read_text().strip() == commit, 'Backup source differs')
    require((backup / 'previous-release.txt').read_text().strip() == PREVIOUS, 'Previous release differs')
    files = {'business-control.db', 'cutover.db', 'uploads.tar.gz', 'cutover-uploads.tar.gz',
             'business-control.env', 'business-control.nginx.conf'}
    checksums = {}
    for line in (backup / 'SHA256SUMS').read_text().splitlines():
        match = re.fullmatch(r'([a-f0-9]{64})  ([A-Za-z0-9.-]+)', line)
        require(match and match.group(2) in files and match.group(2) not in checksums, 'Unexpected backup checksum entry')
        checksums[match.group(2)] = match.group(1)
    require(set(checksums) == files, 'Incomplete backup checksum list')
    for name, expected in checksums.items():
        require(sha_file(backup / name) == expected, 'Backup checksum differs')
    for name in ('local-health.json', 'public-health.json'):
        require(json.loads((backup / name).read_text()).get('status') == 'ok', 'Saved health failed')
    for base in ('http://127.0.0.1:8522', 'https://control.e-rd.ru'):
        require(helpers.get_json(opener, base + '/api/health').get('status') == 'ok', 'Current health failed')
        index = read_bytes(opener, base + '/')
        for asset in ('app.js', 'styles.css'):
            require((asset + '?v=' + CACHE).encode() in index, 'Index cache identity differs')
        for name, markers in {
            'app.js': (f"import {{ selectMenuPosition, selectOptionScrollTop }} from './select-positioning.js?v={CACHE}';",),
            'select-positioning.js': ('export function selectMenuPosition(', 'export function selectOptionScrollTop('),
            'styles.css': ('.custom-select-menu[data-placement="viewport"] .custom-select-context', '--select-safe-top'),
        }.items():
            source = read_bytes(opener, base + '/' + name + '?v=' + CACHE)
            require(all(marker.encode() in source for marker in markers), 'Missing published smart-select implementation')
        worker = read_bytes(opener, base + '/sw.js')
        require(('tessavie-shell-' + CACHE).encode() in worker, 'Service worker cache differs')
        require(('select-positioning.js?v=' + CACHE).encode() in worker, 'Service worker misses positioning module')
        for path in ('/api/mobile/widget', '/api/me/widgets'):
            try:
                response = opener.open(base + path, timeout=25)
            except urllib.error.HTTPError as error:
                require(error.code == 401, 'Widget authentication boundary differs')
            else:
                response.close()
                raise RuntimeError('Anonymous widget access unexpectedly allowed')
    apk = read_bytes(opener, helpers.APK_URL)
    require(len(apk) == 35440 and hashlib.sha256(apk).hexdigest() == helpers.APK_SHA, 'Published Android APK changed')
    spec = importlib.util.spec_from_file_location('smart_select_exact_schema', ROOT / 'verify-smart-select-database.py')
    verifier = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(verifier)
    verifier.validate(db)


def evidence_for(release, commit, sha256, backup, acceptance):
    validate_identity(release, commit, sha256, backup)
    validate_acceptance(acceptance)
    return (f'{RESULT_MARKER}\nПроверенный source {commit}; release {release}; '
            f'SHA256 {sha256}; cache {CACHE}; backup {backup}. '
            'Общий выпадающий список открывается у исходного поля выше/ниже '
            'по свободному месту, учитывает visualViewport и безопасные отступы. '
            'При крайне ограниченной высоте fallback подписывает исходное поле. '
            'Выбор с клавиатуры сохраняет видимость пункта и фокус без прокрутки '
            'всего документа; новая геометрия включена в offline-ресурсы. '
            f"Проверено: {acceptance['nodeTests']} Node-тестов, отдельные тесты select, "
            f"Go-проверки веб-ресурсов и go vet ./web, {acceptance['verifierTests']} проверок валидатора, "
            f"{acceptance['buildInputs']} входов сборки сверены с Git. "
            'Схема 072/130 таблиц и все строки/квитанции сохранены, совместимость '
            'отката проверена. Android APK и API разрешений виджетов сохранены. '
            f"Браузерная проверка 320/390/1280px: {acceptance['browserSummary'].strip()} "
            'Это проверка браузера, не физического телефона. Завершена только '
            'подзадача позиционирования; нативные приложения и широкие мобильные '
            'родители не переводятся в готовые. Документ: '
            'docs/architecture/SMART_SELECT_POSITIONING_2026_09_15.md.')


def record_result(api, evidence, apply=False):
    detail = api('/records/' + TASK_ID)
    record = detail['record']
    helpers.verify_record(record, TASK_ID, 'task', ('in_progress', 'completed'), REQUEST_MARKER, PARENT_ID)
    require(record.get('title') == TASK_TITLE and record.get('ownerId') == OPERATOR and record.get('authorId') == OPERATOR, 'Task identity or accepted scope changed')
    require(not record.get('collectionId') and not record.get('decisionMakerId'), 'Task acquired another workflow; review required')
    helpers.append_once(record.get('description'), RESULT_MARKER, evidence)
    after = helpers.patch_record(api, record, RESULT_MARKER, evidence, record['status'], apply)
    after = helpers.complete_child(api, after, RESULT_MARKER, evidence, apply)
    return {'taskId': TASK_ID, 'workspace': WORKSPACE, 'apply': apply,
            'statusBefore': record['status'], 'status': after['status'], 'plannedStatus': 'completed',
            'otherTasksWritten': False, 'physicalPhoneVerified': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--release', required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--backup', required=True)
    parser.add_argument('--acceptance', type=Path, required=True)
    parser.add_argument('--receipt', type=Path, default=Path('/tmp/tessavie-smart-select-results-20260915.json'))
    args = parser.parse_args()
    acceptance = validate_acceptance(json.loads(args.acceptance.read_text(encoding='utf-8')))
    validate_identity(args.release, args.commit, args.sha256, args.backup)
    require(hasattr(os, 'geteuid') and os.geteuid() == 0, 'Run on the authorized production host as root')
    import fcntl
    lock = open('/run/business-control-smart-select-results.lock', 'a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    opener = helpers.client()
    db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=20)
    digest = None
    receipt = None
    try:
        verify_release(opener, db, args.release, args.commit, args.sha256, args.backup)
        require(db.execute("SELECT id FROM users WHERE username='artkozk'").fetchone() == (OPERATOR,), 'Unexpected local operator')
        require(db.execute("SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=? AND status='active'", (WORKSPACE, OPERATOR)).fetchone(), 'Operator outside product workspace')
        token = secrets.token_urlsafe(32)
        digest = hashlib.sha256(token.encode()).hexdigest()
        now = datetime.datetime.now(datetime.timezone.utc)
        db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)',
                   (OPERATOR, digest, helpers.stamp(now + datetime.timedelta(minutes=5)), helpers.stamp(now), helpers.stamp(now)))
        db.commit()

        def api(path, method='GET', body=None):
            allowed_reads = {'/me', '/records/' + TASK_ID}
            allowed_writes = {('/records/' + TASK_ID, 'PATCH'),
                              ('/records/' + TASK_ID + '/proofs', 'POST'),
                              ('/records/' + TASK_ID + '/complete', 'POST')}
            require((method == 'GET' and path in allowed_reads) or (args.apply and (path, method) in allowed_writes), 'Recorder attempted an out-of-scope request')
            request = urllib.request.Request('http://127.0.0.1:8522/api' + path, method=method,
                headers={'Cookie': 'business_session=' + token, 'X-Workspace-ID': WORKSPACE,
                         'X-Outbox-Owner': str(OPERATOR), 'Content-Type': 'application/json'},
                data=None if body is None else json.dumps(body, ensure_ascii=False).encode())
            try:
                with opener.open(request, timeout=25) as response:
                    raw = response.read()
                    return json.loads(raw) if raw else None
            except urllib.error.HTTPError as error:
                raise RuntimeError(f'API {method} {path}: HTTP {error.code}; reread before retry') from None

        identity = api('/me')
        require(identity.get('id') == OPERATOR and identity.get('username') == 'artkozk', 'Session identity differs')
        evidence = evidence_for(args.release, args.commit, args.sha256, args.backup, acceptance)
        receipt = record_result(api, evidence, args.apply)
        receipt.update({'checkedAt': helpers.stamp(now), 'release': args.release, 'sourceCommit': args.commit,
                        'sha256': args.sha256, 'backup': args.backup, 'cacheVersion': CACHE, 'acceptance': acceptance})
    finally:
        if digest is not None:
            db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
            db.commit()
            require(db.execute('SELECT COUNT(*) FROM sessions WHERE token_hash=?', (digest,)).fetchone()[0] == 0, 'Temporary session removal failed')
        db.close()
        lock.close()
    receipt['temporarySessionRemoved'] = True
    if args.apply:
        fd = os.open(args.receipt, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, 'O_NOFOLLOW', 0), 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as output:
            os.fchmod(output.fileno(), 0o600)
            json.dump(receipt, output, ensure_ascii=False, indent=2)
            output.write('\n')
    print(json.dumps(receipt, ensure_ascii=False))


if __name__ == '__main__':
    main()
