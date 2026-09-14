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
parent_id = '38bf4aee34d6faf2e31c1e99d848ec99'
parent_marker = '[scope:component-recovery-20260914]'
specs = [{'key': 'component-recovery', 'marker': '[request:component-recovery-20260914]', 'title': 'P1 · Сохранять запрос библиотеки блоков до подтверждённого результата', 'priority': 'high', 'status': 'in_progress', 'criteria': 'Воспроизведено исполнением редактора: при отказе localStorage мутация отправляется без надёжной квитанции; после потерянного ответа и reload запрос можно удалить как обычный черновик; повторный 401 очищает неизвестный результат. До первого POST сохранить неизменяемое тело и clientRequestId на устройстве. При отказе хранения не отправлять запрос, оставить ввод для исправления. После закрытия/reload сразу восстанавливать проверку результата, без удаления черновика и новых изменений до разрешения операции. Повторный 401/403/404 не доказывает отсутствие прежнего коммита и сохраняет запрос. Проверить create и insert, потерянный ответ, ревизию страницы, две учётные записи/пространства, поздний ответ, исправляемый 400/409, 320 px и длинный текст. Один успешный запрос должен давать ровно одну библиотечную запись или вставку.'}]
source = 'Новые дефекты воспроизведены при продолжении аудита конструктора 14.09.2026. История и критерии общих задач сохраняются. Отчёт: docs/operations/COMPONENT_RECOVERY_2026_09_14.md. Сроки и трудозатраты не назначены.'

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
    assert parent['status'] in ('planned','in_progress'), 'Unexpected parent status'
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
        matches = [row for row in rows if row['id'] != parent_id and spec['marker'] in (row.get('description') or '')]
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
            }, 'component-recovery-20260914-' + spec['key'])
            task = api('/records/' + task['id'])['record']
            assert spec['marker'] in task['description'] and task['parentId'] == parent_id
            assert task['status'] == spec['status']
            rows.append(task)
        result.append({'key': spec['key'], 'id': task['id'] if task else None,
                       'title': task['title'] if task else spec['title'], 'action': action,
                       'status': task['status'] if task else 'not_created'})
    parent = api('/records/' + parent_id)['record']
    assert parent['status'] in ('planned','in_progress')
    parent_action = 'unchanged' if parent_marker in (parent.get('description') or '') else 'append_scope'
    if args.apply and parent_action == 'append_scope':
        addition = parent_marker + '\nSC-102: восстановление запроса библиотеки блоков:\n'
        addition += '\n\n'.join(spec['marker'] + '\n' + spec['criteria'] for spec in specs)
        addition += '\n\n' + source
        api('/records/' + parent_id, 'PATCH', {
            'description': (parent.get('description') or '') + '\n\n' + addition,
            'expectedUpdatedAt': parent['updatedAt'], 'status':'in_progress', 'reason':'Начато исправление сохранности запросов библиотеки блоков',
        })
        parent = api('/records/' + parent_id)['record']
        assert parent_marker in parent['description'] and parent['status'] == 'in_progress'
    receipt = {'readAt': stamp(now), 'apply': args.apply, 'workspace': workspace,
               'release': str(Path('/opt/business-control/current').resolve()),
               'parent': {'id': parent_id, 'status': parent['status'], 'action': parent_action},
               'tasks': result}
    if args.apply:
        Path('/tmp/component-recovery-tasks-created.json').write_text(
            json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(receipt, ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
    db.commit()
    db.close()
