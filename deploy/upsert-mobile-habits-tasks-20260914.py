"""Review/create the two bounded mobile-habits tasks; never complete them.

Run on the current production host; --apply is required for task mutations.
Existing descriptions are extended, not replaced. No private workspace data,
financial rules, credentials or session tokens are included in task text/output.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import secrets
import sqlite3
import urllib.request


parser = argparse.ArgumentParser()
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
workspace = 'bizflow-team'
parent_id = '66da4e412e714f4ea85c56ff85de03ec'
parent_marker = '[scope:mobile-habits-20260914]'
specs = [{'key': 'mobile-menu', 'marker': '[request:mobile-menu-20260914]', 'title': 'P0 · Свайп меню и стабильный экран телефона', 'priority': 'critical', 'criteria': 'Левый свайп закрывает открытое боковое меню плавно, обычный тап сохраняет переход, вертикальная прокрутка длинного меню не закрывает его. Короткий или отменённый жест возвращает меню, не нажимает пункт. Ширина берётся из реального меню. Открытие и закрытие сохраняют позицию страницы; изменение высоты viewport не перехватывает фокус и не обрывает жест. На телефоне полосы прокрутки скрыты визуально, прокрутка страницы, меню и диалогов остаётся доступна. Анимация учитывает reduced motion. Проверить 320/375 px, длинный список, форму и переключение desktop/mobile.'}, {'key': 'habit-checkin', 'marker': '[request:habit-checkin-20260914]', 'title': 'P0 · Простая отметка привычек без обязательного факта', 'priority': 'critical', 'criteria': 'Обычная бинарная привычка и отказ от нежелательного действия отмечаются нажатием на день без обязательного текста или числа. Повторное открытие отмеченного дня позволяет исправить или убрать отметку. Для количественной привычки есть понятное название величины, ноль учитывается; заметка добровольная. Не превращать отсутствие отметки в успех или срыв. Пауза, архив, будущее, чужой аккаунт и конфликт сохраняют прежние ограничения. После отметки список не перескакивает, результат сохраняется после перехода и reload. Проверить антипривычку без Shorts, обычную галочку, минуты и исправление на 320/375 px.'}]
source = 'Новый запрос пользователя о неудобстве свайпа и отметок привычек. История предыдущих выпусков сохраняется. Приёмка и выпуск: docs/operations/MOBILE_HABITS_2026_09_14.md. Сроки и трудозатраты не назначены.'

db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=20)
user = db.execute("SELECT id FROM users WHERE username='artkozk'").fetchone()
assert user and db.execute(
    "SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=? AND status='active'",
    (workspace, user[0]),
).fetchone(), 'Expected active project operator'
token = secrets.token_urlsafe(32)
digest = hashlib.sha256(token.encode()).hexdigest()
now = datetime.datetime.now(datetime.timezone.utc)


def stamp(value):
    return value.isoformat(timespec='microseconds').replace('+00:00', 'Z')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *unused):
        return None


client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())


def api(path, method='GET', body=None, request_key=None):
    headers = {'Cookie': 'business_session=' + token, 'X-Workspace-ID': workspace,
               'Content-Type': 'application/json'}
    if request_key:
        headers['Idempotency-Key'] = request_key
    request = urllib.request.Request(
        'http://127.0.0.1:8522/api' + path, method=method,
        data=None if body is None else json.dumps(body, ensure_ascii=False).encode(), headers=headers,
    )
    with client.open(request, timeout=25) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


db.execute(
    'INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)',
    (user[0], digest, stamp(now + datetime.timedelta(minutes=5)), stamp(now), stamp(now)),
)
db.commit()
try:
    assert api('/me')['username'] == 'artkozk'
    parent = api('/records/' + parent_id)['record']
    assert parent['workspaceId'] == workspace and parent['ownerId'] == user[0]
    assert parent['status'] == 'in_progress', 'Parent is no longer the active constructor task'
    rows = api('/records?type=task&includeArchived=true')
    expected = db.execute(
        "SELECT count(*) FROM records WHERE workspace_id=? AND type='task' AND subtype='' AND business_kind=''",
        (workspace,),
    ).fetchone()[0]
    assert isinstance(rows, list) and len(rows) == expected, 'Incomplete task response'
    if not args.apply:
        for previous_id in ('810856e6da755ac95048c6ede7ca1502', '32f45bce0dfb0ad682f0b48ac5217bfc', '4b3c1a8b9a6ea05929c7ec17e13c8db1'):
            previous = api('/records/' + previous_id)['record']
            print(json.dumps({'reviewed':previous_id,'title':previous['title'],'status':previous['status'],'description':previous.get('description','')},ensure_ascii=False))
    result = []
    for spec in specs:
        matches = [row for row in rows if spec['marker'] in (row.get('description') or '')]
        assert len(matches) <= 1, 'Duplicate scope marker: ' + spec['key']
        task = api('/records/' + matches[0]['id'])['record'] if matches else None
        if task:
            assert task['workspaceId'] == workspace and task['type'] == 'task'
            assert task['ownerId'] == user[0] and task.get('parentId') == parent_id
        action = 'unchanged' if task else 'create'
        if args.apply and not task:
            task = api('/records', 'POST', {
                'type': 'task', 'title': spec['title'],
                'description': spec['marker'] + '\n\nКритерии приёмки:\n' + spec['criteria'] + '\n\n' + source,
                'ownerId': user[0], 'parentId': parent_id, 'status': 'in_progress',
                'priority': spec['priority'], 'workstream': 'platform', 'editPolicy': 'owner_only',
            }, 'mobile-habits-20260914-' + spec['key'])
            task = api('/records/' + task['id'])['record']
            assert spec['marker'] in task['description'] and task['parentId'] == parent_id
            assert task['status'] == 'in_progress'
            rows.append(task)
        result.append({'key': spec['key'], 'id': task['id'] if task else None,
                       'title': task['title'] if task else spec['title'], 'action': action,
                       'status': task['status'] if task else 'not_created'})
    parent = api('/records/' + parent_id)['record']
    assert parent['status'] == 'in_progress'
    parent_action = 'unchanged' if parent_marker in (parent.get('description') or '') else 'append_scope'
    if args.apply and parent_action == 'append_scope':
        addition = parent_marker + '\nИсправление мобильных сценариев меню и простой отметки привычек:\n'
        addition += '\n\n'.join(spec['marker'] + '\n' + spec['criteria'] for spec in specs)
        addition += '\n\n' + source
        api('/records/' + parent_id, 'PATCH', {
            'description': (parent.get('description') or '') + '\n\n' + addition,
            'expectedUpdatedAt': parent['updatedAt'],
        })
        parent = api('/records/' + parent_id)['record']
        assert parent_marker in parent['description'] and parent['status'] == 'in_progress'
    receipt = {'readAt': stamp(now), 'apply': args.apply, 'workspace': workspace,
               'release': str(Path('/opt/business-control/current').resolve()),
               'parent': {'id': parent_id, 'status': parent['status'], 'action': parent_action},
               'tasks': result}
    if args.apply:
        Path('/tmp/mobile-habits-tasks-created.json').write_text(
            json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(receipt, ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
    db.commit()
    db.close()
