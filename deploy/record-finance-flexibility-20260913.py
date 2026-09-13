"""Verify the finance-flexibility release and record evidence in its two scoped tasks.

Run only on the production host after deployment checks. NODE_TESTS and
BUILD_INPUTS_VERIFIED are the final local validation counts supplied by the
release operator; this script independently checks the current binary and DB.
The separate generic-calculations task receives boundary evidence only and is never completed here.
No personal financial settings, category names, percentages, or amounts are read or recorded.
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
release_match = re.fullmatch(
    r'/opt/business-control/releases/20260913-finance-flexibility-([a-f0-9]{7,40})', release
)
assert release_match and commit.startswith(release_match.group(1)), 'Unexpected release'
assert str(Path('/opt/business-control/current').resolve()) == release
assert hashlib.sha256(Path(release, 'business-control').read_bytes()).hexdigest() == sha
backup_path = Path(backup).resolve()
assert backup_path.parent == Path('/var/lib/business-control/backups')
assert backup_path.name.startswith('pre-finance-flexibility-')
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


marker = '[release:finance-flexibility-20260913]'
task_ids = ('194e6c0dcec0a7d5570578170363f44d', '3cd979213fb3f62d5ba86806c9150f37')
parent_id = '5def98a795abc64380faa17ba416f562'
evidence = (
    f'{marker} Выпущен {commit}; {release}; SHA256 {sha}; backup {backup}. '
    'Добавлены частный справочник плательщиков для личных финансов и общий '
    'расчётный лист конструктора: произвольные подписи, личный числовой ввод, '
    'константы схемы, последовательные формулы со ссылками на результаты других '
    'строк и перенос схемы набором без личных чисел. '
    'Скрытые или временно убранные числа сохраняются при изменении остальных '
    'полей; версии защищают структуру и личный ввод от устаревшего сохранения. '
    'Справочник не объединяет автоматически исторический текст плательщиков; '
    'ссылки и числовые значения разделены по владельцам. '
    'Личные категории, проценты, названия, настройки и суммы не читаются '
    'и не включаются в это доказательство. '
    f'Проверки: {node_tests} Node; go test ./...; go vet ./.... '
    f'Все {build_inputs} сборочных файлов сопоставлены с Git-коммитом. '
    'Серверная копия: 121 прежняя таблица, все прежние строки неизменны при '
    'проекции старых столбцов; payer_id добавлен nullable без заполнения, '
    'воспроизведена точная схема миграций 067 и 068, две новые таблицы пусты, '
    'всего 123. Пробный запуск предыдущего бинарника допустим и проверен только '
    'на копии без использования новых данных. Старый бинарник заблокирован '
    'для отката при наличии новых схем sheet (включая неактивные), оформления, '
    'личных sheet values, плательщиков или связанных payerId. '
    'HTTPS, ресурсы, health, nginx, integrity/FK и отказ без авторизации прошли. '
    'Ресурсы: 20260913-finance-flexibility-2. Физические телефоны не проверялись. '
    'Документы: docs/architecture/PAGE_SHEETS_2026_09_13.md и '
    'docs/operations/FINANCE_FLEXIBILITY_2026_09_13.md. '
    'Незавершённая смена типов полей исключена. Банки не подключались. '
    'Это ограниченный функциональный этап, а не завершение всей платформы, '
    'полной электронной таблицы либо общего направления конструктора.'
)

try:
    scoped = [(task_id, api('/records/' + task_id)) for task_id in task_ids]
    parent = api('/records/' + parent_id)
    for _, detail in scoped:
        assert detail['record']['ownerId'] == user[0] and detail['record']['authorId'] == user[0]
    receipt = {
        'commit': commit,
        'release': release,
        'sha256': sha,
        'backup': backup,
        'checkedAt': stamp(now),
        'oldTablesUnchanged': 121,
        'totalTables': 123,
        'newTablesEmptyAtDryRun': 2,
        'rollbackCompatibility': 'verified_on_unused_copy_guarded_after_new_usage',
        'schema': ['067_personal_finance_counterparties.sql', '068_page_app_sheet_values.sql'],
        'nodeTests': node_tests,
        'buildInputsVerified': build_inputs,
        'assets': '20260913-finance-flexibility-2',
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
    Path('/tmp/finance-flexibility-receipt.json').write_text(
        json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8'
    )
    print(json.dumps(receipt, ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
    db.commit()
    db.close()
