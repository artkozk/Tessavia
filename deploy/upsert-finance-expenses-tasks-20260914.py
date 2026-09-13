"""Review/create the two bounded finance-expenses tasks; never complete them.

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
parent_marker = '[scope:finance-expenses-20260914]'
specs = ({'key': 'finance-expenses', 'marker': '[request:finance-expenses-20260914]', 'title': 'P0 · Расходы и остатки по личным счетам', 'priority': 'critical', 'criteria': 'Записать расход по выбранному направлению: сумма, дата, назначение. Остаток учитывает доходы и расходы всей истории до выбранной даты, переносится между месяцами. Отметки собственных переводов не списываются повторно. Исправить, аннулировать и восстановить расход; повтор запроса не создаёт дубль, параллельная правка даёт конфликт. Приватность владельца, точные копейки, отрицательные остатки без потери реальных расходов. Журнал доходов и расходов по дням с названиями дней недели. Проверить расход через телефонный интерфейс 320 px и сохранение/reload. Формулы распределения ранее созданных доходов не переписывать.'}, {'key': 'page-captions', 'marker': '[request:page-captions-20260914]', 'title': 'P1 · Единый редактор подписей и компактные финансы', 'priority': 'high', 'criteria': 'Список статичных подписей текущей страницы с поиском, вводом своих названий, возвратом исходного текста и предпросмотром перед сохранением. Данные, суммы, даты и пользовательские записи не переименовываются. Сохранение отдельное для страницы и устройства; отмена не теряет сохранённый текст. На финансовой странице нет общего создания посторонних записей; Финансы выбираются пользователем в меню, ранее явный выбор сохраняется. Счета и история удобны на узком экране; настройки и подробные отчёты не загромождают основной экран.'}, {'key': 'private-components', 'marker': '[request:private-components-20260914]', 'title': 'P1 · Сохранять и вставлять собственные составные блоки', 'priority': 'high', 'criteria': 'Этап задачи 38bf4aee34d6faf2e31c1e99d848ec99. Через интерфейс собрать дерево блоков, сохранить в приватную библиотеку, увидеть предпросмотр и вставить независимую копию в другую собственную страницу без кода. Внутренние ссылки получают новые ID, схемы создаются отдельными, личные записи, числа и отметки автора не копируются. Внешние зависимости объясняются до вставки. Сохранение защищено ревизией и ключом повтора, ошибка не стирает черновик. Проверить две страницы, независимые данные, reload, длинное имя и 320 px. Не закрывать широкую библиотеку системных страниц, параметры и общий конструктор этим этапом.'})
source = 'Контракты расходов, интерфейса подписей и собственных блоков; фактические проверки и выпуск в docs/operations/FINANCE_EXPENSES_2026_09_14.md. Сроки и трудозатраты не назначены.'

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
            }, 'finance-expenses-20260914-' + spec['key'])
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
        addition = parent_marker + '\nОграниченный этап расходов, редактора подписей и личной библиотеки блоков:\n'
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
        Path('/tmp/finance-expenses-tasks-created.json').write_text(
            json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(receipt, ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
    db.commit()
    db.close()
