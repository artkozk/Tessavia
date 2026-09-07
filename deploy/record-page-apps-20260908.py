"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

import os
commit = os.environ['CANDIDATE_COMMIT']
release = os.environ['VERIFIED_RELEASE']
sha = os.environ['EXPECTED_SHA256']
backup = os.environ['VERIFIED_BACKUP']
assert str(Path('/opt/business-control/current').resolve()) == release
assert hashlib.sha256(Path(release+'/business-control').read_bytes()).hexdigest() == sha
assert Path(backup+'/business-control.db').is_file()
db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=20)
db.execute('PRAGMA foreign_keys=ON')
assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not db.execute('PRAGMA foreign_key_check').fetchall()
assert db.execute("SELECT count(*) FROM schema_migrations WHERE version='064_page_app_composition.sql'").fetchone()[0] == 1
assert db.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchone()[0] == 116
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

marker='[release:page-apps-20260908]'
evidence=(marker+' Выпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. '
 'SC-74: пользователь создаёт пустую страницу из заголовков, текста, трекеров, прогресса и кнопок перехода; меняет название страницы/блоков, тип, порядок, вид пунктов, размеры, цвета, отступы и скрытие/восстановление. Набор переносит декларативную структуру, тексты и связи, но не личные отметки; установка создаёт независимую копию. Владелец публикует/снимает публикацию, ранее установленные копии сохраняются. Браузер 320/1280 px: три главы, 33%, шаблон 0%, копия переименована и получила четвёртую главу, после reload 0/4; оригинал остался 1/3. Черновик сохраняет недобавленные строки. Go suite, 235 Node, go vet прошли. Dry run: 113 прежних таблиц без изменения строк, три новые пустые таблицы, схема064; HTTPS/assets/health/nginx/integrity/FK проверены. Контракт PAGE_APP_BUILDER_2026_09_08.md. Это первый срез: произвольные данные/формы/действия, все встроенные элементы и полная читалка ещё не реализованы. Большие направления открыты; физических телефонов не проверяли.')
try:
 records=api('/records')
 if isinstance(records,dict):records=records.get('records',records.get('items',[]))
 receipt={'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'schema':'064_page_app_composition.sql','oldTablesUnchanged':113,'newTables':3,'nodeTests':235,'assets':'20260908-page-apps-4','tasks':[]}
 child=None
 specs=[('portable-basic-pages','P0 · Устанавливать независимые наборы страниц из базовых блоков','Сохранить собранную с нуля страницу с блоками/оформлением/связями, увидеть предпросмотр без результатов автора, установить отдельную копию и изменить её без влияния на оригинал. Приватные/публичные наборы, публикация и снятие, только владелец меняет доступ. Личные отметки не переносятся. Проверить роли, проекты, reload, 320 px. Это узкий этап базовых блоков, не полная система приложений.','in_progress'),('data-forms-actions','P0 · Связать пользовательские данные, формы и действия страницы','Следующий этап после SC-74. Пользователь сам определяет типизированную коллекцию, собирает форму ввода, список/детали и действие изменения записи через UI, связывает элементы без кода разработчика. Нужны проверки данных, права пространства/личных записей, предпросмотр действия, ошибки без потери ввода, стабильные IDs. Затем набор должен переносить зависимые схемы/действия без клиентских данных и создавать независимую рабочую копию. Приёмка: учебный журнал и один бизнес-сценарий собраны с нуля через UI; не выдавать трекер за полную читалку.','planned')]
 for key,title,description,status in specs:
  tag='[request:page-apps-20260908:'+key+']'
  matches=[r for r in records if tag in r.get('description','')];assert len(matches)<=1
  item=matches[0] if matches else api('/records','POST',{'type':'task','title':title,'description':tag+' '+description,'ownerId':user[0],'parentId':'66da4e412e714f4ea85c56ff85de03ec','priority':'high','workstream':'platform','status':status,'editPolicy':'shared'})
  if key=='portable-basic-pages':child=item['id']
  receipt['tasks'].append({'id':item['id'],'title':item['title'],'status':item['status']})
 for task_id in [child,'66da4e412e714f4ea85c56ff85de03ec','a288364706d6c9f0ff683003aea39009','6e4f34f50ea37062254b52d8d63292b6','f1a7f01c558ae9a84bc6e5cb90f2c73f','b8a99823ccf3f3a9f39093fe3c1af2bf']:
  detail=api('/records/'+task_id)
  if not any(marker in proof['content'] for proof in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
  if task_id==child and detail['record']['status']!='completed':
   assert detail['record']['ownerId']==user[0] and detail['record']['authorId']==user[0]
   api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
  updated=api('/records/'+task_id)
  assert any(marker in proof['content'] for proof in updated.get('proofs',[]))
  if task_id==child:assert updated['record']['status']=='completed'
  receipt['tasks'].append({'id':task_id,'status':updated['record']['status']})
 assert api('/page-app/templates') is not None
 Path('/tmp/tessavie-page-apps-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps(receipt,ensure_ascii=False))
finally:
 db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
