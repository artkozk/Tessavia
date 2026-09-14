"""Verify the release and record completion of two bounded child tasks.

Run only on production after the deployment script and browser acceptance.
Runtime test counts and explicit Go/vet/browser confirmations are required.
The personal hub parent receives evidence only and remains planned.
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
ASSETS = '20260914-personal-references-1'
MARKER = '[release:personal-references-20260914]'
ROOT_ID = '4420e0be29f8c092c19243aa9d102d38'
SPECS = ({'id': 'a65c8628293feb66d941f0e554343fc1', 'requestMarker': '[request:personal-parent-reference-20260914]', 'title': 'P1 · Проверять владельца и доступность родителя при изменении личного дела', 'result': 'Новая родительская ссылка проверяет владельца, доступность и цикл на create/PATCH. Неизменённая своя историческая архивная связь сохраняется; чужую связь можно только явно убрать или заменить доступной. Массовой очистки и раскрытия чужих названий нет.'}, {'id': '9494b67b04f78cbf8b075f0eeee7d2f1', 'requestMarker': '[request:personal-archived-container-20260914]', 'title': 'P1 · Сохранять возможность работать с делами архивного личного проекта или цели', 'result': 'Свои существующие дела можно редактировать и завершать после архивирования проекта или цели. Прежние ID сохраняются; новая ручная связь с архивом запрещена. В форме и деталях виден архивный статус, недоступный выбор не превращается незаметно в пустую строку. Полный рабочий экран проекта и цели остаётся отдельным незавершённым этапом.'})
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
    match = re.fullmatch(r'/opt/business-control/releases/20260914-personal-references-([a-f0-9]{7,40})', release)
    assert match and commit.startswith(match.group(1)), 'Unexpected release'
    assert str(Path('/opt/business-control/current').resolve()) == release
    assert hashlib.sha256(Path(release, 'business-control').read_bytes()).hexdigest() == sha
    backup_path = Path(backup).resolve()
    assert backup_path.parent == Path('/var/lib/business-control/backups')
    assert backup_path.name.startswith('pre-personal-references-')
    for name in ('business-control.db', 'cutover.db', 'uploads.tar.gz', 'cutover-uploads.tar.gz',
                 'business-control.env', 'business-control.nginx.conf', 'SHA256SUMS'):
        assert (backup_path / name).is_file(), 'Missing deployment backup file: ' + name
    assert (backup_path / 'candidate-commit.txt').read_text().strip() == commit
    assert (backup_path / 'previous-release.txt').read_text().strip() == '/opt/business-control/releases/20260914-component-recovery-e881e41'
    for name in ('local-health.json', 'public-health.json'):
        assert json.loads((backup_path / name).read_text())['status'] == 'ok'

    client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    # Check only public shell/health and anonymous denial; never print finances.
    for base in ('http://127.0.0.1:8522', 'https://control.e-rd.ru'):
        with client.open(base + '/api/health', timeout=20) as response:
            assert json.load(response)['status'] == 'ok'
        with client.open(base + '/', timeout=20) as response:
            assert ('app.js?v=' + ASSETS).encode() in response.read()
        with client.open(base + '/page-components.js?v=' + ASSETS, timeout=20) as response:
            assert b'createPageComponentEditor' in response.read()
        with client.open(base + '/personal-plan-references.js?v=' + ASSETS, timeout=20) as response:
            helper = response.read()
            assert b'personalPlanReferenceOptions' in helper and b'restorePersonalPlanReferenceChoice' in helper
        for path in ('/api/personal/habits/unknown/tracker', '/api/personal/finance', '/api/page-app/components', '/api/workspace/pages/unknown/app/trash'):
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
            'release_database_verifier', Path(__file__).with_name('verify-personal-references-database.py'))
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
            assert detail['record']['status'] == 'planned', 'Personal hub parent needs fresh review'

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
            'только бинарник и сохраняет последнюю базу; предыдущий e881e41 поддерживает ту же схему и активную корзину, но откат вернёт прежнее поведение проверки архивных личных связей. Сохраняются новые отметки '
            'привычек, расходы и собственные блоки. Данные и backup остаются '
            'на рабочем сервере. Локальные и публичные health/ресурсы, '
            'точная схема, integrity/FK и отказ без авторизации перепроверены '
            f'перед записью результата. Ресурсы: {ASSETS}. '
            'Документы: docs/operations/PERSONAL_REFERENCES_2026_09_14.md; '
            'docs/operations/PERSONAL_REFERENCES_RELEASE_SAFETY_2026_09_14.md. '
            'Исправления работают в личных делах; реальные личные записи на production для проверки не менялись. '
            'Реальные личные привычки и финансы не заполнялись примерами. '
        )
        receipt = {
            'commit': commit, 'release': release, 'sha256': sha, 'backup': backup,
            'checkedAt': stamp(now), 'workspace': WORKSPACE,
            'oldTablesUnchanged': 127, 'totalTables': 127, 'newTables': 0,
            'newTableNames': [], 'newMigrations': [], 'latestMigration': LATEST_MIGRATION,
            'rollbackCompatibility': 'verified_schema_070_block_trash_supported_latest_data_retained',
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
        Path('/tmp/personal-references-receipt.json').write_text(
            json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(receipt, ensure_ascii=False))
    finally:
        if digest is not None:
            db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
            db.commit()
        db.close()


if __name__ == '__main__':
    main()
