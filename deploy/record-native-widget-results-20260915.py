"""Append verified native-widget results through the local production API.

Default mode previews; --apply writes. The only direct database mutation is a
short-lived operator session, removed in finally. Never opens personal pages,
issues a widget token, sends messages, or claims physical-device acceptance.
--ios-ci-url is optional and is accepted only after its successful main-branch
macOS simulator job is independently read from the public GitHub API.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import urllib.error
import urllib.request

WORKSPACE = 'bizflow-team'
OPERATOR = 1
ANDROID_ID = 'ed445650102554fc62ee48ff50e2d7a0'
PARENT_ID = '07f69bdb1c480b6e33ffd94d2fe10a02'
GOAL_ID = '17b1c09b1f9d54518a4459e57715cff1'
ANDROID_REQUEST = '[request:android-builder-widget-20260914]'
ANDROID_MARKER = '[release:android-builder-widget-20260914]'
PARENT_MARKER = '[progress:native-widgets-20260915]'
IOS_MARKER = '[request:ios-builder-widget-20260914]'
IOS_TITLE = 'P1 · iOS: WidgetKit выбранного блока и проверка сборки в macOS CI'
COMMIT = '8304391f5a83c75af73528de3e3b37ef85ad71cb'
RELEASE = '/opt/business-control/releases/20260914-android-widget-8304391'
BINARY_SHA = '91095afa8d8eb4e3ec4dd9e4702676a56099bd8a7230826d167fd153ce31a54c'
BACKUP = '/var/lib/business-control/backups/pre-android-widget-20260914T205755Z'
APK_BACKUP = '/var/lib/business-control/backups/pre-android-widget-apk-20260914T205617Z'
APK_SHA = 'c5f9580cb7c3a7688709f8baa438403fd8de71c9e2595539b217c42b466412f4'
APK_URL = 'https://control.e-rd.ru/downloads/tessavie-widgets-preview.apk'
ANDROID_EVIDENCE = (
    f'{ANDROID_MARKER}\n'
    f'Выпущено 14.09.2026 в 20:58:09 UTC. Source {COMMIT}; release {RELEASE}; '
    f'бинарник SHA256 {BINARY_SHA}; 522 входных файла сборки сверены с Git. '
    f'Резервная копия на том же VPS: {BACKUP}. Добавочная схема 072_widget_devices.sql, '
    '130 таблиц; старые строки и квитанции сохранены, пробный откат предыдущего '
    'бинарника на новой схеме пройден. '
    'Проверки: полный go test ./... (internal/app 165,058 с), go vet ./..., '
    '621 Node-тест, 9 проверок миграции, 10 Android JVM и 4 instrumentation-теста '
    'на AVD API34/WHPX; интерфейс 1280/320 px без горизонтального выхода. '
    f'APK опубликован: {APK_URL}; 35440 байт; SHA256 {APK_SHA}. '
    f'Backup nginx/APK: {APK_BACKUP}. '
    'Android companion показывает выбранный пользователем tracker/progress, '
    'подключается одноразовым кодом из единых настроек, хранит capability и '
    'снимок через Keystore, обновляется по системе/кнопке, очищает данные при 401/403. '
    'Из бокового меню убран дублирующий пункт настройки. '
    'Предварительный APK недебажный, подписан локальным Android Debug сертификатом; '
    'это не постоянный магазинный выпуск. Физический телефон, iPhone, подпись Apple, '
    'TestFlight/App Store, запись отметок из виджета, FCM/APNs и все типы блоков '
    'этим результатом не подтверждены. '
    'Документ: docs/operations/ANDROID_WIDGET_RELEASE_2026_09_14.md.'
)
PARENT_EVIDENCE = (
    f'{PARENT_MARKER}\n'
    'По повторному запросу пользователя направление продолжено. Опубликован '
    'проверенный Android APK и серверное подключение выбранного блока; '
    'выделен отдельный iOS этап исходников WidgetKit и неподписанной сборки/'
    'тестов в изолированном macOS CI. Статус общего направления — in_progress. '
    'Настройки остаются в едином центре. Физическая приёмка Android/iPhone, '
    'постоянная подпись и магазинное распространение, интерактивные отметки и '
    'расширение поддерживаемых блоков не объявляются завершёнными. '
    f'Проверенный Android source: {COMMIT}. Исторические описания сохранены.'
)
IOS_DESCRIPTION = (
    f'{IOS_MARKER}\n\nКритерии ограниченного этапа:\n'
    'SwiftUI companion и WidgetKit extension для iOS17+, источник tracker/progress '
    'выбирается в едином центре настроек Tessavie. Одноразовый код и общий '
    'серверный протокол без сбора пароля сайта. Раздельные подключения, общий '
    'Keychain/App Group, зашифрованный снимок, отзыв и очистка на 401/403, '
    'время получения и сохранённая копия при offline. Источник/метрики/текст '
    'проверяются; произвольные URL и содержимое HTML не исполняются. '
    'Подготовить XcodeGen-проект, собрать приложение и WidgetKit extension без '
    'подписи, выполнить тесты на iOS Simulator в отдельном GitHub-hosted macOS '
    'runner с ограниченными permissions и таймаутом, сохранить отчёты CI. '
    'Наличие Swift-файлов не считается пройденной сборкой: результат закрывается '
    'только после успешного проверенного workflow.\n\n'
    'Границы: это исходники и неподписанная проверка, не установленное iPhone '
    'приложение. Apple signing/App Group provisioning, TestFlight/App Store, '
    'приёмка на физическом iPhone и доставка push на закрытый телефон остаются '
    'отдельно незавершёнными; существующая физическая приёмка не закрывается. '
    'Сроки и трудозатраты не назначены. Родительское мобильное направление '
    'остаётся in_progress. Документы: docs/architecture/IOS_WIDGET_COMPANION_2026_09_14.md; '
    'mobile/ios/README.md.'
)


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def stamp(value):
    return value.isoformat(timespec='microseconds').replace('+00:00', 'Z')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *unused):
        return None


def client():
    return urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())


def get_json(opener, url):
    request = urllib.request.Request(url, headers={'Accept': 'application/json', 'User-Agent': 'Tessavie-release-recorder'})
    with opener.open(request, timeout=25) as response:
        return json.load(response)


def verify_ci(url, opener):
    if not url:
        return None
    match = re.fullmatch(r'https://github\.com/artkozk/Tessavia/actions/runs/([0-9]+)', url)
    require(match, 'Expected canonical Tessavia Actions run URL without query or fragment')
    base = 'https://api.github.com/repos/artkozk/Tessavia/actions/runs/' + match.group(1)
    run = get_json(opener, base)
    require(run.get('html_url') == url and run.get('repository', {}).get('full_name') == 'artkozk/Tessavia', 'Unexpected CI repository')
    require(run.get('head_branch') == 'main' and run.get('status') == 'completed' and run.get('conclusion') == 'success', 'iOS CI is not successful main-branch work')
    require(run.get('path') == '.github/workflows/ios-widgets.yml' and run.get('name') == 'iOS widget checks', 'Unexpected iOS workflow')
    require(re.fullmatch(r'[a-f0-9]{40}', run.get('head_sha', '')), 'Missing CI source identity')
    jobs = get_json(opener, base + '/jobs?per_page=100')
    require(jobs.get('total_count') == len(jobs.get('jobs', [])) and len(jobs['jobs']) <= 100, 'Incomplete CI jobs response')
    simulator = [job for job in jobs['jobs'] if job.get('name') == 'simulator']
    require(len(simulator) == 1, 'Expected one bounded simulator job')
    job = simulator[0]
    require(job.get('status') == 'completed' and job.get('conclusion') == 'success' and 'macos-15' in job.get('labels', []), 'macOS simulator job did not pass')
    required_step = 'Build application and WidgetKit extension; run simulator tests'
    steps = [step for step in job.get('steps', []) if step.get('name') == required_step]
    require(len(steps) == 1 and steps[0].get('conclusion') == 'success', 'Missing successful application/extension/test step')
    return {'url': url, 'runId': int(match.group(1)), 'sourceCommit': run['head_sha'],
            'attempt': run.get('run_attempt'), 'jobUrl': job.get('html_url'),
            'physicalPhoneVerified': False, 'signedDistributionVerified': False}


def verify_release(opener, db):
    require(str(Path('/opt/business-control/current').resolve()) == RELEASE, 'Current release changed; review again')
    require(hashlib.sha256(Path(RELEASE, 'business-control').read_bytes()).hexdigest() == BINARY_SHA, 'Runtime binary differs')
    require(Path(BACKUP, 'candidate-commit.txt').read_text().strip() == COMMIT, 'Backup source differs')
    for name in ('business-control.db', 'cutover.db', 'uploads.tar.gz', 'cutover-uploads.tar.gz', 'SHA256SUMS'):
        require(Path(BACKUP, name).is_file(), 'Missing same-host deployment backup')
    apk_receipt = json.loads(Path(APK_BACKUP, 'receipt.json').read_text())
    require(apk_receipt.get('published') is True and apk_receipt.get('sha256') == APK_SHA and apk_receipt.get('url') == APK_URL, 'APK publication receipt differs')
    for name in ('local-health.json', 'public-health.json'):
        require(json.loads(Path(BACKUP, name).read_text()).get('status') == 'ok', 'Saved release health failed')
    for base in ('http://127.0.0.1:8522', 'https://control.e-rd.ru'):
        require(get_json(opener, base + '/api/health').get('status') == 'ok', 'Current health failed')
    with opener.open(APK_URL, timeout=25) as response:
        require(response.headers.get_content_type() == 'application/vnd.android.package-archive', 'Unexpected public APK type')
        apk = response.read(35441)
    require(len(apk) == 35440 and hashlib.sha256(apk).hexdigest() == APK_SHA, 'Public APK differs')
    require(db.execute('PRAGMA integrity_check').fetchall() == [('ok',)], 'Database integrity failed')
    require(not db.execute('PRAGMA foreign_key_check').fetchall(), 'Database foreign keys failed')
    require(db.execute('SELECT COUNT(*) FROM schema_migrations').fetchone()[0] == 72, 'Unexpected migration count')
    require(db.execute('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').fetchone()[0] == '072_widget_devices.sql', 'Unexpected schema')
    require(db.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchone()[0] == 130, 'Unexpected table count')


def verify_record(record, record_id, kind, statuses, marker=None, parent=None):
    require(record.get('id') == record_id and record.get('workspaceId') == WORKSPACE and record.get('type') == kind, 'Unexpected record scope')
    require(record.get('status') in statuses, 'Status changed; fresh review required')
    require(bool(record.get('updatedAt')), 'Record has no freshness token')
    if marker:
        require(marker in (record.get('description') or ''), 'Missing accepted request marker')
    if parent:
        require(record.get('parentId') == parent, 'Child was moved to another parent')
    if record_id == ANDROID_ID or marker == IOS_MARKER:
        require(record.get('ownerId') == OPERATOR and record.get('authorId') == OPERATOR, 'Bounded task owner/author changed')
        require(not record.get('collectionId') and not record.get('decisionMakerId'), 'Task now has extra workflow; review before completion')


def preserved(before, after, allowed):
    # Proof count and blocker display are derived from related entities, not edited here.
    exclude = set(allowed) | {'updatedAt', 'proofCount', 'blockers'}
    require({k: v for k, v in before.items() if k not in exclude} ==
            {k: v for k, v in after.items() if k not in exclude}, 'Unrelated record metadata changed')


def append_once(description, marker, content):
    old = description or ''
    if marker in old:
        require(old.count(marker) == 1 and content in old, 'Existing result marker has different content; review required')
        return old
    return old + ('\n\n' if old else '') + content


def patch_record(api, baseline, marker, content, status, apply):
    fresh = api('/records/' + baseline['id'])['record']
    require(fresh == baseline, 'Record changed after review; no overwrite attempted')
    description = append_once(fresh.get('description'), marker, content)
    body = {'expectedUpdatedAt': fresh['updatedAt']}
    if description != fresh.get('description'):
        body['description'] = description
    if status != fresh['status']:
        body['status'] = status
        body['reason'] = 'Продолжаем пользовательское направление; завершён только отдельный проверенный этап.'
    if not apply or len(body) == 1:
        return fresh
    api('/records/' + fresh['id'], 'PATCH', body)
    after = api('/records/' + fresh['id'])['record']
    require(after.get('description') == description and after['status'] == status, 'Patch not confirmed')
    preserved(fresh, after, {'description', 'status', 'reviewPending', 'stageId', 'stageName'})
    return after


def complete_child(api, baseline, marker, evidence, apply):
    detail = api('/records/' + baseline['id'])
    require(detail['record'] == baseline, 'Child changed before proof; reread required')
    if not apply:
        return baseline
    if not any(proof.get('content') == evidence for proof in detail.get('proofs', [])):
        require(not any(marker in proof.get('content', '') for proof in detail.get('proofs', [])), 'Proof marker collision')
        api('/records/' + baseline['id'] + '/proofs', 'POST', {'kind': 'text', 'content': evidence})
    fresh = api('/records/' + baseline['id'])['record']
    preserved(baseline, fresh, set())
    require(fresh['updatedAt'] == baseline['updatedAt'], 'Child changed during proof recording')
    if fresh['status'] != 'completed':
        result = append_once(fresh.get('result'), marker, evidence)
        # /complete currently accepts only result/notifyPartners. Its own SQL has
        # an updated_at CAS; expectedUpdatedAt is supported on PATCH, not here.
        api('/records/' + fresh['id'] + '/complete', 'POST', {'result': result, 'notifyPartners': False})
    final = api('/records/' + fresh['id'])
    require(final['record']['status'] == 'completed', 'Bounded completion not confirmed')
    require(any(proof.get('content') == evidence for proof in final.get('proofs', [])), 'Completion proof missing')
    preserved(fresh, final['record'], {'status', 'progress', 'result', 'completedAt', 'reviewPending', 'stageId', 'stageName'})
    require(final['record'].get('result', '').startswith(fresh.get('result') or ''), 'Previous result text was lost')
    return final['record']


def record_results(api, full_tasks, apply=False, ios_ci=None):
    rows, count_before = full_tasks()
    android = api('/records/' + ANDROID_ID)['record']
    parent = api('/records/' + PARENT_ID)['record']
    goal = api('/records/' + GOAL_ID)['record']
    verify_record(android, ANDROID_ID, 'task', ('in_progress', 'completed'), ANDROID_REQUEST, PARENT_ID)
    verify_record(parent, PARENT_ID, 'task', ('planned', 'in_progress'), parent=GOAL_ID)
    verify_record(goal, GOAL_ID, 'goal', ('planned', 'in_progress'))
    matches = [row for row in rows if IOS_MARKER in (row.get('description') or '')]
    require(len(matches) <= 1, 'Duplicate iOS request markers')
    ios = api('/records/' + matches[0]['id'])['record'] if matches else None
    if ios:
        verify_record(ios, ios['id'], 'task', ('planned', 'in_progress', 'completed'), IOS_MARKER, PARENT_ID)
        require(ios.get('title') == IOS_TITLE, 'iOS task title changed; review its scope')
    # Check every historical append before the first task write.
    append_once(android.get('description'), ANDROID_MARKER, ANDROID_EVIDENCE)
    append_once(parent.get('description'), PARENT_MARKER, PARENT_EVIDENCE)
    append_once(goal.get('description'), PARENT_MARKER, PARENT_EVIDENCE)
    receipt = {'apply': apply, 'workspace': WORKSPACE, 'countBefore': count_before,
               'androidTaskId': ANDROID_ID, 'parentTaskId': PARENT_ID, 'mobileGoalId': GOAL_ID,
               'iosTaskId': ios['id'] if ios else None, 'iosCI': ios_ci, 'records': [],
               'physicalPhoneVerified': False, 'signedIOSDistributionVerified': False}
    android = patch_record(api, android, ANDROID_MARKER, ANDROID_EVIDENCE, android['status'], apply)
    android = complete_child(api, android, ANDROID_MARKER, ANDROID_EVIDENCE, apply)
    receipt['records'].append({'id': ANDROID_ID, 'status': android['status'], 'plannedStatus': 'completed'})
    for previous in (parent, goal):
        updated = patch_record(api, previous, PARENT_MARKER, PARENT_EVIDENCE, 'in_progress', apply)
        receipt['records'].append({'id': previous['id'], 'status': updated['status'], 'plannedStatus': 'in_progress'})
    if not ios and apply:
        created = api('/records', 'POST', {'type': 'task', 'title': IOS_TITLE, 'description': IOS_DESCRIPTION,
                      'ownerId': OPERATOR, 'parentId': PARENT_ID, 'status': 'in_progress', 'priority': 'high',
                      'workstream': 'platform', 'editPolicy': 'owner_only'}, 'ios-builder-widget-20260914')
        ios = api('/records/' + created['id'])['record']
        verify_record(ios, ios['id'], 'task', ('in_progress',), IOS_MARKER, PARENT_ID)
        require(ios['description'] == IOS_DESCRIPTION and ios['title'] == IOS_TITLE, 'Created iOS scope differs')
    if ios and ios['status'] == 'planned':
        # Preserve an existing description entirely, adding the bounded criteria only if absent.
        marker = '[scope:ios-unsigned-ci-20260915]'
        ios = patch_record(api, ios, marker, marker + '\n' + IOS_DESCRIPTION.replace(IOS_MARKER + '\n\n', '', 1), 'in_progress', apply)
    if ios_ci:
        ci_marker = f"[ci:ios-builder-widget-{ios_ci['runId']}]"
        evidence = (f"{ci_marker}\nУспешный GitHub-hosted macOS15 CI: {ios_ci['url']}; "
                    f"source {ios_ci['sourceCommit']}. Собраны неподписанные приложение и WidgetKit extension, "
                    'пройден шаг iOS Simulator тестов. Завершён только ограниченный этап исходников/CI. '
                    'Это не подписанный IPA, не установка на физический iPhone и не TestFlight/App Store. '
                    'Физическая приёмка, provisioning и распространение остаются открытыми.')
        if ios:
            ios = patch_record(api, ios, ci_marker, evidence, ios['status'], apply)
            ios = complete_child(api, ios, ci_marker, evidence, apply)
    receipt['iosTaskId'] = ios['id'] if ios else None
    receipt['records'].append({'id': receipt['iosTaskId'], 'requestMarker': IOS_MARKER,
                              'status': ios['status'] if ios else 'not_created',
                              'plannedStatus': 'completed' if ios_ci else 'in_progress'})
    final, receipt['countAfter'] = full_tasks()
    if apply:
        matches = [row for row in final if IOS_MARKER in (row.get('description') or '')]
        require(len(matches) == 1 and matches[0]['id'] == receipt['iosTaskId'], 'iOS idempotency verification failed')
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--ios-ci-url', help='Already reviewed successful main-branch iOS workflow URL')
    parser.add_argument('--receipt', type=Path, default=Path('/tmp/tessavie-native-widget-results-20260915.json'))
    args = parser.parse_args()
    require(hasattr(os, 'geteuid') and os.geteuid() == 0, 'Run on the authorized production host as root')
    import fcntl
    lock = open('/run/business-control-native-widget-records.lock', 'a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    opener = client()
    ios_ci = verify_ci(args.ios_ci_url, opener)
    db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=20)
    digest = None
    receipt = None
    try:
        verify_release(opener, db)
        require(db.execute("SELECT id FROM users WHERE username='artkozk'").fetchone() == (OPERATOR,), 'Unexpected operator')
        require(db.execute("SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=? AND status='active'", (WORKSPACE, OPERATOR)).fetchone(), 'Operator is not active in product workspace')
        token = secrets.token_urlsafe(32)
        digest = hashlib.sha256(token.encode()).hexdigest()
        now = datetime.datetime.now(datetime.timezone.utc)
        db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)',
                   (OPERATOR, digest, stamp(now + datetime.timedelta(minutes=5)), stamp(now), stamp(now)))
        db.commit()

        def api(path, method='GET', body=None, key=None):
            headers = {'Cookie': 'business_session=' + token, 'X-Workspace-ID': WORKSPACE,
                       'X-Outbox-Owner': str(OPERATOR), 'Content-Type': 'application/json'}
            if key:
                headers['Idempotency-Key'] = key
            request = urllib.request.Request('http://127.0.0.1:8522/api' + path, method=method,
                headers=headers, data=None if body is None else json.dumps(body, ensure_ascii=False).encode())
            try:
                with opener.open(request, timeout=25) as response:
                    raw = response.read()
                    return json.loads(raw) if raw else None
            except urllib.error.HTTPError as error:
                raise RuntimeError(f'API {method} {path} returned HTTP {error.code}; reread before retry') from None

        def full_tasks():
            rows = api('/records?type=task&includeArchived=true')
            count = db.execute("SELECT COUNT(*) FROM records WHERE workspace_id=? AND type='task' AND subtype='' AND business_kind=''", (WORKSPACE,)).fetchone()[0]
            require(isinstance(rows, list) and len(rows) == count, 'Incomplete project task response')
            require(len({row['id'] for row in rows}) == count, 'Duplicate record response')
            require(all(row.get('workspaceId') == WORKSPACE and row.get('type') == 'task' for row in rows), 'Unexpected task response scope')
            return rows, count

        me = api('/me')
        require(me.get('id') == OPERATOR and me.get('username') == 'artkozk', 'Session identity differs')
        receipt = record_results(api, full_tasks, args.apply, ios_ci)
        receipt.update({'checkedAt': stamp(now), 'release': RELEASE, 'sourceCommit': COMMIT,
                        'binarySha256': BINARY_SHA, 'backup': BACKUP, 'apkSha256': APK_SHA,
                        'apkUrl': APK_URL, 'apkBytes': 35440, 'buildInputs': 522})
    finally:
        if digest is not None:
            db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
            db.commit()
            require(db.execute('SELECT COUNT(*) FROM sessions WHERE token_hash=?', (digest,)).fetchone()[0] == 0, 'Temporary session was not removed')
        db.close()
        lock.close()
    receipt['temporarySessionRemoved'] = True
    if args.apply:
        flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, 'O_NOFOLLOW', 0)
        fd = os.open(args.receipt, flags, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as output:
            os.fchmod(output.fileno(), 0o600)
            json.dump(receipt, output, ensure_ascii=False, indent=2)
            output.write('\n')
    print(json.dumps(receipt, ensure_ascii=False))


if __name__ == '__main__':
    main()
