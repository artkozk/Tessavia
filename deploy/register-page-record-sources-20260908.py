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

marker='[request:page-record-sources-20260908]'
try:
 records=api('/records')
 if isinstance(records,dict):records=records.get('records',records.get('items',[]))
 found=[r for r in records if marker in r.get('description','')];assert len(found)<=1
 item=found[0] if found else api('/records','POST',{'type':'task','title':'P0 · Подключать записи к странице и переносить схемы набором','description':marker+' Первый связанный блок конструктора: выбрать существующую доску, отображаемые пользовательские поля и кнопку добавления записи; поиск, открытие существующей карточки и создание через проверенную форму. Набор переносит схемы всех использованных досок, этапы, поля, варианты и начальные значения, создаёт новые IDs и независимые пустые доски атомарно со страницей. Клиентские записи, личные отметки и внешние ссылки не копировать. Проверить источник другого проекта, архив/отсутствие поля, две ссылки на одну доску без дубля схемы, remap начального select, rollback испорченной зависимости, независимость оригинала, UI 320 px. Это не произвольный конструктор формы/действий: следующий этап остаётся открытым.','ownerId':user[0],'parentId':'26c54f79aa1c9110536670ae8371a868','priority':'high','workstream':'platform','status':'in_progress','editPolicy':'shared'})
 receipt={'task':item['id'],'title':item['title'],'status':api('/records/'+item['id'])['record']['status']}
 Path('/tmp/tessavie-page-record-source-task.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps(receipt,ensure_ascii=False))
finally:
 db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
