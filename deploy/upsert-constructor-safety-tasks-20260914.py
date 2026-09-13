"""Review/create bounded constructor safety tasks; never complete them.

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
parent_marker = '[scope:constructor-safety-20260914]'
specs = [{'key': 'component-drafts', 'marker': '[request:component-drafts-20260914]', 'title': 'P1 · Не терять черновик названия и описания своего блока', 'priority': 'high', 'status': 'in_progress', 'criteria': 'Воспроизведено на локальной SC-94: имя и описание своего блока пропадают после закрытия редактора. Сохранять метаданные по выбранному корню в существующем черновике аккаунта, пространства и страницы. Возврат, закрытие, reload и переключение другого блока сохраняют ввод. Ответ 400/409 оставляет форму исправляемой; неизвестный результат повторяется тем же запросом без второй копии. После успеха очищается только соответствующий черновик. Проверить узкий экран 320, длинное имя, несколько корней, сетевой сбой, поздний ответ и изоляцию контекста.'}, {'key': 'block-kind-safety', 'marker': '[request:block-kind-safety-20260914]', 'title': 'P0 · Не удалять действия незаметно при смене типа блока', 'priority': 'critical', 'status': 'in_progress', 'criteria': 'Подтверждено исполнением обработчика: Список записей с действием → Текст → Список записей очищает actions. Изменение типа не должно молча уничтожать кнопки, условия и цепочки. Предоставить понятную защиту и отмену до удаления несовместимой конфигурации; не обходить серверную проверку и не давать старым скрытым действиям исполняться в другом типе. Проверить возврат к прежнему типу, сохранение/черновик/reload, клавиатуру и 320 px. Неподтверждённое переключение не меняет исходную схему.'}, {'key': 'block-capacity', 'marker': '[request:block-capacity-20260914]', 'title': 'P1 · Освобождать место для блоков без тупика скрытых элементов', 'priority': 'high', 'status': 'planned', 'criteria': 'Подтверждено: на странице 40 блоков скрытие всех оставляет лимит 40, а вставка советует освободить место без доступной операции. Спроектировать понятный список скрытых блоков и безопасное удаление/восстановление с проверкой внутренних зависимостей. Скрытие само по себе не должно притворяться удалением. Показать занятое место и реальные варианты выхода; не увеличивать лимит без проверки нагрузки. Отдельная последующая задача, не закрывать вместе с черновиками.'}]
source = 'Новые дефекты воспроизведены при продолжении аудита конструктора 14.09.2026. История и критерии общих задач сохраняются. Отчёт: docs/operations/CONSTRUCTOR_SAFETY_2026_09_14.md. Сроки и трудозатраты не назначены.'

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
        for previous_id in ('38bf4aee34d6faf2e31c1e99d848ec99', 'f4dd60e96ccb69635a2faa05a60fd058'):
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
                'ownerId': user[0], 'parentId': parent_id, 'status': spec['status'],
                'priority': spec['priority'], 'workstream': 'platform', 'editPolicy': 'owner_only',
            }, 'constructor-safety-20260914-' + spec['key'])
            task = api('/records/' + task['id'])['record']
            assert spec['marker'] in task['description'] and task['parentId'] == parent_id
            assert task['status'] == spec['status']
            rows.append(task)
        result.append({'key': spec['key'], 'id': task['id'] if task else None,
                       'title': task['title'] if task else spec['title'], 'action': action,
                       'status': task['status'] if task else 'not_created'})
    parent = api('/records/' + parent_id)['record']
    assert parent['status'] == 'in_progress'
    parent_action = 'unchanged' if parent_marker in (parent.get('description') or '') else 'append_scope'
    if args.apply and parent_action == 'append_scope':
        addition = parent_marker + '\nСохранность настройки блоков и выявленные ограничения:\n'
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
        Path('/tmp/constructor-safety-tasks-created.json').write_text(
            json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(receipt, ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
    db.commit()
    db.close()
