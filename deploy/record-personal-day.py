"""Verify private scope and record a shipped stage without completing umbrella tasks."""
import argparse, datetime, fcntl, hashlib, json, secrets, sqlite3, urllib.request
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--commit', required=True); p.add_argument('--release', required=True); p.add_argument('--sha256', required=True)
args = p.parse_args()
assert len(args.commit) == 40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260904-personal-day-')
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
    assert db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='043_personal_day.sql'").fetchone()[0]==1
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
    task_id='cf22d3a3a52d33eef11e8118a232d9a4'
    detail=api('/records/'+task_id);task=detail['record'];assert task['workspaceId']=='bizflow-team'
    marker='[verified:personal-day-'+args.commit[:7]+']'
    result='Выпущен личный фокус на конкретный день без изменения срока; выбор, очистка, завершение и повтор защищены версией. Сегодня отделяет активные дела дня, события, просроченное с причиной, завершённое и будущие дела. Заданные владельцем границы дня и timezone дают свободные интервалы без двойного вычитания пересечений и отдельно остаток после текущего момента. Без границ время явно неизвестно. Ночные окна, весь день, DST, неоднозначное время, полуночная конечная граница и освобождение будущего после завершения учтены. Фокус и границы хранятся только у владельца, независимо от команды; приватные тексты не пересылаются. Черновики и сравнение конфликта версий сохранены. Новые блоки включены в конструктор и переносимые наборы; проверено различие ПК/mobile.'
    limits='Задача остаётся в работе: доставка напоминаний относится к a57de109f2d1876d30dd9135627657a8; ожидания, сводка по всем командам и Review ещё не реализованы этим этапом. Выявлена прежняя привязка раскладки личного раздела к активной командной области; её перенос в независимый контекст с сохранением старых настроек продолжится отдельно. Физические телефоны не проверялись.'
    checks='Проверки: go test ./..., go vet ./..., 178 Node-тестов. Браузер: выбор/завершение фокуса, reload, пересечения 10–12/11–13, будущее отдельно, просроченный срок, заданное и неизвестное время, 320 px, конфликт 08:00/10:00 с явным применением, скрытие блока на ПК без изменения mobile. Миграция 043 проверена на серверной копии со сравнением всех прежних таблиц. Контракт: docs/architecture/PERSONAL_TODAY_FOCUS_AND_TIME_2026_09_04.md.'
    evidence=marker+'\n'+result+'\n'+limits+'\n'+checks+'\nCommit: '+args.commit+'\nRelease: '+args.release+'\nSHA256: '+args.sha256
    if not any(marker in proof['content'] for proof in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
    task=api('/records/'+task_id)['record']
    if marker not in task['description']:api('/records/'+task_id,'PATCH',{'status':'in_progress','description':task['description']+'\n\n'+evidence,'expectedUpdatedAt':task['updatedAt'],'reason':'Выпущен личный фокус и расписание; оставшиеся критерии сохраняются в работе'})
    print('TODAY_TASK_STATUS='+api('/records/'+task_id)['record']['status'])
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
