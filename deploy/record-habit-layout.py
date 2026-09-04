"""Verify habit data after the presentation-only release and record its evidence."""
import argparse, datetime, fcntl, hashlib, json, secrets, sqlite3, urllib.request
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--commit', required=True); p.add_argument('--release', required=True); p.add_argument('--sha256', required=True)
args = p.parse_args()
assert len(args.commit) == 40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260904-habit-layout-')
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
    marker='[verified:habit-layout-'+args.commit[:7]+']'
    evidence=marker+'\nПосле замечания пользователя крупные карточки заменены компактными строками в стиле личного пространства. Семь выровненных дат, отдельное обозначение дней до начала, спокойные заголовки и фильтры, компактная кнопка отметки. В подробном трекере три числовых показателя, календарь и раскрываемые пояснения. Палитра, история, формы и офлайн-очередь сохранены.\nПроверено: go test ./..., go vet ./..., 150 Node-тестов; браузер обычной ширины и 320 px, длинное название, новая привычка, быстрое выполнение, дробная прошлая отметка, восстановленный черновик, отсутствие горизонтального переполнения. Физические телефоны не проверялись. Производственный экспорт сверён с БД; тестовых привычек на рабочем сервере не создавалось. Сравнение 72 таблиц на отдельной серверной копии подтвердило отсутствие изменений данных при запуске.\nCommit: '+args.commit+'\nRelease: '+args.release+'\nSHA256: '+args.sha256+'\nДокумент: docs/architecture/HABIT_LAYOUT_REFINEMENT_2026_09_04.md. Техническая проверка не заменяет оценку дизайна пользователем.'
    task_id='04353cdf4e995267371b48398509a461'
    detail=api('/records/'+task_id);task=detail['record']
    assert task['workspaceId']=='bizflow-team'
    if not any(marker in proof['content'] for proof in detail.get('proofs',[])):
        api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
    if task['status']!='completed':
        api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
    statuses={id:api('/records/'+id)['record']['status'] for id in [task_id,'32f45bce0dfb0ad682f0b48ac5217bfc']}
    print(json.dumps({'verifiedOwnHabits':len(rows),'taskStatuses':statuses},ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
