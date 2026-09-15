"""Record exactly the two team-finance/media child tasks after a verified release.

Default mode does not write cards. --apply appends factual evidence and completes
only the two hard-coded IDs. Parent tasks cannot be requested by the API allowlist.
Both cards and proof histories are validated before the first mutation. A narrow
five-minute session is deleted even after failure. No user database is exported.

Required acceptance JSON records completed Go/Node/build/validator checks, actual
browser widths and scenarios; it cannot certify a physical phone. Production
identity, hashes, backups, public hooks and exact schema074 are checked afresh.
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
PARENT_ID = '3d81cdb847c8fcfdb329639c22f3067a'
TASKS = (
    {'id': 'e8f9f56433e9e5969e0abd2e3add2b12',
     'title': 'P1 · Отдельные финансы команды и явная связь с командой-источником',
     'request': '[request:team-finance-sources-20260915]',
     'result': '[release:team-finance-sources-20260915]'},
    {'id': 'de274e87c23aa7ce431d76f103851f4e',
     'title': 'P1 · Медиа-блок конструктора и просмотр эскизов в заметках и карточках',
     'request': '[request:builder-media-materials-20260915]',
     'result': '[release:builder-media-materials-20260915]'},
)
TASK_IDS = frozenset(task['id'] for task in TASKS)
CACHE = '20260915-team-finance-media-1'
PREVIOUS = '/opt/business-control/releases/20260915-smart-select-f177677'
WORKSPACE = 'bizflow-team'
OPERATOR = 1


def validate_acceptance(value):
    require(isinstance(value, dict), 'Acceptance must be an object')
    for name in ('goTests', 'goVet', 'migrationPreserved', 'rollbackTrial'):
        require(value.get(name) is True, 'Missing completed check: ' + name)
    for name, minimum in (('goTestCount', 435), ('nodeTests', 649), ('buildInputs', 524), ('verifierTests', 13)):
        require(type(value.get(name)) is int and value[name] >= minimum, 'Missing actual check count: ' + name)
    viewports = value.get('viewports')
    require(isinstance(viewports, list) and 390 in viewports and len(viewports) == len(set(viewports))
            and all(type(width) is int and 280 <= width <= 4096 for width in viewports), 'Expected actual viewport widths including 390')
    require(isinstance(value.get('browserSummary'), str) and 40 <= len(value['browserSummary'].strip()) <= 4000, 'Describe actual browser scenarios')
    require(value.get('physicalPhoneVerified') is False, 'This recorder cannot certify a physical phone')
    return value

def validate_identity(release, commit, sha256, backup):
    require(re.fullmatch(r'[a-f0-9]{40}', commit), 'Expected full source commit')
    require(re.fullmatch(r'[a-f0-9]{64}', sha256), 'Expected binary SHA256')
    match = re.fullmatch(r'/opt/business-control/releases/20260915-team-finance-media-([a-f0-9]{7,40})', release)
    require(match and commit.startswith(match.group(1)), 'Release does not identify this team-finance-media commit')
    require(re.fullmatch(r'/var/lib/business-control/backups/pre-team-finance-media-[0-9]{8}T[0-9]{6}Z', str(backup)), 'Unexpected same-host backup path')


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
        for asset in ('app.js', 'styles.css', 'page-media.css'):
            require((asset + '?v=' + CACHE).encode() in index, 'Index cache identity differs')
        for name, markers in {
            'app.js': ('const teamFinanceUI', 'renderTeamFinance', 'recordMediaMarkup'),
            'personal-finance.js': ('X-Finance-Source', 'X-Finance-Revision', 'teamSourceSettings', 'data-finance-open-source'),
            'settings-hub.js': ('team-finance',),
            'page-apps.js': ('createPageMediaUI',),
            'page-media.js': ('createPageMediaUI', 'recordMediaMarkup', 'requireMediaUploadReceipt'),
            'page-media.css': ('.page-media-grid',),
            'note-media.js': ('note-file-thumbnail',),
        }.items():
            source = read_bytes(opener, base + '/' + name + '?v=' + CACHE)
            require(all(marker.encode() in source for marker in markers), 'Missing published finance/media implementation: ' + name)
        worker = read_bytes(opener, base + '/sw.js')
        require(('tessavie-shell-' + CACHE).encode() in worker, 'Service worker cache differs')
        for name in ('select-positioning.js', 'page-media.js', 'page-media.css'):
            require((name + '?v=' + CACHE).encode() in worker, 'Service worker misses a release asset')
        for path, method in (
            ('/api/workspace/finance', 'GET'), ('/api/workspace/finance/settings', 'GET'),
            ('/api/workspace/finance/settings', 'PUT'), ('/api/workspace/finance/entries', 'POST'),
            ('/api/workspace/finance/expenses', 'POST'),
            ('/api/workspace/pages/unknown/app/media/unknown', 'GET'),
            ('/api/workspace/pages/unknown/app/media/unknown', 'POST'),
            ('/api/workspace/pages/unknown/app/media/unknown/unknown', 'PATCH'),
            ('/api/workspace/pages/unknown/app/media/unknown/unknown/file?workspaceId=unknown', 'GET'),
            ('/api/mobile/widget', 'GET'), ('/api/me/widgets', 'GET'),
        ):
            try:
                response = opener.open(urllib.request.Request(base + path, method=method), timeout=25)
            except urllib.error.HTTPError as error:
                require(error.code == 401, 'Authentication boundary differs: ' + path)
            else:
                response.close()
                raise RuntimeError('Anonymous protected access unexpectedly allowed')
    apk = read_bytes(opener, helpers.APK_URL)
    require(len(apk) == 35440 and hashlib.sha256(apk).hexdigest() == helpers.APK_SHA, 'Published Android APK changed')
    spec = importlib.util.spec_from_file_location('team_finance_media_exact_schema', ROOT / 'verify-team-finance-media-database.py')
    verifier = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(verifier)
    require(verifier.validate(db) == 74, 'Expected exact deployed schema 074 and 139 tables')


def evidence_for(release, commit, sha256, backup, acceptance):
    validate_identity(release, commit, sha256, backup)
    validate_acceptance(acceptance)
    shared = (f'Проверенный source {commit}; release {release}; SHA256 {sha256}; '
              f'cache {CACHE}; backup {backup}. '
              f"Проверено: {acceptance['goTestCount']} Go-тестовых событий, включая подтесты, "
              f"go vet ./..., {acceptance['nodeTests']} Node-тестов, "
              f"{acceptance['verifierTests']} проверок валидатора, {acceptance['buildInputs']} входов сборки сверены с Git. "
              'Миграции 073/074: девять новых таблиц, прежние 130 таблиц и их строки сохранены; '
              'после выпуска подтверждена точная схема 074/139 таблиц. Совместимость прежнего '
              'бинарника с актуальной БД проверена, откат не подменяет её старой копией. '
              f"Браузерные ширины {','.join(map(str, acceptance['viewports']))} px: "
              f"{acceptance['browserSummary'].strip()} "
              'Физический телефон не проверялся. Завершается только ограниченная подзадача; '
              'общее направление конструктора остаётся в работе. ')
    contents = (
        'У команды собственные пустые финансы по умолчанию; личные счета и операции '
        'не копируются. Доходы, расходы, остатки, справочники и экспорт работают в '
        'командном контексте. Источник выбирается в едином центре настроек. '
        'Подключение другой команды только для чтения, с явным названием и проверкой '
        'личного доступа каждого участника к источнику; связь не выдаёт доступ коллегам. '
        'Переход в исходную команду, возврат к своим сохранённым строкам, ревизии '
        'подключения и защита устаревших форм проверены. '
        'Документ: docs/architecture/WORKSPACE_FINANCE_2026_09_15.md.',
        'Пользователь добавляет собственный блок «Медиа и файлы» в конструкторе. '
        'Загрузка, просмотр эскизов, обратимое скрытие и восстановление, повтор запроса '
        'и принадлежность файлов странице проверены. Личные заметки и командные карточки '
        'показывают безопасные изображения; остальным файлам доступно скачивание. '
        'Содержимое и MIME проверяются, опасные типы не исполняются. '
        'Набор переносит структуру медиаблока, а не частные файлы автора. '
        'Точные проверенные пользовательские сценарии перечислены выше. '
        'Документ: docs/architecture/PAGE_MEDIA_AND_SKETCHES_2026_09_15.md.',
    )
    return {task['id']: task['result'] + '\n' + shared + content for task, content in zip(TASKS, contents)}


def allowed_request(path, method, apply=False):
    reads = {'/me'} | {'/records/' + task_id for task_id in TASK_IDS}
    writes = {(f'/records/{task_id}' + suffix, verb) for task_id in TASK_IDS
              for suffix, verb in (('', 'PATCH'), ('/proofs', 'POST'), ('/complete', 'POST'))}
    return method == 'GET' and path in reads or apply and (path, method) in writes


def record_results(api, evidence, apply=False):
    require(isinstance(evidence, dict) and set(evidence) == TASK_IDS, 'Evidence must identify exactly the two accepted tasks')
    before = {}
    # Inspect both accepted identities and all historical collisions before the
    # first write. Per-task CAS still protects changes made during this run.
    for task in TASKS:
        task_id, marker = task['id'], task['result']
        text = evidence[task_id]
        require(isinstance(text, str) and text.startswith(marker + '\n') and text.count(marker) == 1, 'Evidence marker differs')
        detail = api('/records/' + task_id)
        record = detail['record']
        helpers.verify_record(record, task_id, 'task', ('in_progress', 'completed'), task['request'], PARENT_ID)
        require(record.get('title') == task['title'] and record.get('ownerId') == OPERATOR and record.get('authorId') == OPERATOR, 'Task identity or accepted scope changed')
        require(not record.get('collectionId') and not record.get('decisionMakerId'), 'Task acquired another workflow; review required')
        helpers.append_once(record.get('description'), marker, text)
        helpers.append_once(record.get('result'), marker, text)
        marked = [proof for proof in detail.get('proofs', []) if marker in proof.get('content', '')]
        require(len(marked) <= 1 and all(proof.get('kind') == 'text' and proof.get('content') == text for proof in marked), 'Proof marker collision or tampered proof')
        before[task_id] = record
    statuses = []
    for task in TASKS:
        record, marker, text = before[task['id']], task['result'], evidence[task['id']]
        after = helpers.patch_record(api, record, marker, text, record['status'], apply)
        after = helpers.complete_child(api, after, marker, text, apply)
        statuses.append({'taskId': task['id'], 'statusBefore': record['status'], 'status': after['status'], 'plannedStatus': 'completed'})
    return {'tasks': statuses, 'workspace': WORKSPACE, 'apply': apply,
            'allowedTaskIds': sorted(TASK_IDS), 'otherTasksWritten': False,
            'parentWritten': False, 'physicalPhoneVerified': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--release', required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--backup', required=True)
    parser.add_argument('--acceptance', type=Path, required=True)
    parser.add_argument('--receipt', type=Path, default=Path('/tmp/tessavie-team-finance-media-results-20260915.json'))
    args = parser.parse_args()
    acceptance = validate_acceptance(json.loads(args.acceptance.read_text(encoding='utf-8')))
    validate_identity(args.release, args.commit, args.sha256, args.backup)
    require(hasattr(os, 'geteuid') and os.geteuid() == 0, 'Run on the authorized production host as root')
    import fcntl
    lock = open('/run/business-control-team-finance-media-results.lock', 'a')
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
            require(allowed_request(path, method, args.apply), 'Recorder attempted an out-of-scope request')
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
        receipt = record_results(api, evidence, args.apply)
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
