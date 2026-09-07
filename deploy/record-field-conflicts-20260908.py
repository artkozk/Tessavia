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

marker='[release:field-conflicts-20260908]'
evidence=(marker+' Выпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. SC-75: воспроизведена потеря поля двумя редакторами, затем добавлен обязательный expectedUpdatedAt и CAS/rollback. Форма и её черновик хранят исходную версию и значения.409 открывает сравнение: нетронутые поля берутся из текущей карточки, спорные значения требуют явного выбора; перенос в форму не сохраняет автоматически. Legacy-черновики без версии не получают актуальную версию молча. Изолированные тесты stale/missing версии, валидация без частичной записи, перенос нетронутых полей;239Node и полныйGo, vet. Локальный UI:1→7 при параллельном3; сравнение показывает3/7, выбранное7 переносится вместе с обновлённым коллегой примечанием; проверены320px и восстановленный черновик после reload. Dry run сравнил116таблиц, данные/схема неизменны; HTTPS/assets/401/health/nginx/integrity/FK успешны. DATA_FORMS_ACTIONS_2026_09_08.md. Пользовательские источники/формы/действия конструктора ещё не выпущены, большие задачи открыты.')
try:
 receipt={'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'tablesUnchanged':116,'schema':'064_page_app_composition.sql','nodeTests':239,'assets':'20260908-field-conflicts-2','tasks':[]}
 for task_id in ['e45e995dbc1b20bb00c578ae89ae2558','26c54f79aa1c9110536670ae8371a868','66da4e412e714f4ea85c56ff85de03ec','6e4f34f50ea37062254b52d8d63292b6']:
  detail=api('/records/'+task_id)
  if not any(marker in p['content'] for p in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
  if task_id=='e45e995dbc1b20bb00c578ae89ae2558' and detail['record']['status']!='completed':
   assert detail['record']['ownerId']==user[0] and detail['record']['authorId']==user[0]
   api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
  updated=api('/records/'+task_id)
  assert any(marker in p['content'] for p in updated.get('proofs',[]))
  if task_id=='e45e995dbc1b20bb00c578ae89ae2558':assert updated['record']['status']=='completed'
  receipt['tasks'].append({'id':task_id,'status':updated['record']['status']})
 Path('/tmp/tessavie-field-conflicts-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps(receipt,ensure_ascii=False))
finally:
 db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
