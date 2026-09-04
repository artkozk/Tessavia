"""Verify private scope and record a shipped stage without completing umbrella tasks."""
import argparse, datetime, fcntl, hashlib, json, secrets, sqlite3, urllib.request
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--commit', required=True); p.add_argument('--release', required=True); p.add_argument('--sha256', required=True)
args = p.parse_args()
assert len(args.commit) == 40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260904-reminder-settings-')
assert str(Path('/opt/business-control/current').resolve()) == args.release
assert hashlib.sha256(Path(args.release+'/business-control').read_bytes()).hexdigest() == args.sha256
lock = open('/run/business-control-personal-batch-task.lock', 'w')
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
    assert db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='046_reminder_preferences.sql'").fetchone()[0]==1
    before=list(db.execute('SELECT * FROM reminder_preferences WHERE user_id=1'))
    prefs=api('/me/reminders')
    assert isinstance(prefs['deadlineEnabled'],bool) and isinstance(prefs['projects'],list)
    assert before==list(db.execute('SELECT * FROM reminder_preferences WHERE user_id=1'))
    allowed={row[0] for row in db.execute("SELECT workspace_id FROM workspace_members WHERE user_id=1 AND status='active'")}
    assert all(project['workspaceId'] in allowed for project in prefs['projects'])
    exported=json.dumps(api('/export'))
    assert 'reminder_preferences' not in exported and 'reminder_project_preferences' not in exported
    print('AUTHENTICATED_REMINDER_PREFERENCES=ok')
    task_id='a57de109f2d1876d30dd9135627657a8'
    detail=api('/records/'+task_id);task=detail['record'];assert task['workspaceId']=='bizflow-team'
    marker='[verified:reminder-settings-'+args.commit[:7]+']'
    result='В уведомлениях появились личные настройки сроков карточек: включение, часовой пояс, тихие часы через полночь и выбор проектов. Настройки действуют на всех устройствах только для владельца. GET не создаёт строки; отдельные проекты и общий выключатель проверяются перед доставкой. После тихого окна приходит только актуальное напоминание. История сохраняется. Форма сохраняет черновик и при конфликте предлагает сравнить текущую версию перед явным применением.'
    limits='Общая задача остаётся в работе: личные планы/привычки, snooze, сводки, дополнительные типы и push этим этапом не завершены. Изменение часового пояса делает прежние сообщения историческими; уже прочитанное не стирается.'
    checks='Пройдены go test ./..., go vet ./..., 182 Node-теста. Go: приватность, CAS и безопасный повтор, проекты, тихие часы, обе границы и DST. Браузер: сохранение и reload, восстановление черновика, конфликт с другим окном и явное применение, 320 px. Миграция 046 на серверной копии сохраняет старые столбцы всех таблиц, добавляет пустые настройки и пояс Europe/Moscow к прежним источникам. Контракт: docs/architecture/REMINDER_DELIVERY_2026_09_04.md.'
    evidence=marker+'\n'+result+'\n'+limits+'\n'+checks+'\nCommit: '+args.commit+'\nRelease: '+args.release+'\nSHA256: '+args.sha256
    if not any(marker in proof['content'] for proof in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
    task=api('/records/'+task_id)['record']
    if marker not in task['description']:api('/records/'+task_id,'PATCH',{'status':'in_progress','description':task['description']+'\n\n'+evidence,'expectedUpdatedAt':task['updatedAt'],'reason':'Выпущены личные правила сроков; планы, привычки и сводки остаются в работе'})
    print('REMINDER_TASK_STATUS='+api('/records/'+task_id)['record']['status'])
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
