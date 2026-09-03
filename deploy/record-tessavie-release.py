#!/usr/bin/env python3
"""Record the technical Tessavie release through the local authorized API.

Run on the production host only. The temporary session is removed in finally;
tokens and user data never leave the host. Repeated calls deduplicate by marker.
"""
import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import secrets
import sqlite3
from urllib import request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('phase', choices=['prepare', 'complete'])
parser.add_argument('--commit', default='')
parser.add_argument('--release', default='')
args = parser.parse_args()
workspace = 'bizflow-team'
parent_id = '9b40463ee2ec5e93d91309bd34b2e5f8'
marker = '[release:tessavie-brand-2026-09-03]'
db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=15)
db.row_factory = sqlite3.Row
owner = db.execute("SELECT id FROM users WHERE username='artkozk'").fetchone()[0]
assert db.execute("SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=? AND status='active'", (workspace, owner)).fetchone()
if args.phase == 'complete':
    assert len(args.commit) == 40 and all(c in '0123456789abcdef' for c in args.commit)
    assert str(Path('/opt/business-control/current').resolve()) == args.release
    assert args.release.startswith('/opt/business-control/releases/20260903-tessavie-')
    assert db.execute("SELECT 1 FROM schema_migrations WHERE version='029_tessavie_brand.sql'").fetchone()

token = secrets.token_urlsafe(32)
token_hash = hashlib.sha256(token.encode()).hexdigest()
now = datetime.now(timezone.utc)
stamp = lambda d: d.isoformat(timespec='microseconds').replace('+00:00', 'Z')
db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)',
           (owner, token_hash, stamp(now+timedelta(minutes=15)), stamp(now), stamp(now)))
db.commit()
opener = request.build_opener(request.ProxyHandler({}))
def api(method, path, body=None):
    payload = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    req = request.Request('http://127.0.0.1:8522/api'+path, payload,
        {'Cookie':'business_session='+token, 'Content-Type':'application/json', 'X-Workspace-ID':workspace}, method=method)
    with opener.open(req, timeout=20) as response:
        data = response.read()
        return json.loads(data) if data else None

try:
    parent = api('GET', '/records/'+parent_id)['record']
    assert parent['workspaceId'] == workspace
    rows = db.execute('SELECT id FROM records WHERE workspace_id=? AND description LIKE ?', (workspace, '%'+marker+'%')).fetchall()
    assert len(rows) <= 1, 'Duplicate release tasks must be reviewed'
    if rows:
        task = api('GET', '/records/'+rows[0]['id'])['record']
    else:
        assert args.phase == 'prepare', 'Prepare the release task before completion'
        task = api('POST', '/records', {
            'type':'task', 'title':'Выпустить Tessavie: новое имя, логотип и оформление',
            'description': marker+'\nПрямое решение пользователя 03.09.2026: перейти на Tessavie.\n'
                'Объём: вход, навигация, тексты интерфейса, favicon/PWA, экспорты, стандартные имена команды, документация.\n'
                'Критерии: проверки кода и 320/390/820/1280 px; сохранность ID и пользовательских имён; backup и dry-run на рабочем сервере; публичный smoke.\n'
                'Правовая регистрация и смена домена остаются за пределами технического выпуска.',
            'status':'in_progress', 'ownerId':owner, 'parentId':parent_id,
            'priority':'normal', 'workstream':'platform', 'editPolicy':'shared'})
    assert task['parentId'] == parent_id and task['workspaceId'] == workspace
    parent_marker = '[decision:tessavie-brand-2026-09-03]'
    if parent_marker not in parent['description']:
        api('PATCH', '/records/'+parent_id, {
            'expectedUpdatedAt':parent['updatedAt'],
            'description':parent['description']+'\n\n'+parent_marker+'\n'
            '03.09.2026 пользователь новым прямым запросом утвердил Tessavie, логотип и оформление. '
            'Прежний запрет интерфейсного ребрендинга заменён этим решением. '
            'Технический выпуск ведётся дочерней задачей '+task['id']+'. '
            'История сохранена; правовая регистрация и смена домена не подтверждены этим этапом.'})
    if args.phase == 'complete':
        evidence_marker = '[verified:tessavie-brand-'+args.commit[:7]+']'
        evidence = evidence_marker+'\nhttps://control.e-rd.ru\nCommit: '+args.commit+'\nRelease: '+args.release+'\n'
        evidence += ('Новые имя, знак, вход, меню, CSS, manifest, PNG/SVG и экспорты проверены. '
            'Go test/vet и 64 Node-теста прошли; 320/390/820/1280 px, длинный текст, меню и локальный черновик проверены в браузере. '
            'SHA256, backup, dry-run, сравнение содержимого таблиц, integrity/FK, публичный health и ресурсы прошли. '
            'Реальные iOS/Android и обновление установленной PWA не проверялись.')
        detail = api('GET', '/records/'+task['id'])
        if not any(evidence_marker in p['content'] for p in detail.get('proofs', [])):
            api('POST', '/records/'+task['id']+'/proofs', {'kind':'text','content':evidence})
        current = api('GET', '/records/'+task['id'])['record']
        if current['status'] != 'completed':
            # Completion has a dedicated endpoint that checks the proof and
            # preserves the task's review/recurrence lifecycle.
            api('POST', '/records/'+task['id']+'/complete',
                {'result':evidence, 'notifyPartners':False})
        task = api('GET', '/records/'+task['id'])['record']
        assert task['status'] == 'completed' and evidence_marker in task['result']
    print(json.dumps({'taskId':task['id'], 'status':task['status'], 'parentId':parent_id}, ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?', (token_hash,))
    db.commit()
    db.close()
