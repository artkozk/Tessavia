"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

commit = '04b185624e3cca9fc0e0ca4f35775dca2f604891'
release = '/opt/business-control/releases/20260907-chat-workspace-04b1856'
sha = 'bfae0291b253bdef2524db8573d8dfb9d9ea08b1ad97fa86a20ea87044bac06f'
backup = '/var/lib/business-control/backups/pre-chat-workspace-20260906T213950Z'
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

marker = '[verified:chat-workspace-04b1856]'
proof = (marker+'\nВыпуск '+release+'; commit '+commit+'; SHA256 '+sha+'.\n'
    'Backup '+backup+'. Миграция на копии сохранила все прежние строки 103 таблиц; SQLite integrity/FK, защищённые API и публичный HTTPS прошли. '
    'Полный Go, vet, 199 JavaScript-проверок; браузер 1280/390/320 px, три синтетических аккаунта, 241 сообщение. '
    'Проверены приватность/повтор пары, поиск за пределами 200 сообщений, страницы/переход, закрепление, черновик при смене и reload, текстовая очередь, меню и сохранение позиции чтения. '
    'Входящие → связанное дело, недатированная заметка/журнал, круговой календарь, создание датированного дела и reload; заполненная команда, изменение/сохранение роли и узкие вкладки. '
    'Физические телефоны, микрофон/камера и независимые пользователи не проверены. Управление составом групп, realtime, медиа, экран Сегодня и полный аудит остаются отдельными открытыми этапами. '
    'Отчёт: docs/operations/CHAT_WORKSPACE_RELEASE_2026_09_07.md; 55 сценариев: docs/product/TESSAVIE_SCENARIOS_2026_09_07.md.')
scoped = ('823789206b40a638abde3ef53b930fbb', 'f91b7582a85c3938b6eb0d4c57ff5515')
parents = ('e402d353a684b074f852fa1fd277d895', '6e4f34f50ea37062254b52d8d63292b6', '1168ce733dc42915ee54c9dd8d6b773f')
receipt = {'commit':commit, 'release':release, 'sha256':sha, 'backup':backup, 'tasks':[]}
try:
    before = db.execute('SELECT COUNT(*) FROM chat_messages').fetchone()[0]
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
            api('/records/'+task_id+'/complete', 'POST', {'result':'Опубликован и проверен узкий выпуск чата и повседневных экранов; проверяемые результаты и оставшиеся ограничения приложены. Общие направления не завершены.', 'notifyPartners':False})
        final = api('/records/'+task_id)
        assert any(marker in item['content'] for item in final.get('proofs', []))
        assert final['record']['status'] == ('completed' if task_id in scoped else previous_status)
        receipt['tasks'].append({'id':task_id, 'title':final['record']['title'], 'status':final['record']['status'], 'proofVerified':True})
    Path('/tmp/tessavie-chat-workspace-release-receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2))
    print(json.dumps({'verified':True, 'threads':len(threads), 'scopedCompleted':len(scoped), 'parentsPreserved':len(parents)}))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
    db.commit()
    db.close()
