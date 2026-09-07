"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

commit = '3a8f1f8fa5308dc0391b364c449c22e70580e618'
release = '/opt/business-control/releases/20260907-chat-forward-3a8f1f8'
sha = '04cc02e1fbf39ba0b454b99ef2c2d0d97a3aac43e2a21c2ddf1eca099408f788'
backup = '/var/lib/business-control/backups/pre-chat-forward-20260907T083731Z'
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

marker = '[release:chat-forward-20260907]'
evidence = (marker+'\nВыпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. '
    'SC-32: после поиска старого сообщения можно последовательно догрузить ближайшие 50 сообщений кнопкой Следующие сообщения. '
    'Прежний текст и позиция чтения сохраняются, фоновый опрос не выбрасывает продолжение. Явная кнопка К последним сообщениям прокручивает до конца. '
    'Ручной сценарий прошёл на 241 синтетическом сообщении: 11→61→111→161→211→241, кнопка исчезла в конце; черновик не отправлялся и сохранился. '
    'Проверены 320/1280 px и длинные сообщения; 214 Node и полный Go прошли. Серверный тест проверяет оба направления, совпадение timestamps, чужие курсоры и отсутствие доступа. '
    'Dry run сохранил все 106 таблиц; служба, nginx, HTTPS и assets chat-forward-2 проверены. '
    'SC-31, SC-33, SC-37 и управление группами остаются открыты. Контракт дополнен в docs/architecture/CHAT_CONVERSATIONS_2026_09_07.md.')
try:
    receipt={'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'preservedTables':106,'nodeTests':214,'goTests':'go test ./... passed','tasks':[]}
    threads=api('/chat/threads')
    if threads:
        page=api('/chat/threads/'+threads[0]['id']+'/history')
        assert 'hasNewer' in page and 'nextAfter' in page
        if page['nextAfter']:
            next_page=api('/chat/threads/'+threads[0]['id']+'/history?after='+page['nextAfter'])
            assert len(next_page['messages'])<=50
        receipt['productionHistoryApi']='200 with forward cursor contract; messages omitted'
    for task_id in ['45bbc1b549a12bb12b1c0ab92cf23a84','e402d353a684b074f852fa1fd277d895','6e4f34f50ea37062254b52d8d63292b6']:
        detail=api('/records/'+task_id)
        if not any(marker in p['content'] for p in detail.get('proofs',[])):
            api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
        receipt['tasks'].append({'id':task_id,'status':api('/records/'+task_id)['record']['status']})
    Path('/tmp/tessavie-chat-forward-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2))
    print(json.dumps(receipt,ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
