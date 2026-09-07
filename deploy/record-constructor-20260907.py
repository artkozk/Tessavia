"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

commit = 'b8e48d9de2cd7573ff58c6d1f12d7a1c39f52612'
release = '/opt/business-control/releases/20260907-constructor-b8e48d9'
sha = '7c0d9881f032cdd5a846b8fa0881532e6f62d2fd106e2b55befa8636154af8c9'
backup = '/var/lib/business-control/backups/pre-constructor-20260907T093849Z'
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

marker = '[release:constructor-20260907]'
evidence = (marker+'\nВыпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. '
 'SC-57: варианты переименовываются и добавляются без потери ID и заполненных карточек; множественный выбор флажками, обязательность хотя бы одного значения. '
 'Предпросмотр сохранённой формы без создания записей. Черновики карточки и настройки поля. Ручной путь на доске с 12 карточками: пример оставил 12, создание дало 13, переименование Сайт в Вебсайт сохранило выбор, добавленный Партнёр сохраняется вторым значением. '
 'SC-33: перезагрузка восстановила выбранный DM и черновик. 320/1280 px, 217 Node, полный Go. Dry run сохранил 106 таблиц, health/nginx/HTTPS/assets проверены. '
 'Прямой запрос 07.09: продолжать улучшать понятность и гибкость конструктора. Следом: создание доски и варианты полей, далее шаблоны процессов. Собственные типы, формулы и жизненный цикл групп остаются открыты. '
 'Контракт docs/architecture/CONSTRUCTOR_OPTIONS_PREVIEW_2026_09_07.md.')
try:
    receipt={'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'preservedTables':106,'nodeTests':217,'goTests':'go test ./... passed','tasks':[]}
    for task_id in ['a288364706d6c9f0ff683003aea39009','45bbc1b549a12bb12b1c0ab92cf23a84','6e4f34f50ea37062254b52d8d63292b6']:
        detail=api('/records/'+task_id)
        if not any(marker in p['content'] for p in detail.get('proofs',[])):
            api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
        receipt['tasks'].append({'id':task_id,'status':api('/records/'+task_id)['record']['status']})
    Path('/tmp/tessavie-constructor-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2))
    print(json.dumps(receipt,ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()