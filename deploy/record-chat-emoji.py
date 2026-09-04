"""Verify chat access and the emoji release and record the completed task."""
import argparse, datetime, fcntl, hashlib, json, secrets, sqlite3, urllib.request
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--commit', required=True); p.add_argument('--release', required=True); p.add_argument('--sha256', required=True)
args = p.parse_args()
assert len(args.commit) == 40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260904-chat-emoji-')
assert str(Path('/opt/business-control/current').resolve()) == args.release
assert hashlib.sha256(Path(args.release+'/business-control').read_bytes()).hexdigest() == args.sha256
lock = open('/run/business-control-chat-emoji-task.lock', 'w')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=15)
assert db.execute('SELECT username FROM users WHERE id=1').fetchone()[0] == 'artkozk'
assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not db.execute('PRAGMA foreign_key_check').fetchall()
token = secrets.token_urlsafe(32); digest = hashlib.sha256(token.encode()).hexdigest()
now = datetime.datetime.now(datetime.timezone.utc)
stamp = lambda value: value.isoformat(timespec='microseconds').replace('+00:00', 'Z')
db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(1,?,?,?,?)',
           (digest, stamp(now+datetime.timedelta(minutes=5)), stamp(now), stamp(now)))
db.commit()
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *unused): return None
client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
def api(path, method='GET', body=None, workspace='bizflow-team'):
    request = urllib.request.Request('http://127.0.0.1:8522/api'+path, method=method,
        data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
        headers={'Cookie':'business_session='+token, 'X-Workspace-ID':workspace, 'Content-Type':'application/json'})
    with client.open(request, timeout=25) as response:
        raw=response.read(); return json.loads(raw) if raw else None
try:
    task_id='313946e8cb6e8055306906a42ecb8aec'
    detail=api('/records/'+task_id);task=detail['record']
    assert task['workspaceId']=='bizflow-team'
    threads=api('/chat/threads')
    allowed={row[0] for row in db.execute('SELECT t.id FROM chat_threads t JOIN chat_members cm ON cm.thread_id=t.id WHERE cm.user_id=1 AND t.workspace_id=?',('bizflow-team',))}
    assert {thread['id'] for thread in threads}.issubset(allowed)
    for thread in threads[:3]:
        messages=api('/chat/threads/'+thread['id']+'/messages')
        expected={row[0] for row in db.execute('SELECT id FROM chat_messages WHERE thread_id=? AND archived_at IS NULL',(thread['id'],))}
        assert {message['id'] for message in messages}.issubset(expected)
    print('AUTHENTICATED_CHAT_SCOPE=ok')
    marker='[verified:chat-emoji-'+args.commit[:7]+']'
    evidence=marker+"\n"+'В чате доступен полный локальный каталог Unicode 17.0 / CLDR 48.2: 3944 последовательности, девять категорий, поиск по русским и английским названиям, вставке готового эмодзи. Выбор тона кожи и все варианты, включая сочетания разных оттенков. Недавние/частые и тон изолированы по аккаунту в текущем браузере; чужие реакции не влияют на рекомендации. Старый общий ключ не импортируется.\nВставка в редактор заменяет выделение либо идёт на позицию курсора, не отправляет сообщение и сохраняет несохранённую правку. Реакции обновляются без перерисовки редактора. Правка сохраняется в памяти и при перестроении ширины экрана. Повтор нового PUT сохраняет желаемое состояние, не снимает уже записанную реакцию; старый POST совместим. При сетевом сбое доступен явный повтор. Сервер поддерживает семьи, ZWJ, флаги регионов, разные тона, проверяет членство и выбранный проект в транзакции, не меняет чужие реакции.\nПроверки: go test ./..., go vet ./..., 169 Node-тестов, все 3944 последовательности, RU/EN поиск, владельцы и сбои storage, POST/PUT, архив/404/403, чужой аккаунт. Браузер на синтетической базе: выделение, несохранённая правка, составной эмодзи, потерянный ответ после фактической записи и одна реакция после повтора, поиск и тон, 320 px и кнопки не менее 44 px. Физические телефоны не проверялись.\nКаталог встроен в приложение; runtime-запросов к CDN нет. Отрисовка зависит от системного emoji-шрифта. История использования локальна, не синхронизируется между устройствами. Для сохранения реакции нужна сеть, долговременная очередь реакций не добавлялась. Прочие задачи полноценного мессенджера остаются открытыми.\nВыпуск без миграции, проверены все 77 таблиц на серверной копии, рабочий HTTPS и права чата. Тестовые сообщения/реакции на рабочем сервере не создавались. Контракт: docs/architecture/CHAT_EMOJI_CATALOG_2026_09_04.md.\n'+"Commit: "+args.commit+"\nRelease: "+args.release+"\nSHA256: "+args.sha256+"\n"
    if not any(marker in proof['content'] for proof in detail.get('proofs',[])):
        api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
    if task['status']!='completed':
        api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
    print(json.dumps({'taskStatuses':{task_id:api('/records/'+task_id)['record']['status']}},ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
