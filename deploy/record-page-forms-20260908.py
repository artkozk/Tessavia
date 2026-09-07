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

marker='[release:page-forms-20260908]'
evidence=(marker+' Выпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. SC-77: самостоятельный блок формы создания записи, выбор полей и порядка, скрытие/возврат основных и пользовательских полей, подписи/подсказки/ширины/шрифт/цвета, начальное название без отдельного ввода, текст кнопки и результата. Сервер проверяет источник/обязательность/конфигурацию, API email больше не принимает invalid. Набор переносит форму и независимую схему с новыми IDs. Локальный UI: ручная сборка, предпросмотр без записи, черновик после reload, создание и обновление списка, установка пустой копии, скрытое название с понятной ошибкой без default, создание после явной настройки default, значение0 и320px. Исправлены иконки перемещения, блокировка формы при отправке, сохранение подтверждения при фоне.243Node, полныйGo60.061s, web1.063s, vet; старый habit-snooze тест уточнён по дню при переходе UTC-полуночи, продуктовый алгоритм привычек не менялся. Dry run116таблиц без изменений, HTTPS/assets/health/nginx/integrity/FK/401. PAGE_FORMS_2026_09_08.md. Изменение существующих записей, условные действия, вычисления, идемпотентная отправка и настройка всех встроенных элементов остаются открытыми.')

try:
 receipt={'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'tablesUnchanged':116,'schema':'064_page_app_composition.sql','nodeTests':243,'assets':'20260908-page-forms-3','tasks':[]}
 for task_id in ['4c629c5a9eec7e53a5b11ecba1060cb4','26c54f79aa1c9110536670ae8371a868','66da4e412e714f4ea85c56ff85de03ec']:
  detail=api('/records/'+task_id)
  if not any(marker in p['content'] for p in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
  if task_id=='4c629c5a9eec7e53a5b11ecba1060cb4' and detail['record']['status']!='completed':
   assert detail['record']['ownerId']==user[0] and detail['record']['authorId']==user[0]
   api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
  updated=api('/records/'+task_id)
  assert any(marker in p['content'] for p in updated.get('proofs',[]))
  if task_id=='4c629c5a9eec7e53a5b11ecba1060cb4':assert updated['record']['status']=='completed'
  receipt['tasks'].append({'id':task_id,'status':updated['record']['status']})
 follow_marker='[request:record-create-idempotency-20260908]'
 records=api('/records')
 if isinstance(records,dict):records=records.get('records',records.get('items',[]))
 found=[r for r in records if follow_marker in r.get('description','')];assert len(found)<=1
 follow=found[0] if found else api('/records','POST',{'type':'task','title':'P0 · Повторять отправку формы без дублирования записи','description':follow_marker+' POST records пока создаёт новый ID при каждом запросе. Блокировка кнопки не защищает от потерянного ответа и повторной отправки. Добавить идемпотентный ключ для одного намерения создания, область пользователь/пространство, проверку совпадения тела, атомарность записи и результата, восстановление ключа в черновике и повтор после неопределённого ответа. Проверить два одинаковых конкурентных запроса, иной payload с тем же ключом, чужой проект/пользователя и reload. Старые клиентские записи не объединять автоматически. Сначала этот критерий безопасных форм, затем действия изменения и условия.','ownerId':user[0],'parentId':'26c54f79aa1c9110536670ae8371a868','priority':'high','workstream':'platform','status':'planned','editPolicy':'shared'})
 receipt['nextTask']={'id':follow['id'],'title':follow['title'],'status':api('/records/'+follow['id'])['record']['status']}
 Path('/tmp/tessavie-page-forms-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps(receipt,ensure_ascii=False))
finally:
 db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
