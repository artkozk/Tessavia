"""Record only the two bounded mobile web results after verified deployment.

Run on production only after release/browser acceptance. All gates are explicit:
fake-provider and narrow-browser checks never certify a physical phone. Both
broad parents receive append-only proof, retaining their different statuses.
The physical-device and native-widget children are read-only and stay planned.
This script never subscribes a device, sends push, or reads private user content.
The temporary local operator session is removed even on a failed precondition.
"""
import base64
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
ASSETS = '20260914-mobile-access-1'
MARKER = '[release:mobile-access-20260914]'
# Pinned separately so a reviewed intervening release requires a visible change.
EXPECTED_PREVIOUS = '/opt/business-control/releases/20260914-offline-recovery-c0de3fc'
LATEST_MIGRATION = '071_web_push.sql'
PARENTS = {
    '96870bd6091353613e906174f19fe574': 'planned',
    '78d357246455a37e129e689c3a7e9d9c': 'postponed',
}
SPECS = (
    {
        'id': '9dc190a34f31d4537c3a16c97e84780f',
        'parentId': '96870bd6091353613e906174f19fe574',
        'requestMarker': '[request:pwa-mobile-access-20260914]',
        'title': 'P1 · Установка на телефон и быстрый запуск личных заметок',
        'result': 'В личных настройках есть единый раздел «На телефоне»: состояние '
        'установки, инструкции iPhone/Android и быстрые ссылки на заметку, дело и '
        'сегодня. Manifest содержит три быстрые команды. Разрешённые launch-действия '
        'ждут входа и загрузки данных, не принимают произвольные URL или ID и '
        'используют штатное закрытие с сохранением черновиков. Настроенный пользователем '
        'рабочий экран не заменяется. Физическая установка и живые виджеты этим '
        'результатом не подтверждены.',
    },
    {
        'id': '895248a660147ed71060dd300fc3ab54',
        'parentId': '78d357246455a37e129e689c3a7e9d9c',
        'requestMarker': '[request:web-push-delivery-20260914]',
        'title': 'P1 · Web Push: доставка и отдельное подключение каждого устройства',
        'result': 'Реализованы серверная очередь Web Push и отдельное подключение '
        'устройств в настройках уведомлений. Разрешение запрашивается только по '
        'кнопке пользователя; различаются разрешение, подписка браузера, регистрация '
        'и результат отправки. Доставка шифруется; сервер учитывает действующую '
        'сессию, свежий доступ, отзыв, тихие часы и повторные попытки. Нейтральный '
        'push открывает общий доступный аккаунту inbox; живая вкладка получает '
        'безопасное сообщение без принудительной перезагрузки и потери черновика. '
        'Проверки транспорта с fake provider и браузерной логики не подтверждают '
        'доставку на закрытый или заблокированный физический телефон.',
    },
)
PLANNED = (
    {
        'id': 'b99a799000443931c92251b76d800e38',
        'parentId': '78d357246455a37e129e689c3a7e9d9c',
        'requestMarker': '[request:mobile-push-physical-acceptance-20260914]',
        'title': 'P1 · Физическая приёмка уведомлений на iPhone и Android',
    },
    {
        'id': '07f69bdb1c480b6e33ffd94d2fe10a02',
        'parentId': '17b1c09b1f9d54518a4459e57715cff1',
        'requestMarker': '[request:native-builder-widgets-20260914]',
        'title': 'Живые виджеты WidgetKit и Glance из настроек конструктора',
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
    assert created['apply'] is True and created['completeTaskResponse'] is True
    assert created['workspace'] == WORKSPACE and created['operatorId'] == OPERATOR_ID
    assert created['countAfter'] >= created['countBefore'], 'Invalid full task-list receipt'
    rows = created['tasks']
    assert len(rows) == len(SPECS) + len(PLANNED)
    by_id = {row['id']: row for row in rows}
    assert set(by_id) == {spec['id'] for spec in (*SPECS, *PLANNED)}
    for spec in (*SPECS, *PLANNED):
        row = by_id[spec['id']]
        assert row['parentId'] == spec['parentId'] and row['title'] == spec['title']
        assert row['marker'] == spec['requestMarker']
        assert row['plannedStatus'] == ('planned' if spec in PLANNED else 'in_progress')
    parents = {row['id']: row for row in created['parents']}
    for parent_id, status in PARENTS.items():
        assert parents[parent_id]['status'] == status, 'Creation receipt parent status differs'


def verify_push_settings(config):
    # Strict public DTO allowlist ensures a later accidental secret field aborts
    # before task writes. Never put device names, IDs or key material in proof.
    assert isinstance(config, dict) and set(config) == {'configured', 'publicKey', 'devices'}
    assert config['configured'] is True, 'Production Web Push is not configured'
    key = config['publicKey']
    assert isinstance(key, str) and re.fullmatch(r'[A-Za-z0-9_-]{87}', key), 'Invalid public key encoding'
    raw = base64.b64decode(key + '=', altchars=b'-_', validate=True)
    assert len(raw) == 65 and raw[0] == 4, 'Invalid public key point'
    assert base64.urlsafe_b64encode(raw).decode().rstrip('=') == key, 'Noncanonical public key'
    # Verify the uncompressed point lies on P-256, without loading private keys.
    prime = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff
    curve_b = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b
    x, y = int.from_bytes(raw[1:33], 'big'), int.from_bytes(raw[33:], 'big')
    assert x < prime and y < prime and (y * y - x * x * x + 3 * x - curve_b) % prime == 0, 'Invalid P-256 public key'
    assert isinstance(config['devices'], list), 'Invalid public device list'
    fields = {'id', 'name', 'current', 'enabled', 'lastStatus', 'lastAttemptAt', 'lastSuccessAt', 'createdAt'}
    for device in config['devices']:
        assert isinstance(device, dict) and set(device) == fields, 'Unexpected device fields'
        assert all(isinstance(device[field], str) for field in fields - {'current', 'enabled'})
        assert type(device['current']) is bool and type(device['enabled']) is bool


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
    assert node_tests >= 555 and build_inputs > 0 and verifier_tests > 0, 'Expected final validation counts'
    assert 40 <= len(browser_summary) <= 8000, 'Provide actual GUI results and limitations'
    for gate in ('GO_TESTS_VERIFIED', 'GO_VET_VERIFIED', 'BROWSER_QA_VERIFIED',
                 'MIGRATION_TRIAL_VERIFIED', 'OLD_TABLE_VALUES_VERIFIED', 'ROLLBACK_TRIAL_VERIFIED'):
        assert os.environ[gate] == 'true', 'Missing acceptance: ' + gate
    match = re.fullmatch(r'/opt/business-control/releases/20260914-mobile-access-([a-f0-9]{7,40})', release)
    assert match and commit.startswith(match.group(1)), 'Unexpected release'
    assert str(Path('/opt/business-control/current').resolve()) == release
    assert file_sha256(Path(release, 'business-control')) == sha
    backup_path = Path(backup).resolve()
    assert backup_path.parent == Path('/var/lib/business-control/backups')
    assert backup_path.name.startswith('pre-mobile-access-')
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
    verify_task_receipt(json.loads(Path('/tmp/mobile-access-tasks-created.json').read_text(encoding='utf-8')))

    client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    for base in ('http://127.0.0.1:8522', 'https://control.e-rd.ru'):
        with client.open(base + '/api/health', timeout=20) as response:
            assert json.load(response)['status'] == 'ok'
        with client.open(base + '/', timeout=20) as response:
            shell = response.read()
            for asset in ('app.js', 'mobile-access.css', 'phone-notifications.css'):
                assert (asset + '?v=' + ASSETS).encode() in shell
        for name, markers in {
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
            'release_database_verifier', Path(__file__).with_name('verify-mobile-access-database.py'))
        verifier = importlib.util.module_from_spec(module_spec)
        module_spec.loader.exec_module(verifier)
        verifier.validate(db)
        assert verifier.schema_level(db) == '071', 'Expected released schema 071'
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
        verify_push_settings(api('/me/push'))
        common = (
            f'{MARKER} Выпущен {commit}; {release}; SHA256 {sha}; backup {backup}. '
            f'Проверки: {node_tests} Node; go test ./...; go vet ./.... '
            f'Все {build_inputs} сборочных файлов сопоставлены с Git-коммитом. '
            f'Проверки deploy verifier: {verifier_tests} PASS. '
            f'Фактически пройденные браузерные сценарии: {browser_summary} '
            'Физические iPhone/Android не проверялись; узкий viewport и fake provider '
            'не заменяют приёмку установки и доставки на реальном устройстве. '
            'Миграция 071 добавляет push_subscriptions, push_deliveries и триггер '
            'очереди. На копии проверены прежние 127 таблиц и их значения: '
            'исключение — добавленная квитанция 071 в schema_migrations; прежние '
            '70 квитанций не изменены. Итоговая точная схема содержит 129 таблиц. '
            'Предыдущий бинарник проверен на мигрированной копии с повторным '
            f'сравнением всех 129 таблиц. Предшественник: {EXPECTED_PREVIOUS}. '
            'Откат переключает только бинарник, сохраняет последнюю базу, новые '
            'таблицы и очередь, но отправка Web Push на предыдущей версии недоступна. '
            'После возврата совместимого обработчика действуют TTL и свежая проверка '
            'доступа. Перед записью результата повторно проверены локальные и '
            'публичные health/ресурсы, схема 071, integrity/FK, отказ без входа и '
            'GET настроек доставки: configured=true, валидный публичный ключ, '
            'список устройств без секретных полей. В production не создавались '
            'проверочные подписки и не отправлялись тестовые push; приватные '
            'заметки, привычки и финансы для приёмки не менялись. '
            f'Ресурсы: {ASSETS}. Документы: docs/architecture/MOBILE_ACCESS_2026_09_14.md; '
            'docs/architecture/WEB_PUSH_DELIVERY_2026_09_14.md; '
            'docs/operations/MOBILE_ACCESS_RELEASE_SAFETY_2026_09_14.md. '
        )
        receipt = {
            'commit': commit, 'release': release, 'sha256': sha, 'backup': backup,
            'previousRelease': EXPECTED_PREVIOUS, 'checkedAt': stamp(now), 'workspace': WORKSPACE,
            'oldTablesPreserved': 127, 'oldTableValueException': 'schema_migrations:new_071_receipt_only',
            'oldMigrationReceiptsUnchanged': 70, 'totalTables': 129, 'newTables': 2,
            'newTableNames': ['push_deliveries', 'push_subscriptions'],
            'newMigrations': [LATEST_MIGRATION], 'latestMigration': LATEST_MIGRATION,
            'migrationTrialVerified': True, 'rollbackTrialVerified': True,
            'rollbackCompatibility': 'additive_071_latest_data_retained_web_push_sending_unavailable',
            'browserScenariosVerified': True, 'browserSummary': browser_summary,
            'physicalDevices': False, 'nativeWidgetsImplemented': False,
            'productionPushConfigured': True, 'productionPushPublicKeyValid': True,
            'productionPushDeviceDTOSecretFree': True, 'productionTestPushSent': False,
            'productionTestSubscriptionCreated': False, 'nodeTests': node_tests,
            'deployVerifierTests': verifier_tests, 'buildInputsVerified': build_inputs,
            'assets': ASSETS, 'tasks': [],
        }
        record_results(api, common, commit, receipt)
        Path('/tmp/mobile-access-receipt.json').write_text(
            json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(receipt, ensure_ascii=False))
    finally:
        if session_digest is not None:
            db.execute('DELETE FROM sessions WHERE token_hash=?', (session_digest,))
            db.commit()
        db.close()


if __name__ == '__main__':
    main()
