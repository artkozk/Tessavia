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

marker='[release:action-increment-20260908]'
evidence=(marker+' Выпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. SC-81: действие прибавляет настроенный шаг к текущему числу/сумме записи. Отрицательный шаг вычитает; результат вычисляет сервер. Пустое/нечисловое значение, неизвестная операция, переполнение и потерянный из-за точности шаг отклоняются. Десятичное сложение 0.1+0.2 даёт0.3 в существующей числовой модели. Права/условия/ревизии/схемы/атомарная история сохраняются; повтор старого подтверждения не прибавляет снова. Набор переносит операцию с новыми полями, без исходных записей. Вручную через UI настроен add1, восстановлен черновик после reload; второй редактор изменил0на2, старый apply409, обновлённый предпросмотр2→3 подтверждён. Набор установлен независимой копией, запись2→3; в копии шаг-0.5, отмена сохранила3, подтверждение/reload показали2.5.320px/длинный текст/конструктор/предпросмотр проверены. Go62.460s/web0.997s/vet/252Node919.611ms, расширенный целевой0.819s. Dry run117таблиц без изменений, схема065; HTTPS/assets/health/nginx/integrity/FK/401. PAGE_ACTION_INCREMENT_2026_09_08.md и ACTION_INCREMENT_LOCAL_2026_09_08.json. Старый SC-80 не понимает operation: rollback запрещён при сохранённых операциях. Произвольные формулы/цепочки/все элементы и полная читалка остаются открытыми.')

try:
 receipt={'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'oldTablesUnchanged':117,'tables':117,'schema':'065_record_create_requests.sql','nodeTests':252,'assets':'20260908-action-increment-1','tasks':[]}
 for task_id in ['e3462bb4cf8717ae77cb7f01f38c6103','26c54f79aa1c9110536670ae8371a868','66da4e412e714f4ea85c56ff85de03ec']:
  detail=api('/records/'+task_id)
  if not any(marker in p['content'] for p in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
  if task_id=='e3462bb4cf8717ae77cb7f01f38c6103' and detail['record']['status']!='completed':
   assert detail['record']['ownerId']==user[0] and detail['record']['authorId']==user[0]
   api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
  updated=api('/records/'+task_id)
  assert any(marker in p['content'] for p in updated.get('proofs',[]))
  if task_id=='e3462bb4cf8717ae77cb7f01f38c6103':assert updated['record']['status']=='completed'
  receipt['tasks'].append({'id':task_id,'status':updated['record']['status']})
 Path('/tmp/tessavie-action-increment-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps(receipt,ensure_ascii=False))
finally:
 db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
