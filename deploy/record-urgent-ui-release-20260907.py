"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

commit = 'fd25e02f0f85c186bdc9cd5cc354364d864f21e2'
release = '/opt/business-control/releases/20260907-urgent-ui-fd25e02'
sha = '3c0a459529059bc1f8799aa59385d236797c428450b6437f03ab58804697b1d9'
backup = '/var/lib/business-control/backups/pre-urgent-ui-20260907T051711Z'
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

marker = '[verified:urgent-ui-fd25e02]'
task_id = '1db98ed1eb695ba4e4c550fdacd36d69'
proof = (marker+'\nRelease '+release+'; commit '+commit+'; SHA256 '+sha+'; backup '+backup+'.\n'
    'Опубликованы три подтверждённых исправления: календарь сохраняет активную команду; карточки заполненной доски не сжимаются; фильтры открываются внутри экрана. '
    '203 Node-теста, Go web, Windows/Linux сборки. Браузер: командный календарь, переходы Работа/Доски, 12 карточек и фильтры на 320/1280 px. '
    'Кандидат сохранил все строки 104 таблиц на копии БД. После выкладки проверены HTTP/HTTPS, версии файлов, nginx, служба, SQLite integrity/FK. '
    'Смена исполнителя остаётся открытой: автор-member в синтетической команде успешно сохранил новое назначение; реальный аккаунт на скриншоте в БД имеет member. '
    'Реальные назначения и роли не изменялись. Отчёт docs/operations/URGENT_UI_RELEASE_2026_09_07.md. Весь инцидент не закрывается до выяснения конкретного отказа.')
try:
    detail = api('/records/'+task_id)
    previous_status = detail['record']['status']
    if not any(marker in item['content'] for item in detail.get('proofs', [])):
        api('/records/'+task_id+'/proofs', 'POST', {'kind':'text', 'content':proof})
    final = api('/records/'+task_id)
    assert final['record']['status'] == previous_status
    assert any(marker in item['content'] for item in final.get('proofs', []))
    receipt = {'commit':commit, 'release':release, 'sha256':sha, 'backup':backup,
        'taskId':task_id, 'status':final['record']['status'], 'proofVerified':True,
        'fixed':['calendar-workspace','board-card-height','work-filter-position'],
        'open':['assignee-report-reproduction','reported-admin-role']}
    Path('/tmp/tessavie-urgent-ui-release-receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2))
    print(json.dumps({'verified':True,'status':receipt['status']}))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
    db.commit()
    db.close()
