"""Verify independent production teams and append evidence to the existing task."""
import argparse, datetime, fcntl, hashlib, json, secrets, sqlite3, urllib.error, urllib.request
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--commit', required=True); p.add_argument('--release', required=True); p.add_argument('--sha256', required=True)
args = p.parse_args()
assert len(args.commit) == 40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260903-team-workspaces-')
release = Path(args.release)
assert Path('/opt/business-control/current').resolve() == release
assert hashlib.sha256((release/'business-control').read_bytes()).hexdigest() == args.sha256
lock = open('/run/business-control-team-release.lock', 'w')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=15)
assert db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='036_one_team_per_workspace.sql'").fetchone()[0] == 1
assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not db.execute('PRAGMA foreign_key_check').fetchall()
expected = {'bizflow-team': 'team-bizflow-team', 'crm-first-client': 'team-space-crm-first-client',
            '350cf609e61f3e35b9f89fc1556969d5': 'team-space-350cf609e61f3e35b9f89fc1556969d5'}
for workspace, team in expected.items():
    assert db.execute('SELECT team_id FROM workspaces WHERE id=?', (workspace,)).fetchone()[0] == team
    assert db.execute("SELECT COUNT(*) FROM workspaces WHERE team_id=? AND kind='team'", (team,)).fetchone()[0] == 1
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *unused): return None
client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
digests = []
def session(username):
    user_id = db.execute('SELECT id FROM users WHERE username=?', (username,)).fetchone()[0]
    token = secrets.token_urlsafe(32); digest = hashlib.sha256(token.encode()).hexdigest()
    now = datetime.datetime.now(datetime.timezone.utc)
    stamp = lambda value: value.isoformat(timespec='microseconds').replace('+00:00', 'Z')
    db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)',
               (user_id, digest, stamp(now + datetime.timedelta(minutes=5)), stamp(now), stamp(now)))
    db.commit(); digests.append(digest)
    return token
def api(token, path, method='GET', body=None, workspace='bizflow-team'):
    req = urllib.request.Request('http://127.0.0.1:8522/api' + path, method=method,
        data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
        headers={'Cookie': 'business_session=' + token, 'X-Workspace-ID': workspace, 'Content-Type': 'application/json'})
    with client.open(req, timeout=25) as response:
        raw=response.read(); return json.loads(raw) if raw else None
try:
    owner = session('artkozk')
    teams = api(owner, '/teams')
    assert set(expected.values()) <= {t['id'] for t in teams}
    assert set(expected) <= {w['id'] for w in api(owner, '/workspaces')}
    for team_id in expected.values():
        detail = api(owner, '/teams/' + team_id)
        assert len(detail['projects']) == 1
        workspace_id = detail['projects'][0]['id']
        actual = {member['id'] for member in detail['members']}
        target = {row[0] for row in db.execute("SELECT user_id FROM workspace_members WHERE workspace_id=? AND status='active'", (workspace_id,))}
        assert actual == target
    for username, allowed in [('voldemar_qwerty', '350cf609e61f3e35b9f89fc1556969d5'), ('sweetybboy', 'bizflow-team')]:
        token = session(username)
        assert {w['id'] for w in api(token, '/workspaces') if w['kind']=='team'} == {allowed}
        for other in set(expected)-{allowed}:
            for path in ('/records', '/collections', '/search?q=verify', '/export'):
                try: api(token, path, workspace=other)
                except urllib.error.HTTPError as error: assert error.code == 403
                else: raise AssertionError(username + ' can read another team')
        assert isinstance(api(token, '/personal/overview')['habits'], list)
    marker = '[verified:team-workspaces-' + args.commit[:7] + ']'
    task_id = '1168ce733dc42915ee54c9dd8d6b773f'
    detail = api(owner, '/records/' + task_id)
    evidence = marker + '\nTessavie, CRM и «Владов стартап» разделены на независимые команды. ID рабочих пространств и содержимое карточек, досок, чата, файлов и личных данных сохранены. Состав каждой команды соответствует прежнему доступу к её пространству; неоднозначные старые приглашения отозваны. Администратор ограничен одной командой. Выход виден прямо в списке и заголовке; владелец сначала передаёт права.\nДобавление на доску доступно всем 14 типам, с выбором этапа и сохранением типа/состояния. Проверены создание первой доски из идеи и выход участника; Go test/vet, 139 Node-тестов, desktop/320px. Реальные мобильные устройства не проверялись. Production: owner видит три команды, два других пользователя видят только свою; чужие records/collections/search/export дают 403.\nЭто доказательство частичного этапа. Большая задача профилей и участников остаётся открытой.\nCommit: ' + args.commit + '\nRelease: ' + args.release + '\nSHA256: ' + args.sha256 + '\nКонтракт: docs/architecture/TEAM_WORKSPACE_AND_BOARD_ASSIGNMENT_CONTRACT_2026_09_03.md.'
    if not any(marker in proof['content'] for proof in detail.get('proofs', [])):
        api(owner, '/records/' + task_id + '/proofs', 'POST', {'kind':'text','content':evidence})
    assert api(owner, '/records/' + task_id)['record']['status'] == detail['record']['status']
    print(json.dumps({'teamIsolation':'verified','teams':len(expected),'taskStatus':detail['record']['status'],'proof':marker},ensure_ascii=False))
finally:
    for digest in digests: db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
    db.commit(); db.close()
