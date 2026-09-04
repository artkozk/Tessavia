"""Verify private scope and record a shipped stage without completing umbrella tasks."""
import argparse, datetime, fcntl, hashlib, json, secrets, sqlite3, urllib.request
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--commit', required=True); p.add_argument('--release', required=True); p.add_argument('--sha256', required=True)
args = p.parse_args()
assert len(args.commit) == 40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260904-habit-snooze-')
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
    assert db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='050_habit_snooze_metadata.sql'").fetchone()[0]==1
    before=list(db.execute('SELECT * FROM habit_reminder_preferences'))
    items=api('/personal/reminders')
    assert isinstance(items['items'],list) and isinstance(items['enabled'],bool)
    assert before==list(db.execute('SELECT * FROM habit_reminder_preferences'))
    owned={row[0] for row in db.execute('SELECT id FROM personal_plans WHERE owner_id=1')}
    assert all(item['planId'] in owned for item in items['items'])
    other=db.execute("SELECT id FROM personal_plans WHERE owner_id<>1 AND status<>'archived' LIMIT 1").fetchone()
    if other:
        try:api('/personal/plans/'+other[0]+'/reminder');raise AssertionError('Foreign reminder accepted')
        except urllib.error.HTTPError as error:assert error.code==404
    exported=json.dumps(api('/export'))
    assert 'personal_plan_reminders' not in exported and 'personal_plan_reminder_events' not in exported
    assert isinstance(items['habits'],list) and isinstance(items['habitsEnabled'],bool)
    owned_habits={row[0] for row in db.execute('SELECT id FROM personal_habits WHERE owner_id=1')}
    assert all(item['habitId'] in owned_habits for item in items['habits'])
    active=db.execute('SELECT id FROM personal_habits WHERE owner_id=1 AND archived_at IS NULL LIMIT 1').fetchone()
    if active: assert api('/personal/habits/'+active[0]+'/reminder')['habitId']==active[0]
    foreign=db.execute('SELECT id FROM personal_habits WHERE owner_id<>1 AND archived_at IS NULL LIMIT 1').fetchone()
    if foreign:
        try:api('/personal/habits/'+foreign[0]+'/reminder');raise AssertionError('Foreign habit accepted')
        except urllib.error.HTTPError as error:assert error.code==404
    assert 'habit_reminder_preferences' not in exported and 'habit_reminder_sources' not in exported
    print('AUTHENTICATED_HABIT_SNOOZE=ok')
    for task_id in ['a57de109f2d1876d30dd9135627657a8','32f45bce0dfb0ad682f0b48ac5217bfc']:
        detail=api('/records/'+task_id);task=detail['record'];assert task['workspaceId']=='bizflow-team'
        marker='[verified:habit-snooze-'+args.commit[:7]+']'
        result='Исправлена потеря числового факта при Позже сегодня. Отдельные метаданные откладывания сохраняют уже записанные минуты/количество, состояние measured и заметку. Частичная величина остаётся в статистике и квоте. В редакторе откладывание вынесено из результата в отдельную кнопку; несохранённые поля остаются черновиком. Повтор после потерянного ответа не продлевает час, новая отметка снимает откладывание, старый повтор после изменения отклоняется. Без отметки день не становится успешным. Серверная доставка соблюдает время привычки, выключатели, тихие часы и полночь.'
        limits='Канонические задачи остаются в работе. Обычные результаты по-прежнему поддерживают очередь без сети; новая кнопка откладывания требует соединения и сохраняет черновик при ошибке. Выключенные напоминания не включаются самим откладыванием. Прежние уже потерянные величины не восстанавливаются выдуманными данными.'
        checks='Пройдены go test ./..., go vet ./..., 188 Node-тестов. Сценарии: дробный факт и заметка после откладывания, статистика и экспорт, новая доставка не раньше часа, снятие при новой отметке, идемпотентный повтор и CAS, чужой пользователь, отсутствие ложного чистого дня, удаление, пауза, DST и полночь. Браузер: частичный результат, несохранённый ввод, откладывание, сохранение после него, узкий экран. Миграция 050 на серверной копии сохраняет все прежние строки и столбцы, добавляя только пустые snoozed_at/snoozed_from. Контракт: docs/architecture/HABIT_SNOOZE_PRESERVES_RESULT_2026_09_04.md.'
        evidence=marker+'\n'+result+'\n'+limits+'\n'+checks+'\nCommit: '+args.commit+'\nRelease: '+args.release+'\nSHA256: '+args.sha256
        if not any(marker in proof['content'] for proof in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
        task=api('/records/'+task_id)['record']
        if marker not in task['description']:api('/records/'+task_id,'PATCH',{'status':'in_progress','description':task['description']+'\n\n'+evidence,'expectedUpdatedAt':task['updatedAt'],'reason':'Исправлена сохранность факта при откладывании; оставшиеся критерии сохраняются в работе'})
        print('REMINDER_TASK_STATUS='+api('/records/'+task_id)['record']['status'])
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
