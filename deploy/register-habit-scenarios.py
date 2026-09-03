"""Register the user's habit work, preserving previous task descriptions."""
import datetime, fcntl, hashlib, json, secrets, sqlite3, urllib.request
from pathlib import Path

lock = open('/run/business-control-habit-planning.lock', 'w')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=15)
assert db.execute('SELECT username FROM users WHERE id=1').fetchone()[0] == 'artkozk'
token = secrets.token_urlsafe(32)
digest = hashlib.sha256(token.encode()).hexdigest()
now = datetime.datetime.now(datetime.timezone.utc)
stamp = lambda value: value.isoformat(timespec='microseconds').replace('+00:00', 'Z')
db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(1,?,?,?,?)',
           (digest, stamp(now + datetime.timedelta(minutes=5)), stamp(now), stamp(now)))
db.commit()
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *unused): return None
client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
def api(path, method='GET', body=None):
    req = urllib.request.Request('http://127.0.0.1:8522/api' + path, method=method,
        data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
        headers={'Cookie': 'business_session=' + token, 'X-Workspace-ID': 'bizflow-team', 'Content-Type': 'application/json'})
    with client.open(req, timeout=25) as response:
        raw = response.read()
        return json.loads(raw) if raw else None
try:
    marker = '[request:2026-09-03:anti-habits]'
    document = Path('/tmp/HABITS_AND_ANTI_HABITS_SCENARIOS_2026_09_03.md').read_text(encoding='utf-8')
    existing = db.execute("SELECT id FROM records WHERE workspace_id='bizflow-team' AND type='task' AND instr(description,?)>0", (marker,)).fetchall()
    assert len(existing) <= 1
    if existing:
        anti_id = existing[0][0]
    else:
        created = api('/records', 'POST', {
            'type': 'task', 'title': 'Добавить анти-привычки: отказ и постепенное сокращение',
            'description': marker + '\nПрямой запрос пользователя 03.09.2026. Следующий блок после разделения команд.\n'
                'Критерии: отдельные режимы отказ/сокращение; ноль как факт; день без действия, срыв и отсутствие отметки различимы; '
                'количество случаев и заметки; исправление дня; возобновление без потери прошлой статистики; приватность и тесты.\n'
                'Связанные канонические задачи: 32f45bce0dfb0ad682f0b48ac5217bfc (расписания), 04353cdf4e995267371b48398509a461 (аналитика).\n'
                'Даты и трудозатраты не назначены. Ниже полный проработанный контракт, это план, а не отчёт о выпуске.\n\n' + document,
            'status': 'planned', 'priority': 'high', 'ownerId': 1,
        })
        anti_id = created['id']
    addition_marker = '[scope:2026-09-03:habit-scenarios]'
    additions = {
        '32f45bce0dfb0ad682f0b48ac5217bfc': 'Уточнение: измеренный ноль не заменяется единицей; дробные значения/время; явные результаты дня; выбранные дни, интервалы и N за период; исторические версии целей; дата начала, timezone/DST; запрет будущих отметок; пауза/перенос/архив; конфликт устройств и идемпотентная офлайн-отметка. Изменение расписания не переписывает историю. Привычка и связь с личной целью приватны.',
        '04353cdf4e995267371b48398509a461': 'Уточнение: считать от прошедшего плана; неотмеченное, неуспешное и пропуск различимы; отдых/пауза/будущее исключены; серия по плановым дням или завершённым периодам с явной единицей; отдельные показатели отказа/сокращения; нулевой знаменатель не превращать в 100%; исправление прошлого использует старую цель; выборка страницами без N+1 по всей истории.',
    }
    for task_id, text in additions.items():
        task = api('/records/' + task_id)['record']
        assert task['workspaceId'] == 'bizflow-team' and task['status'] not in ('completed', 'archived')
        if addition_marker not in task['description']:
            api('/records/' + task_id, 'PATCH', {'description': task['description'] + '\n\n' + addition_marker + '\n' + text
                + '\nАнти-привычки: ' + anti_id + '\nПолный контракт: docs/architecture/HABITS_AND_ANTI_HABITS_SCENARIOS_2026_09_03.md. Критерии ещё не реализованы.',
                'expectedUpdatedAt': task['updatedAt']})
    result = api('/records/' + anti_id)['record']
    assert marker in result['description'] and result['status'] == 'planned'
    print(json.dumps({'antiHabitTask': anti_id, 'status': result['status'], 'updatedHabitTasks': list(additions)}, ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
    db.commit()
    db.close()
