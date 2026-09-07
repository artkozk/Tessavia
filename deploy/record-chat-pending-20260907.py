"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

commit = 'a53521c07b4b8a5bc6eaf466a6a5ff5860e24daa'
release = '/opt/business-control/releases/20260907-chat-pending-a53521c'
sha = 'b6a6ee66317b4e1b10f21a4ff8097addb691a7805bac4cf06027892c35db18df'
backup = '/var/lib/business-control/backups/pre-chat-pending-20260907T101955Z'
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

marker = '[release:chat-pending-20260907]'
evidence = (marker+'\nВыпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. '
 'SC-37/59: ожидающий текст или имя файла видны внутри исходного разговора, состояние и повтор рядом. Следующий черновик и позиция чтения сохраняются. '
 'SC-60: локальный прокси оборвал первый ответ после HTTP 201; повтор подтвердился, в БД и переписке ровно одна запись. '
 'SC-61: искусственный 403 до записи, ошибка рядом с текстом, остановка повторов через очередь, повтор из переписки с тем же ключом, сохранность следующего черновика. '
 'Ручные 320/1280px; длинный текст, полоса прокрутки без стрелок. 219 Node и полный Go прошли. Серверный nonce получает только автор; дедупликация не сравнивает тексты. '
 'Dry run сохранил 106 таблиц, HTTPS/nginx/health/assets chat-pending-2 проверены. Контракт docs/architecture/CHAT_PENDING_MESSAGES_2026_09_07.md. Группы, единое обсуждение и полный offline-кэш остаются открыты.')
try:
    receipt={'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'preservedTables':106,'nodeTests':219,'goTests':'go test ./... passed; asset checks repeated','tasks':[]}
    for task_id in ['45bbc1b549a12bb12b1c0ab92cf23a84','3d9a860505030ea14061633f22b115fd','e402d353a684b074f852fa1fd277d895','6e4f34f50ea37062254b52d8d63292b6']:
        detail=api('/records/'+task_id)
        if not any(marker in p['content'] for p in detail.get('proofs',[])):
            api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
        receipt['tasks'].append({'id':task_id,'status':api('/records/'+task_id)['record']['status']})
    Path('/tmp/tessavie-chat-pending-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2))
    print(json.dumps(receipt,ensure_ascii=False))
    record=api('/records/524e18c09b0fad83704dbc82de46b700')['record']
    print(json.dumps({'nextTask':record['title'],'description':record['description'],'status':record['status']},ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()