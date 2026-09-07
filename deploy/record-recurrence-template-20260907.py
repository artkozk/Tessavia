"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

commit = '7171d64334e6b0ea3efdca4034257ff859aff2ae'
release = '/opt/business-control/releases/20260907-recurrence-template-7171d64'
sha = 'c0c34fe2aa7bf72c20b0eabd577fa21fb2a0cfbc8f58a1f038e6432818444909'
backup = '/var/lib/business-control/backups/pre-recurrence-template-20260907T114443Z'
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

marker='[release:recurrence-template-20260907]'
evidence=(marker+'\nВыпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. '
 'SC-63: независимый шаблон и номинальная дата повторения; разовые правки/перенос не меняют следующие недели; общая правка явно выбрана, с версией и сохранением истории. Проверены создание, перенос 7→9, следующее 14, восстановление черновика общей правки, пропуск→21, остановка без 28-го. 320/1280 px. Timed task теперь виден в расписании Сегодня. 223 Node, полный Go 50.525s; миграция сохранила 108 старых таблиц, integrity/FK/HTTPS/assets проверены. Контракт docs/architecture/PERSONAL_RECURRENCE_TEMPLATES_2026_09_07.md. Будущий горизонт календаря ещё открыт; задачу повторений целиком не закрываем.')
try:
    receipt={'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'preservedTables':108,'schema':'059_personal_recurrence_templates.sql','nodeTests':223,'goTests':'go test ./... passed; final web assets passed','tasks':[]}
    for task_id in ['0311dbcf668203acd4ffb32461307d9b','6e4f34f50ea37062254b52d8d63292b6','f1a7f01c558ae9a84bc6e5cb90f2c73f']:
        detail=api('/records/'+task_id)
        if not any(marker in proof['content'] for proof in detail.get('proofs',[])):
            api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
        receipt['tasks'].append({'id':task_id,'status':api('/records/'+task_id)['record']['status']})
    path='/records/40842b928756f5898e49a6ea09629584';record=api(path)['record']
    if marker not in record['description']:api(path,'PATCH',{'description':record['description']+'\n\n'+evidence,'expectedUpdatedAt':record['updatedAt']})
    Path('/tmp/tessavie-recurrence-template-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2))
    print(json.dumps(receipt,ensure_ascii=False))
    record=api('/records/0311dbcf668203acd4ffb32461307d9b')['record']
    print(json.dumps({'id':record['id'],'title':record['title'],'status':record['status'],'description':record['description']},ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
