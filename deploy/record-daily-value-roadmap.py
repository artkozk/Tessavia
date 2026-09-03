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
    parser.add_argument('roadmap')
    args=parser.parse_args()
    roadmap=json.loads(Path(args.roadmap).read_text(encoding='utf-8-sig'))
    records=api('/records')
    result=[]
    inbox=None
    for item in roadmap['tasks']:
        marker='[request:daily-value-2026-09-03:'+item['key']+']'
        task=next((r for r in records if r['id']==item.get('id') or marker in r.get('description','')),None)
        addition=marker+'\nПриоритет сценария: '+item['priority']+'\nСостояние по аудиту: '+item['state']+'\nКритерии:\n'+'\n'.join(str(i+1)+'. '+c for i,c in enumerate(item['criteria']))+'\nИсточник: docs/product/TESSAVIE_DAILY_VALUE_ROADMAP_2026_09_03.json. Сроки и трудозатраты не назначены.'
        if task:
            assert task['workspaceId']=='bizflow-team' and task['type']=='task'
            if marker not in task.get('description',''):
                task=api('/records/'+task['id'],'PATCH',{'description':task.get('description','')+'\n\n'+addition,'expectedUpdatedAt':task['updatedAt']})
        else:
            task=api('/records','POST',{'type':'task','title':item['title'],'description':addition,'ownerId':1,'parentId':'3d81cdb847c8fcfdb329639c22f3067a','status':'planned','priority':'high' if item['priority']=='P0' else 'normal','workstream':'platform','editPolicy':'owner_only'})
            records.append(task)
        result.append({'key':item['key'],'id':task['id'],'status':task['status']})
        if item['key']=='inbox': inbox=task
    marker='[release:personal-inbox-capture-2026-09-03]'
    task=next((r for r in records if marker in r.get('description','')),None)
    if not task:
        task=api('/records','POST',{'type':'task','title':'Выпустить личные входящие и быстрый текстовый ввод','description':marker+'\nПервый этап Inbox: один ввод без обязательного заголовка, личная очередь неразобранного, сохранить заметкой или связать, существующие записи не теряют ID, дату и связи. По умолчанию только владельцу. Черновик и обработка ошибок, защита от повторной отправки, ПК/телефон, тесты, документация и выпуск.\nНе включает полный Today, AI, голос, файлы, Share, нативные виджеты и офлайн-синхронизацию. Родительский Inbox после этого не закрывается.','ownerId':1,'parentId':inbox['id'],'status':'in_progress','priority':'high','workstream':'platform','editPolicy':'owner_only'})
    result.append({'key':'capture-release','id':task['id'],'status':task['status']})
    print(json.dumps(result,ensure_ascii=False))

finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,))
    db.commit()
    db.close()

