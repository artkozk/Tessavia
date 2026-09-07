"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

commit = 'afb77d194b0d287dee1ecd3d5ba51c45ec932fb7'
release = '/opt/business-control/releases/20260907-chat-history-batch-afb77d1'
sha = 'c64a3be7f5806f723263055640c9185b0ed83d120ac7a66a0e10f048eb102ab0'
backup = '/var/lib/business-control/backups/pre-chat-history-batch-20260907T130213Z'
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

marker='[release:chat-history-batch-20260907]'
evidence=(marker+'\nВыпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. '
 'SC-65: загрузка реакций и прочтений всей страницы двумя запросами вместо двух на каждое сообщение. На странице200 дополнительных SQL400→2. Синтетический набор5000 сообщений/10000 реакций: медиана семи локальных запусков серверной функции8.3221→3.2332ms; это не сетевой SLA. Редкий поиск32–33ms не ускорен. Порядок, реакции Mine/count/usernames, граница прочтения, пустые массивы, Unicode-поиск и пагинация проверены. Ошибка чтения метаданных возвращается как ошибка вместо ложной пустоты. Ручной DM: №120 найден, ✓✓ и реакция группы сохранены, черновик SC65 сохранился после поиска и перезагрузки. Полный Go51.750s. Frontend/CSS не менялись. Dry run110 таблиц без изменений, HTTPS/health/assets/служба/nginx/integrity/FK проверены. Контракт docs/architecture/CHAT_HISTORY_BATCH_LOADING_2026_09_07.md. Большие каталоги карточек/связей/наборов и общий чат ещё не приняты целиком.')
try:
 receipt={'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'preservedTables':110,'schema':'059_personal_recurrence_templates.sql','goTests':'go test ./... passed; internal/app51.750s','benchmark':{'messages':5000,'reactions':10000,'page':200,'runs':7,'beforeMedianMs':8.3221,'afterMedianMs':3.2332,'scope':'local server function; not network SLA'},'tasks':[]}
 for task_id in ['f7f78ad1042255630386fa5b11d51f47','e402d353a684b074f852fa1fd277d895','6e4f34f50ea37062254b52d8d63292b6']:
  detail=api('/records/'+task_id)
  if not any(marker in p['content'] for p in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
  if task_id=='f7f78ad1042255630386fa5b11d51f47' and marker not in detail['record']['description']:
   r=api('/records/'+task_id)['record'];api('/records/'+task_id,'PATCH',{'description':r['description']+'\n\n'+evidence,'status':'in_progress','reason':'Проверена и ускорена страница большого чата; остальные контрольные наборы остаются в работе','expectedUpdatedAt':r['updatedAt']})
  receipt['tasks'].append({'id':task_id,'status':api('/records/'+task_id)['record']['status']})
 Path('/tmp/tessavie-chat-history-batch-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps(receipt,ensure_ascii=False))
finally:
 db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
