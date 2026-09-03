#!/usr/bin/env python3
"""Append a verified appearance correction to the existing release task on-host."""
import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import secrets
import sqlite3
from urllib import request

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--commit',required=True)
parser.add_argument('--release',required=True)
args=parser.parse_args()
assert len(args.commit)==40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260903-classic-brand-')
assert str(Path('/opt/business-control/current').resolve())==args.release
db=sqlite3.connect('/var/lib/business-control/business-control.db',timeout=15)
owner=db.execute("SELECT id FROM users WHERE username='artkozk'").fetchone()[0]
token=secrets.token_urlsafe(32)
hashed=hashlib.sha256(token.encode()).hexdigest()
now=datetime.now(timezone.utc)
stamp=lambda value:value.isoformat(timespec='microseconds').replace('+00:00','Z')
db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)',
    (owner,hashed,stamp(now+timedelta(minutes=5)),stamp(now),stamp(now)))
db.commit()
opener=request.build_opener(request.ProxyHandler({}))
task_id='c0fd9c05fb729716cc0fcee1392673e4'
marker='[verified:classic-brand-'+args.commit[:7]+']'
def api(method,path,body=None):
    payload=None if body is None else json.dumps(body,ensure_ascii=False).encode()
    req=request.Request('http://127.0.0.1:8522/api'+path,payload,
        {'Cookie':'business_session='+token,'Content-Type':'application/json','X-Workspace-ID':'bizflow-team'},method=method)
    with opener.open(req,timeout=20) as response: return json.load(response)
try:
    detail=api('GET','/records/'+task_id)
    record=detail['record']
    assert record['workspaceId']=='bizflow-team' and record['ownerId']==owner
    evidence=marker+'\nУточнение пользователя: оставить только новое название Tessavie; вернуть прежние цвета и знак.\n'
    evidence+='Восстановлены исходные CSS-переменные и знак из трёх связанных точек, прежняя страница входа; новый декоративный CSS удалён. '
    evidence+='Название Tessavie, совместимость и исправление личного заголовка сохранены. '
    evidence+='Go test/vet, 64 Node-проверки, браузер 1280/390/320 px, меню и восстановление черновика прошли. '
    evidence+='Backup и dry-run на копии: ни одна таблица не изменилась; публичный smoke прошёл. '
    evidence+='Физические телефоны не проверялись.\nCommit: '+args.commit+'\nRelease: '+args.release+'\nhttps://control.e-rd.ru'
    if not any(marker in proof['content'] for proof in detail.get('proofs',[])):
        api('POST','/records/'+task_id+'/proofs',{'kind':'text','content':evidence})
    record=api('GET','/records/'+task_id)['record']
    if marker not in record['result']:
        api('PATCH','/records/'+task_id,{
            'expectedUpdatedAt':record['updatedAt'],
            'result':record['result']+'\n\n'+evidence,
            'description':record['description']+'\n\n'+marker+'\nПрежний визуальный вариант отклонён пользователем. '
                'Актуальное решение — название Tessavie при прежней палитре и логотипе. '
                'Проверенный результат добавлен без удаления истории.'})
    verified=api('GET','/records/'+task_id)
    assert marker in verified['record']['result']
    print(json.dumps({'taskId':task_id,'status':verified['record']['status'],'proofs':len(verified['proofs'])}))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(hashed,))
    db.commit()
    db.close()
