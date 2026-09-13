"""Read project task titles/statuses for the personal-navigation release review.

Run on the current production host. Creates a short-lived operator session and
removes it in finally; never changes tasks or reads private personal-space data.
Only project task metadata is printed, without descriptions, proofs or results.
"""
import datetime
import hashlib
import json
from pathlib import Path
import secrets
import sqlite3
import urllib.request


workspace = 'bizflow-team'
db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=20)
user = db.execute("SELECT id FROM users WHERE username='artkozk'").fetchone()
assert user and db.execute(
    "SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=? AND status='active'",
    (workspace, user[0]),
).fetchone(), 'Expected active project operator'
token = secrets.token_urlsafe(32)
digest = hashlib.sha256(token.encode()).hexdigest()
now = datetime.datetime.now(datetime.timezone.utc)


def stamp(value):
    return value.isoformat(timespec='microseconds').replace('+00:00', 'Z')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *unused):
        return None


client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())


def api(path):
    request = urllib.request.Request(
        'http://127.0.0.1:8522/api' + path,
        headers={'Cookie': 'business_session=' + token, 'X-Workspace-ID': workspace},
    )
    with client.open(request, timeout=25) as response:
        return json.load(response)


db.execute(
    'INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)',
    (user[0], digest, stamp(now + datetime.timedelta(minutes=5)), stamp(now), stamp(now)),
)
db.commit()
try:
    assert api('/me')['username'] == 'artkozk'
    # The legacy array API deliberately returns every matching record. Confirm
    # against the same SQL predicate, so a future pagination change fails closed.
    rows = api('/records?type=task&includeArchived=true')
    expected = db.execute(
        "SELECT count(*) FROM records WHERE workspace_id=? AND type='task' AND subtype='' AND business_kind=''",
        (workspace,),
    ).fetchone()[0]
    assert isinstance(rows, list) and len(rows) == expected, 'Incomplete project task response'
    fields = ('id', 'title', 'status', 'priority', 'parentId')
    tasks = [{key: row.get(key) for key in fields} for row in rows]
    print(json.dumps({
        'readAt': stamp(now),
        'release': str(Path('/opt/business-control/current').resolve()),
        'workspace': workspace,
        'total': expected,
        'tasks': tasks,
    }, ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
    db.commit()
    db.close()
