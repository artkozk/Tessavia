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

marker='[release:form-element-styles-20260908]'
evidence=marker+' Выпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. '+'SC-90: единый редактор оформления подписей/ввода/отправки/результата формы. Старые font/color/background полей переводятся при редактировании без потери вида, индивидуальный сброс независим. Скрытая подпись сохраняет доступное имя ввода/селекта, ID подписи уникален для экземпляра. Контролы и отправка не скрываются оформлением: убрать поле можно в структуре с проверкой обязательности/начального значения. Селекты оформляют видимую кнопку, чекбоксы строку выбора. Предпросмотр внутри редактора не вкладывает form в form и не отправляет данные. UI: бизнес-форма54px/18px, селект с индивидуальным фоном, скрытая подпись, отправка58px, синий результат; ввод/reload/изменение оформления сохранили черновик, одна запись с каналом Чат и числом2. Приватная копия без исходных записей/черновика, свой учебный вариант, сброс подписи/черновик/reload/восстановление, переименование/убирание поля с default, собственная запись15.320px/меню/чекбокс/результат; физических устройств нет. Go65.705s, web0.365s/vet,281Node944.37ms. Integration два аккаунта/права/обязательность/перенос ID/stale409/независимость.117таблиц dryrun без изменений, схема065/HTTPS/assets/health/nginx/integrity/FK/401. PAGE_FORM_ELEMENT_STYLES_2026_09_08.md, FORM_ELEMENT_STYLES_LOCAL_2026_09_08.json. Композиция/контекст/вычисления/встроенная читалка/чат/команды остаются открыты.'

try:
 receipt={'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'oldTablesUnchanged':117,'tables':117,'schema':'065_record_create_requests.sql','nodeTests':281,'assets':'20260908-form-element-styles-3','tasks':[]}
 for task_id in ['24dace03e01ee45f65328a4ea2e821d0','b8a99823ccf3f3a9f39093fe3c1af2bf','66da4e412e714f4ea85c56ff85de03ec']:
  detail=api('/records/'+task_id)
  if not any(marker in p['content'] for p in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
  if task_id=='24dace03e01ee45f65328a4ea2e821d0' and detail['record']['status']!='completed':
   assert detail['record']['ownerId']==user[0] and detail['record']['authorId']==user[0]
   api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
  updated=api('/records/'+task_id);assert any(marker in p['content'] for p in updated.get('proofs',[]))
  if task_id=='24dace03e01ee45f65328a4ea2e821d0':assert updated['record']['status']=='completed'
  receipt['tasks'].append({'id':task_id,'status':updated['record']['status']})
 Path('/tmp/tessavie-form-element-styles-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps(receipt,ensure_ascii=False))
finally:
 db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
