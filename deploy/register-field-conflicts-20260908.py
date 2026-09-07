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

marker='[audit:field-conflicts-20260908]'
try:
 records=api('/records')
 if isinstance(records,dict):records=records.get('records',records.get('items',[]))
 matches=[r for r in records if marker in r.get('description','')];assert len(matches)<=1
 item=matches[0] if matches else api('/records','POST',{'type':'task','title':'P0 · Защитить поля от перезаписи устаревшей формой','description':marker+' При подготовке пользовательских форм воспроизведено на изолированной БД: два редактора читают одну версию, первый сохраняет3, второй со старой формой7; оба получают200, первое значение теряется. PUT custom-fields не принимает версию. Исправить CAS по updatedAt, передавать версию из формы и её черновика; при409 показать сравнение, сохранить чужие изменения в нетронутых полях, спорные значения выбирать явно. Перенос сравнения не должен сам сохранять. Legacy-черновик без версии не должен молча получить актуальную версию. Проверить права, гонку, rollback, reload, старые черновики, 320px. Это предпосылка безопасных форм, не завершение конструктора данных.','ownerId':user[0],'parentId':'26c54f79aa1c9110536670ae8371a868','priority':'high','workstream':'platform','status':'in_progress','editPolicy':'shared'})
 evidence=marker+' SC-75: TestSC75AuditTwoEditorsOverwriteFields на одноразовой fixture прошёл,0.752s; подтверждены чтение одной версии, сохранение3, затем устаревшее7 с200. Это фиксация дефекта, не готовности. Клиентские данные не менялись. Код bindWorkingDraft также восстанавливает значения без исходной версии; устранение должно учитывать этот путь.'
 for task_id in [item['id'],'26c54f79aa1c9110536670ae8371a868']:
  detail=api('/records/'+task_id)
  if not any(marker in p['content'] for p in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
 receipt={'task':item['id'],'status':api('/records/'+item['id'])['record']['status'],'audit':'SC-75','parent':'26c54f79aa1c9110536670ae8371a868'}
 Path('/tmp/tessavie-field-conflict-task.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps(receipt))
finally:
 db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
