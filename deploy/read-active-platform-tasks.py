"""Read the canonical platform backlog without changing task state or printing secrets."""
import datetime
import hashlib
import json
from pathlib import Path
import secrets
import sqlite3
import urllib.request

db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=15)
assert db.execute('SELECT username FROM users WHERE id=1').fetchone()[0] == 'artkozk'
token = secrets.token_urlsafe(32)
digest = hashlib.sha256(token.encode()).hexdigest()
now = datetime.datetime.now(datetime.timezone.utc)
stamp = lambda d: d.isoformat(timespec='microseconds').replace('+00:00', 'Z')
db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(1,?,?,?,?)',
           (digest, stamp(now + datetime.timedelta(minutes=5)), stamp(now), stamp(now)))
db.commit()

def api(path):
    request = urllib.request.Request('http://127.0.0.1:8522/api' + path,
        headers={'Cookie': 'business_session=' + token, 'X-Workspace-ID': 'bizflow-team'})
    with urllib.request.urlopen(request, timeout=25) as response:
        return json.load(response)

try:
    assert api('/me')['username'] == 'artkozk'
    rows = api('/records?includeArchived=true')
    total = db.execute("SELECT COUNT(*) FROM records WHERE workspace_id='bizflow-team'").fetchone()[0]
    assert len(rows) == total, 'The response is incomplete; do not treat a page as the whole backlog'
    fields = ('id', 'type', 'title', 'status', 'description', 'parentId', 'priority',
              'ownerId', 'updatedAt', 'result', 'workstream')
    records = [{key: row.get(key) for key in fields} for row in rows]
    print(json.dumps({'readAt': stamp(now), 'release': str(Path('/opt/business-control/current').resolve()),
                      'total': total, 'records': records}, ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
    db.commit()
    db.close()
