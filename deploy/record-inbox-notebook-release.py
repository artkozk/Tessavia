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
    assert args.release.startswith('/opt/business-control/releases/20260903-inbox-notebook-')
    assert str(Path('/opt/business-control/current').resolve())==args.release
    assert hashlib.sha256(Path(args.release+'/business-control').read_bytes()).hexdigest()==args.sha256
    try:
        api('/records','POST',{'type':'inbox','description':''})
        raise AssertionError('Empty inbox was accepted')
    except RuntimeError as error:
        assert str(error).startswith('400:'), str(error)
    task_id='3dd58f8cffea6504454b4f7f99bb9bc8'
    detail=api('/records/'+task_id)
    task=detail['record']
    assert task['ownerId']==1 and task['workspaceId']=='bizflow-team'
    assert '[request:adoption-2026-09-03:inbox-notebook]' in task['description']
    assert task['parentId']=='36cceab2931f04d7d2d79878ab2475d5'
    proof_marker='[verified:inbox-notebook-'+args.commit[:7]+']'
    evidence=proof_marker+'\nВыпущен единый лист проектного входящего при создании и редактировании, как у заметок. Необязательное название берётся из первой непустой строки; Enter переводит в текст, IME не перехватывается. Форматирование, старые черновики title/description, права, история и связи сохранены.\nПроверки: go test ./..., go vet ./..., 73 JS-теста; браузер 320/390/1440 px, длинный заголовок, Enter, жирный текст, закрытие и восстановление черновика, создание без названия и редактирование. Строгое сравнение данных при запуске на копии БД, публичный health и авторизация endpoints.\nЭто только этап формы входящего. Остальные приоритеты, общий Inbox, пагинация, независимые оценки, восстановление доступа и общая офлайн-синхронизация не объявляются готовыми.\nЖурнал: docs/operations/TESSAVIE_INBOX_NOTEBOOK_2026_09_03.md\nCommit: '+args.commit+'\nRelease: '+args.release+'\nSHA256: '+args.sha256+'\nhttps://control.e-rd.ru'
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
