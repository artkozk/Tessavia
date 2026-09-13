"""Verify the personal-navigation release and record scoped completion evidence.

Run only on production after deployment and user-scenario acceptance. Final
Node/build-input counts and Go/vet/browser confirmations come from the operator.
Only the two reviewed child tasks are completed; the constructor parent receives
proof without a status change. No private personal-space content is recorded.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import urllib.request


commit = os.environ['CANDIDATE_COMMIT']
release = os.environ['VERIFIED_RELEASE']
sha = os.environ['EXPECTED_SHA256']
backup = os.environ['VERIFIED_BACKUP']
node_tests = int(os.environ['NODE_TESTS'])
build_inputs = int(os.environ['BUILD_INPUTS_VERIFIED'])
assert re.fullmatch(r'[a-f0-9]{40}', commit), 'Expected full source commit'
assert re.fullmatch(r'[a-f0-9]{64}', sha), 'Expected binary SHA256'
assert node_tests > 0 and build_inputs > 0, 'Expected final validation counts'
assert os.environ['GO_TESTS_VERIFIED'] == 'true'
assert os.environ['GO_VET_VERIFIED'] == 'true'
assert os.environ['BROWSER_QA_VERIFIED'] == 'true'
release_match = re.fullmatch(
    r'/opt/business-control/releases/20260913-personal-navigation-([a-f0-9]{7,40})', release
)
assert release_match and commit.startswith(release_match.group(1)), 'Unexpected release'
assert str(Path('/opt/business-control/current').resolve()) == release
assert hashlib.sha256(Path(release, 'business-control').read_bytes()).hexdigest() == sha
backup_path = Path(backup).resolve()
assert backup_path.parent == Path('/var/lib/business-control/backups')
assert backup_path.name.startswith('pre-personal-navigation-')
assert (backup_path / 'business-control.db').is_file()
assert (backup_path / 'cutover.db').is_file()
assert (backup_path / 'candidate-commit.txt').read_text().strip() == commit

db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=20)
db.execute('PRAGMA foreign_keys=ON')
assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not db.execute('PRAGMA foreign_key_check').fetchall()
assert db.execute(
    "SELECT count(*) FROM schema_migrations WHERE version='066_personal_finance.sql'"
).fetchone()[0] == 1
assert db.execute(
    "SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
).fetchone()[0] == 123
for migration in ('067_personal_finance_counterparties.sql', '068_page_app_sheet_values.sql'):
    assert db.execute('SELECT count(*) FROM schema_migrations WHERE version=?', (migration,)).fetchone()[0] == 1
user = db.execute("SELECT id FROM users WHERE username='artkozk'").fetchone()
assert user and db.execute(
    "SELECT 1 FROM workspace_members WHERE workspace_id='bizflow-team' AND user_id=? AND status='active'",
    user,
).fetchone()
token = secrets.token_urlsafe(32)
digest = hashlib.sha256(token.encode()).hexdigest()
now = datetime.datetime.now(datetime.timezone.utc)


def stamp(value):
    return value.isoformat(timespec='microseconds').replace('+00:00', 'Z')


db.execute(
    'INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)',
    (user[0], digest, stamp(now + datetime.timedelta(minutes=5)), stamp(now), stamp(now)),
)
db.commit()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *unused):
        return None


client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())


def api(path, method='GET', body=None):
    request = urllib.request.Request(
        'http://127.0.0.1:8522/api' + path,
        method=method,
        data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
        headers={
            'Cookie': 'business_session=' + token,
            'X-Workspace-ID': 'bizflow-team',
            'Content-Type': 'application/json',
        },
    )
    with client.open(request, timeout=25) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


marker = '[release:personal-navigation-20260913]'
task_ids = ('4e267c1f304f00a96a22b300d5b73dbb', '97be56788c5c6ba0bd28ecb6825f2aff')
parent_id = '66da4e412e714f4ea85c56ff85de03ec'
evidence = (
    f'{marker} Выпущен {commit}; {release}; SHA256 {sha}; backup {backup}. '
    'Личные разделы и собственные страницы доступны из бокового меню; '
    'пункты можно скрывать и упорядочивать в едином центре настроек. '
    'Повторная полоса личных вкладок убрана. Сохраняются история переходов '
    'между подразделами, личный контекст, независимые раскладки и профили '
    'ПК/телефона. Создание личной страницы не требует команды, а установка '
    'набора создаёт собственную копию без личных отметок и чисел автора. '
    'Косметическая настройка домашнего экрана не включает пустые инструменты; '
    'явный порядок, скрытые блоки/поля и добавленные виджеты сохраняются. '
    'В новой адаптивной раскладке скрытие одного блока не раскрывает остальные '
    'пустые; отдельный пустой блок можно явно показать. Старые раскладки '
    'без нового признака сохраняют прежние правила. '
    'Формы создания и установки защищены от позднего ответа в другом контексте. '
    f'Проверки: {node_tests} Node; go test ./...; go vet ./.... '
    f'Все {build_inputs} сборочных файлов сопоставлены с Git-коммитом. '
    'GUI-сценарии выпуска подтверждены оператором; подробные результаты и '
    'ограничения записаны в operations doc. Физические телефоны не проверялись. '
    'Серверная копия: все 123 таблицы, все строки и SQL-объекты схемы неизменны; '
    'миграций нет, последняя 068. Прежний бинарник проверен на копии без новых '
    'личных ключей. После сохранения новых ключей меню/раскладок в профиле, '
    'мобильных настройках, наборе или снимках его применения откат блокируется, '
    'как и при явном adaptiveToday true/false или непустом shownBlocks, '
    'чтобы прежняя нормализация не потеряла настройки. Финансы и расчётные листы '
    'поддерживаются предыдущим выпуском и не считаются несовместимыми сами по себе. '
    'HTTPS, ресурсы, health, nginx, integrity/FK и отказ без авторизации прошли. '
    'Ресурсы: 20260913-personal-navigation-1. '
    'Документы: docs/operations/PERSONAL_NAVIGATION_2026_09_13.md, '
    'docs/architecture/PERSONAL_NAVIGATION_CONSTRUCTOR_2026_09_13.md, '
    'docs/architecture/PERSONAL_PAGE_CONSTRUCTOR_ACCESS_2026_09_13.md и '
    'docs/architecture/PERSONAL_TODAY_PROGRESSIVE_2026_09_07.md. '
    'Незавершённая смена типов полей исключена. Личные production-страницы '
    'и настройки за пользователя не собирались. Это ограниченный этап '
    'конструктора и удобства личного пространства, а не завершение всего продукта.'
)

try:
    scoped = [(task_id, api('/records/' + task_id)) for task_id in task_ids]
    parent = api('/records/' + parent_id)
    for _, detail in scoped:
        assert detail['record']['ownerId'] == user[0] and detail['record']['authorId'] == user[0]
        assert detail['record']['workspaceId'] == 'bizflow-team'
        assert detail['record']['type'] == 'task' and detail['record']['parentId'] == parent_id
    receipt = {
        'commit': commit,
        'release': release,
        'sha256': sha,
        'backup': backup,
        'checkedAt': stamp(now),
        'oldTablesUnchanged': 123,
        'totalTables': 123,
        'newTables': 0,
        'schemaUnchanged': True,
        'allRowsUnchangedAtDryRun': True,
        'rollbackCompatibility': 'verified_on_copy_guarded_after_new_personal_navigation_settings',
        'newMigrations': [],
        'latestMigration': '068_page_app_sheet_values.sql',
        'browserScenariosVerified': True,
        'nodeTests': node_tests,
        'buildInputsVerified': build_inputs,
        'assets': '20260913-personal-navigation-1',
        'physicalDevices': False,
        'tasks': [],
    }
    for current_id, detail in [*scoped, (parent_id, parent)]:
        if not any(marker in proof['content'] for proof in detail.get('proofs', [])):
            api('/records/' + current_id + '/proofs', 'POST', {'kind': 'text', 'content': evidence})
        if current_id in task_ids and detail['record']['status'] != 'completed':
            api('/records/' + current_id + '/complete', 'POST', {'result': evidence, 'notifyPartners': False})
        updated = api('/records/' + current_id)
        assert any(marker in proof['content'] for proof in updated.get('proofs', []))
        if current_id in task_ids:
            assert updated['record']['status'] == 'completed'
        if current_id == parent_id:
            assert updated['record']['status'] == detail['record']['status'], 'Parent status changed'
        receipt['tasks'].append({
            'id': current_id,
            'statusBefore': detail['record']['status'],
            'status': updated['record']['status'],
            'action': 'completed_scoped_task' if current_id in task_ids else 'proof_only',
        })
    Path('/tmp/personal-navigation-receipt.json').write_text(
        json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8'
    )
    print(json.dumps(receipt, ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
    db.commit()
    db.close()
