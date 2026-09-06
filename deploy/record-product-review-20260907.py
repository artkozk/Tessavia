"""Append the reviewed execution order through the existing API, preserving task history."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

plan=json.loads(Path('/tmp/tessavie-product-execution.json').read_text())
db=sqlite3.connect('/var/lib/business-control/business-control.db',timeout=20)
db.execute('PRAGMA foreign_keys=ON')
user=db.execute("SELECT id FROM users WHERE username='artkozk'").fetchone()
assert user and db.execute("SELECT 1 FROM workspace_members WHERE user_id=? AND workspace_id='bizflow-team' AND status='active'",user).fetchone()
now=datetime.datetime.now(datetime.timezone.utc)
backup=Path('/var/lib/business-control/backups/product-review-'+now.strftime('%Y%m%dT%H%M%SZ'))
backup.mkdir(mode=0o700)
with sqlite3.connect(backup/'business-control.db') as target:db.backup(target)
token=secrets.token_urlsafe(32);digest=hashlib.sha256(token.encode()).hexdigest()
def stamp(dt):return dt.isoformat(timespec='microseconds').replace('+00:00','Z')
db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)',(user[0],digest,stamp(now+datetime.timedelta(minutes=5)),stamp(now),stamp(now)));db.commit()
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*unused):return None
client=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
def api(path,method='GET',body=None):
    request=urllib.request.Request('http://127.0.0.1:8522/api'+path,method=method,data=None if body is None else json.dumps(body,ensure_ascii=False).encode(),headers={'Cookie':'business_session='+token,'X-Workspace-ID':'bizflow-team','Content-Type':'application/json'})
    with client.open(request,timeout=20) as response:
        raw=response.read();return json.loads(raw) if raw else None
receipt={'backup':str(backup),'updated':[],'created':[],'sourceSnapshotSha256':plan['sourceSnapshotSha256']}
try:
    for item in plan['reviewedActiveItems']:
        if item['type']=='goal':continue
        task=api('/records/'+item['id'])['record']
        assert task['title']==item['title'],'Task identity changed'
        if task['status'] in ('completed','archived','cancelled'):continue
        marker='[execution-order:2026-09-07:'+item['tier']+']'
        if marker not in task.get('description',''):
            addition=marker+'\n'+item['reason']+'\nОчередь: '+item['tier']+'. Документ: docs/product/TESSAVIE_PRODUCT_EXECUTION_2026_09_07.md. Сроки и трудозатраты не назначены. Исторические критерии сохраняются.'
            payload={'description':task.get('description','')+'\n\n'+addition,'priority':item['priority'],'expectedUpdatedAt':task['updatedAt']}
            if item['id'] in ('e402d353a684b074f852fa1fd277d895','b6033b58f0b44021d680f7b8c6ef746e','45bbc1b549a12bb12b1c0ab92cf23a84','6e4f34f50ea37062254b52d8d63292b6') and task['status']=='planned':
                payload.update(status='in_progress',reason='Начат согласованный пользователем аудит и исправление повседневных сценариев')
            api('/records/'+item['id'],'PATCH',payload)
        final=api('/records/'+item['id'])['record']
        assert marker in final['description'] and final['priority']==item['priority']
        receipt['updated'].append({'id':item['id'],'title':final['title'],'status':final['status'],'tier':item['tier'],'priority':final['priority']})
    for item in plan['newTasks']:
        marker='[product-review:2026-09-07:'+item['key']+']'
        matches=db.execute("SELECT id FROM records WHERE workspace_id='bizflow-team' AND (title=? OR instr(description,?)>0) AND status<>'cancelled'",(item['title'],marker)).fetchall()
        assert len(matches)<=1,'Duplicate scoped task'
        if matches:task=api('/records/'+matches[0][0])['record']
        else:task=api('/records','POST',{'type':'task','title':item['title'],'description':marker+'\n'+item['description']+'\nОснование: повторный запрос пользователя и локальная проверка 06–07.09.2026. Документ: docs/architecture/PRODUCT_SCENARIO_ACCEPTANCE_2026_09_06.md.','ownerId':user[0],'parentId':item['parentId'],'priority':item['priority'],'status':'in_progress' if item['key'] in ('chat-core-release','daily-clarity-release') else 'planned','workstream':'platform','editPolicy':'owner_only'})
        final=api('/records/'+task['id'])['record'];assert marker in final['description']
        receipt['created'].append({'key':item['key'],'id':final['id'],'title':final['title'],'status':final['status']})
    assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    assert not db.execute('PRAGMA foreign_key_check').fetchall()
    Path('/tmp/tessavie-product-review-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2))
    print(json.dumps({'updated':len(receipt['updated']),'newStages':len(receipt['created']),'backup':str(backup),'verified':True}))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
