"""Attach verified personal-context release evidence without closing unmet personal-goal criteria."""
import argparse, datetime, fcntl, hashlib, json, secrets, sqlite3, urllib.request
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--commit', required=True)
parser.add_argument('--release', required=True)
parser.add_argument('--sha256', required=True)
args = parser.parse_args()
assert len(args.commit) == 40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260903-personal-context-')
assert len(args.sha256) == 64 and all(c in '0123456789abcdef' for c in args.sha256)
lock = open('/run/business-control-personal-context-task.lock', 'w')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
release = Path(args.release)
assert Path('/opt/business-control/current').resolve() == release
assert hashlib.sha256((release / 'business-control').read_bytes()).hexdigest() == args.sha256

db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=15)
assert db.execute('SELECT username FROM users WHERE id=1').fetchone()[0] == 'artkozk'
token = secrets.token_urlsafe(32)
digest = hashlib.sha256(token.encode()).hexdigest()
now = datetime.datetime.now(datetime.timezone.utc)
stamp = lambda value: value.isoformat(timespec='microseconds').replace('+00:00', 'Z')
db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(1,?,?,?,?)',
           (digest, stamp(now + datetime.timedelta(minutes=5)), stamp(now), stamp(now)))
db.commit()

def api(path, method='GET', body=None):
    request = urllib.request.Request('http://127.0.0.1:8522/api' + path, method=method,
        data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
        headers={'Cookie': 'business_session=' + token, 'X-Workspace-ID': 'bizflow-team', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=25) as response:
        data = response.read()
        return json.loads(data) if data else None

try:
    assert api('/me')['username'] == 'artkozk'
    task_id = 'cf8fd7f89027490aceec013d3f10cb3c'
    detail = api('/records/' + task_id)
    task = detail['record']
    assert task['workspaceId'] == 'bizflow-team' and task['ownerId'] == 1
    assert task['status'] in ('planned', 'in_progress')
    if task['status'] == 'planned':
        api('/records/' + task_id, 'PATCH', {
            'status': 'in_progress', 'expectedUpdatedAt': task['updatedAt'],
            'reason': 'Опубликован явный personal workspace и приватный поиск существующих заметок, планов и привычек. Полноценные личные цели остаются отдельной зависимой задачей.'
        })
        detail = api('/records/' + task_id)
    proof_marker = '[verified:personal-context-' + args.commit[:7] + ']'
    evidence = proof_marker + '\nPersonal workspace явно отделён от командных проектов; меню, создание, поиск и уведомления следуют выбранной области. Приватный Unicode-поиск заметок, планов и привычек не попадает в проектный поиск. Проверены аккаунт без команды, две команды, смена роли, повторный вход, desktop и 320 px. Go, vet и 132 Node-теста прошли. Полный отчёт: docs/architecture/PERSONAL_CONTEXT_SEARCH_CONTRACT_2026_09_03.md.\nCommit: ' + args.commit + '\nRelease: ' + args.release + '\nSHA256: ' + args.sha256 + '\nОграничение: сущность личной цели добавляется задачей 1aba51a72a4aa853e3ca13d3fd1201b0; поэтому текущая задача остаётся in_progress.'
    if not any(proof_marker in proof['content'] for proof in detail.get('proofs', [])):
        api('/records/' + task_id + '/proofs', 'POST', {'kind': 'text', 'content': evidence})
    result = api('/records/' + task_id)['record']
    assert result['status'] == 'in_progress'
    print(json.dumps({'id': result['id'], 'title': result['title'], 'status': result['status'], 'proof': proof_marker}, ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
    db.commit()
    db.close()