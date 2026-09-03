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
    parser.add_argument('spec')
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    spec=json.loads(Path(args.spec).read_text(encoding='utf-8-sig'))
    records=api('/records?includeArchived=true')
    assert len(records)<500, 'Truncated API list: stop before deduplication'
    expected=db.execute("SELECT COUNT(*) FROM records WHERE workspace_id='bizflow-team'").fetchone()[0]
    assert len(records)==expected, 'Incomplete API list'
    result=[]
    for item in spec['tasks']:
        marker='[request:adoption-2026-09-03:'+item['key']+']'
        matches=[r for r in records if r['id']==item.get('id') or marker in r.get('description','') or (item.get('matchMarker') and item['matchMarker'] in r.get('description','')) or (not item.get('id') and r['title'].strip().casefold()==item['title'].casefold())]
        assert len(matches)<=1, 'Conflicting task matches: '+item['key']
        task=matches[0] if matches else None
        assert task or not (item.get('id') or item.get('matchMarker')), 'Existing task missing: '+item['key']
        if task:
            assert task['workspaceId']=='bizflow-team' and task['ownerId']==1 and task['type']=='task'
            assert marker in task.get('description','') or task['status'] not in ['completed','archived'], 'Do not reopen or duplicate finished work: '+task['title']
        action='unchanged' if task and marker in task.get('description','') else 'update' if task else 'create'
        addition=marker+'\nУточнение пользователя после презентации.\nКритерии и границы: '+item['criteria']+'\nИсточник: docs/product/TESSAVIE_ADOPTION_TASKS_2026_09_03.json. Сроки и трудозатраты не назначены. Пересекающийся механизм реализуется в одной канонической задаче, а не отдельно для каждого сценария.'
        if args.apply and action=='update':
            task=api('/records/'+task['id'],'PATCH',{'description':task.get('description','')+'\n\n'+addition,'expectedUpdatedAt':task['updatedAt']})
        elif args.apply and action=='create':
            task=api('/records','POST',{'type':'task','title':item['title'],'description':addition,'ownerId':1,'parentId':item.get('parentId','3d81cdb847c8fcfdb329639c22f3067a'),'status':item.get('status','planned'),'priority':'high' if item['key']=='inbox-notebook' else 'normal','workstream':'platform','editPolicy':'owner_only'})
            records.append(task)
        result.append({'key':item['key'],'id':task['id'] if task else None,'title':task['title'] if task else item['title'],'action':action,'status':task['status'] if task else 'not-created',**({'description':task['description']} if not args.apply and task else {})})
    print(json.dumps(result,ensure_ascii=False))

finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,))
    db.commit()
    db.close()


