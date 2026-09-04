"""Idempotent, server-local setup of the requested owner's reading team.

Run only after deployment/backup, on the approved production host. No credentials
or private reading text are printed. A five-minute maintenance session is revoked
in finally. The normal API performs team creation and feature enablement.
"""
import argparse
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
import urllib.error
import urllib.parse

parser = argparse.ArgumentParser()
parser.add_argument('--username', default='artkozk')
parser.add_argument('--database', default='/var/lib/business-control/business-control.db')
parser.add_argument('--base-url', default='http://127.0.0.1:8522')
args = parser.parse_args()
url = urllib.parse.urlparse(args.base_url)
assert url.scheme == 'http' and url.hostname == '127.0.0.1' and not url.username
db = sqlite3.connect(args.database, timeout=20)
db.execute('PRAGMA foreign_keys=ON')
user = db.execute('SELECT id, username FROM users WHERE username=?', (args.username,)).fetchone()
assert user and user[1] == args.username, 'Requested account not found; no fallback to first user'
assert db.execute("SELECT 1 FROM schema_migrations WHERE version='046_homegroup_reading.sql'").fetchone()
assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
# Refuse ambiguous/deleted names, instead of silently creating another team.
candidates = list(db.execute('SELECT id, deleted_at FROM teams WHERE owner_id=? AND name=?', (user[0], 'Домашка')))
assert len(candidates) <= 1 and all(row[1] is None for row in candidates), 'Ambiguous or deleted Домашка; inspect before setup'
token = secrets.token_urlsafe(32)
digest = hashlib.sha256(token.encode()).hexdigest()
now = datetime.datetime.now(datetime.timezone.utc)
stamp = lambda value: value.isoformat(timespec='microseconds').replace('+00:00', 'Z')
db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)',
           (user[0], digest, stamp(now+datetime.timedelta(minutes=5)), stamp(now), stamp(now)))
db.commit()

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *unused):
        return None

client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

def api(path, method='GET', payload=None, workspace=None):
    headers = {'Cookie': 'business_session='+token, 'Content-Type': 'application/json'}
    if workspace:
        headers['X-Workspace-ID'] = workspace
    req = urllib.request.Request(args.base_url+'/api'+path, method=method, headers=headers,
        data=None if payload is None else json.dumps(payload, ensure_ascii=False).encode())
    with client.open(req, timeout=25) as response:
        return json.load(response)

try:
    assert api('/me')['username'] == args.username
    workspaces = api('/workspaces')
    matches = [w for w in workspaces if w.get('teamId') in {t[0] for t in candidates}]
    assert len(matches) == len(candidates), 'Existing team is inaccessible; do not duplicate'
    if matches:
        workspace = matches[0]
        assert workspace['role'] == 'owner'
    else:
        workspace = api('/workspaces', 'POST', {
            'name': 'Домашка',
            'description': 'Чтение Библии, личные размышления и подготовка к домашним встречам по вторникам.'})
    # Only this explicitly idempotent operation is retried after a lost reply.
    # Team creation is never blindly retried: rerunning the script re-discovers it.
    for attempt in range(2):
        try:
            api('/reading/enable', 'POST', {}, workspace['id'])
            break
        except urllib.error.HTTPError:
            raise
        except (ConnectionError, TimeoutError, urllib.error.URLError):
            if attempt:
                raise
    # New team starts with reading and chat. Existing customization is preserved.
    navigation = api('/workspace/navigation', workspace=workspace['id'])
    if not matches or navigation['enabledViews'] == ['dashboard', 'work', 'calendar', 'collections', 'chat']:
        api('/workspace/navigation', 'PUT', {'enabledViews': ['reading', 'chat', 'calendar']}, workspace['id'])
    overview = api('/reading', workspace=workspace['id'])
    assert overview['enabled'] and overview['timezone'] == 'Europe/Moscow'
    assert len(overview['books']) == 66 and overview['groups']
    print(json.dumps({'username': args.username, 'teamId': workspace['teamId'],
        'workspaceId': workspace['id'], 'groupId': overview['groups'][0]['id'],
        'created': not bool(matches), 'verified': True}, ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
    db.commit()
    db.close()
