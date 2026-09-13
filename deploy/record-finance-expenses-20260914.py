"""Verify the release and record completion of three bounded child tasks.

Run only on production after the deployment script and browser acceptance.
Runtime test counts and explicit Go/vet/browser confirmations are required.
The broad constructor, component and appearance tasks receive evidence only.
No private financial entries, page content or session credentials leave the host.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import urllib.error
import urllib.request


WORKSPACE = 'bizflow-team'
ASSETS = '20260914-finance-expenses-1'
MARKER = '[release:finance-expenses-20260914]'
ROOT_ID = '66da4e412e714f4ea85c56ff85de03ec'
COMPONENT_PARENT_ID = '38bf4aee34d6faf2e31c1e99d848ec99'
APPEARANCE_PARENT_ID = 'b8a99823ccf3f3a9f39093fe3c1af2bf'
SPECS = (
    {
        'id': '199f50a3b6ed577af4bf4963cf3bf32e',
        'requestMarker': '[request:finance-expenses-20260914]',
        'title': 'P0 · Расходы и остатки по личным счетам',
        'result': (
            'Добавлены ручные расходы по собственным счетам: сумма, дата, '
            'получатель и заметка; исправление, отмена и восстановление. '
            'Остаток учитывает распределённые доходы и расходы всей истории '
            'до показанной даты, включая перенос между месяцами. '
            'Старые отметки перекладывания денег между своими счетами не '
            'списываются второй раз и не превращаются в расходы автоматически. '
            'Сохраняются точные копейки, отрицательные остатки и приватность '
            'владельца. Повтор создания не дублирует расход, правки проверяют '
            'ревизию. История сгруппирована по дням с указанием дня недели. '
            'Прежние распределения доходов не пересчитываются этим выпуском. '
            'Это ручной бюджетный учёт, а не банковская синхронизация или '
            'неизменяемая бухгалтерская книга проводок.'
        ),
    },
    {
        'id': '83382cc8db1ef809acf512b0dd16dcc9',
        'requestMarker': '[request:page-captions-20260914]',
        'title': 'P1 · Единый редактор подписей и компактные финансы',
        'result': (
            'Добавлен общий экран «Тексты и подписи» для зарегистрированных '
            'заголовков и статичных подписей страницы: поиск, своё название, '
            'возврат исходного текста и применение к черновику перед сохранением '
            'оформления. Суммы, даты и содержимое записей не переименовываются. '
            'Настройки остаются отдельными для страницы и устройства. '
            'В финансах разделены счета и история, есть быстрые «Доход» и '
            '«Расход», периоды с полными датами и подробности по запросу. '
            'Общее создание посторонних записей на финансовой странице убрано. '
            'Финансы выбираются в общем редакторе меню; ранее явный выбор '
            'сохранён. Поле поступления подписано «От кого». '
            'Этап не объявляет редактирование всех слов во всех диалогах.'
        ),
    },
    {
        'id': '2e0f3a9972a32cd9d330869610243757',
        'requestMarker': '[request:private-components-20260914]',
        'title': 'P1 · Сохранять и вставлять собственные составные блоки',
        'result': (
            'В конструкторе собственной страницы можно собрать группу, '
            'сохранить её как свой блок, открыть личную библиотеку, увидеть '
            'предпросмотр и вставить независимую копию в другую свою страницу. '
            'Внутренние ссылки блоков переназначаются; списки и формы получают '
            'отдельные пустые схемы. Личные записи, отметки и введённые числа '
            'автора не копируются. Внешние зависимости группы объясняются '
            'перед переносом. Явная операция «Вставить и сохранить страницу» '
            'атомарно сохраняет принимающий черновик и источники; конфликт '
            'не оставляет ненужных досок. Повтор и потерянный ответ защищены '
            'ключом запроса, включая восстановление после перезагрузки. '
            'Старый черновик не записывается под новой ревизией после конфликта. '
            'Вставка на встроенные системные страницы, параметры, общие '
            'выражения и цепочки действий остаются отдельной работой. '
            'Полная воспроизводимость финансового модуля без кода не заявляется.'
        ),
    },
)
NEW_TABLES = (
    'personal_finance_expenses', 'personal_finance_expense_requests',
    'page_app_components', 'page_app_component_insertions',
)
NEW_MIGRATIONS = ('069_personal_finance_expenses.sql', '070_page_app_components.sql')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *unused):
        return None


def stamp(value):
    return value.isoformat(timespec='microseconds').replace('+00:00', 'Z')


def verify_task(record, spec, user_id):
    assert record['id'] == spec['id']
    assert record['workspaceId'] == WORKSPACE and record['type'] == 'task'
    assert record['ownerId'] == user_id and record['authorId'] == user_id
    assert record['parentId'] == ROOT_ID, 'Reviewed child moved to another parent'
    assert record['title'] == spec['title'], 'Reviewed task title changed'
    assert spec['requestMarker'] in (record.get('description') or '')
    assert record['status'] in ('planned', 'in_progress', 'completed'), 'Task needs fresh review'


def main():
    commit = os.environ['CANDIDATE_COMMIT']
    release = os.environ['VERIFIED_RELEASE']
    sha = os.environ['EXPECTED_SHA256']
    backup = os.environ['VERIFIED_BACKUP']
    node_tests = int(os.environ['NODE_TESTS'])
    build_inputs = int(os.environ['BUILD_INPUTS_VERIFIED'])
    assert re.fullmatch(r'[a-f0-9]{40}', commit), 'Expected full source commit'
    assert re.fullmatch(r'[a-f0-9]{64}', sha), 'Expected binary SHA256'
    assert node_tests > 0 and build_inputs > 0, 'Expected final validation counts'
    for gate in ('GO_TESTS_VERIFIED', 'GO_VET_VERIFIED', 'BROWSER_QA_VERIFIED'):
        assert os.environ[gate] == 'true', 'Missing acceptance: ' + gate
    match = re.fullmatch(r'/opt/business-control/releases/20260914-finance-expenses-([a-f0-9]{7,40})', release)
    assert match and commit.startswith(match.group(1)), 'Unexpected release'
    assert str(Path('/opt/business-control/current').resolve()) == release
    assert hashlib.sha256(Path(release, 'business-control').read_bytes()).hexdigest() == sha
    backup_path = Path(backup).resolve()
    assert backup_path.parent == Path('/var/lib/business-control/backups')
    assert backup_path.name.startswith('pre-finance-expenses-')
    for name in ('business-control.db', 'cutover.db', 'uploads.tar.gz',
                 'business-control.env', 'business-control.nginx.conf', 'SHA256SUMS'):
        assert (backup_path / name).is_file(), 'Missing deployment backup file: ' + name
    assert (backup_path / 'candidate-commit.txt').read_text().strip() == commit
    assert (backup_path / 'previous-release.txt').read_text().strip() == '/opt/business-control/releases/20260913-personal-navigation-2ae5847'
    for name in ('local-health.json', 'public-health.json'):
        assert json.loads((backup_path / name).read_text())['status'] == 'ok'

    client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    # Check only public shell/health and anonymous denial; never print finances.
    for base in ('http://127.0.0.1:8522', 'https://control.e-rd.ru'):
        with client.open(base + '/api/health', timeout=20) as response:
            assert json.load(response)['status'] == 'ok'
        with client.open(base + '/', timeout=20) as response:
            assert ('app.js?v=' + ASSETS).encode() in response.read()
        for path in ('/api/personal/finance', '/api/page-app/components'):
            try:
                response = client.open(base + path, timeout=20)
            except urllib.error.HTTPError as error:
                assert error.code == 401, 'Expected authentication boundary'
            else:
                response.close()
                raise AssertionError('Anonymous feature access unexpectedly allowed')

    db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=20)
    digest = None
    try:
        db.execute('PRAGMA foreign_keys=ON')
        assert db.execute('PRAGMA integrity_check').fetchall() == [('ok',)]
        assert not db.execute('PRAGMA foreign_key_check').fetchall()
        tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
        assert len(tables) == 127 and set(NEW_TABLES) <= tables
        for migration in ('066_personal_finance.sql', '067_personal_finance_counterparties.sql',
                          '068_page_app_sheet_values.sql', *NEW_MIGRATIONS):
            assert db.execute('SELECT count(*) FROM schema_migrations WHERE version=?', (migration,)).fetchone()[0] == 1
        assert db.execute('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').fetchone()[0] == NEW_MIGRATIONS[-1]
        user = db.execute("SELECT id FROM users WHERE username='artkozk'").fetchone()
        assert user and db.execute(
            "SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=? AND status='active'",
            (WORKSPACE, user[0]),
        ).fetchone(), 'Expected active project operator'
        token = secrets.token_urlsafe(32)
        digest = hashlib.sha256(token.encode()).hexdigest()
        now = datetime.datetime.now(datetime.timezone.utc)
        db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)',
                   (user[0], digest, stamp(now + datetime.timedelta(minutes=5)), stamp(now), stamp(now)))
        db.commit()

        def api(path, method='GET', body=None):
            request = urllib.request.Request(
                'http://127.0.0.1:8522/api' + path, method=method,
                data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
                headers={'Cookie': 'business_session=' + token, 'X-Workspace-ID': WORKSPACE,
                         'Content-Type': 'application/json'},
            )
            with client.open(request, timeout=25) as response:
                raw = response.read()
                return json.loads(raw) if raw else None

        assert api('/me')['username'] == 'artkozk'
        scoped = {spec['id']: api('/records/' + spec['id']) for spec in SPECS}
        parents = {key: api('/records/' + key) for key in (ROOT_ID, COMPONENT_PARENT_ID, APPEARANCE_PARENT_ID)}
        for spec in SPECS:
            verify_task(scoped[spec['id']]['record'], spec, user[0])
        for detail in parents.values():
            assert detail['record']['workspaceId'] == WORKSPACE and detail['record']['type'] == 'task'

        common = (
            f'{MARKER} Выпущен {commit}; {release}; SHA256 {sha}; backup {backup}. '
            f'Проверки: {node_tests} Node; go test ./...; go vet ./.... '
            f'Все {build_inputs} сборочных файлов сопоставлены с Git-коммитом. '
            'GUI-сценарии выпуска подтверждены оператором; результаты и '
            'ограничения записаны в операционном отчёте. Физические телефоны '
            'не проверялись. Штатный выпуск добавляет миграции 069/070: '
            '123 прежние таблицы сохранены, всего 127; новые данные не '
            'создавались миграцией. Предыдущий бинарник проверяется на копии; '
            'автоматический откат запрещён после использования новых расходов '
            'или библиотеки, чтобы не скрыть новую работу пользователя. '
            'Данные и backup остаются на рабочем сервере. Текущие локальные '
            'и публичные health/ресурсы, integrity/FK и отказ без авторизации '
            f'перепроверены перед записью результата. Ресурсы: {ASSETS}. '
            'Документы: docs/operations/FINANCE_EXPENSES_2026_09_14.md; '
            'docs/architecture/FINANCE_EXPENSES_2026_09_14.md; '
            'docs/architecture/FINANCE_EXPENSES_UI_2026_09_14.md; '
            'docs/architecture/PAGE_CAPTIONS_2026_09_14.md; '
            'docs/architecture/PAGE_COMPONENT_LIBRARY_2026_09_14.md. '
            'Незавершённые преобразования типов полей не входят в выпуск. '
            'Настоящие личные страницы и финансы не заполнялись примерами. '
        )
        receipt = {
            'commit': commit, 'release': release, 'sha256': sha, 'backup': backup,
            'checkedAt': stamp(now), 'workspace': WORKSPACE,
            'oldTablesUnchanged': 123, 'totalTables': 127, 'newTables': 4,
            'newTableNames': list(NEW_TABLES),
            'newMigrations': list(NEW_MIGRATIONS), 'latestMigration': NEW_MIGRATIONS[-1],
            'rollbackCompatibility': 'verified_on_copy_blocked_after_new_expense_or_component_usage',
            'browserScenariosVerified': True, 'physicalDevices': False,
            'nodeTests': node_tests, 'buildInputsVerified': build_inputs, 'assets': ASSETS,
            'tasks': [],
        }
        spec_by_id = {spec['id']: spec for spec in SPECS}
        parent_results = {
            ROOT_ID: ' '.join(spec['result'] for spec in SPECS),
            COMPONENT_PARENT_ID: SPECS[2]['result'],
            APPEARANCE_PARENT_ID: SPECS[1]['result'],
        }
        for current_id, detail in [*scoped.items(), *parents.items()]:
            is_child = current_id in spec_by_id
            result = spec_by_id[current_id]['result'] if is_child else parent_results[current_id]
            evidence = common + result
            if not any(MARKER in proof['content'] and commit in proof['content'] for proof in detail.get('proofs', [])):
                api('/records/' + current_id + '/proofs', 'POST', {'kind': 'text', 'content': evidence})
            if is_child and detail['record']['status'] != 'completed':
                fresh = api('/records/' + current_id)['record']
                verify_task(fresh, spec_by_id[current_id], user[0])
                assert fresh.get('description') == detail['record'].get('description'), 'Acceptance criteria changed during recording'
                api('/records/' + current_id + '/complete', 'POST', {'result': evidence, 'notifyPartners': False})
            updated = api('/records/' + current_id)
            assert any(MARKER in proof['content'] and commit in proof['content'] for proof in updated.get('proofs', []))
            if is_child:
                assert updated['record']['status'] == 'completed'
            else:
                assert updated['record']['status'] == detail['record']['status'], 'Broad parent status changed'
            receipt['tasks'].append({
                'id': current_id, 'statusBefore': detail['record']['status'],
                'status': updated['record']['status'],
                'action': 'completed_scoped_task' if is_child else 'proof_only',
            })
        Path('/tmp/finance-expenses-receipt.json').write_text(
            json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(receipt, ensure_ascii=False))
    finally:
        if digest is not None:
            db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
            db.commit()
        db.close()


if __name__ == '__main__':
    main()
