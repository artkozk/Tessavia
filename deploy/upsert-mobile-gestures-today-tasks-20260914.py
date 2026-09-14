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
parent_marker = '[scope:mobile-gestures-today-20260914]'
specs = [{'key': 'center-swipe', 'marker': '[request:center-swipe-20260914]', 'title': 'P0 · Открытие меню свайпом из центра страницы', 'priority': 'critical', 'criteria': 'На телефоне свайп вправо из обычной области страницы открывает меню без обязательного старта у края Android. Левый свайп по панели или подложке закрывает меню. Горизонтальные списки и таблицы сохраняют свой жест даже в крайнем положении; ввод, редактор, карта, жесты чата и перетаскивание конструктора не открывают меню. Тап, вертикальная прокрутка, короткий жест, второй палец и отмена не вызывают перехода или случайного открытия. Сохраняются позиция страницы, фокус, reduced motion. Проверить исполняемый контроллер и мобильную вёрстку; физические Android/iPhone отдельно обозначить как не проверенные при отсутствии устройства.'}, {'key': 'habit-today-focus', 'marker': '[request:habit-today-focus-20260914]', 'title': 'P1 · Сегодняшняя отметка привычки без недельного перегруза', 'priority': 'high', 'criteria': 'Карточка привычки на Сегодня показывает крупное название, понятное состояние за сегодня и простое действие. Семь дневных ячеек убраны из обычной карточки, история доступна отдельно из привычки. Обычная привычка и отказ отмечаются без обязательного факта; количество и время сохраняют свою форму, неизвестное не считается нулём. Исправление, отмена, офлайн и ограничения доступа сохраняются. Верхняя сводка описывает сегодняшнее выполнение, а не число серий. Проверить 320/390px, длинное название, привычки разных режимов, сохранение после reload.'}]
source = 'Уточнение пользователя: системный жест Android мешает открывать меню с края; нужно открытие из центра без конфликта с горизонтальными списками. В привычках нужен фокус на сегодняшнем результате, а не семь ячеек на каждой карточке. История предыдущих выпусков сохраняется. Приёмка и выпуск: docs/operations/MOBILE_GESTURES_TODAY_RELEASE_2026_09_14.md. Сроки и трудозатраты не назначены.'

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
        for previous_id in ('92118eef746fd910cab273e2026dc101', 'eb8eb14c857b866d39c593ba6dc566f4'):
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
            }, 'mobile-gestures-today-20260914-' + spec['key'])
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
        addition = parent_marker + '\nУточнение мобильных сценариев: жест из центра и компактная сегодняшняя привычка:\n'
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
        Path('/tmp/mobile-gestures-today-tasks-created.json').write_text(
            json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(receipt, ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
    db.commit()
    db.close()
