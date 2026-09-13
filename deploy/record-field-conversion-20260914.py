"""Verify the release and record completion of one bounded child task.

Run only on production after the deployment script and browser acceptance.
Runtime test counts and explicit Go/vet/browser confirmations are required.
The broad constructor parent receives evidence only.
No private habit entries, financial records or session credentials leave the host.
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
ASSETS = '20260914-field-conversion-1'
MARKER = '[release:field-conversion-20260914]'
ROOT_ID = 'a288364706d6c9f0ff683003aea39009'
SPECS = ({
    'id':'2092665a817cc23073154bc1adf06377',
    'requestMarker':'[request:constructor-safe-type-conversion-20260907]',
    'title':'P1 · Безопасно менять тип заполненного поля с предпросмотром',
    'result':('Совместимые пары: текст/большой текст, число/сумма и один/несколько вариантов. '
      'В форме показаны значения до/после, количество карточек и начальное значение. '
      'Несовместимые данные блокируют всю операцию. Предпросмотр и применение проверяют '
      'актуальность схемы, вариантов, начального значения и карточек; запись выполняется '
      'атомарно с сохранением исходных значений в истории. Числовые JSON значения сохраняют '
      'точные исходные байты. Изменения администратора не обходят границы проекта. '
      'Отмена сохраняет черновик; устаревший предпросмотр требует повторной проверки. '
      'Это ограниченная смена совместимых типов, а не произвольное преобразование или завершение конструктора.')
},)
LATEST_MIGRATION = '070_page_app_components.sql'



class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *unused):
        return None


def stamp(value):
    return value.isoformat(timespec='microseconds').replace('+00:00', 'Z')


def verify_task(record, spec, user_id):
    assert record['id'] == spec['id']
    assert record['workspaceId'] == WORKSPACE and record['type'] == 'task'
    assert record['ownerId'] == user_id and record['authorId'] == user_id
    assert record['parentId'] == ROOT_ID, 'Reviewed child moved to another parent'
    assert record['title'] == spec['title'], 'Reviewed task title changed'
    assert spec['requestMarker'] in (record.get('description') or '')
    assert record['status'] in ('planned', 'in_progress', 'completed'), 'Task needs fresh review'


def main():
    commit = os.environ['CANDIDATE_COMMIT']
    release = os.environ['VERIFIED_RELEASE']
    sha = os.environ['EXPECTED_SHA256']
    backup = os.environ['VERIFIED_BACKUP']
    node_tests = int(os.environ['NODE_TESTS'])
    build_inputs = int(os.environ['BUILD_INPUTS_VERIFIED'])
    assert re.fullmatch(r'[a-f0-9]{40}', commit), 'Expected full source commit'
    assert re.fullmatch(r'[a-f0-9]{64}', sha), 'Expected binary SHA256'
    verifier_tests = int(os.environ['DEPLOY_VERIFIER_TESTS'])
    browser_summary = os.environ['BROWSER_QA_SUMMARY'].strip()
    assert 40 <= len(browser_summary) <= 8000, 'Provide actual GUI results and limitations'
    assert node_tests > 0 and build_inputs > 0 and verifier_tests > 0, 'Expected final validation counts'
    for gate in ('GO_TESTS_VERIFIED', 'GO_VET_VERIFIED', 'BROWSER_QA_VERIFIED', 'SCHEMA_UNCHANGED_VERIFIED', 'ROLLBACK_TRIAL_VERIFIED'):
        assert os.environ[gate] == 'true', 'Missing acceptance: ' + gate
    match = re.fullmatch(r'/opt/business-control/releases/20260914-field-conversion-([a-f0-9]{7,40})', release)
    assert match and commit.startswith(match.group(1)), 'Unexpected release'
    assert str(Path('/opt/business-control/current').resolve()) == release
    assert hashlib.sha256(Path(release, 'business-control').read_bytes()).hexdigest() == sha
    backup_path = Path(backup).resolve()
    assert backup_path.parent == Path('/var/lib/business-control/backups')
    assert backup_path.name.startswith('pre-field-conversion-')
    for name in ('business-control.db', 'cutover.db', 'uploads.tar.gz', 'cutover-uploads.tar.gz',
                 'business-control.env', 'business-control.nginx.conf', 'SHA256SUMS'):
        assert (backup_path / name).is_file(), 'Missing deployment backup file: ' + name
    assert (backup_path / 'candidate-commit.txt').read_text().strip() == commit
    assert (backup_path / 'previous-release.txt').read_text().strip() == '/opt/business-control/releases/20260914-mobile-habits-b66b33c'
    for name in ('local-health.json', 'public-health.json'):
        assert json.loads((backup_path / name).read_text())['status'] == 'ok'

    client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    # Check only public shell/health and anonymous denial; never print finances.
    for base in ('http://127.0.0.1:8522', 'https://control.e-rd.ru'):
        with client.open(base + '/api/health', timeout=20) as response:
            assert json.load(response)['status'] == 'ok'
        with client.open(base + '/', timeout=20) as response:
            assert ('app.js?v=' + ASSETS).encode() in response.read()
        with client.open(base + '/field-conversion.js?v=' + ASSETS, timeout=20) as response:
            assert b'fieldConversionPreviewHTML' in response.read()
        for path in ('/api/personal/habits/unknown/tracker', '/api/personal/finance', '/api/page-app/components'):
            try:
                response = client.open(base + path, timeout=20)
            except urllib.error.HTTPError as error:
                assert error.code == 401, 'Expected authentication boundary'
            else:
                response.close()
                raise AssertionError('Anonymous feature access unexpectedly allowed')

    db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=20)
    digest = None
    try:
        db.execute('PRAGMA foreign_keys=ON')
        spec = importlib.util.spec_from_file_location(
            'release_database_verifier', Path(__file__).with_name('verify-field-conversion-database.py'))
        verifier = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(verifier)
        verifier.validate(db)
        user = db.execute("SELECT id FROM users WHERE username='artkozk'").fetchone()
        assert user and db.execute(
            "SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=? AND status='active'",
            (WORKSPACE, user[0]),
        ).fetchone(), 'Expected active project operator'
        token = secrets.token_urlsafe(32)
        digest = hashlib.sha256(token.encode()).hexdigest()
        now = datetime.datetime.now(datetime.timezone.utc)
        db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)',
                   (user[0], digest, stamp(now + datetime.timedelta(minutes=5)), stamp(now), stamp(now)))
        db.commit()

        def api(path, method='GET', body=None):
            request = urllib.request.Request(
                'http://127.0.0.1:8522/api' + path, method=method,
                data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
                headers={'Cookie': 'business_session=' + token, 'X-Workspace-ID': WORKSPACE,
                         'Content-Type': 'application/json'},
            )
            with client.open(request, timeout=25) as response:
                raw = response.read()
                return json.loads(raw) if raw else None

        assert api('/me')['username'] == 'artkozk'
        scoped = {spec['id']: api('/records/' + spec['id']) for spec in SPECS}
        parents = {key: api('/records/' + key) for key in (ROOT_ID,)}
        for spec in SPECS:
            verify_task(scoped[spec['id']]['record'], spec, user[0])
        for detail in parents.values():
            assert detail['record']['workspaceId'] == WORKSPACE and detail['record']['type'] == 'task'

        common = (
            f'{MARKER} Выпущен {commit}; {release}; SHA256 {sha}; backup {backup}. '
            f'Проверки: {node_tests} Node; go test ./...; go vet ./.... '
            f'Все {build_inputs} сборочных файлов сопоставлены с Git-коммитом. '
            f'Отдельные проверки deploy verifier: {verifier_tests} PASS. '
            f'Фактически пройденные GUI-сценарии: {browser_summary} '
            'Физические телефоны не проверялись; браузерная проверка узкого '
            'экрана не заменяет проверку Android/iOS. Новых миграций нет: '
            'точная схема 070, все 127 таблиц и их значения проверены на '
            'неизменность при запуске кандидата на копии. Предыдущий бинарник '
            'проверен на этой же копии с повторным сравнением. Откат меняет '
            'только бинарник и сохраняет последнюю базу, включая новые отметки '
            'привычек, расходы и собственные блоки. Данные и backup остаются '
            'на рабочем сервере. Локальные и публичные health/ресурсы, '
            'точная схема, integrity/FK и отказ без авторизации перепроверены '
            f'перед записью результата. Ресурсы: {ASSETS}. '
            'Документы: docs/operations/FIELD_CONVERSION_2026_09_14.md; '
            'docs/operations/FIELD_CONVERSION_RELEASE_SAFETY_2026_09_14.md. '
            'Преобразование запускается только явным действием администратора; пользовательские поля на production ради проверки не менялись. '
            'Реальные личные привычки и финансы не заполнялись примерами. '
        )
        receipt = {
            'commit': commit, 'release': release, 'sha256': sha, 'backup': backup,
            'checkedAt': stamp(now), 'workspace': WORKSPACE,
            'oldTablesUnchanged': 127, 'totalTables': 127, 'newTables': 0,
            'newTableNames': [], 'newMigrations': [], 'latestMigration': LATEST_MIGRATION,
            'rollbackCompatibility': 'verified_same_schema_and_contract_latest_data_retained',
            'browserScenariosVerified': True, 'browserSummary': browser_summary,
            'physicalDevices': False, 'nodeTests': node_tests,
            'deployVerifierTests': verifier_tests,
            'buildInputsVerified': build_inputs, 'assets': ASSETS, 'tasks': [],
        }
        spec_by_id = {spec['id']: spec for spec in SPECS}
        parent_results = {ROOT_ID: ' '.join(spec['result'] for spec in SPECS)}
        for current_id, detail in [*scoped.items(), *parents.items()]:
            is_child = current_id in spec_by_id
            result = spec_by_id[current_id]['result'] if is_child else parent_results[current_id]
            evidence = common + result
            if not any(MARKER in proof['content'] and commit in proof['content'] for proof in detail.get('proofs', [])):
                api('/records/' + current_id + '/proofs', 'POST', {'kind': 'text', 'content': evidence})
            if is_child and detail['record']['status'] != 'completed':
                fresh = api('/records/' + current_id)['record']
                verify_task(fresh, spec_by_id[current_id], user[0])
                assert fresh.get('description') == detail['record'].get('description'), 'Acceptance criteria changed during recording'
                api('/records/' + current_id + '/complete', 'POST', {'result': evidence, 'notifyPartners': False})
            updated = api('/records/' + current_id)
            assert any(MARKER in proof['content'] and commit in proof['content'] for proof in updated.get('proofs', []))
            if is_child:
                assert updated['record']['status'] == 'completed'
            else:
                assert updated['record']['status'] == detail['record']['status'], 'Broad parent status changed'
            receipt['tasks'].append({
                'id': current_id, 'statusBefore': detail['record']['status'],
                'status': updated['record']['status'],
                'action': 'completed_scoped_task' if is_child else 'proof_only',
            })
        Path('/tmp/field-conversion-receipt.json').write_text(
            json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(receipt, ensure_ascii=False))
    finally:
        if digest is not None:
            db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
            db.commit()
        db.close()


if __name__ == '__main__':
    main()
