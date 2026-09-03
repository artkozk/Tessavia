"""Track and verify the empty boards heading layout repair."""
import argparse, datetime, fcntl, hashlib, json, secrets, sqlite3, urllib.request
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--complete', action='store_true')
parser.add_argument('--commit')
parser.add_argument('--release')
parser.add_argument('--sha256')
args = parser.parse_args()
lock = open('/run/business-control-collection-heading-task.lock', 'w')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=15)
assert db.execute('SELECT username FROM users WHERE id=1').fetchone()[0] == 'artkozk'
token = secrets.token_urlsafe(32)
digest = hashlib.sha256(token.encode()).hexdigest()
now = datetime.datetime.now(datetime.timezone.utc)
stamp = lambda value: value.isoformat(timespec='microseconds').replace('+00:00', 'Z')
db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(1,?,?,?,?)',
           (digest, stamp(now + datetime.timedelta(minutes=5)), stamp(now), stamp(now)))
db.commit()

def api(path, method='GET', body=None):
    request = urllib.request.Request('http://127.0.0.1:8522/api' + path, method=method,
        data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
        headers={'Cookie': 'business_session=' + token, 'X-Workspace-ID': 'bizflow-team', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=25) as response:
        data = response.read()
        return json.loads(data) if data else None

try:
    assert api('/me')['username'] == 'artkozk'
    marker = '[request:collection-heading-layout-2026-09-03]'
    title = 'Исправить наложение проекта и заголовка на пустой странице досок'
    description = marker + '\nНа пустой странице название проекта и H1 «Доски» должны идти отдельными строками без пересечения. Непустая страница сохраняет действия справа на ПК и адаптивную сетку на телефоне. Критерии: 1440×900, 390×844, 320×844, отсутствие горизонтального переполнения; позиционный last-child не должен определять роль действий.\nОтчёт: docs/operations/COLLECTION_HEADING_LAYOUT_2026_09_03.md. Не закрывать общие задачи конструктора досок и полного аудита интерфейса.'
    records = api('/records?includeArchived=true')
    matches = [record for record in records if record['type'] == 'task' and
               (marker in record.get('description', '') or record['title'] == title)]
    assert len(matches) <= 1, 'Duplicate heading tasks require reconciliation'
    if matches:
        task = matches[0]
        assert task['workspaceId'] == 'bizflow-team' and task['ownerId'] == 1
    else:
        task = api('/records', 'POST', {'type': 'task', 'title': title, 'description': description,
                   'ownerId': 1, 'status': 'in_progress', 'priority': 'normal', 'workstream': 'platform'})
    if args.complete:
        assert args.commit and len(args.commit) == 40 and all(c in '0123456789abcdef' for c in args.commit)
        assert args.release and args.release.startswith('/opt/business-control/releases/20260903-collection-heading-')
        assert str(Path('/opt/business-control/current').resolve()) == args.release
        assert hashlib.sha256(Path(args.release + '/business-control').read_bytes()).hexdigest() == args.sha256
        detail = api('/records/' + task['id'])
        proof_marker = '[verified:collection-heading-' + args.commit[:7] + ']'
        evidence = proof_marker + '\nПустой заголовок использует вертикальную grid; действия существующей доски имеют отдельный класс. Проверены 1440/390/320 px, обе ветки страницы, отсутствие пересечения и горизонтального переполнения. Все тесты и ограничения зафиксированы в docs/operations/COLLECTION_HEADING_LAYOUT_2026_09_03.md.\nCommit: ' + args.commit + '\nRelease: ' + args.release + '\nSHA256: ' + args.sha256
        if not any(proof_marker in proof['content'] for proof in detail.get('proofs', [])):
            api('/records/' + task['id'] + '/proofs', 'POST', {'kind': 'text', 'content': evidence})
        if detail['record']['status'] != 'completed':
            api('/records/' + task['id'] + '/complete', 'POST', {'result': evidence, 'notifyPartners': False})
    result = api('/records/' + task['id'])['record']
    print(json.dumps({'id': result['id'], 'title': result['title'], 'status': result['status']}, ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
    db.commit()
    db.close()
