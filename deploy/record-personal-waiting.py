"""Verify private scope and record a shipped stage without completing umbrella tasks."""
import argparse, datetime, fcntl, hashlib, json, secrets, sqlite3, urllib.request
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--commit', required=True); p.add_argument('--release', required=True); p.add_argument('--sha256', required=True)
args = p.parse_args()
assert len(args.commit) == 40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260904-personal-waiting-')
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
    assert db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='051_personal_waiting.sql'").fetchone()[0]==1
    before=list(db.execute('SELECT * FROM personal_waiting'))
    items=api('/personal/reminders')
    assert isinstance(items['items'],list) and isinstance(items['enabled'],bool)
    assert before==list(db.execute('SELECT * FROM personal_waiting'))
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
    waits=api('/personal/waiting?status=all&timezone=UTC')
    assert isinstance(waits['items'],list) and isinstance(waits['total'],int) and waits['pageSize']==20
    assert before==list(db.execute('SELECT * FROM personal_waiting'))
    owned_waiting={row[0] for row in db.execute('SELECT id FROM personal_waiting WHERE owner_id=1')}
    assert all(item['id'] in owned_waiting for item in waits['items'])
    foreign_wait=db.execute('SELECT id FROM personal_waiting WHERE owner_id<>1 LIMIT 1').fetchone()
    if foreign_wait:
        try:api('/personal/waiting/'+foreign_wait[0]+'?timezone=UTC');raise AssertionError('Foreign waiting accepted')
        except urllib.error.HTTPError as error:assert error.code==404
    assert 'personal_waiting' not in exported and 'personal_waiting_events' not in exported
    print('AUTHENTICATED_PERSONAL_WAITING=ok')
    for task_id in ['e811bcc565da70123644a4654273aca3','cf22d3a3a52d33eef11e8118a232d9a4']:
        detail=api('/records/'+task_id);task=detail['record'];assert task['workspaceId']=='bizflow-team'
        marker='[verified:personal-waiting-'+args.commit[:7]+']'
        result='Добавлен личный учёт внешних ожиданий: что ждём, от кого, с какого дня, необязательная ожидаемая дата, контекст и связь с личным делом. Просроченное видно на Сегодня; отдельный список содержит поиск, фильтр и страницы по 20. Получение, отмена, возврат и перенос даты сохраняют историю. Создание и изменения защищены ключами повторов и revision. Конфликт показывает текущую дату/статус и сохраняет введённые поля. Исходное дело не закрывается и не меняет срок. Новая запись не отправляет сообщение внешнему человеку.'
        limits='Канонические задачи остаются в работе. Этот выпуск покрывает личные ожидания и Сегодня; Review и командный сценарий не реализованы, автоматических напоминаний человеку нет. Ожидание хранит текст от кого, не выдаёт доступ и не назначает пользователя. Сохранённые пользовательские раскладки не переписываются; блок day-waiting можно включить в конструкторе страницы.'
        checks='Пройдены go test ./..., go vet ./..., 180 Node-тестов. Сервер: приватность, чужое дело, безопасные повторы, CAS, история переноса/получения/отмены/возврата, даты, просрочка, Сегодня, неизменность исходного дела и страницы. Браузер: Сегодня, список, длинные поля, 320 px, черновик и конфликт двух сессий. Миграция 051 на серверной копии сравнивает все прежние строки и столбцы и добавляет только пустые таблицы ожиданий. Контракт: docs/architecture/PERSONAL_WAITING_2026_09_04.md.'
        evidence=marker+'\n'+result+'\n'+limits+'\n'+checks+'\nCommit: '+args.commit+'\nRelease: '+args.release+'\nSHA256: '+args.sha256
        if not any(marker in proof['content'] for proof in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
        task=api('/records/'+task_id)['record']
        if marker not in task['description']:api('/records/'+task_id,'PATCH',{'status':'in_progress','description':task['description']+'\n\n'+evidence,'expectedUpdatedAt':task['updatedAt'],'reason':'Выпущен личный этап внешних ожиданий; Review и командный этап сохраняются в работе'})
        print('WAITING_TASK_STATUS='+api('/records/'+task_id)['record']['status'])
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
