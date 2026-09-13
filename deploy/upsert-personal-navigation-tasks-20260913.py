"""Review/create the two bounded personal-navigation tasks; never complete them.

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
parent_marker = '[scope:personal-navigation-20260913]'
specs = (
    {
        'key': 'personal-sidebar',
        'marker': '[request:personal-sidebar-20260913]',
        'title': 'P0 · Личные разделы и страницы в боковом меню',
        'priority': 'critical',
        'criteria': (
            'Открыть личные разделы из бокового меню, скрыть или упорядочить их '
            'в едином центре настроек; повторный вход и reload сохраняют выбор. '
            'Создать собственную личную страницу без команды, перейти в другой '
            'раздел и вернуться через меню; установленный набор также остаётся '
            'доступен как независимая личная страница. Переходы между личными '
            'разделами и собственными страницами работают с Back/Forward, '
            'сохраняют личный контекст и защищают несохранённую форму. '
            'Раскладки разделов и профили ПК/телефона сохраняются независимо; '
            'совместимость прежней раскладки объяснена. Проверить узкий экран '
            'и длинные названия. Чужие личные страницы, отметки и числа не '
            'становятся доступны участникам общей команды. Набор переносит '
            'схему, а не личные данные. Не закрывать общий конструктор по '
            'завершении этого ограниченного этапа.'
        ),
    },
    {
        'key': 'personal-home',
        'marker': '[request:personal-home-20260913]',
        'title': 'P1 · Компактный личный экран без сдвига навигации',
        'priority': 'high',
        'criteria': (
            'Убрать повторную прыгающую полосу личных вкладок после переноса '
            'навигации в боковое меню. На пустом и малозаполненном домашнем '
            'экране показывать полезный следующий шаг и содержательные блоки. '
            'Изменение текста, ширины, плотности и других косметических '
            'параметров не включает все пустые инструменты. Сохранить явно '
            'выбранные порядок, скрытие, поля и добавленные виджеты; редактор '
            'продолжает давать доступ к настройке блоков. Компактные превью '
            'не должны обрезать содержимое или менять смысл функции. '
            'Проверить desktop и 320 px, длинные названия, reload, меню над '
            'карточками и сохранность черновиков. Сохранить палитру платформы. '
            'Фактическую браузерную проверку и ограничения указать отдельно '
            'от наличия кода и тестов.'
        ),
    },
)
source = (
    'Документы: docs/architecture/PERSONAL_NAVIGATION_CONSTRUCTOR_2026_09_13.md, '
    'docs/architecture/PERSONAL_PAGE_CONSTRUCTOR_ACCESS_2026_09_13.md, '
    'docs/architecture/PERSONAL_TODAY_PROGRESSIVE_2026_09_07.md и '
    'docs/operations/PERSONAL_NAVIGATION_2026_09_13.md. '
    'Сроки и трудозатраты не назначены. Готовность подтверждается отдельным '
    'результатом, проверками, коммитом и штатным выпуском.'
)
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
            }, 'personal-navigation-20260913-' + spec['key'])
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
        addition = parent_marker + '\nОграниченный этап личной навигации и домашнего экрана:\n'
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
        Path('/tmp/personal-navigation-tasks-created.json').write_text(
            json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(receipt, ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
    db.commit()
    db.close()
