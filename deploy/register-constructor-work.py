"""Register the user's constructor work, preserving previous task descriptions."""
import datetime, fcntl, hashlib, json, secrets, sqlite3, urllib.request
from pathlib import Path

lock = open('/run/business-control-constructor-task.lock', 'w')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=15)
assert db.execute('SELECT username FROM users WHERE id=1').fetchone()[0] == 'artkozk'
token = secrets.token_urlsafe(32)
digest = hashlib.sha256(token.encode()).hexdigest()
now = datetime.datetime.now(datetime.timezone.utc)
stamp = lambda value: value.isoformat(timespec='microseconds').replace('+00:00', 'Z')
db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(1,?,?,?,?)',
           (digest, stamp(now + datetime.timedelta(minutes=5)), stamp(now), stamp(now)))
db.commit()
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *unused): return None
client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
def api(path, method='GET', body=None):
    req = urllib.request.Request('http://127.0.0.1:8522/api' + path, method=method,
        data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
        headers={'Cookie': 'business_session=' + token, 'X-Workspace-ID': 'bizflow-team', 'Content-Type': 'application/json'})
    with client.open(req, timeout=25) as response:
        raw = response.read()
        return json.loads(raw) if raw else None
try:
    marker='[request:constructor-lifecycle-2026-09-04]'
    parent='a288364706d6c9f0ff683003aea39009'
    document=Path('/tmp/CONSTRUCTOR_AND_BOUNDED_WORK_2026_09_04.md').read_text(encoding='utf-8')
    task=api('/records/'+parent)['record']
    addition='[scope:constructor-lifecycle-2026-09-04]'
    if addition not in task['description']:
        api('/records/'+parent,'PATCH',{'description':task['description']+'\n\n'+addition+'\nНовый прямой запрос владельца разрешает начать работу вместо прежней отсрочки. Первый этап: удаление/восстановление и порядок полей/колонок, понятная настройка общей доски, ограниченная очередь. Произвольные типы, формулы и конверсия заполненных полей остаются следующими критериями.', 'status':'in_progress','priority':'high','reason':'Прямой запрос владельца 04.09.2026: начать конструктор и исправить большие списки','expectedUpdatedAt':task['updatedAt']})
    rows=db.execute("SELECT id FROM records WHERE workspace_id='bizflow-team' AND instr(description,?)>0",(marker,)).fetchall()
    assert len(rows)<=1
    if rows: task_id=rows[0][0]
    else:
        task_id=api('/records','POST',{'type':'task','title':'Удаление полей и колонок, порядок схемы и компактная очередь','description':marker+'\n'+document,'status':'in_progress','priority':'high','ownerId':1,'parentId':parent})['id']
    print(json.dumps({'taskId':task_id,'status':api('/records/'+task_id)['record']['status'],'parent':parent}))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
