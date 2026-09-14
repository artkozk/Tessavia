"""Create four bounded mobile-access tasks and append the revised scope.

Run only on the current production host. --apply is required for task writes;
the short-lived local operator session is removed in finally in both modes.
Only bizflow-team task and parent metadata is read/written. No personal contents, push
endpoints, VAPID material, session tokens, or credentials enter the receipt.
Existing task/parent statuses and previous descriptions are never rewritten.
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
OPERATOR_ID = 1
RECEIPT = Path('/tmp/mobile-access-tasks-created.json')
SPECS = [
    {
        'key': 'pwa-access', 'marker': '[request:pwa-mobile-access-20260914]',
        'parent': '96870bd6091353613e906174f19fe574',
        'title': 'P1 · Установка на телефон и быстрый запуск личных заметок',
        'status': 'in_progress', 'priority': 'high',
        'criteria': 'Единственный вход Настройки → Личные настройки → На телефоне. '
        'Честные статусы окна браузера/отдельного приложения и доступности установки; '
        'системный install prompt только по кнопке пользователя, с инструкциями iPhone/Safari '
        'и Android/Chrome при его отсутствии. Manifest сохраняет прежние id/start_url/scope '
        'и добавляет три быстрые команды: заметка, дело, сегодня. Allowlisted launch URL '
        'не принимает произвольные адреса, ID, текст, дубли действий или совмещённое приглашение. '
        'Холодный запуск ждёт авторизацию и загрузку данных; после выполнения URL очищается. '
        'Смена аккаунта, пространства, маршрута и поздний ответ не открывают старый редактор. '
        'Живая вкладка открывает раздел через штатную навигацию без reload; черновики '
        'сохраняются, отказ хранилища блокирует закрытие. Обычный start_url сохраняет '
        'пользовательский рабочий экран; наборы не создаются и не заменяются. Проверить '
        '320/1280 px, длинные подписи, меню, установку как отдельный неподтверждённый '
        'на физическом устройстве критерий. Ярлык не называть живым виджетом.',
    },
    {
        'key': 'web-push', 'marker': '[request:web-push-delivery-20260914]',
        'parent': '78d357246455a37e129e689c3a7e9d9c',
        'title': 'P1 · Web Push: доставка и отдельное подключение каждого устройства',
        'status': 'in_progress', 'priority': 'high',
        'criteria': 'Серверный Web Push transport и настройки текущего устройства в '
        'едином разделе уведомлений. Согласие браузера запрашивается только по явной кнопке; '
        'различать разрешение, локальную подписку, регистрацию на сервере и результат '
        'тестовой отправки. Шифрование payload Web Push; никакого приватного текста '
        'в незашифрованных URL, логах, квитанциях или push-навигации. Подписка принадлежит '
        'текущему аккаунту/устройству; отзыв и выход прекращают его доставку без удаления '
        'чужих подписок. Проверять свежий доступ перед отправкой и повтором; тихие часы, '
        'истёкшие подписки, повторные попытки, потерянный ответ и смена владельца не '
        'создают дубли или утечку. Notification click открывает общий аккаунтный inbox '
        'через allowlist; живой клиент получает только безопасное сообщение и сохраняет '
        'черновик. Проверить fake provider и браузерные статусы/permission handlers. '
        'Не считать fake-provider или headless-проверку доказательством доставки '
        'на заблокированный физический iPhone/Android: это отдельная задача.',
    },
    {
        'key': 'physical-push-acceptance', 'marker': '[request:mobile-push-physical-acceptance-20260914]',
        'parent': '78d357246455a37e129e689c3a7e9d9c',
        'title': 'P1 · Физическая приёмка уведомлений на iPhone и Android',
        'status': 'planned', 'priority': 'high',
        'criteria': 'На реальном iPhone/iPad с установленным веб-приложением и реальном '
        'Android проверить подключение устройства, явное разрешение, отказ и повторное '
        'включение, test push, доставку при закрытой вкладке/приложении и заблокированном '
        'экране. Проверить системный фокус/тихие часы, временный offline и последующее '
        'подключение, отзыв разрешения и серверной подписки, logout и смену аккаунта. '
        'Клик открывает существующий inbox и не теряет незавершённый текст. Записать '
        'модель, версию ОС/браузера, состояние установки и наблюдаемый результат, '
        'без персональных содержимых и секретов. При отсутствии физического устройства '
        'оставить planned; эмуляция viewport и fake provider не закрывают этот критерий.',
    },
    {
        'key': 'native-builder-widgets', 'marker': '[request:native-builder-widgets-20260914]',
        'parent': '17b1c09b1f9d54518a4459e57715cff1',
        'title': 'Живые виджеты WidgetKit и Glance из настроек конструктора',
        'status': 'planned', 'priority': 'normal',
        'criteria': 'Отдельно спроектировать и реализовать живые виджеты домашнего экрана '
        'iOS/WidgetKit и Android/Glance, с настройкой источника и действий из пользовательского '
        'конструктора, без хардкода личного набора. Согласовать поддерживаемые блоки, '
        'размеры, обновление снимка данных, ограничения фонового выполнения и безопасную '
        'авторизацию/deep links. Данные разных аккаунтов и пространств изолированы; '
        'после отзыва доступа/logout приватный снимок очищается. До реализации и '
        'приёмки на устройствах не выдавать PWA installation, системные ярлыки или '
        'кнопку Быстрых команд за живой виджет с данными Tessavie. Этот этап остаётся planned.',
    },
]
SOURCE = ('Основание: новый запрос пользователя 14.09.2026 о мобильных уведомлениях, '
          'виджетах домашнего экрана и быстром доступе к заметкам. Пользователь сам '
          'настраивает свой набор. Документ web-этапа: '
          'docs/architecture/MOBILE_ACCESS_2026_09_14.md. '
          'Сроки и трудозатраты не назначены; выполнение подтверждается отдельно.')
PARENT_ADDITIONS = {
    '96870bd6091353613e906174f19fe574': (
        '[scope:pwa-mobile-access-20260914]',
        'Уточнение нового запроса: установка PWA из браузера и быстрый запуск '
        'заметки/дела/сегодня не требуют предварительного выпуска APK. Выделен '
        'самостоятельный web-этап с проверкой авторизации, черновиков и узкого экрана. '
        'Прежнее описание и статус направления сохраняются; этот этап не закрывает '
        'всю мобильную платформу.'),
    '78d357246455a37e129e689c3a7e9d9c': (
        '[scope:web-push-mobile-access-20260914]',
        'Уточнение нового запроса: Web Push для установленного веб-приложения может '
        'развиваться без обязательного предварительного APK. Выделены отдельные '
        'этапы серверной доставки/per-device UI и физической приёмки iPhone/Android. '
        'Тесты fake provider и браузерной логики не подтверждают доставку при '
        'закрытом приложении и заблокированном экране; родительский статус сохранён.'),
    '17b1c09b1f9d54518a4459e57715cff1': (
        '[scope:builder-native-widgets-20260914]',
        'Уточнение нового запроса: ярлык установленной PWA открывает приложение, '
        'а живой системный виджет отображает обновляемые данные. Для WidgetKit/Glance '
        'нужен отдельный этап с настройками из конструктора и приватными снимками. '
        'Этот этап оставлен planned; установки PWA и ярлыков недостаточно для '
        'завершения направления виджетов.'),
    '88c24efba689dd1d77282b17bda30ec7': (
        '[research:pwa-native-scope-20260914]',
        'Дополнение исследования 14.09.2026: APK не является обязательным первым '
        'шагом для установки PWA, быстрых ссылок и Web Push в поддерживаемой ОС. '
        'Нативную оболочку/приложения оценивать отдельно по необходимым системным '
        'интеграциям, в том числе живым виджетам WidgetKit/Glance. Это исследовательское '
        'уточнение, не подтверждение реализации native и не изменение прежнего статуса.'),
}
PARENT_TYPES = {parent_id: ('goal' if parent_id == '17b1c09b1f9d54518a4459e57715cff1' else 'task')
                for parent_id in PARENT_ADDITIONS}


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
    user = db.execute("SELECT id FROM users WHERE username='artkozk'").fetchone()
    assert user and user[0] == OPERATOR_ID, 'Expected operator artkozk/1'
    assert db.execute("SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=? AND status='active'", (WORKSPACE, OPERATOR_ID)).fetchone(), 'Expected active project operator'
    token = secrets.token_urlsafe(32)
    digest = hashlib.sha256(token.encode()).hexdigest()
    now = datetime.datetime.now(datetime.timezone.utc)
    client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def api(path, method='GET', body=None, request_key=None):
        headers = {'Cookie': 'business_session=' + token, 'X-Workspace-ID': WORKSPACE,
                   'Content-Type': 'application/json', 'X-Outbox-Owner': str(OPERATOR_ID)}
        if request_key:
            headers['Idempotency-Key'] = request_key
        request = urllib.request.Request('http://127.0.0.1:8522/api' + path, method=method,
            data=None if body is None else json.dumps(body, ensure_ascii=False).encode(), headers=headers)
        with client.open(request, timeout=25) as response:
            raw = response.read()
            return json.loads(raw) if raw else None

    def full_tasks():
        rows = api('/records?type=task&includeArchived=true')
        expected = db.execute("SELECT count(*) FROM records WHERE workspace_id=? AND type='task' AND subtype='' AND business_kind=''", (WORKSPACE,)).fetchone()[0]
        assert isinstance(rows, list) and len(rows) == expected, 'Incomplete task response; no mutations performed after this check'
        assert len({row['id'] for row in rows}) == len(rows), 'Duplicate rows in task response'
        assert all(row['workspaceId'] == WORKSPACE and row['type'] == 'task' for row in rows), 'Unexpected task scope'
        return rows, expected

    db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)',
               (OPERATOR_ID, digest, stamp(now + datetime.timedelta(minutes=5)), stamp(now), stamp(now)))
    db.commit()
    try:
        identity = api('/me')
        assert identity['username'] == 'artkozk' and identity['id'] == OPERATOR_ID
        rows, count_before = full_tasks()
        parents = {}
        for parent_id in PARENT_ADDITIONS:
            parent = api('/records/' + parent_id)['record']
            assert parent['workspaceId'] == WORKSPACE and parent['type'] == PARENT_TYPES[parent_id], 'Parent outside expected project entity scope'
            parents[parent_id] = parent
        for spec in SPECS:
            matches = [row for row in rows if spec['marker'] in (row.get('description') or '')]
            assert len(matches) <= 1, 'Duplicate scope marker: ' + spec['key']
            if matches:
                task = api('/records/' + matches[0]['id'])['record']
                assert task['workspaceId'] == WORKSPACE and task['type'] == 'task'
                assert task['ownerId'] == OPERATOR_ID and task.get('parentId') == spec['parent'], 'Existing scope task has different owner or parent'
        result = []
        for spec in SPECS:
            matches = [row for row in rows if spec['marker'] in (row.get('description') or '')]
            task = api('/records/' + matches[0]['id'])['record'] if matches else None
            action = 'unchanged' if task else 'create'
            if args.apply and not task:
                task = api('/records', 'POST', {
                    'type': 'task', 'title': spec['title'],
                    'description': spec['marker'] + '\n\nКритерии приёмки:\n' + spec['criteria'] + '\n\n' + SOURCE,
                    'ownerId': OPERATOR_ID, 'parentId': spec['parent'], 'status': spec['status'],
                    'priority': spec['priority'], 'workstream': 'platform', 'editPolicy': 'owner_only',
                }, 'mobile-access-20260914-' + spec['key'])
                task = api('/records/' + task['id'])['record']
                assert spec['marker'] in task['description'] and task['parentId'] == spec['parent']
                assert task['ownerId'] == OPERATOR_ID and task['status'] == spec['status']
                rows.append(task)
            result.append({'key': spec['key'], 'marker': spec['marker'], 'id': task['id'] if task else None,
                           'title': task['title'] if task else spec['title'], 'parentId': spec['parent'],
                           'action': action, 'status': task['status'] if task else 'not_created', 'plannedStatus': spec['status']})
        parent_results = []
        for parent_id, (marker, addition) in PARENT_ADDITIONS.items():
            parent = api('/records/' + parent_id)['record']
            previous = parents[parent_id]
            assert parent['status'] == previous['status'], 'Parent status changed during review; re-read before appending'
            action = 'unchanged' if marker in (parent.get('description') or '') else 'append_scope'
            if args.apply and action == 'append_scope':
                old_description = parent.get('description') or ''
                preserved = {key: parent.get(key) for key in ('title', 'status', 'ownerId', 'parentId', 'priority')}
                description = old_description + '\n\n' + marker + '\n' + addition + '\n\n' + SOURCE
                api('/records/' + parent_id, 'PATCH', {'description': description, 'expectedUpdatedAt': parent['updatedAt']})
                parent = api('/records/' + parent_id)['record']
                assert parent['description'] == description and parent['description'].startswith(old_description)
                assert all(parent.get(key) == value for key, value in preserved.items()), 'Parent metadata changed unexpectedly'
            parent_results.append({'id': parent_id, 'status': parent['status'], 'action': action})
        final_rows, count_after = full_tasks()
        receipt = {'readAt': stamp(now), 'apply': args.apply, 'workspace': WORKSPACE, 'operatorId': OPERATOR_ID,
                   'release': str(Path('/opt/business-control/current').resolve()), 'previousReviewCount': 242,
                   'countBefore': count_before, 'countAfter': count_after, 'completeTaskResponse': True,
                   'tasks': result, 'parents': parent_results}
        if args.apply:
            for spec in SPECS:
                assert len([row for row in final_rows if spec['marker'] in (row.get('description') or '')]) == 1
            RECEIPT.write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(receipt, ensure_ascii=False))
    finally:
        db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
        db.commit()
        db.close()


if __name__ == '__main__':
    main()
