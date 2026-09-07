"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

commit = '40e9495ff62cb55bc79d9500dafb11d656f97c57'
release = '/opt/business-control/releases/20260907-usability-recovery-40e9495'
sha = '9924560cd781077e4630ae75f9c2eb0bf4a1a55c59500bfb7e1bfeebc56de9a9'
backup = '/var/lib/business-control/backups/pre-usability-recovery-20260907T203050Z'
assert str(Path('/opt/business-control/current').resolve()) == release
assert hashlib.sha256(Path(release+'/business-control').read_bytes()).hexdigest() == sha
assert Path(backup+'/business-control.db').is_file()
db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=20)
db.execute('PRAGMA foreign_keys=ON')
assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not db.execute('PRAGMA foreign_key_check').fetchall()
assert db.execute("SELECT count(*) FROM schema_migrations WHERE version='063_task_completion_review.sql'").fetchone()[0] == 1
assert db.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchone()[0] == 113
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

tasks=[('page-builder','P0 · Собирать собственные приложения из страниц, блоков и действий','Новый прямой запрос: пользователь должен без разработчика воссоздать сценарии, включая читалку. Нужны пустая страница, библиотека переиспользуемых блоков, свои тексты и наборы элементов, источники данных, действия и связанный прогресс. Стартовый проверяемый срез: пользователь сам собирает трекер чтения/обучения с пунктами, личными отметками и прогрессом. Не выдавать один трекер за законченный конструктор всех сценариев. Блоки можно добавлять, переименовывать, менять тип представления, переставлять, скрывать/возвращать и удалять без потери отметок. Проверить администратора/участника, проектную изоляцию, версии, сохранение/reload, отмену, длинные тексты и 320 px.','in_progress'),('element-properties','P0 · Настраивать размеры, цвета, тексты и вид элементов','Новый запрос: абсолютно все элементы, а не избранные виджеты. Настройки должны реально применяться на чтении и других страницах. Нужен выбор блока и вложенного элемента, понятные свойства размеров/отступов/типографики/цветов, скрытие и восстановление, сохранение по проекту и устройству. Общая схема сценария и личный вид различаются. Не ограничиваться косметикой: возможность сборки сценария проверяется отдельным этапом конструктора приложений.','planned')]
try:
 records=api('/records')
 if isinstance(records,dict):records=records.get('records',records.get('items',[]))
 receipt=[]
 for key,title,description,status in tasks:
  marker='[request:app-constructor-20260907:'+key+']'
  matches=[r for r in records if marker in r.get('description','')];assert len(matches)<=1
  item=matches[0] if matches else api('/records','POST',{'type':'task','title':title,'description':marker+' '+description,'ownerId':user[0],'parentId':'a288364706d6c9f0ff683003aea39009','priority':'high','workstream':'platform','status':status,'editPolicy':'shared'})
  verified=api('/records/'+item['id'])['record'];receipt.append({'id':verified['id'],'title':verified['title'],'status':verified['status']})
 Path('/tmp/tessavie-app-constructor-tasks.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps(receipt,ensure_ascii=False))
finally:
 db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
