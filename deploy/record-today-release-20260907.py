"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

commit = '508795a1ab3b39608101a1cf751c47ae7a430f0c'
release = '/opt/business-control/releases/20260907-today-508795a'
sha = '12d2b7628897afe060d5a1cfb7f2e8d7dca589e0db43e2118913f5ee9bfdf3ed'
backup = '/var/lib/business-control/backups/pre-today-20260906T215357Z'
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

marker = '[verified:today-508795a]'
proof = (marker+'\nRelease '+release+'; commit '+commit+'; SHA256 '+sha+'; backup '+backup+'.\n'
    'Компактный Сегодня опубликован. Кандидат на копии сохранил все строки 104 таблиц; HTTP/HTTPS и SQLite/FK прошли. '
    '202 JavaScript-теста, Go web, Windows/Linux сборки. Локальные браузерные сценарии: пустой аккаунт → заметка → разбор → связанное дело; активная привычка; границы дня; назначение команды и открытие исходной карточки. '
    '320/390/1280 px, сохранённая раскладка после reload и показ всех блоков в редакторе. Физические устройства не проверены. '
    'Отчёт docs/operations/PERSONAL_TODAY_PROGRESSIVE_RELEASE_2026_09_07.md. Остальные личные вкладки и заполненные карточки требуют продолжения визуального аудита; всё направление первого запуска остаётся открытым.')
scoped = ('c67bd9589e451927036639e517ffd28d',)
parents = ('54f7cd0225c5ef0f5eba56e3ffb71e51', 'f1a7f01c558ae9a84bc6e5cb90f2c73f')
receipt = {'commit':commit, 'release':release, 'sha256':sha, 'backup':backup, 'tasks':[]}
try:
    before = db.execute('SELECT COUNT(*) FROM chat_messages').fetchone()[0]
    day = api('/personal/day?timezone=Europe%2FMoscow')
    assert 'projectWork' in day and 'focus' in day
    receipt['personalDayVerified'] = True
    threads = api('/chat/threads')
    for thread in threads:
        page = api('/chat/threads/'+thread['id']+'/history')
        assert isinstance(page['messages'], list) and len(page['messages']) <= 50
        assert isinstance(page['hasMore'], bool)
        assert isinstance(api('/chat/threads/'+thread['id']+'/pins'), list)
    assert before == db.execute('SELECT COUNT(*) FROM chat_messages').fetchone()[0]
    receipt['authenticatedThreadsChecked'] = len(threads)
    for task_id in scoped+parents:
        detail = api('/records/'+task_id)
        previous_status = detail['record']['status']
        if not any(marker in item['content'] for item in detail.get('proofs', [])):
            api('/records/'+task_id+'/proofs', 'POST', {'kind':'text', 'content':proof})
        if task_id in scoped and previous_status != 'completed':
            api('/records/'+task_id+'/complete', 'POST', {'result':'Стандартный Сегодня показывает следующий шаг и заполненные блоки; ручная раскладка сохраняется. Проверки и ограничения приложены.', 'notifyPartners':False})
        final = api('/records/'+task_id)
        assert any(marker in item['content'] for item in final.get('proofs', []))
        assert final['record']['status'] == ('completed' if task_id in scoped else previous_status)
        receipt['tasks'].append({'id':task_id, 'title':final['record']['title'], 'status':final['record']['status'], 'proofVerified':True})
    Path('/tmp/tessavie-today-release-receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2))
    print(json.dumps({'verified':True, 'threads':len(threads), 'scopedCompleted':len(scoped), 'parentsPreserved':len(parents)}))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
    db.commit()
    db.close()
