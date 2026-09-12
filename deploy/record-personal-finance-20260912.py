"""Verify the deployed personal-finance release and record evidence in its scoped task.

Run only on the production host after deployment checks. NODE_TESTS and
BUILD_INPUTS_VERIFIED are the final local validation counts supplied by the
release operator; this script independently checks the current binary and DB.
The separate generic-calculations task receives boundary evidence only and is never completed here.
No personal financial settings, category names, percentages, or amounts are read or recorded.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import urllib.request


commit = os.environ['CANDIDATE_COMMIT']
release = os.environ['VERIFIED_RELEASE']
sha = os.environ['EXPECTED_SHA256']
backup = os.environ['VERIFIED_BACKUP']
node_tests = int(os.environ['NODE_TESTS'])
build_inputs = int(os.environ['BUILD_INPUTS_VERIFIED'])
assert re.fullmatch(r'[a-f0-9]{40}', commit), 'Expected full source commit'
assert re.fullmatch(r'[a-f0-9]{64}', sha), 'Expected binary SHA256'
assert node_tests > 0 and build_inputs > 0, 'Expected final validation counts'
release_match = re.fullmatch(
    r'/opt/business-control/releases/20260912-personal-finance-([a-f0-9]{7,40})', release
)
assert release_match and commit.startswith(release_match.group(1)), 'Unexpected release'
assert str(Path('/opt/business-control/current').resolve()) == release
assert hashlib.sha256(Path(release, 'business-control').read_bytes()).hexdigest() == sha
backup_path = Path(backup).resolve()
assert backup_path.parent == Path('/var/lib/business-control/backups')
assert backup_path.name.startswith('pre-personal-finance-')
assert (backup_path / 'business-control.db').is_file()
assert (backup_path / 'cutover.db').is_file()
assert (backup_path / 'candidate-commit.txt').read_text().strip() == commit

db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=20)
db.execute('PRAGMA foreign_keys=ON')
assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not db.execute('PRAGMA foreign_key_check').fetchall()
assert db.execute(
    "SELECT count(*) FROM schema_migrations WHERE version='066_personal_finance.sql'"
).fetchone()[0] == 1
assert db.execute(
    "SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
).fetchone()[0] == 121
user = db.execute("SELECT id FROM users WHERE username='artkozk'").fetchone()
assert user and db.execute(
    "SELECT 1 FROM workspace_members WHERE workspace_id='bizflow-team' AND user_id=? AND status='active'",
    user,
).fetchone()
token = secrets.token_urlsafe(32)
digest = hashlib.sha256(token.encode()).hexdigest()
now = datetime.datetime.now(datetime.timezone.utc)


def stamp(value):
    return value.isoformat(timespec='microseconds').replace('+00:00', 'Z')


db.execute(
    'INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)',
    (user[0], digest, stamp(now + datetime.timedelta(minutes=5)), stamp(now), stamp(now)),
)
db.commit()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *unused):
        return None


client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())


def api(path, method='GET', body=None):
    request = urllib.request.Request(
        'http://127.0.0.1:8522/api' + path,
        method=method,
        data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
        headers={
            'Cookie': 'business_session=' + token,
            'X-Workspace-ID': 'bizflow-team',
            'Content-Type': 'application/json',
        },
    )
    with client.open(request, timeout=25) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


marker = '[release:personal-finance-20260912]'
task_id = '89d079ce1a8a8c3b06279db98bc54352'
parent_id = '5def98a795abc64380faa17ba416f562'
evidence = (
    f'{marker} Выпущен {commit}; {release}; SHA256 {sha}; backup {backup}. '
    'Первый функциональный этап личного бюджета: приватный учёт поступлений, '
    'настраиваемое распределение поступлений и история операций. Финансовые '
    'настройки пользователя и реальные значения в это доказательство не включаются. '
    f'Проверки: {node_tests} Node; go test ./...; go vet ./.... '
    'Браузерная приёмка и её ограничения описаны в отчёте выпуска; '
    'физические телефоны не проверялись. '
    f'Все {build_inputs} сборочных файлов сопоставлены с Git-коммитом. '
    'Пробный запуск на серверной копии: 117 старых таблиц, их объекты схемы и '
    'строки неизменны, за исключением добавленной строки миграции; миграция 066 '
    'создала четыре пустые отдельные таблицы, всего 121. Предыдущий бинарник '
    'успешно запущен на мигрированной копии; повторная сверка прошла. '
    'HTTPS, ресурсы, health, nginx, integrity/FK и запрет API личных финансов '
    'без авторизации прошли. Ресурсы: 20260912-personal-finance-1. '
    'Документ docs/operations/PERSONAL_FINANCE_2026_09_12.md. '
    'Незавершённая смена типов полей исключена из релиза. '
    'Банковская синхронизация не подключалась. Общий пользовательский механизм '
    'вычислений остаётся отдельной задачей: этот специализированный этап '
    'не объявляет готовым универсальный конструктор.'
)

try:
    scoped = api('/records/' + task_id)
    parent = api('/records/' + parent_id)
    assert scoped['record']['ownerId'] == user[0] and scoped['record']['authorId'] == user[0]
    receipt = {
        'commit': commit,
        'release': release,
        'sha256': sha,
        'backup': backup,
        'checkedAt': stamp(now),
        'oldTablesUnchanged': 117,
        'totalTables': 121,
        'newTablesEmptyAtDryRun': 4,
        'rollbackCompatibility': 'verified_on_server_local_copy',
        'schema': '066_personal_finance.sql',
        'nodeTests': node_tests,
        'buildInputsVerified': build_inputs,
        'assets': '20260912-personal-finance-1',
        'physicalDevices': False,
        'tasks': [],
    }
    for current_id, detail in ((task_id, scoped), (parent_id, parent)):
        if not any(marker in proof['content'] for proof in detail.get('proofs', [])):
            api('/records/' + current_id + '/proofs', 'POST', {'kind': 'text', 'content': evidence})
        if current_id == task_id and detail['record']['status'] != 'completed':
            api('/records/' + current_id + '/complete', 'POST', {'result': evidence, 'notifyPartners': False})
        updated = api('/records/' + current_id)
        assert any(marker in proof['content'] for proof in updated.get('proofs', []))
        if current_id == task_id:
            assert updated['record']['status'] == 'completed'
        receipt['tasks'].append({
            'id': current_id,
            'statusBefore': detail['record']['status'],
            'status': updated['record']['status'],
            'action': 'completed_scoped_task' if current_id == task_id else 'proof_only',
        })
    Path('/tmp/personal-finance-receipt.json').write_text(
        json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8'
    )
    print(json.dumps(receipt, ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
    db.commit()
    db.close()
