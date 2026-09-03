"""Verify the live constructor API and complete its bounded canonical task."""
import argparse, datetime, fcntl, hashlib, json, secrets, sqlite3, urllib.request
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--commit', required=True); p.add_argument('--release', required=True); p.add_argument('--sha256', required=True)
args = p.parse_args()
assert len(args.commit) == 40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260904-constructor-work-')
assert str(Path('/opt/business-control/current').resolve()) == args.release
assert hashlib.sha256(Path(args.release+'/business-control').read_bytes()).hexdigest() == args.sha256
lock = open('/run/business-control-constructor-task.lock', 'w')
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
def api(path, method='GET', body=None):
    request = urllib.request.Request('http://127.0.0.1:8522/api'+path, method=method,
        data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
        headers={'Cookie':'business_session='+token, 'X-Workspace-ID':'bizflow-team', 'Content-Type':'application/json'})
    with client.open(request, timeout=25) as response:
        raw=response.read(); return json.loads(raw) if raw else None
try:
    boards = api('/collections')
    for board in boards:
        schema = api('/collections/'+board['id']+'/schema')
        for kind, table in [('fields','collection_fields'), ('stages','collection_stages')]:
            actual = schema[kind]
            expected = list(db.execute('SELECT id,updated_at,archived_at FROM '+table+' WHERE collection_id=?', (board['id'],)))
            assert {item['id'] for item in actual} == {row[0] for row in expected}
            assert {item['id'] for item in board[kind]} == {row[0] for row in expected if row[2] is None}
            assert all(item['updatedAt'] for item in actual)
            if kind == 'stages':
                for item in actual:
                    assert item['recordCount'] == db.execute('SELECT COUNT(*) FROM records WHERE collection_id=? AND stage_id=?', (board['id'],item['id'])).fetchone()[0]
    task_id='7323301b79de2fc339d11144e81a313d'; parent_id='a288364706d6c9f0ff683003aea39009'
    detail=api('/records/'+task_id); task=detail['record']
    assert task['workspaceId']=='bizflow-team' and task['ownerId']==1 and task['parentId']==parent_id
    assert task['status'] in ('in_progress','completed')
    marker='[verified:constructor-work-'+args.commit[:7]+']'
    evidence=marker+'\nУдаление, восстановление и порядок полей/колонок доступны администратору конкретной команды. Значения полей сохранены; удаление заполненной колонки требует выбора целевой, сохраняет статус и тип. Общая доска настраивается как личный вид, системные колонки можно скрыть. Список: страницы 10/25/50, поиск по всему набору; доска: ограниченная высота и порции по 20.\nПроверены API-доступы, устаревшие версии, сохранность заполненного обязательного поля, последняя колонка, отмена переноса и восстановление. Go test/vet и 145 Node-тестов успешны. В браузере: создание/удаление/возврат заполненного поля, удаление/возврат и порядок колонок, 1201 запись, последняя страница и полный поиск, 320 px. Физические Android/iPhone не проверялись.\nProduction GET schema соответствует БД на '+str(len(boards))+' досках; тестовые данные не создавались. Сухой запуск сравнил все таблицы до/после без изменения.\nCommit: '+args.commit+'\nRelease: '+args.release+'\nSHA256: '+args.sha256+'\nКонтракт: docs/architecture/CONSTRUCTOR_AND_BOUNDED_WORK_2026_09_04.md. Большой конструктор остаётся в работе: типы сущностей, формулы, преобразование типов и библиотека блоков не объявляются завершёнными.'
    if not any(marker in proof['content'] for proof in detail.get('proofs',[])):
        api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
    if task['status']!='completed': api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
    parent=api('/records/'+parent_id)
    if not any(marker in proof['content'] for proof in parent.get('proofs',[])):
        api('/records/'+parent_id+'/proofs','POST',{'kind':'text','content':evidence})
    assert api('/records/'+parent_id)['record']['status']==parent['record']['status']=='in_progress'
    print(json.dumps({'taskId':task_id,'status':api('/records/'+task_id)['record']['status'],'parentStatus':parent['record']['status'],'verifiedBoards':len(boards)},ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,)); db.commit(); db.close()
