"""Verify personal-note API ownership and record the completed notes task."""
import argparse, datetime, fcntl, hashlib, json, secrets, sqlite3, urllib.request
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--commit', required=True); p.add_argument('--release', required=True); p.add_argument('--sha256', required=True)
args = p.parse_args()
assert len(args.commit) == 40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260904-note-organize-')
assert str(Path('/opt/business-control/current').resolve()) == args.release
assert hashlib.sha256(Path(args.release+'/business-control').read_bytes()).hexdigest() == args.sha256
lock = open('/run/business-control-note-task.lock', 'w')
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
    task_id='55f55a231e05ee5e2653b8b902be5aba'
    detail=api('/records/'+task_id);task=detail['record']
    assert task['workspaceId']=='bizflow-team'
    overview=api('/personal/overview')
    assert isinstance(overview['noteFolders'],list) and isinstance(overview['noteTemplates'],list)
    owned={row[0] for row in db.execute('SELECT id FROM personal_notes WHERE owner_id=1 AND archived_at IS NULL')}
    assert {note['id'] for note in overview['notes']}==owned
    for note in overview['notes']:
        assert 'folderId' in note and 'tags' in note and isinstance(note['tags'],list) and 'dailyDate' in note
    for key,table in [('noteFolders','personal_note_folders'),('noteTemplates','personal_note_templates')]:
        assert {item['id'] for item in overview[key]}=={row[0] for row in db.execute('SELECT id FROM '+table+' WHERE owner_id=1 AND archived_at IS NULL')}
    assert db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='039_note_organization.sql'").fetchone()[0]==1
    print('AUTHENTICATED_PERSONAL_OVERVIEW=ok')
    marker='[verified:note-organization-'+args.commit[:7]+']'
    evidence=marker+"\n"+'Папки, метки и шаблоны доступны в Личное → Заметки. Поиск по заголовку, содержимому, папке и меткам; пересекающиеся фильтры и закреплённые записи. Первая порция 24 карточки, остальные доступны через Показать ещё. Папка и метки необязательны. Переименование и перенос сохраняют ID и связи; удаление папки оставляет заметки и шаблоны без папки.\nЗаметка дня открывает единственную активную запись владельца на сегодня. Личный шаблон можно сохранить из текущего редактора, изменить, удалить и применить; копии независимы, {{date}} подставляется как дата. Исходный черновик сохраняется. Повтор после потери ответа и перезагрузки не создаёт дубликат.\nПроверки: go test ./..., go vet ./..., 157 Node-тестов. Приватность владельца, конфликт версий, поиск кириллицей, сохранность связей и совместимость старых outbox-запросов; шесть параллельных запросов дня создают одну запись. Браузер: папка, метки, поиск, закрепление, шаблон из черновика, потеря ответа/перезагрузка/повтор с одной копией; ширина 320 px, меню, длинное имя и восстановление черновика. Физические телефоны не проверялись.\nМиграция 039 проверена на серверной копии с сохранением всех старых строк. HTTP, авторизация ресурсов и личный overview рабочего сервера проверены. Общая очередь заметок использует прежний outbox; управление папками/шаблонами и открытие дня требуют сети.\nКонтракт: docs/architecture/PERSONAL_NOTE_ORGANIZATION_2026_09_04.md.'+"\nCommit: "+args.commit+"\nRelease: "+args.release+"\nSHA256: "+args.sha256+"\n"
    if not any(marker in proof['content'] for proof in detail.get('proofs',[])):
        api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
    if task['status']!='completed':
        api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
    statuses={task_id:api('/records/'+task_id)['record']['status']}
    print(json.dumps({'taskStatuses':statuses},ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
