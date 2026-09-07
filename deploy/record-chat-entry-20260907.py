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

marker = '[release:record-chat-entry-20260907]'
evidence = (marker+'\nВыпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. '
    'SC-31: из вкладки Обсуждение открывается правильная существующая ветка чата; комментарии названы отдельно, история сохранена. '
    'Черновик комментария сохранён при переходе, восстановлен при возврате. Повторный вход показывает одно отправленное синтетическое сообщение. '
    'Проверены 320/1280 px и длинный заголовок. Исправлена несогласованная мобильная подпись вкладки после переключения на ПК. '
    '209 клиентских тестов и go test ./web прошли; dry run сохранил 104 таблицы; HTTP/HTTPS, версии assets, служба, nginx, integrity/FK проверены. '
    'Этот этап НЕ объединяет комментарии и сообщения в одну ленту, большая задача остаётся открытой. '
    'Контракт: docs/architecture/RECORD_CHAT_ENTRY_2026_09_07.md.')
try:
    receipt = {'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'tasks':[]}
    for task_id in ['45bbc1b549a12bb12b1c0ab92cf23a84','6e4f34f50ea37062254b52d8d63292b6','f1a7f01c558ae9a84bc6e5cb90f2c73f']:
        detail = api('/records/'+task_id)
        if not any(marker in p['content'] for p in detail.get('proofs',[])):
            api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
        receipt['tasks'].append({'id':task_id,'status':api('/records/'+task_id)['record']['status']})
    Path('/tmp/tessavie-record-chat-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2))
    print(json.dumps(receipt,ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,))
    db.commit()
    db.close()
