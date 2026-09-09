"""Verify the deployed settings release and record evidence in its scoped task.

Run only on the production host after deployment checks. NODE_TESTS and
BUILD_INPUTS_VERIFIED are the final local validation counts supplied by the
release operator; this script independently checks the current binary and DB.
The broader parent receives evidence only and is never completed here.
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
    r'/opt/business-control/releases/20260910-settings-hub-([a-f0-9]{7,40})', release
)
assert release_match and commit.startswith(release_match.group(1)), 'Unexpected release'
assert str(Path('/opt/business-control/current').resolve()) == release
assert hashlib.sha256(Path(release, 'business-control').read_bytes()).hexdigest() == sha
backup_path = Path(backup).resolve()
assert backup_path.parent == Path('/var/lib/business-control/backups')
assert backup_path.name.startswith('pre-settings-hub-')
assert (backup_path / 'business-control.db').is_file()
assert (backup_path / 'cutover.db').is_file()
assert (backup_path / 'candidate-commit.txt').read_text().strip() == commit

db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=20)
db.execute('PRAGMA foreign_keys=ON')
assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not db.execute('PRAGMA foreign_key_check').fetchall()
assert db.execute(
    "SELECT count(*) FROM schema_migrations WHERE version='065_record_create_requests.sql'"
).fetchone()[0] == 1
assert db.execute(
    "SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
).fetchone()[0] == 117
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


marker = '[release:settings-hub-20260910]'
task_id = '130277134cefaae25fd5a0c374476911'
parent_id = 'b8a99823ccf3f3a9f39093fe3c1af2bf'
evidence = (
    f'{marker} Выпущен {commit}; {release}; SHA256 {sha}; backup {backup}. '
    'Единые настройки открываются одной шестерёнкой; четыре раздела собирают '
    'настройку текущей страницы, интерфейса и остальные доступные параметры. '
    'Повторные точки настройки убраны. Распорядок дня загружается заново при '
    'открытии из любого раздела, форма сохраняется при возврате к настройкам. '
    'Переход из вложенного окна закрывает настройки и восстанавливает историю; '
    'несохранённые изменения защищены при Back и смене устройства во время сохранения. '
    f'Проверки: {node_tests} Node; go test ./...; go vet ./.... '
    'UI: настольная и 320 px ширина без горизонтального переполнения; '
    'сохранена ширина настольного меню 250 px; время начала дня 08:30 изменено '
    'из командного календаря; установка синтетического набора SC-74 закрыла оба '
    'окна и открыла страницу; конструктор доступен через настройки, сохранение проверено. '
    'Физические телефоны не проверялись. '
    f'Все {build_inputs} сборочных файлов сопоставлены с Git-коммитом. '
    'Пробный запуск на серверной копии: 117 таблиц, объекты схемы и все строки '
    'неизменны; HTTPS, ресурсы, health, nginx, integrity/FK и запрет API без '
    'авторизации прошли. Ресурсы: 20260910-settings-hub-2. '
    'Документ docs/operations/UNIFIED_SETTINGS_2026_09_10.md. '
    'Незавершённая смена типов полей исключена из релиза. Собственные блоки и '
    'дальнейшее развитие универсального конструктора остаются отдельной работой; '
    'большое направление этим выпуском не закрывается.'
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
        'schema': '065_record_create_requests.sql',
        'nodeTests': node_tests,
        'buildInputsVerified': build_inputs,
        'assets': '20260910-settings-hub-2',
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
    Path('/tmp/settings-hub-receipt.json').write_text(
        json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8'
    )
    print(json.dumps(receipt, ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
    db.commit()
    db.close()
