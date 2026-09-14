"""Record two bounded UI results only after exact-071 deploy and actual QA.

Never run for prepared work. No production habit entries or push subscriptions
are created; the short operator session is removed in finally. The broad parent
keeps its in_progress status, and physical-device acceptance is not claimed.
"""
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

WORKSPACE = 'bizflow-team'
OPERATOR_ID = 1
ASSETS = '20260914-mobile-gestures-today-1'
MARKER = '[release:mobile-gestures-today-20260914]'
EXPECTED_PREVIOUS = '/opt/business-control/releases/20260914-mobile-access-f1aa726'
LATEST_MIGRATION = '071_web_push.sql'
ROOT_ID = '66da4e412e714f4ea85c56ff85de03ec'
PARENTS = {ROOT_ID: 'in_progress'}
PLANNED = ()
SPECS = (
    {
        'id': '9017f436f52736168795026aed28933c',
        'parentId': ROOT_ID,
        'requestMarker': '[request:center-swipe-20260914]',
        'title': 'P0 · Открытие меню свайпом из центра страницы',
        'result': 'Мобильное меню открывается правым жестом из обычной области '
        'страницы и закрывается левым жестом по панели или подложке. '
        'Горизонтальные области, ввод, редакторы, карта, жесты чата и '
        'перетаскивание конструктора сохраняют собственное взаимодействие. '
        'Тап, вертикальная прокрутка, короткий или отменённый жест и второй '
        'палец не вызывают случайного открытия. Проверена браузерная логика '
        'и мобильная вёрстка; физический Android/iPhone не проверялся.',
    },
    {
        'id': 'ace427d0a637643a89422609c99024da',
        'parentId': ROOT_ID,
        'requestMarker': '[request:habit-today-focus-20260914]',
        'title': 'P1 · Сегодняшняя отметка привычки без недельного перегруза',
        'result': 'Карточка привычки выделяет название, состояние за сегодня '
        'и простое действие. Недельные ячейки убраны из обычной карточки; '
        'полный календарь доступен через Историю. Сводка считает сегодняшние '
        'отметки, а не серии. Бинарная привычка и отказ сохраняют простую '
        'отметку без обязательного факта; количество и время используют '
        'прежний числовой ввод. Неизвестное значение не считается нулём. '
        'Исторические отметки и серверный формат не переписывались.',
    },
)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *unused):
        return None


def stamp(value):
    return value.isoformat(timespec='microseconds').replace('+00:00', 'Z')


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def verify_task(record, spec, planned=False):
    assert record['id'] == spec['id'], 'Unexpected task identity'
    assert record['workspaceId'] == WORKSPACE and record['type'] == 'task', 'Unexpected task scope'
    assert record['ownerId'] == OPERATOR_ID and record['authorId'] == OPERATOR_ID, 'Task operator changed'
    assert record['parentId'] == spec['parentId'], 'Reviewed child moved to another parent'
    assert record['title'] == spec['title'], 'Reviewed task title changed'
    assert spec['requestMarker'] in (record.get('description') or ''), 'Missing reviewed request marker'
    allowed = ('planned',) if planned else ('in_progress', 'completed')
    assert record['status'] in allowed, 'Task needs fresh review'


def verify_parent(record, parent_id):
    assert record['id'] == parent_id and record['workspaceId'] == WORKSPACE
    assert record['type'] == 'task' and record['status'] == PARENTS[parent_id], 'Broad parent needs fresh review'


def verify_task_receipt(created):
    assert created['apply'] is True and created['workspace'] == WORKSPACE
    assert created['release'] == EXPECTED_PREVIOUS, 'Task receipt baseline changed'
    assert created['parent']['id'] == ROOT_ID and created['parent']['status'] == PARENTS[ROOT_ID]
    rows = created['tasks']
    assert len(rows) == len(SPECS), 'Unexpected task count'
    by_id = {row['id']: row for row in rows}
    assert set(by_id) == {spec['id'] for spec in SPECS}, 'Unexpected task identities'
    for spec in SPECS:
        assert by_id[spec['id']]['title'] == spec['title']
        assert by_id[spec['id']]['status'] == 'in_progress', 'Task was not started'


def record_results(api, common, commit, receipt):
    # Every scope/status/criteria check precedes the first proof or completion.
    scoped = {spec['id']: api('/records/' + spec['id']) for spec in SPECS}
    parents = {key: api('/records/' + key) for key in PARENTS}
    planned = {spec['id']: api('/records/' + spec['id']) for spec in PLANNED}
    for spec in SPECS:
        verify_task(scoped[spec['id']]['record'], spec)
    for parent_id, detail in parents.items():
        verify_parent(detail['record'], parent_id)
    for spec in PLANNED:
        verify_task(planned[spec['id']]['record'], spec, planned=True)
    spec_by_id = {spec['id']: spec for spec in SPECS}
    for current_id, detail in [*scoped.items(), *parents.items()]:
        is_child = current_id in spec_by_id
        fresh_detail = api('/records/' + current_id)
        fresh = fresh_detail['record']
        if is_child:
            verify_task(fresh, spec_by_id[current_id])
        else:
            verify_parent(fresh, current_id)
        assert fresh.get('description') == detail['record'].get('description'), 'Criteria changed during recording'
        result = (spec_by_id[current_id]['result'] if is_child else
                  ' '.join(spec['result'] for spec in SPECS if spec['parentId'] == current_id)
                  + ' Родительское направление не завершено; прежние описание и статус сохранены.')
        evidence = common + result
        if not any(MARKER in proof['content'] and commit in proof['content'] for proof in fresh_detail.get('proofs', [])):
            api('/records/' + current_id + '/proofs', 'POST', {'kind': 'text', 'content': evidence})
        if is_child and fresh['status'] != 'completed':
            latest = api('/records/' + current_id)['record']
            verify_task(latest, spec_by_id[current_id])
            assert latest.get('description') == fresh.get('description'), 'Criteria changed before completion'
            api('/records/' + current_id + '/complete', 'POST', {'result': evidence, 'notifyPartners': False})
        updated = api('/records/' + current_id)
        assert any(MARKER in proof['content'] and commit in proof['content'] for proof in updated.get('proofs', []))
        if is_child:
            verify_task(updated['record'], spec_by_id[current_id])
            assert updated['record']['status'] == 'completed'
        else:
            verify_parent(updated['record'], current_id)
        assert updated['record'].get('description') == fresh.get('description'), 'Task description changed'
        receipt['tasks'].append({'id': current_id, 'parentId': fresh.get('parentId'),
                                 'statusBefore': detail['record']['status'], 'status': updated['record']['status'],
                                 'action': 'completed_scoped_task' if is_child else 'proof_only'})
    for spec in PLANNED:
        updated = api('/records/' + spec['id'])['record']
        verify_task(updated, spec, planned=True)
        assert updated.get('description') == planned[spec['id']]['record'].get('description')
        receipt['tasks'].append({'id': spec['id'], 'parentId': spec['parentId'],
                                 'statusBefore': 'planned', 'status': 'planned', 'action': 'verified_unmodified'})


def main():
    commit, release = os.environ['CANDIDATE_COMMIT'], os.environ['VERIFIED_RELEASE']
    sha, backup = os.environ['EXPECTED_SHA256'], os.environ['VERIFIED_BACKUP']
    node_tests = int(os.environ['NODE_TESTS'])
    build_inputs = int(os.environ['BUILD_INPUTS_VERIFIED'])
    verifier_tests = int(os.environ['DEPLOY_VERIFIER_TESTS'])
    browser_summary = os.environ['BROWSER_QA_SUMMARY'].strip()
    assert re.fullmatch(r'[a-f0-9]{40}', commit), 'Expected full source commit'
    assert re.fullmatch(r'[a-f0-9]{64}', sha), 'Expected binary SHA256'
    assert node_tests >= 560 and build_inputs > 0 and verifier_tests >= 51, 'Expected final validation counts'
    assert 40 <= len(browser_summary) <= 8000, 'Provide actual GUI results and limitations'
    for gate in ('GO_TESTS_VERIFIED', 'GO_VET_VERIFIED', 'BROWSER_QA_VERIFIED',
                 'SCHEMA_UNCHANGED_VERIFIED', 'ROLLBACK_TRIAL_VERIFIED',
                 'GESTURE_UNIT_TESTS_VERIFIED', 'TODAY_HABIT_QA_VERIFIED'):
        assert os.environ[gate] == 'true', 'Missing acceptance: ' + gate
    match = re.fullmatch(r'/opt/business-control/releases/20260914-mobile-gestures-today-([a-f0-9]{7,40})', release)
    assert match and commit.startswith(match.group(1)), 'Unexpected release'
    assert str(Path('/opt/business-control/current').resolve()) == release
    assert file_sha256(Path(release, 'business-control')) == sha
    backup_path = Path(backup).resolve()
    assert backup_path.parent == Path('/var/lib/business-control/backups')
    assert backup_path.name.startswith('pre-mobile-gestures-today-')
    required = {'business-control.db', 'cutover.db', 'uploads.tar.gz', 'cutover-uploads.tar.gz',
                'business-control.env', 'business-control.nginx.conf'}
    checksum_rows = (backup_path / 'SHA256SUMS').read_text().splitlines()
    checksums = {}
    for row in checksum_rows:
        match = re.fullmatch(r'([a-f0-9]{64})  ([A-Za-z0-9.-]+)', row)
        assert match and match.group(2) in required and match.group(2) not in checksums, 'Unexpected backup checksum entry'
        checksums[match.group(2)] = match.group(1)
    assert set(checksums) == required, 'Missing deployment backup checksum'
    for name, digest in checksums.items():
        assert file_sha256(backup_path / name) == digest, 'Deployment backup checksum mismatch'
    assert (backup_path / 'candidate-commit.txt').read_text().strip() == commit
    assert (backup_path / 'previous-release.txt').read_text().strip() == EXPECTED_PREVIOUS
    for name in ('local-health.json', 'public-health.json'):
        assert json.loads((backup_path / name).read_text())['status'] == 'ok'
    verify_task_receipt(json.loads(Path('/tmp/mobile-gestures-today-tasks-created.json').read_text(encoding='utf-8')))

    client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    for base in ('http://127.0.0.1:8522', 'https://control.e-rd.ru'):
        with client.open(base + '/api/health', timeout=20) as response:
            assert json.load(response)['status'] == 'ok'
        with client.open(base + '/', timeout=20) as response:
            shell = response.read()
            for asset in ('app.js', 'mobile-access.css', 'phone-notifications.css'):
                assert (asset + '?v=' + ASSETS).encode() in shell
        for name, markers in {
            'app.js': ('function bindSidebarSwipe', 'function setSidebarOpen', 'habitTodaySummary',
                       "const touchEvents = 'TouchEvent' in window;", 'const canOpenFrom = (target) => {',
                       "document.addEventListener('touchmove', (event) => {"),
            'habit-tracker.js': ('export function habitTodaySummary', 'habit-entry-today-label', 'habit-entry-history'),
            'mobile-access.js': ('createMobileAccessUI', 'mobileLaunchAction', 'mobileNotificationMessage'),
            'phone-notifications.js': ('createPhonePushController', 'mountPhonePushSettings', 'expectedPublicKey'),
        }.items():
            with client.open(base + '/' + name + '?v=' + ASSETS, timeout=20) as response:
                source = response.read()
                assert all(marker.encode() in source for marker in markers), 'Missing published mobile module'
        with client.open(base + '/manifest.webmanifest', timeout=20) as response:
            manifest = json.load(response)
            assert all(manifest[key] == '/' for key in ('id', 'start_url', 'scope'))
            assert [shortcut['url'] for shortcut in manifest['shortcuts']] == ['/?launch=note', '/?launch=plan', '/?launch=today']
        with client.open(base + '/sw.js', timeout=20) as response:
            worker = response.read()
            assert ('tessavie-shell-' + ASSETS).encode() in worker
            assert b"self.addEventListener('push'," in worker and b"self.addEventListener('notificationclick'," in worker
            assert b'tessavie-open-notifications' in worker and b'client.navigate(' not in worker
        # Read-only requests: no subscribe/test/revoke, even anonymously.
        for path in ('/api/me/push', '/api/notifications/inbox', '/api/personal/finance'):
            try:
                response = client.open(base + path, timeout=20)
            except urllib.error.HTTPError as error:
                assert error.code == 401, 'Expected authentication boundary'
            else:
                response.close()
                raise AssertionError('Anonymous private route access unexpectedly allowed')

    db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=20)
    session_digest = None
    try:
        db.execute('PRAGMA foreign_keys=ON')
        module_spec = importlib.util.spec_from_file_location(
            'release_database_verifier', Path(__file__).with_name('verify-mobile-gestures-today-database.py'))
        verifier = importlib.util.module_from_spec(module_spec)
        module_spec.loader.exec_module(verifier)
        verifier.validate(db)
        user = db.execute("SELECT id FROM users WHERE username='artkozk'").fetchone()
        assert user and user[0] == OPERATOR_ID, 'Expected operator artkozk/1'
        assert db.execute("SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=? AND status='active'",
                          (WORKSPACE, OPERATOR_ID)).fetchone(), 'Expected active project operator'
        token = secrets.token_urlsafe(32)
        session_digest = hashlib.sha256(token.encode()).hexdigest()
        now = datetime.datetime.now(datetime.timezone.utc)
        db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)',
                   (OPERATOR_ID, session_digest, stamp(now + datetime.timedelta(minutes=5)), stamp(now), stamp(now)))
        db.commit()

        def api(path, method='GET', body=None):
            request = urllib.request.Request(
                'http://127.0.0.1:8522/api' + path, method=method,
                data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
                headers={'Cookie': 'business_session=' + token, 'X-Workspace-ID': WORKSPACE,
                         'X-Outbox-Owner': str(OPERATOR_ID), 'Content-Type': 'application/json'},
            )
            with client.open(request, timeout=25) as response:
                raw = response.read()
                return json.loads(raw) if raw else None

        assert api('/me')['username'] == 'artkozk'
        common = (
            f'{MARKER} Выпущен {commit}; {release}; SHA256 {sha}; backup {backup}. '
            f'Проверки: {node_tests} Node; go test ./...; go vet ./.... '
            f'Все {build_inputs} сборочных файлов сопоставлены с Git-коммитом. '
            f'Проверки deploy verifier: {verifier_tests} PASS. '
            f'Фактически пройденные GUI-сценарии и ограничения: {browser_summary} '
            'Исполняемые проверки жестов и сегодняшних привычек подтверждены отдельно. '
            'Физические телефоны не проверялись: браузер и тесты контроллера '
            'не заменяют системные жесты Android/iPhone. Миграций нет; точная '
            'схема071, все129 таблиц и все квитанции проверены на неизменность '
            'при старте кандидата и после анонимных HTTP-проверок. Предыдущий '
            f'бинарник {EXPECTED_PREVIOUS} проверен на той же копии с повторным '
            'сравнением. Откат сохраняет последнюю БД, включая отметки, финансы, '
            'блоки, подписки и очередь push. Он возвращает прежний интерфейс, '
            'но не выключает уже поддерживаемый предшественником транспорт. '
            'Резервные копии остаются на том же сервере. Перед записью результатов '
            'перепроверены current/SHA, контрольные суммы backup, local/public '
            'health и ресурсы, точная схема, integrity/FK, отказ без авторизации. '
            'Личные production привычки и финансы не заполнялись; проверочные '
            'push-подписки и отправки не выполнялись. '
            f'Ресурсы: {ASSETS}. Документ процедуры: '
            'docs/operations/MOBILE_GESTURES_TODAY_RELEASE_2026_09_14.md. '
            'Это ограниченное продолжение mobile-habits, а не завершение '
            'всего мобильного интерфейса или конструктора. '
        )
        receipt = {
            'commit': commit, 'release': release, 'sha256': sha, 'backup': backup,
            'previousRelease': EXPECTED_PREVIOUS, 'checkedAt': stamp(now), 'workspace': WORKSPACE,
            'oldTablesUnchanged': 129, 'totalTables': 129, 'newTables': 0,
            'newTableNames': [], 'newMigrations': [], 'latestMigration': LATEST_MIGRATION,
            'schemaUnchangedVerified': True, 'rollbackTrialVerified': True,
            'rollbackCompatibility': 'same_071_latest_data_retained_previous_mobile_ui',
            'browserScenariosVerified': True, 'browserSummary': browser_summary,
            'gestureUnitTestsVerified': True, 'todayHabitQAVerified': True,
            'physicalDevices': False, 'productionTestPushSent': False,
            'productionTestSubscriptionCreated': False, 'nodeTests': node_tests,
            'deployVerifierTests': verifier_tests, 'buildInputsVerified': build_inputs,
            'assets': ASSETS, 'tasks': [],
        }
        record_results(api, common, commit, receipt)
        Path('/tmp/mobile-gestures-today-receipt.json').write_text(
            json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(receipt, ensure_ascii=False))
    finally:
        if session_digest is not None:
            db.execute('DELETE FROM sessions WHERE token_hash=?', (session_digest,))
            db.commit()
        db.close()


if __name__ == '__main__':
    main()
