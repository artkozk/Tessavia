"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

commit = '21ad00a6a5083a7524aba1cfbd3d2e841fc2e8da'
release = '/opt/business-control/releases/20260907-chat-groups-21ad00a'
sha = 'a1362a12e66c9f1386d35010cf788e8a5481c25b0d004537234eeb68e57c00b7'
backup = '/var/lib/business-control/backups/pre-chat-groups-20260907T105953Z'
assert str(Path('/opt/business-control/current').resolve()) == release
assert hashlib.sha256(Path(release+'/business-control').read_bytes()).hexdigest() == sha
assert Path(backup+'/business-control.db').is_file()
db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=20)
db.execute('PRAGMA foreign_keys=ON')
assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not db.execute('PRAGMA foreign_key_check').fetchall()
user = db.execute("SELECT id FROM users WHERE username='artkozk'").fetchone()
assert user and db.execute("SELECT 1 FROM workspace_members WHERE workspace_id='bizflow-team' AND user_id=? AND status='active'", user).fetchone()
token = secrets.token_urlsafe(32)
digest = hashlib.sha256(token.encode()).hexdigest()
now = datetime.datetime.now(datetime.timezone.utc)
def stamp(value): return value.isoformat(timespec='microseconds').replace('+00:00', 'Z')
db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)', (user[0], digest, stamp(now+datetime.timedelta(minutes=5)), stamp(now), stamp(now)))
db.commit()
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *unused): return None
client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
def api(path, method='GET', body=None):
    request = urllib.request.Request('http://127.0.0.1:8522/api'+path, method=method, data=None if body is None else json.dumps(body, ensure_ascii=False).encode(), headers={'Cookie':'business_session='+token, 'X-Workspace-ID':'bizflow-team', 'Content-Type':'application/json'})
    with client.open(request, timeout=25) as response:
        raw = response.read()
        return json.loads(raw) if raw else None

try:
    path='/records/0311dbcf668203acd4ffb32461307d9b';record=api(path)['record']
    marker='[implementation:recurrence-template-20260907]'
    addition=marker+'\nНачато исправление SC-10: отдельный шаблон и исходная дата экземпляра, разовые правки не меняют будущее, явное изменение всей серии с версией, сохранение истории. Проверить недельный ритм после переноса, концы месяцев, DST, остановку/пропуски/дубли и приватность. Контракт docs/architecture/PERSONAL_RECURRENCE_TEMPLATES_2026_09_07.md. Прогноз будущих повторений в календаре — следующий этап; вся задача пока не завершена.'
    if marker not in record['description']:
        api(path,'PATCH',{'description':record['description']+'\n\n'+addition,'status':'in_progress','reason':'Начато исправление воспроизведённой ошибки повторений','expectedUpdatedAt':record['updatedAt']})
    print(json.dumps({'id':record['id'],'status':api(path)['record']['status']},ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()