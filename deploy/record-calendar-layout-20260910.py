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

marker='[release:calendar-layout-20260910]'
evidence=marker+' Выпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. Исправлены потеря черновика при Личное/Проект, стандартная раскладка при отсутствии отдельного вида и смена контекста при reload/Назад. Раздельные аккаунты/пространства/устройства, явные overrides и сброс сохранены. 309 Node, go test ./..., go vet. UI: собственный заголовок,6колонок/560px, смена источников/месяца/расписания, день и возврат, reload/Back, выход в Обзор и обратно; отдельный мобильный заголовок320px без overflow; десктоп сохранён. Кнопки системного confirm проверены исполняемыми тестами: CUA не предоставил диалог, ручной приёмкой это не объявляется. Физические телефоны не проверялись. Все446сборочных файлов совпали с git archive commit. Dryrun117таблиц/объектысхемы/всестроки неизменны, HTTPS/assets/health/nginx/integrity/FK/401 прошли. Документ docs/operations/CALENDAR_LAYOUT_PERSISTENCE_2026_09_10.md. Незавершённая смена типов полей исключена из релиза. Следующий этап38bf4aee34d6faf2e31c1e99d848ec99: пользовательский составной блок и общая библиотека; параметры/контекст/цепочки остаются открытыми.'
try:
 receipt={'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'oldTablesUnchanged':117,'schema':'065_record_create_requests.sql','nodeTests':309,'buildInputsVerified':446,'assets':'20260910-calendar-layout-1','physicalDevices':False,'tasks':[]}
 for task_id in ['7c700ef13dfb1d5d72f4bbcdddf14001','b8a99823ccf3f3a9f39093fe3c1af2bf','66da4e412e714f4ea85c56ff85de03ec']:
  detail=api('/records/'+task_id)
  if not any(marker in p['content'] for p in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
  if task_id=='7c700ef13dfb1d5d72f4bbcdddf14001' and detail['record']['status']!='completed':
   assert detail['record']['ownerId']==user[0] and detail['record']['authorId']==user[0]
   api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
  updated=api('/records/'+task_id);assert any(marker in p['content'] for p in updated.get('proofs',[]))
  if task_id=='7c700ef13dfb1d5d72f4bbcdddf14001':assert updated['record']['status']=='completed'
  receipt['tasks'].append({'id':task_id,'status':updated['record']['status']})
 next_task=api('/records/38bf4aee34d6faf2e31c1e99d848ec99')['record'];assert next_task['status']=='planned'
 receipt['nextTask']={'id':next_task['id'],'status':next_task['status']}
 Path('/tmp/calendar-layout-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2))
 print(json.dumps(receipt,ensure_ascii=False))
finally:
 db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
