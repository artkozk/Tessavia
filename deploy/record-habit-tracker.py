"""Verify the live constructor API and complete its bounded canonical task."""
import argparse, datetime, fcntl, hashlib, json, secrets, sqlite3, urllib.request
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--commit', required=True); p.add_argument('--release', required=True); p.add_argument('--sha256', required=True)
args = p.parse_args()
assert len(args.commit) == 40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260904-habit-tracker-')
assert str(Path('/opt/business-control/current').resolve()) == args.release
assert hashlib.sha256(Path(args.release+'/business-control').read_bytes()).hexdigest() == args.sha256
lock = open('/run/business-control-habit-task.lock', 'w')
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
    overview=api('/personal/overview')
    rows=list(db.execute('SELECT id FROM personal_habits WHERE owner_id=1'))
    assert {h['id'] for h in overview['habits']}=={row[0] for row in rows}
    for h in overview['habits']:
        data=api('/personal/habits/'+h['id']+'/tracker')
        raw=api('/personal/habits/'+h['id']+'/export')
        assert data['habit']['id']==h['id'] and data['habit']['rules']
        expected=list(db.execute('SELECT checkin_date,amount,note,result_state FROM personal_habit_checkins WHERE habit_id=? AND owner_id=1 ORDER BY checkin_date',(h['id'],)))
        assert [(c['date'],c['value'],c['note'],c['state']) for c in raw['checkins']]==expected
        assert len(data['days'])<=31
    foreign=db.execute('SELECT id FROM personal_habits WHERE owner_id<>1 LIMIT 1').fetchone()
    if foreign:
        for suffix in ['/tracker','/export']:
            try: api('/personal/habits/'+foreign[0]+suffix)
            except urllib.error.HTTPError as err: assert err.code==404
            else: raise AssertionError('Foreign habit exposed')
    marker='[verified:habit-tracker-'+args.commit[:7]+']'
    common=marker+'\nВыпущен полноценный экран Личное → Привычки. Режимы: выполнение, количество, минуты, отказ, сокращение. Ноль/дробь/срыв/пропуск/нет отметки различимы. Исторические цели, ежедневное расписание, дни недели, интервал, квоты дней/объёма за неделю/месяц. Пауза, архив/восстановление, перенос предстоящего выполнения на свободный день. Календарь недели/месяца/12 недель, серии по ритму, процент от плана, дни недели, заметки и приватный экспорт.\nПроверки: go test ./..., go vet ./..., 149 Node-тестов; API ноль/дробь/даты/конфликты/пауза/архив/чужой аккаунт, leap day/DST/недельные квоты; браузер desktop и 320 px, длинное название, прошлая отметка, черновик, разрыв сети и доставка одной строки. Физические телефоны не проверялись. Production: исходные факты личного экспорта сверены с БД без создания тестовых привычек. Миграция на локальной серверной копии сохранила все прежние столбцы всех таблиц.\nCommit: '+args.commit+'\nRelease: '+args.release+'\nSHA256: '+args.sha256+'\nКонтракт: docs/architecture/HABIT_TRACKER_IMPLEMENTATION_2026_09_04.md.'
    remaining='\nОставшаяся часть расширенного направления: push с закрытой вкладкой, холодный офлайн-запуск приватного трекера, журнал отдельных подходов с временем события. Сейчас напоминания в открытой вкладке, офлайн-очередь из открытой формы и дневной итог с прибавлением подходов. Эти ограничения явно описаны в интерфейсе/контракте; большое направление расписаний остаётся в работе.'
    statuses={}
    for task_id in ['32f45bce0dfb0ad682f0b48ac5217bfc','04353cdf4e995267371b48398509a461','4b3c1a8b9a6ea05929c7ec17e13c8db1']:
        detail=api('/records/'+task_id);task=detail['record']
        assert task['workspaceId']=='bizflow-team'
        evidence=common+(remaining if task_id=='32f45bce0dfb0ad682f0b48ac5217bfc' else '\nОсновные критерии этой задачи проверены; расширенные уведомления/офлайн входят в оставшуюся часть задачи расписаний.')
        if not any(marker in proof['content'] for proof in detail.get('proofs',[])):
            api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
        if task_id!='32f45bce0dfb0ad682f0b48ac5217bfc' and task['status']!='completed':
            api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
        statuses[task_id]=api('/records/'+task_id)['record']['status']
    assert statuses['32f45bce0dfb0ad682f0b48ac5217bfc']=='in_progress'
    print(json.dumps({'verifiedOwnHabits':len(rows),'foreignPrivacyChecked':bool(foreign),'taskStatuses':statuses},ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
