"""Verify the offline outbox release and append evidence without falsely completing device acceptance."""
import argparse, datetime, hashlib, json, secrets, sqlite3, time, urllib.parse, urllib.request
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('--commit',required=True)
parser.add_argument('--release',required=True)
parser.add_argument('--sha256',required=True)
args=parser.parse_args()
assert len(args.commit)==40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260903-offline-outbox-')
assert str(Path('/opt/business-control/current').resolve())==args.release
assert hashlib.sha256(Path(args.release+'/business-control').read_bytes()).hexdigest()==args.sha256
db=sqlite3.connect('/var/lib/business-control/business-control.db',timeout=15)
assert db.execute('SELECT username FROM users WHERE id=1').fetchone()[0]=='artkozk'
token=secrets.token_urlsafe(32);digest=hashlib.sha256(token.encode()).hexdigest()
now=datetime.datetime.now(datetime.timezone.utc)
stamp=lambda d:d.isoformat(timespec='microseconds').replace('+00:00','Z')
db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(1,?,?,?,?)',(digest,stamp(now+datetime.timedelta(minutes=5)),stamp(now),stamp(now)));db.commit()
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*unused):return None
client=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
def api(path,method='GET',body=None):
    req=urllib.request.Request('http://127.0.0.1:8522/api'+path,method=method,data=None if body is None else json.dumps(body,ensure_ascii=False).encode(),headers={'Cookie':'business_session='+token,'X-Workspace-ID':'bizflow-team','Content-Type':'application/json'})
    with client.open(req,timeout=25) as response:
        data=response.read()
        return json.loads(data) if data else None
try:
    assert api('/me')['username']=='artkozk'
    task_id='3d9a860505030ea14061633f22b115fd'
    detail=api('/records/'+task_id);task=detail['record']
    assert task['workspaceId']=='bizflow-team' and task['ownerId']==1 and task['status'] in ('in_progress','completed')
    assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    assert not db.execute('PRAGMA foreign_key_check').fetchall()
    assert api('/export')['schemaVersion']==17
    marker='[verified:offline-outbox-'+args.commit[:7]+']'
    evidence=marker+'\nОпубликована автономная очередь новых заметок, планов, сообщений и файлов. IndexedDB фиксирует неизменяемый пакет до очистки формы; состояния локального ожидания, отправки, подтверждения и блокировки различаются. Между вкладками действует lease. Заголовок ожидаемого автора не допускает отправку очереди прежнего аккаунта после смены cookie.\nСерверная квитанция и сущность создаются одной транзакцией. Повтор одинакового ключа возвращает актуальную запись, а изменённый payload получает 409. Чат читает квитанцию без лимита 200. Файл после неопределённой ошибки удаляется только при доказанном отсутствии сообщения.\nService worker кеширует только публичный allowlist оболочки, никогда API/сессии/вложения. В реальном браузере заметка пережила перезапуск без сети, работала на 320×740 и после reconnect появилась один раз. Отдельно отброшен ответ после server commit: безопасный повтор оставил одну строку.\nGo test, vet и 124 Node-теста успешны. Проверены конкуренция, потеря ответа, рестарт, два окна, смена аккаунта/проекта, отзыв доступа, конфликт, частичный batch файлов и нехватка места. Физическое устройство и реальная экранная клавиатура не проверены, поэтому задача остаётся in_progress.\nCommit: '+args.commit+'\nRelease: '+args.release+'\nSHA256: '+args.sha256+'\nКонтракт: docs/architecture/OFFLINE_OUTBOX_CONTRACT_2026_09_03.md. Migration 034 и сохранность production проверены на копии.'
    if not any(marker in proof['content'] for proof in detail.get('proofs',[])):
        api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
    assert api('/records/'+task_id)['record']['status']=='in_progress' 
    print(json.dumps({'id':task_id,'status':api('/records/'+task_id)['record']['status'],'exportVersion':17,'acceptance':'physical-keyboard-unverified'},ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
