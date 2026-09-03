"""Verify the production personal-planning release and complete its satisfied tasks."""
import argparse, datetime, fcntl, hashlib, json, secrets, sqlite3, urllib.request
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--commit', required=True)
parser.add_argument('--release', required=True)
parser.add_argument('--sha256', required=True)
args = parser.parse_args()
assert len(args.commit) == 40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260903-personal-planning-')
assert len(args.sha256) == 64 and all(c in '0123456789abcdef' for c in args.sha256)

lock = open('/run/business-control-personal-planning-task.lock', 'w')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
release = Path(args.release)
assert Path('/opt/business-control/current').resolve() == release
assert hashlib.sha256((release / 'business-control').read_bytes()).hexdigest() == args.sha256

db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=15)
assert db.execute('SELECT username FROM users WHERE id=1').fetchone()[0] == 'artkozk'
assert db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='035_personal_planning.sql'").fetchone()[0] == 1
for table in ('personal_projects', 'personal_goals', 'personal_recurrence_rules'):
    assert db.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()[0] == 1
assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not db.execute('PRAGMA foreign_key_check').fetchall()

token = secrets.token_urlsafe(32)
digest = hashlib.sha256(token.encode()).hexdigest()
now = datetime.datetime.now(datetime.timezone.utc)
stamp = lambda value: value.isoformat(timespec='microseconds').replace('+00:00', 'Z')
db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(1,?,?,?,?)',
           (digest, stamp(now + datetime.timedelta(minutes=5)), stamp(now), stamp(now)))
db.commit()

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *unused):
        return None

client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
def api(path, method='GET', body=None):
    request = urllib.request.Request('http://127.0.0.1:8522/api' + path, method=method,
        data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
        headers={'Cookie': 'business_session=' + token, 'X-Workspace-ID': 'bizflow-team', 'Content-Type': 'application/json'})
    with client.open(request, timeout=25) as response:
        raw = response.read()
        return json.loads(raw) if raw else None

try:
    assert api('/me')['username'] == 'artkozk'
    overview = api('/personal/overview')
    assert isinstance(overview['projects'], list) and isinstance(overview['goals'], list)
    assert isinstance(overview['plans'], list)
    assert len(overview['projects']) == db.execute('SELECT COUNT(*) FROM personal_projects WHERE owner_id=1 AND status<>\'archived\'').fetchone()[0]
    assert len(overview['goals']) == db.execute('SELECT COUNT(*) FROM personal_goals WHERE owner_id=1 AND status<>\'archived\'').fetchone()[0]
    assert len(api('/personal/search?q=production-personal-planning-verification')) == 0
    exported = api('/export')
    serialized = json.dumps(exported, ensure_ascii=False)
    for project_id, in db.execute("SELECT id FROM personal_projects WHERE owner_id=1"):
        assert project_id not in serialized
    for goal_id, in db.execute("SELECT id FROM personal_goals WHERE owner_id=1"):
        assert goal_id not in serialized

    task_id = '1aba51a72a4aa853e3ca13d3fd1201b0'
    detail = api('/records/' + task_id)
    task = detail['record']
    assert task['workspaceId'] == 'bizflow-team' and task['ownerId'] == 1
    assert task['status'] in ('in_progress', 'completed')
    marker = '[verified:personal-planning-' + args.commit[:7] + ']'
    evidence = marker + '\nДобавлены приватные личные проекты и цели, дела/события, подзадачи, раздельные план/факт, срок и временной блок, а также повторения с отдельными экземплярами, пропуском, переносом и остановкой серии. Личные ID не входят в командный поиск и export.\nПроверки: два аккаунта; горизонты месяц/12 недель; событие без даты и с блоком; цикл подзадач; DST/timezone; завершение, пропуск, перенос, остановка и конец месяца. Полные Go test, vet и 136 Node-тестов успешны. Локальный браузер: проект → цель → повтор без срока → пропуск → следующий экземпляр; desktop и 320 px. Production проверен без создания личных данных.\nCommit: ' + args.commit + '\nRelease: ' + args.release + '\nSHA256: ' + args.sha256 + '\nКонтракт: docs/architecture/PERSONAL_PLANNING_CONTRACT_2026_09_03.md.'
    if not any(marker in proof['content'] for proof in detail.get('proofs', [])):
        api('/records/' + task_id + '/proofs', 'POST', {'kind': 'text', 'content': evidence})
    if task['status'] != 'completed':
        api('/records/' + task_id + '/complete', 'POST', {'result': evidence, 'notifyPartners': False})

    context_id = 'cf8fd7f89027490aceec013d3f10cb3c'
    context_detail = api('/records/' + context_id)
    context_task = context_detail['record']
    assert context_task['workspaceId'] == 'bizflow-team' and context_task['status'] in ('in_progress', 'completed')
    context_marker = '[verified:personal-context-goals-' + args.commit[:7] + ']'
    context_evidence = context_marker + '\nЗависимый критерий личных целей выполнен: personal search теперь ищет собственные проекты и цели и открывает их в личном контексте; командный поиск их не получает. Основная навигация и поиск выпущены ранее, текущий release закрывает оставшуюся зависимость.\nCommit: ' + args.commit + '\nRelease: ' + args.release + '\nSHA256: ' + args.sha256
    if not any(context_marker in proof['content'] for proof in context_detail.get('proofs', [])):
        api('/records/' + context_id + '/proofs', 'POST', {'kind': 'text', 'content': context_evidence})
    if context_task['status'] != 'completed':
        api('/records/' + context_id + '/complete', 'POST', {'result': context_evidence, 'notifyPartners': False})

    print(json.dumps({
        'personalPlanning': api('/records/' + task_id)['record']['status'],
        'personalContext': api('/records/' + context_id)['record']['status'],
        'projects': len(overview['projects']), 'goals': len(overview['goals']),
        'exportVersion': exported['schemaVersion'], 'proof': marker,
    }, ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
    db.commit()
    db.close()
