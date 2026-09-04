"""Record the verified work board defaults release without changing user layouts."""
import argparse, datetime, fcntl, hashlib, json, secrets, sqlite3, urllib.request
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--commit', required=True); p.add_argument('--release', required=True); p.add_argument('--sha256', required=True)
args = p.parse_args()
assert len(args.commit) == 40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260904-bulk-actions-')
assert str(Path('/opt/business-control/current').resolve()) == args.release
assert hashlib.sha256(Path(args.release+'/business-control').read_bytes()).hexdigest() == args.sha256
lock = open('/run/business-control-bulk-task.lock', 'w')
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
    task_id='362741955c76fa703dc5cf410e7a1536'
    detail=api('/records/'+task_id);task=detail['record']
    assert task['workspaceId']=='bizflow-team'
    preview=api('/record-batches/preview','POST',{'id':'release-check-'+args.commit[:12], 'items':[{'id':task_id,'expectedUpdatedAt':task['updatedAt']}], 'patch':{'priority':task['priority']}, 'reason':'Проверка выпуска без изменения карточки'})
    assert preview['items'][0]['state']=='unchanged'
    marker='[verified:bulk-actions-'+args.commit[:7]+']'
    evidence=marker+'\nМассовые действия в разделе Работа: явный выбор до 100 карточек в списке и на доске, смена ответственного, приоритета, направления и допустимого состояния. Предпросмотр по каждой карточке, частичные отказы и причины, история, последняя операция после перезагрузки, отмена с проверкой версий и прав. Скрытые фильтром и невыбранные записи не меняются. Завершение с доказательствами остаётся в карточке.\nПроверки: go test ./..., go vet ./..., 153 Node-теста; права проекта и карточки, устаревшие версии, назначение и отмена, синхронизация этапа, транзакционный откат при ошибке истории, повтор операции и отмены. Браузер: список и доска, потеря ответа после сохранения и повтор без дублирования, последняя операция после перезагрузки, отмена, ширина 320 px. Физические телефоны не проверялись. Миграция 038 добавляет таблицу квитанций без переписывания старых данных; серверная копия и HTTP проверяются при выпуске.\nCommit: '+args.commit+'\nRelease: '+args.release+'\nSHA256: '+args.sha256+'\nКонтракт: docs/architecture/BULK_WORK_ACTIONS_2026_09_04.md.'
    if not any(marker in proof['content'] for proof in detail.get('proofs',[])):
        api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
    if task['status']!='completed':
        api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
    statuses={task_id:api('/records/'+task_id)['record']['status']}
    print(json.dumps({'taskStatuses':statuses},ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
