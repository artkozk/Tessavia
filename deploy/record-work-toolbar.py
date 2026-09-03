"""Track this toolbar repair without duplicating or completing broader audit tasks."""
import argparse, datetime, fcntl, hashlib, json, secrets, sqlite3, urllib.request
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--complete', action='store_true')
parser.add_argument('--simplify', action='store_true')
parser.add_argument('--commit')
parser.add_argument('--release')
parser.add_argument('--sha256')
args = parser.parse_args()
lock = open('/run/business-control-work-toolbar-task.lock', 'w')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
if args.complete:
    assert args.commit and len(args.commit) == 40 and all(c in '0123456789abcdef' for c in args.commit)
    assert args.release and args.release.startswith('/opt/business-control/releases/20260903-work-toolbar-')
    assert str(Path('/opt/business-control/current').resolve()) == args.release
    assert hashlib.sha256(Path(args.release + '/business-control').read_bytes()).hexdigest() == args.sha256

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
    def redirect_request(self, *unused):
        return None

client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

def api(path, method='GET', body=None):
    request = urllib.request.Request('http://127.0.0.1:8522/api' + path, method=method,
        data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
        headers={'Cookie': 'business_session=' + token, 'X-Workspace-ID': 'bizflow-team', 'Content-Type': 'application/json'})
    with client.open(request, timeout=25) as response:
        data = response.read()
        return json.loads(data) if data else None

try:
    assert api('/me')['username'] == 'artkozk'
    marker = '[request:work-toolbar-2026-09-03]'
    title = 'Исправить наложение лупы и командный фильтр очереди работы'
    criteria = marker + '\nЛупа не перекрывает текст поиска. Подпись «Партнёра» заменена на «Других участников»: все остальные участники, а не один человек. Старый ключ partner сохранён для представлений. Проверить ПК и 390/320 px, ввод, группу фильтров, приоритет конкретного ответственного, нативные флажки. Не расширять задачу до полного аудита команд и навигации.\nОтчёт: docs/operations/WORK_TOOLBAR_2026_09_03.md.'
    records = api('/records?includeArchived=true')
    matches = [record for record in records if record['type'] == 'task' and
               (marker in record.get('description', '') or record['title'] == title)]
    assert len(matches) <= 1, 'Duplicate tasks require reconciliation'
    if matches:
        task = matches[0]
        assert task['workspaceId'] == 'bizflow-team' and task['ownerId'] == 1
        if marker not in task.get('description', ''):
            task = api('/records/' + task['id'], 'PATCH', {'description': task.get('description', '') + '\n\n' + criteria,
                       'expectedUpdatedAt': task['updatedAt']})
    else:
        task = api('/records', 'POST', {'type': 'task', 'title': title, 'description': criteria, 'ownerId': 1, 'status': 'in_progress'})
    if args.simplify:
        revision = '[revision:work-toolbar-two-scopes-2026-09-03]'
        if revision not in task.get('description', ''):
            task = api('/records/' + task['id'], 'PATCH', {
                'description': task.get('description', '') + '\n\n' + revision + '\nАктуальное уточнение пользователя отменяет третий переключатель. Оставить только «Вся» и «Моя», конкретного участника выбирать в фильтрах. Старые scope=partner открывать как «Вся», не оставляя скрытого ограничения. Исправление лупы сохранить; старые доказательства относятся к предыдущей редакции требований.',
                'status': 'in_progress', 'reason': 'Уточнение пользователя: убрать лишний переключатель',
                'expectedUpdatedAt': task['updatedAt']})
    if args.complete:
        detail = api('/records/' + task['id'])
        evidence_marker = '[verified:work-toolbar-' + args.commit[:7] + ']'
        evidence = evidence_marker + '\nИсправлен каскад базовых input-стилей; отступ поиска 36 px, лупа не перехватывает нажатие. Командная подпись и aria-pressed, совместимость сохранённых фильтров. Тесты, браузерные проверки и ограничения зафиксированы в docs/operations/WORK_TOOLBAR_2026_09_03.md.\nCommit: ' + args.commit + '\nRelease: ' + args.release + '\nSHA256: ' + args.sha256
        if args.simplify:
            evidence += '\nАктуальный результат: третий переключатель удалён, только «Вся»/«Моя». Прежний partner трактуется как all; явный ответственный имеет приоритет. Исправление поиска сохранено. Эта редакция заменяет прежний критерий о подписи третьего переключателя.'
        if not any(evidence_marker in proof['content'] for proof in detail.get('proofs', [])):
            api('/records/' + task['id'] + '/proofs', 'POST', {'kind': 'text', 'content': evidence})
        if detail['record']['status'] != 'completed':
            api('/records/' + task['id'] + '/complete', 'POST', {'result': evidence, 'notifyPartners': False})
    result = api('/records/' + task['id'])['record']
    print(json.dumps({'id': result['id'], 'title': result['title'], 'status': result['status']}, ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
    db.commit()
    db.close()
