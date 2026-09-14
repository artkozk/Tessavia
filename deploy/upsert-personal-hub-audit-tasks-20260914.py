"""Review or create two planned personal-planning audit tasks.

Run on the documented production host. --apply permits task creation and an
append-only parent description update; it does not start or complete any task.
Dry-run reads through the API using a temporary operator session, then removes
that session. No personal plans, production examples or credentials are printed.
"""

import argparse
import datetime
import hashlib
import json
from pathlib import Path
import secrets
import sqlite3
import urllib.request


WORKSPACE = 'bizflow-team'
PARENT_ID = '4420e0be29f8c092c19243aa9d102d38'
PARENT_MARKER = '[scope:personal-hub-audit-20260914]'
SOURCE = (
    'Аудит 14.09.2026: выводы получены трассировкой текущего кода; '
    'отдельное HTTP-воспроизведение этих дефектов ещё не выполнено. '
    'Контракт, места в коде и ограничения: '
    'docs/architecture/PERSONAL_HUB_AUDIT_2026_09_14.md. '
    'История родительской задачи сохраняется. Эти задачи не входят в runtime-исправление '
    'восстановления библиотеки блоков. Сроки и трудозатраты не назначаются.'
)
SPECS = [
    {
        'key': 'personal-parent-reference',
        'marker': '[request:personal-parent-reference-20260914]',
        'title': 'P1 · Проверять владельца и доступность родителя при изменении личного дела',
        'criteria': (
            '1. Сначала выполнить HTTP-воспроизведение на отдельной тестовой БД с двумя '
            'аккаунтами A и B: создать их личные дела, затем PATCH дела A с parentId дела B '
            'и актуальной expectedUpdatedAt. Отдельно проверить своего архивного и '
            'несуществующего родителя. Сейчас подтверждена только трассировка: '
            'validatePersonalPlanReferences в internal/app/personal_planning.go проверяет '
            'существование доступного родителя только при создании; на PATCH пустая '
            'рекурсивная цепочка возвращает COUNT=0 и не отклоняет существующий чужой '
            'или архивный parentId.\n'
            '2. В одной транзакции одинаково проверять владельца, существование и '
            'доступность новой родительской ссылки при create и PATCH. Сохранить запрет '
            'ссылки на себя и циклов. Чужой и отсутствующий ID не должны раскрывать '
            'заголовок или владельца.\n'
            '3. Проверить, что свой активный родитель принимается, а чужой, архивный, '
            'несуществующий, собственный ID и цикл отклоняются до записи. Отказ не меняет '
            'родителя, текст, другие поля или версию дела. Обычное редактирование без '
            'родителя и защита от устаревшей версии сохраняются.\n'
            '4. Явно определить исправление уже сохранённой недоступной ссылки и '
            'поведение подзадачи после архивирования её родителя. Не запускать массовую '
            'очистку, не раскрывать чужие данные и не переписывать историю. Обновить '
            'документацию фактическими HTTP-результатами; до проверки не считать дефект исправленным.'
        ),
    },
    {
        'key': 'personal-archived-container',
        'marker': '[request:personal-archived-container-20260914]',
        'title': 'P1 · Сохранять возможность работать с делами архивного личного проекта или цели',
        'criteria': (
            '1. Сначала выполнить HTTP-воспроизведение на отдельной тестовой БД с двумя '
            'аккаунтами: у A создать проект, цель и связанное дело; архивировать проект '
            'и попробовать завершить и отредактировать дело с актуальной expectedUpdatedAt. '
            'Отдельно повторить с архивированием только цели; аккаунт B не должен получить '
            'доступ к контейнеру или делу A. Сейчас подтверждена только трассировка: '
            'архивирование сохраняет projectId/goalId в активном деле, а следующий PATCH '
            'отклоняет прежнюю связь фильтром status<>archived в validatePersonalPlanReferences.\n'
            '2. Согласовать и реализовать различие между сохранённой неизменённой '
            'исторической связью и новой привязкой: существующее своё дело можно '
            'редактировать и завершить после архива контейнера, сохранив прежние ID; '
            'новую связь с архивным или чужим контейнером создавать нельзя. Не снимать '
            'проверку владельца и не разрешать все архивные ссылки одним общим исключением.\n'
            '3. Показать архивное состояние прежнего проекта/цели в доступном контексте '
            'дела. Не отвязывать дела автоматически, не возвращать архивный контейнер '
            'и не переносить данные в другой проект. Проверить обычное изменение, '
            'завершение, сохранность связей и отказ при новой недопустимой связи, '
            'устаревшую версию и отсутствие побочных записей после отказа.\n'
            '4. Пройти пользовательский сценарий на 320 и 1280 px, включая длинное '
            'название и переход обратно. Зафиксировать реальную проверку и ограничения '
            'в документации, не объявляя завершённым весь экран личного проекта и цели.'
        ),
    },
]


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def stamp(value):
    return value.isoformat(timespec='microseconds').replace('+00:00', 'Z')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *unused):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=20)
    token = secrets.token_urlsafe(32)
    digest = hashlib.sha256(token.encode()).hexdigest()
    now = datetime.datetime.now(datetime.timezone.utc)
    session_created = False
    client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def api(path, method='GET', body=None, request_key=None):
        require(args.apply or method == 'GET', 'Task mutation requires --apply')
        headers = {
            'Cookie': 'business_session=' + token,
            'X-Workspace-ID': WORKSPACE,
            'Content-Type': 'application/json',
        }
        if request_key:
            headers['Idempotency-Key'] = request_key
        request = urllib.request.Request(
            'http://127.0.0.1:8522/api' + path,
            method=method,
            data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
            headers=headers,
        )
        with client.open(request, timeout=25) as response:
            raw = response.read()
            return json.loads(raw) if raw else None

    def read_complete_tasks():
        rows = api('/records?type=task&includeArchived=true')
        expected = db.execute(
            "SELECT count(*) FROM records WHERE workspace_id=? AND type='task' "
            "AND subtype='' AND business_kind=''", (WORKSPACE,),
        ).fetchone()[0]
        require(isinstance(rows, list) and len(rows) == expected, 'Incomplete task response')
        return rows

    def find_task(rows, marker):
        # The append-only parent also quotes child markers. It is context, not a
        # duplicate child; every other matching record must pass the scope guard.
        matches = [row for row in rows if row['id'] != PARENT_ID
                   and marker in (row.get('description') or '')]
        require(len(matches) <= 1, 'Duplicate audit marker: ' + marker)
        return api('/records/' + matches[0]['id'])['record'] if matches else None

    try:
        user = db.execute("SELECT id FROM users WHERE username='artkozk'").fetchone()
        require(user is not None, 'Expected project operator artkozk')
        owner_id = user[0]
        require(db.execute(
            "SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=? "
            "AND status='active'", (WORKSPACE, owner_id),
        ).fetchone() is not None, 'Expected active project operator')
        db.execute(
            'INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) '
            'VALUES(?,?,?,?,?)',
            (owner_id, digest, stamp(now + datetime.timedelta(minutes=5)), stamp(now), stamp(now)),
        )
        db.commit()
        session_created = True
        me = api('/me')
        require(me['username'] == 'artkozk' and me['id'] == owner_id, 'Unexpected API operator')

        def read_parent():
            parent = api('/records/' + PARENT_ID)['record']
            require(parent['workspaceId'] == WORKSPACE and parent['type'] == 'task'
                    and parent['ownerId'] == owner_id, 'Unexpected parent scope')
            require(parent['status'] == 'planned', 'Parent is no longer planned; review before proceeding')
            return parent

        def guard_child(task):
            require(task['workspaceId'] == WORKSPACE and task['type'] == 'task'
                    and task['ownerId'] == owner_id and task.get('parentId') == PARENT_ID,
                    'Unexpected child scope')

        read_parent()
        rows = read_complete_tasks()
        tasks = []
        for spec in SPECS:
            task = find_task(rows, spec['marker'])
            if task:
                guard_child(task)
            action = 'unchanged' if task else 'create'
            if args.apply and not task:
                created = api('/records', 'POST', {
                    'type': 'task', 'title': spec['title'],
                    'description': spec['marker'] + '\n\nКритерии приёмки:\n'
                    + spec['criteria'] + '\n\n' + SOURCE,
                    'ownerId': owner_id, 'parentId': PARENT_ID, 'status': 'planned',
                    'priority': 'high', 'workstream': 'platform', 'editPolicy': 'owner_only',
                }, 'personal-hub-audit-20260914-' + spec['key'])
                task = api('/records/' + created['id'])['record']
                guard_child(task)
                require(task['status'] == 'planned' and task['priority'] == 'high'
                        and spec['marker'] in task['description'], 'Created task differs from reviewed scope')
                rows.append(task)
            tasks.append({
                'key': spec['key'], 'marker': spec['marker'],
                'id': task['id'] if task else None,
                'title': task['title'] if task else spec['title'],
                'status': task['status'] if task else 'not_created',
                'action': action, 'evidence': 'code_trace_only', 'criteria': spec['criteria'],
            })

        parent = read_parent()
        parent_action = 'unchanged' if PARENT_MARKER in (parent.get('description') or '') else 'append_audit'
        if args.apply and parent_action == 'append_audit':
            addition = PARENT_MARKER + '\nДве отдельные проверки ссылок личных дел:\n'
            addition += '\n\n'.join(spec['marker'] + '\n' + spec['criteria'] for spec in SPECS)
            addition += '\n\n' + SOURCE
            original_description = parent.get('description') or ''
            appended_description = original_description + '\n\n' + addition
            api('/records/' + PARENT_ID, 'PATCH', {
                'description': appended_description,
                'expectedUpdatedAt': parent['updatedAt'],
            })
            parent = read_parent()
            require(parent['description'] == appended_description, 'Parent audit append was not preserved')

        if args.apply:
            final_rows = read_complete_tasks()
            for spec in SPECS:
                task = find_task(final_rows, spec['marker'])
                require(task is not None, 'Created audit task is missing')
                guard_child(task)
            parent = read_parent()
        receipt = {
            'readAt': stamp(now), 'apply': args.apply, 'workspace': WORKSPACE,
            'release': str(Path('/opt/business-control/current').resolve()),
            'source': 'docs/architecture/PERSONAL_HUB_AUDIT_2026_09_14.md',
            'parent': {'id': PARENT_ID, 'status': parent['status'], 'action': parent_action},
            'tasks': tasks,
        }
        if args.apply:
            Path('/tmp/personal-hub-audit-tasks-created.json').write_text(
                json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8',
            )
        print(json.dumps(receipt, ensure_ascii=False))
    finally:
        if session_created:
            db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
            db.commit()
        db.close()


if __name__ == '__main__':
    main()
