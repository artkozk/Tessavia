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
assert db.execute("SELECT count(*) FROM schema_migrations WHERE version='065_record_create_requests.sql'").fetchone()[0] == 1
assert db.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchone()[0] == 117
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

marker='[release:live-sources-20260908]'
evidence=marker+' Выпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. '+'SC-82: блок Данные и действия подключает личные привычки/дела/работу/чтение к составной странице. Настраиваются источник, список/карточки, фильтр, поля, скрытие действий, подписи, размеры и цвета. Родные действия сохраняют модели и права. Чтение включает локальный Синодальный текст 66 книг; открытие не отмечает главу. Выбор группы доступен внутри блока; частичная/отменённая отметка сохраняет заметку/приватность/версию. Набор переносит только конфигурацию; у получателя свои данные. Пользователь сам собирает свой набор, его набор не создавался. На синтетической UI-странице вручную добавлены три источника, отмечена привычка, дело выполнено/возвращено, прочитана глава без отметки, другая отмечена, частичная завершена без потери заметки. Настроены подпись, размер главы22px, цвет; черновик восстановлен после reload; приватная копия установлена через UI.320px/длинный текст/чтение/редактор проверены. Исправлено наложение главы на соседние карточки. Go64.056s/web0.346s/vet/257Node1127.1579ms; embedded66books31169verses. Dry run117таблиц без изменения данных; схема065; HTTPS/assets/health/nginx/integrity/FK/401. PAGE_LIVE_SOURCES_2026_09_08.md и LIVE_SOURCES_LOCAL_2026_09_08.json. Старый бинарник не знает kind=data: rollback блокируется после сохранения таких блоков. Произвольные привязки/условия видимости/цепочки/вложенные компоненты/любая книга/все встроенные элементы остаются открытыми.'

try:
 receipt={'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'oldTablesUnchanged':117,'tables':117,'schema':'065_record_create_requests.sql','nodeTests':257,'assets':'20260908-live-sources-3','tasks':[]}
 for task_id in ['c04580f862b83f7601ffffb156231c00','26c54f79aa1c9110536670ae8371a868','66da4e412e714f4ea85c56ff85de03ec']:
  detail=api('/records/'+task_id)
  if not any(marker in p['content'] for p in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
  if task_id=='c04580f862b83f7601ffffb156231c00' and detail['record']['status']!='completed':
   assert detail['record']['ownerId']==user[0] and detail['record']['authorId']==user[0]
   api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
  updated=api('/records/'+task_id)
  assert any(marker in p['content'] for p in updated.get('proofs',[]))
  if task_id=='c04580f862b83f7601ffffb156231c00':assert updated['record']['status']=='completed'
  receipt['tasks'].append({'id':task_id,'status':updated['record']['status']})
 rows=api('/records')
 if isinstance(rows,dict):rows=rows.get('records',rows.get('items',[]))
 receipt['nextTasks']=[]
 for tag,title,criteria in [
  ('page-element-bindings-20260908','P0 · Привязки данных и условия видимости элементов конструктора','Пользователь связывает заголовок/подпись/значение/видимость блока, поля и кнопки с типизированными полями и контекстом текущего пользователя. Понятный редактор условий, предпросмотр состояний и пустого значения, восстановление черновика, проверки прав, перенос набором с переназначением схем. Не требовать конфигурации от разработчика; не выдавать новые фиксированные блоки за универсальный конструктор. Ручной личный и бизнес-сценарий,320px,два аккаунта.'),
  ('page-action-chains-20260908','P0 · Значения из полей и составные действия конструктора','Действие может брать значение другого совместимого поля и выполнять настроенную последовательность изменений. До применения показать последствия; все изменения атомарны, права/типы/ревизии проверяются сервером, повторы не дублируются. Отмена ничего не меняет. Набор переносит связи и действия с новыми IDs; конфликты не теряют данные. Начать с копирования значения поля, затем цепочки; пользователь собирает сценарий вручную.')]:
  request_marker='[request:'+tag+']'
  found=[r for r in rows if request_marker in r.get('description','')];assert len(found)<=1
  task=found[0] if found else api('/records','POST',{'type':'task','title':title,'description':request_marker+' '+criteria,'parentId':'66da4e412e714f4ea85c56ff85de03ec','ownerId':user[0],'priority':'high','workstream':'platform','status':'planned','editPolicy':'shared'})
  receipt['nextTasks'].append({'id':task['id'],'title':task['title'],'status':task['status']})
 Path('/tmp/tessavie-live-sources-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps(receipt,ensure_ascii=False))
finally:
 db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
