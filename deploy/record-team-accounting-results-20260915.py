"""Record exactly the two team menu/accounting tasks after a verified release.

Default mode does not write cards. --apply appends factual evidence and completes
only the two hard-coded IDs. Parent tasks cannot be requested by the API allowlist.
Both cards and proof histories are validated before the first mutation. A narrow
five-minute session is deleted even after failure. No user database is exported.

Required acceptance JSON records completed Go/Node/build/validator checks, actual
browser widths and scenarios; it cannot certify a physical phone. Production
identity, running-binary hash, backups, public hooks and schema077 are checked afresh.
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
import subprocess
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('native_result_helpers', ROOT / 'record-native-widget-results-20260915.py')
helpers = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(helpers)
require = helpers.require
PARENT_ID = '3d81cdb847c8fcfdb329639c22f3067a'
TASKS = (
    {'id': '4c262b5f62a29ef17162809ec83fc1d7',
     'title': 'P1 · Добавить финансы команды в своё боковое меню',
     'request': '[request:team-finance-menu-20260915]',
     'result': '[release:team-finance-menu-20260915]'},
    {'id': '26e949d20d9e18b96819c000d1f420d1',
     'title': 'P1 · Простой учёт вложений, доходов и расходов команды',
     'request': '[request:team-basic-accounting-20260915]',
     'result': '[release:team-basic-accounting-20260915]'},
)
TASK_IDS = frozenset(task['id'] for task in TASKS)
CACHE = '20260915-team-accounting-1'
PREVIOUS = '/opt/business-control/releases/20260915-media-variants-712e53c'
PREVIOUS_COMMIT = '712e53c4f36545730e287ab209ecfb523bfe4feb'
PREVIOUS_SHA256 = '5a1e9fc1f2d12b2aa1f519d03b4227bd98b424ad3cc0cc152a37dd0de407af8b'
WORKSPACE = 'bizflow-team'
OPERATOR = 1
SCENARIOS = (
    'menuSettingsDesktopPhone', 'menuPersistenceAndScope',
    'emptyTeamContributionAndRevenue', 'expensesBalanceAndNegativeBalance',
    'receiptEditVoidRestore', 'receiptIdempotencyAndDraftRecovery',
    'legacyPersonalAndTeamPreserved', 'optionalLinksNoDoubleCounting',
    'constructorBlockSummary', 'linkedReadOnlyAndContextChanges',
)


def validate_acceptance(value):
    require(isinstance(value, dict), 'Acceptance must be an object')
    for name in ('goTests', 'goVet', 'migrationPreserved', 'rollbackTrial'):
        require(value.get(name) is True, 'Missing completed check: ' + name)
    for name, minimum in (('goTestCount', 467), ('nodeTests', 705), ('buildInputs', 524), ('verifierTests', 18)):
        require(type(value.get(name)) is int and value[name] >= minimum, 'Missing actual check count: ' + name)
    viewports = value.get('viewports')
    require(isinstance(viewports, list) and all(type(width) is int and 280 <= width <= 4096 for width in viewports)
            and {320, 390, 1280}.issubset(viewports) and len(viewports) == len(set(viewports)), 'Expected actual viewport widths including 320, 390 and 1280')
    scenarios = value.get('scenarios')
    require(isinstance(scenarios, dict) and set(scenarios) == set(SCENARIOS)
            and all(item is True for item in scenarios.values()), 'Every bounded acceptance scenario must be verified')
    require(isinstance(value.get('browserSummary'), str) and 40 <= len(value['browserSummary'].strip()) <= 4000, 'Describe actual browser scenarios')
    require(value.get('physicalPhoneVerified') is False, 'This recorder cannot certify a physical phone')
    return value

def validate_identity(release, commit, sha256, backup):
    require(re.fullmatch(r'[a-f0-9]{40}', commit) and commit != PREVIOUS_COMMIT, 'Expected new full source commit')
    require(re.fullmatch(r'[a-f0-9]{64}', sha256), 'Expected binary SHA256')
    match = re.fullmatch(r'/opt/business-control/releases/20260915-team-accounting-([a-f0-9]{7,40})', release)
    require(match and commit.startswith(match.group(1)), 'Release does not identify this team-accounting commit')
    require(re.fullmatch(r'/var/lib/business-control/backups/pre-team-accounting-[0-9]{8}T[0-9]{6}Z', str(backup)), 'Unexpected same-host backup path')


def sha_file(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def read_bytes(opener, url):
    with opener.open(url, timeout=25) as response:
        return response.read()


def verify_running_binary(release, sha256):
    pid = subprocess.check_output(['systemctl', 'show', 'business-control.service', '--property=MainPID', '--value'], text=True, timeout=15).strip()
    require(re.fullmatch(r'[1-9][0-9]*', pid), 'Service has no live process')
    executable = Path('/proc', pid, 'exe')
    require(executable.resolve() == Path(release, 'business-control'), 'Running process is not this release')
    require(sha_file(executable) == sha256, 'Running binary hash differs')


def verify_backup(backup, commit):
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
        require((backup / name).is_file() and not (backup / name).is_symlink(), 'Backup payload is not a regular file')
        require(sha_file(backup / name) == expected, 'Backup checksum differs')
    for name in ('local-health.json', 'public-health.json'):
        require(json.loads((backup / name).read_text()).get('status') == 'ok', 'Saved health failed')
    for name in ('business-control.db', 'cutover.db'):
        connection = sqlite3.connect((backup / name).as_uri() + '?mode=ro', uri=True)
        try:
            require(connection.execute('PRAGMA integrity_check').fetchall() == [('ok',)], 'Backup database integrity failed')
            require(not connection.execute('PRAGMA foreign_key_check').fetchall(), 'Backup database foreign keys failed')
        finally:
            connection.close()


def verify_release(opener, db, release, commit, sha256, backup):
    validate_identity(release, commit, sha256, backup)
    require(str(Path('/opt/business-control/current').resolve()) == release, 'Current release changed')
    require(sha_file(Path(release, 'business-control')) == sha256, 'Current binary differs')
    verify_running_binary(release, sha256)
    require(sha_file(Path(PREVIOUS, 'business-control')) == PREVIOUS_SHA256, 'Verified baseline binary differs')
    verify_backup(backup, commit)
    for base in ('http://127.0.0.1:8522', 'https://control.e-rd.ru'):
        require(helpers.get_json(opener, base + '/api/health').get('status') == 'ok', 'Current health failed')
        index = read_bytes(opener, base + '/')
        for asset in ('app.js', 'styles.css', 'page-finance.css', 'media-variants.css'):
            require((asset + '?v=' + CACHE).encode() in index, 'Index cache identity differs')
        for name, markers in {
            'app.js': ("key === 'personal' || key === 'finance' || enabled.has(key)", 'const teamFinanceUI', 'renderTeamFinance', 'onFinanceAction', 'createMediaVariantsUI', 'reloadUpdatedInterface', 'shellUpdatePending'),
            'personal-finance.js': ('financeReceiptPayload', 'financeReceiptKinds', 'data-finance-receipt-bucket', 'data-finance-team-overview', 'X-Finance-Source', 'X-Finance-Revision', 'financeOrganizationPayload', 'data-finance-history-category', 'data-finance-related'),
            'settings-hub.js': ('team-finance', 'shell-update'),
            'page-apps.js': ('createPageFinanceUI', 'pageFinanceConfigMarkup', 'financeBlocks.mount'),
            'page-finance.js': ('page-finance-team-totals', 'validatePageFinanceOverview', 'sourceRevision', 'pageFinanceOverviewMarkup'),
            'page-finance.css': ('.page-finance-accounts', '.page-finance-actions'),
            'media-variants.js': ('createMediaVariantsUI', 'mediaComparisonMarkup', 'requireVariantUploadReceipt', 'mediaVariantMetadataBody'),
            'media-variants.css': ('.media-variants-grid',),
            'note-media.js': ('bindSavedEditor', 'data-note-file-legacy-pending'),
            'page-media.js': ('createMediaVariantsUI', 'mountLegacy'),
            'outbox-ui.js': ('watchShellUpdates', 'onPendingChange(pending)'),
            'select-positioning.js': ('selectMenuPosition', 'selectOptionScrollTop', 'trackSelectAnchor'),
        }.items():
            source = read_bytes(opener, base + '/' + name + '?v=' + CACHE)
            require(all(marker.encode() in source for marker in markers), 'Missing published team-accounting implementation: ' + name)
        worker = read_bytes(opener, base + '/sw.js')
        require(('tessavie-shell-' + CACHE).encode() in worker, 'Service worker cache differs')
        for name in ('select-positioning.js', 'page-media.js', 'page-media.css', 'page-finance.js', 'page-finance.css', 'media-variants.js', 'media-variants.css'):
            require((name + '?v=' + CACHE).encode() in worker, 'Service worker misses a release asset')
        for path, method in (
            ('/api/workspace/finance', 'GET'), ('/api/workspace/finance/settings', 'GET'),
            ('/api/workspace/finance/settings', 'PUT'), ('/api/workspace/finance/entries', 'POST'),
            ('/api/workspace/finance/expenses', 'POST'),
            ('/api/workspace/finance/receipts', 'POST'),
            ('/api/workspace/finance/receipts/unknown', 'GET'),
            ('/api/workspace/finance/receipts/unknown', 'PUT'),
            ('/api/personal/finance/categories', 'POST'), ('/api/workspace/finance/categories', 'POST'),
            ('/api/personal/finance/link-targets', 'GET'), ('/api/workspace/finance/link-targets', 'GET'),
            ('/api/workspace/pages/unknown/app', 'GET'), ('/api/workspace/pages/unknown/app', 'PUT'),
            ('/api/mobile/widget', 'GET'), ('/api/me/widgets', 'GET'),
            ('/api/records/unknown/media-variants', 'GET'), ('/api/records/unknown/media-variants', 'POST'),
            ('/api/records/unknown/media-variants/unknown', 'PATCH'),
            ('/api/records/unknown/media-variants/unknown/versions', 'POST'),
            ('/api/personal/notes/unknown/media-variants', 'GET'), ('/api/personal/notes/unknown/media-variants', 'POST'),
            ('/api/workspace/pages/unknown/app/media/unknown/variants', 'GET'),
            ('/api/workspace/pages/unknown/app/media/unknown/variants', 'POST'),
            ('/api/records/unknown/media-variants/unknown/versions/unknown/file', 'GET'),
            ('/api/personal/notes/unknown/media-variants/unknown/versions/unknown/file', 'GET'),
            ('/api/workspace/pages/unknown/app/media/unknown/variants/unknown/versions/unknown/file', 'GET'),
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
    spec = importlib.util.spec_from_file_location('team_accounting_exact_schema', ROOT / 'verify-team-accounting-database.py')
    verifier = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(verifier)
    require(verifier.validate(db) == 77, 'Expected exact deployed schema 077 and 150 tables')


def evidence_for(release, commit, sha256, backup, acceptance):
    validate_identity(release, commit, sha256, backup)
    validate_acceptance(acceptance)
    shared = (f'Проверенный source {commit}; release {release}; SHA256 {sha256}; '
              f'cache {CACHE}; backup {backup}. '
              f"Проверено: {acceptance['goTestCount']} Go-тестовых событий, включая подтесты, "
              f"go vet ./..., {acceptance['nodeTests']} Node-тестов, "
              f"{acceptance['verifierTests']} проверок валидатора, {acceptance['buildInputs']} входов сборки сверены с Git. "
              f'Базовый опубликованный source {PREVIOUS_COMMIT}; бинарник {PREVIOUS_SHA256}. '
              'Миграция 077 добавила две пустые таблицы; прежние 148 таблиц и их строки сохранены; '
              'после выпуска подтверждена точная схема 077/150 таблиц. Совместимость прежнего '
              'бинарника с актуальной БД проверена на копии до новых поступлений; после появления '
              'метаданных 077 откат блокируется, поскольку старый код не сохраняет смысл '
              'простого учёта. Старая резервная копия не подменяет актуальную БД. '
              f"Браузерные ширины {','.join(map(str, acceptance['viewports']))} px: "
              f"{acceptance['browserSummary'].strip()} "
              'Физический телефон не проверялся. Завершается только ограниченная подзадача; '
              'общее направление конструктора остаётся в работе. ')
    contents = (
        'Финансы доступны в общем центре Настройки → Меню и разделы новой и старой '
        'команды. Пользователь выбирает видимость и порядок для ПК и телефона; '
        'меню других людей не меняется. Проверены сохранение, скрытие и возврат, '
        'переход между командами и сохранность выбора. Пункт открывает выбранную '
        'команду, личные деньги не подставляются. Дополнительных точек настройки '
        'в боковом меню не добавлено.',
        'В пустой команде поступление можно записать без создания процентной схемы: '
        'вложение, доход или другое поступление, сумма, дата, отправитель и пометка. '
        'Счёт создаётся атомарно при первой подтверждённой операции. Расходы и '
        'остаток связаны с этим же регистром; остаток не называется прибылью. '
        'Доступны необязательная группа и связи с карточками/целями. Несколько '
        'ссылок не размножают сумму. Проверены правка, отмена и восстановление, '
        'отрицательный остаток, повтор без дубля, финансовый блок конструктора, '
        'старые операции без выдуманной классификации, личное распределение и '
        'подключённый бюджет только для чтения. Денежное разбиение по задачам '
        'не объявляется выполненным. Документ: docs/product/TEAM_USABILITY_2026_09_15.md.',
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
    parser.add_argument('--receipt', type=Path, default=Path('/tmp/tessavie-team-accounting-results-20260915.json'))
    args = parser.parse_args()
    acceptance = validate_acceptance(json.loads(args.acceptance.read_text(encoding='utf-8')))
    validate_identity(args.release, args.commit, args.sha256, args.backup)
    require(hasattr(os, 'geteuid') and os.geteuid() == 0, 'Run on the authorized production host as root')
    import fcntl
    lock = open('/run/business-control-team-accounting-results.lock', 'a')
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
                        'sha256': args.sha256, 'backup': args.backup, 'cacheVersion': CACHE, 'acceptance': acceptance,
                        'previousRelease': PREVIOUS, 'previousSourceCommit': PREVIOUS_COMMIT,
                        'previousBinarySHA256': PREVIOUS_SHA256, 'schemaVersion': 77, 'tableCount': 150})
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
