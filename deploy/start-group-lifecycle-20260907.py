"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

commit = 'a53521c07b4b8a5bc6eaf466a6a5ff5860e24daa'
release = '/opt/business-control/releases/20260907-chat-pending-a53521c'
sha = 'b6a6ee66317b4e1b10f21a4ff8097addb691a7805bac4cf06027892c35db18df'
backup = '/var/lib/business-control/backups/pre-chat-pending-20260907T101955Z'
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

try:
    path='/records/524e18c09b0fad83704dbc82de46b700'
    record=api(path)['record']
    marker='[implementation:group-lifecycle-20260907]'
    addition=marker+'\nНачата реализация: отдельные роли группы, состав, название, приглашение активного коллеги, исключение, выход и передача владения. Защита последнего владельца, атомарная проверка версии, системные события, отзыв доступа к истории/файлам. Роли проекта не открывают закрытый разговор. Проверка минимум тремя синтетическими аккаунтами и 320/1280 px. Контракт docs/architecture/CHAT_GROUP_LIFECYCLE_2026_09_07.md. Готовность ещё не подтверждена.'
    if marker not in record['description']:
        api(path,'PATCH',{'description':record['description']+'\n\n'+addition,'status':'in_progress','reason':'Начата реализация критериев управления группой','expectedUpdatedAt':record['updatedAt']})
    print(json.dumps({'id':record['id'],'status':api(path)['record']['status']},ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()