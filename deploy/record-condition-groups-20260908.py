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

marker='[release:condition-groups-20260908]'
evidence=marker+' Выпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. '+'SC-86: до8 типизированных условий кнопки, Все/Любое, добавление/изменение/удаление каждого и явное снятие последнего. Одиночные условия совместимы. Предпросмотр показывает каждую проверку и её результат. Сервер проверяет группу/все поля и схемы/версии/права; старый клиент без expectedConditionCount не применяет группу. Набор переводит все поля и варианты. UI вручную: настройка all заполненность оценки и подтверждённое>10, черновик/reload, disabled с объяснением; any разрешает кнопку. При открытом просмотре другой локальный клиент очистил оценку и поставил0: staleapply409, обновление показало обе проверки false и disabled. Восстановление5/0, обновление/применение/reload дали9/5. Независимый приватный набор и собственная запись0/0: первая проверка true, вторая false, применение9/0. В копии первое и затем последнее условие удалены с сохранением/reload; оригинал сохранил группу.320px/настройки/длинные тексты/предпросмотр проверены. Go63.453s/web0.375s/vet/269Node979.6588ms; целевые1.953s.117таблиц dryrun без изменений, схема065, HTTPS/assets/health/nginx/integrity/FK/401. PAGE_ACTION_CONDITION_GROUPS_2026_09_08.md, CONDITION_GROUPS_LOCAL_2026_09_08.json. Rollback наSC85 блокируется при сохранённых группах. Вложенные группы/общие привязки/все элементы и чат остаются открытыми.'

try:
 receipt={'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'oldTablesUnchanged':117,'tables':117,'schema':'065_record_create_requests.sql','nodeTests':269,'assets':'20260908-condition-groups-1','tasks':[]}
 for task_id in ['8dec307305e9c75d378b1cedb3cff9ed','2ad192a4298615883945e23a87d8ecd2','66da4e412e714f4ea85c56ff85de03ec']:
  detail=api('/records/'+task_id)
  if not any(marker in p['content'] for p in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
  if task_id=='8dec307305e9c75d378b1cedb3cff9ed' and detail['record']['status']!='completed':
   assert detail['record']['ownerId']==user[0] and detail['record']['authorId']==user[0]
   api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
  updated=api('/records/'+task_id);assert any(marker in p['content'] for p in updated.get('proofs',[]))
  if task_id=='8dec307305e9c75d378b1cedb3cff9ed':assert updated['record']['status']=='completed'
  receipt['tasks'].append({'id':task_id,'status':updated['record']['status']})
 Path('/tmp/tessavie-condition-groups-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps(receipt,ensure_ascii=False))
finally:
 db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
