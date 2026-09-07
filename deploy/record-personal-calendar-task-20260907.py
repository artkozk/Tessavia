"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

commit = 'fd49fa85b947c1811a899b5412e49eb9990a4b04'
release = '/opt/business-control/releases/20260907-record-chat-fd49fa8'
sha = '9bd6b68fd71898f7a910ffcc209bf915819013cbe4c669741f8a6ee9d4296486'
backup = '/var/lib/business-control/backups/pre-record-chat-20260907T072900Z'
assert str(Path('/opt/business-control/current').resolve()) == release
assert hashlib.sha256(Path(release+'/business-control').read_bytes()).hexdigest() == sha
assert Path(backup+'/business-control.db').is_file()
db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=20)
db.execute('PRAGMA foreign_keys=ON')
assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not db.execute('PRAGMA foreign_key_check').fetchall()
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

marker = '[request:personal-work-calendar-20260907]'
title = 'Показывать рабочие задачи в личном календаре и подтверждать пересечения'
try:
    row = db.execute("SELECT id FROM records WHERE workspace_id='bizflow-team' AND (title=? OR instr(description,?)>0)",(title,marker)).fetchone()
    if row:
        task=api('/records/'+row[0])['record']
    else:
        task=api('/records','POST',{'type':'task','title':title,'description':marker+'\nПрямой запрос пользователя: гибкая платформа-конструктор, личный календарь только личный либо вместе с рабочими задачами, предупреждение о скрытых пересечениях и явное подтверждение. Приёмка: назначенные пользователю карточки всех доступных проектов и досок; личный временной блок без изменения дедлайна команды; проверка независимо от фильтра; открытие обеих записей; подтверждение точно текущих интервалов и отмена; перенос требует нового подтверждения; приватность и отзыв доступа. Документ docs/architecture/PERSONAL_WORK_CALENDAR_2026_09_07.md. Один блок на рабочую карточку в первом этапе; работа не ограничивается встроенным типом task.','ownerId':user[0],'parentId':'40842b928756f5898e49a6ea09629584','status':'in_progress','priority':'high','workstream':'platform','editPolicy':'owner_only'})
    parent=api('/records/40842b928756f5898e49a6ea09629584')['record']
    if parent['status']=='planned':api('/records/'+parent['id'],'PATCH',{'status':'in_progress','expectedUpdatedAt':parent['updatedAt'],'reason':'Начат подтверждённый пользователем личный календарь с рабочей занятостью'})
    print(json.dumps({k:task[k] for k in ['id','title','status']},ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
