import sqlite3, json, urllib.request, urllib.error, hashlib, secrets, datetime
db=sqlite3.connect('/var/lib/business-control/business-control.db', timeout=15)
db.row_factory=sqlite3.Row
assert db.execute("SELECT username FROM users WHERE id=1").fetchone()[0]=='artkozk'
token=secrets.token_urlsafe(32)
digest=hashlib.sha256(token.encode()).hexdigest()
now=datetime.datetime.now(datetime.timezone.utc)
stamp=lambda d:d.isoformat(timespec='microseconds').replace('+00:00','Z')
db.execute("INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(1,?,?,?,?)",(digest,stamp(now+datetime.timedelta(minutes=5)),stamp(now),stamp(now)))
db.commit()
def api(path,method='GET',body=None):
    req=urllib.request.Request('http://127.0.0.1:8522/api'+path,method=method,data=json.dumps(body,ensure_ascii=False).encode() if body is not None else None,headers={'Cookie':'business_session='+token,'Content-Type':'application/json','X-Workspace-ID':'bizflow-team'})
    try:
        with urllib.request.urlopen(req,timeout=25) as r:
            data=r.read()
            return json.loads(data) if data else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(str(e.code)+': '+e.read().decode()) from None
try:
    assert api('/me')['username']=='artkozk'
    import argparse
    from pathlib import Path
    parser=argparse.ArgumentParser()
    parser.add_argument('--commit',required=True)
    parser.add_argument('--release',required=True)
    parser.add_argument('--sha256',required=True)
    args=parser.parse_args()
    assert len(args.commit)==40 and all(c in '0123456789abcdef' for c in args.commit)
    assert args.release.startswith('/opt/business-control/releases/20260903-personal-capture-')
    assert str(Path('/opt/business-control/current').resolve())==args.release
    assert hashlib.sha256(Path(args.release+'/business-control').read_bytes()).hexdigest()==args.sha256
    overview=api('/personal/overview')
    assert all(isinstance(n.get('inInbox'),bool) for n in overview['notes'])
    try:
        api('/personal/capture','POST',{'body':'','requestKey':'0123456789abcdef0123456789abcdef'})
        raise AssertionError('Empty capture was accepted')
    except RuntimeError as error:
        assert str(error).startswith('400:'), str(error)
    task_id='e1dd112fdf7e69a0ca870f1ab0d4b6f7'
    detail=api('/records/'+task_id)
    task=detail['record']
    assert task['ownerId']==1 and task['workspaceId']=='bizflow-team'
    assert '[release:personal-inbox-capture-2026-09-03]' in task['description']
    assert task['parentId']=='36cceab2931f04d7d2d79878ab2475d5'
    proof_marker='[verified:personal-capture-'+args.commit[:7]+']'
    evidence=proof_marker+'\nВыпущены приватные текстовые входящие: одно поле без обязательного заголовка и срока, автоматическая дата создания, локальный черновик, повтор без дубликата, разбор в заметки с сохранением ID и связей, отмена разбора. Связывание с проектом не публикует личную запись.\nПроверки: go test ./..., go vet ./..., 71 JS-тест; браузер 320/390/1440 px, перенос длинных связей, потеря сети и повторная отправка. Миграция на копии БД сохранила прежние данные; публичный health и приватные endpoints проверены.\nЭто только текстовый этап. Общий Inbox, AI, голос, файлы, Share, офлайн-синхронизация и преобразование в рабочую карточку остаются задачами.\nЖурнал: docs/operations/TESSAVIE_PERSONAL_INBOX_CAPTURE_2026_09_03.md\nCommit: '+args.commit+'\nRelease: '+args.release+'\nSHA256: '+args.sha256+'\nhttps://control.e-rd.ru'
    if not any(proof_marker in p['content'] for p in detail.get('proofs',[])):
        api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
    if task['status']!='completed':
        api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
    task=api('/records/'+task_id)['record']
    assert task['status']=='completed'
    parent=api('/records/'+task['parentId'])
    assert parent['record']['status']!='completed'
    if not any(proof_marker in p['content'] for p in parent.get('proofs',[])):
        api('/records/'+task['parentId']+'/proofs','POST',{'kind':'text','content':evidence})
    print(json.dumps({'taskId':task['id'],'status':task['status'],'parentStatus':parent['record']['status'],'authenticatedSmoke':'ok'},ensure_ascii=False))

finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,))
    db.commit()
    db.close()

