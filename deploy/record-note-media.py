"""Verify private note media/history APIs and record the completed task."""
import argparse, datetime, fcntl, hashlib, json, secrets, sqlite3, urllib.request
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--commit', required=True); p.add_argument('--release', required=True); p.add_argument('--sha256', required=True)
args = p.parse_args()
assert len(args.commit) == 40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260904-note-media-')
assert str(Path('/opt/business-control/current').resolve()) == args.release
assert hashlib.sha256(Path(args.release+'/business-control').read_bytes()).hexdigest() == args.sha256
lock = open('/run/business-control-note-media-task.lock', 'w')
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
    task_id='3f4ce24b1d445462d20837517ba02e0e'
    detail=api('/records/'+task_id);task=detail['record']
    assert task['workspaceId']=='bizflow-team'
    overview=api('/personal/overview')
    owned={row[0] for row in db.execute('SELECT id FROM personal_notes WHERE owner_id=1 AND archived_at IS NULL')}
    assert {note['id'] for note in overview['notes']}==owned
    archived={row[0] for row in db.execute('SELECT id FROM personal_notes WHERE owner_id=1 AND archived_at IS NOT NULL')}
    archive=api('/personal/notes/archive')
    assert archive['total']==len(archived) and {n['id'] for n in archive['items']}.issubset(archived)
    for note in overview['notes'][:3]:
        versions=api('/personal/notes/'+note['id']+'/versions')
        assert versions['items'] and all('note' not in v for v in versions['items'])
        allowed_versions={r[0] for r in db.execute('SELECT id FROM personal_note_versions WHERE note_id=?',(note['id'],))}
        assert {v['id'] for v in versions['items']}.issubset(allowed_versions)
        files=api('/personal/notes/'+note['id']+'/attachments')
        expected_files={r[0] for r in db.execute('SELECT id FROM personal_note_attachments WHERE note_id=?',(note['id'],))}
        assert {f['id'] for f in files}==expected_files
    assert db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='040_note_media_history.sql'").fetchone()[0]==1
    print('AUTHENTICATED_NOTE_MEDIA_HISTORY=ok')
    marker='[verified:note-media-history-'+args.commit[:7]+']'
    evidence=marker+"\n"+'Личное → Заметки: в обычном редакторе добавлены файлы, просмотр фото, скачивание, удалённые вложения и возврат. Файлы новой заметки сохраняются на устройстве до нажатия Сохранить и переживают закрытие/перезагрузку. Заметка и все файлы атомарно попадают в очередь; прогресс, ошибка и повтор доступны в редакторе и очереди. Потеря ответа не создаёт копию. Фото/файлы можно выбрать, вставить или перетащить; до 20 за раз и 15 МБ на файл. HEIC/HEIF доступны для скачивания, встроенный просмотр — PNG/JPEG/GIF/WebP.\nИстория показывает серверные сохранения и позволяет вернуть версию. Текущий сохранённый текст остаётся в истории; файлы, ID и связи сохраняются. Несохранённый черновик блокирует восстановление до сохранения, просмотр его не стирает. Архив обратим; при конфликте заметки дня можно вернуть запись обычной заметкой. Все новые API проверяют владельца, общая команда/активность файлы не получает.\nПроверки: go test ./..., go vet ./..., 164 Node-теста; чужие аккаунты, конфликты версий, сохранность связей, зависимость файла от ещё не пришедшей заметки (425), повтор, 15 МБ/превышение/пустой файл. Браузер: два файла в новом черновике и после перезагрузки, сохранение одной заметки, фото, потеря ответа с одним файлом после повтора, защита черновика, история/восстановление, архив/возврат, удаление/возврат вложения, длинное имя и ширина 320 px. Физические телефоны и системный буфер обмена не проверялись; экран 320 px — эмуляция.\nНа рабочем домене устранён конфликт лимитов: Nginx 1 МБ ранее отвергал фото раньше приложения; теперь 16 МиБ на запрос с multipart, приложение оставляет 15 МиБ на файл. HTML-отказ 413 не вызывает бесконечный повтор. Миграция 040 проверена на серверной копии, все старые строки сохранены, начальная версия каждой старой заметки совпадает с её текущими данными. Рабочий HTTP и владельческая авторизация проверены.\nКонтракт: docs/architecture/PERSONAL_NOTE_MEDIA_HISTORY_2026_09_04.md. История до этого выпуска не восстанавливается задним числом. Архив, просмотр истории и правки существующего текста требуют сети. Файлы вне публичного кэша; шаблоны текстовые, без копирования файлов.\n'+"Commit: "+args.commit+"\nRelease: "+args.release+"\nSHA256: "+args.sha256+"\n"
    if not any(marker in proof['content'] for proof in detail.get('proofs',[])):
        api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
    if task['status']!='completed':
        api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
    statuses={task_id:api('/records/'+task_id)['record']['status']}
    print(json.dumps({'taskStatuses':statuses},ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
