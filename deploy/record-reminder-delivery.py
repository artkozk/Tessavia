"""Verify private scope and record a shipped stage without completing umbrella tasks."""
import argparse, datetime, fcntl, hashlib, json, secrets, sqlite3, urllib.request
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--commit', required=True); p.add_argument('--release', required=True); p.add_argument('--sha256', required=True)
args = p.parse_args()
assert len(args.commit) == 40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260904-reminder-delivery-')
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
    assert db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='045_deadline_delivery_sources.sql'").fetchone()[0]==1
    day=api('/personal/day?timezone=Europe/Moscow')
    assert isinstance(day['timeKnown'],bool) and isinstance(day['remainingFree'],list)
    other=db.execute("SELECT id FROM personal_plans WHERE owner_id<>1 AND status<>'archived' LIMIT 1").fetchone()
    if other:
        try:
            api('/personal/day/'+day['date']+'/focus','PUT',{'planId':other[0],'expectedUpdatedAt':''})
            raise AssertionError('Foreign focus accepted')
        except urllib.error.HTTPError as error:assert error.code==404
    exported=json.dumps(api('/export'))
    assert 'personal_day_settings' not in exported and 'personal_day_focus' not in exported
    print('AUTHENTICATED_PERSONAL_DAY_SCOPE=ok')
    task_id='a57de109f2d1876d30dd9135627657a8'
    detail=api('/records/'+task_id);task=detail['record'];assert task['workspaceId']=='bizflow-team'
    marker='[verified:reminder-delivery-'+args.commit[:7]+']'
    result='Доставка напоминаний о сроках перенесена из GET уведомлений в фоновый процесс каждые 30 секунд. Чтение страницы не сканирует и не записывает напоминания по всем пользователям. Ключ включает исходный срок; повтор и перезапуск не создают дубль. Исходник, ответственный и доступ повторно проверяются в транзакции. Перенос срока, завершение, смена ответственного и истечение окна снимают актуальность; старый текст остаётся в истории. После потери доступа текст скрыт. Исправлено разделение местных дней около полуночи.'
    limits='Каноническая задача остаётся в работе. Этот этап доставляет существующие напоминания карточек во входящие сайта; пользовательские часовые пояса, тихие часы, настройки по проектам/типам, snooze, личные планы/привычки, сводки и push ещё не готовы. Сохранён прежний пояс доставки Europe/Moscow.'
    checks='Go-тесты: пять конкурентных циклов дают одно сообщение; GET ничего не создаёт; перенос, завершение, переназначение и отзыв доступа прекращают актуальность. Местная полночь, точный срок и DST проверены. Полные go test ./..., go vet ./... и 182 Node-теста. Миграция 045 на серверной копии сохраняет все прежние строки; фоновый процесс для копии явно выключен. Контракт: docs/architecture/REMINDER_DELIVERY_2026_09_04.md.'
    evidence=marker+'\n'+result+'\n'+limits+'\n'+checks+'\nCommit: '+args.commit+'\nRelease: '+args.release+'\nSHA256: '+args.sha256
    if not any(marker in proof['content'] for proof in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
    task=api('/records/'+task_id)['record']
    if marker not in task['description']:api('/records/'+task_id,'PATCH',{'status':'in_progress','description':task['description']+'\n\n'+evidence,'expectedUpdatedAt':task['updatedAt'],'reason':'Выпущена фоновая доставка сроков; настройки и личные напоминания остаются в работе'})
    print('TODAY_TASK_STATUS='+api('/records/'+task_id)['record']['status'])
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
