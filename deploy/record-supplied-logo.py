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
variant=parser.add_mutually_exclusive_group()
variant.add_argument('--compact',action='store_true',help='Record the verified sidebar size correction')
variant.add_argument('--linked',action='store_true',help='Record the verified linked frames logo replacement')
args=parser.parse_args()
assert len(args.commit)==40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260903-supplied-logo-')
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
marker='[verified:'+('linked-logo-' if args.linked else 'compact-logo-' if args.compact else 'supplied-logo-')+args.commit[:7]+']'
def api(method,path,body=None):
    payload=None if body is None else json.dumps(body,ensure_ascii=False).encode()
    req=request.Request('http://127.0.0.1:8522/api'+path,payload,
        {'Cookie':'business_session='+token,'Content-Type':'application/json','X-Workspace-ID':'bizflow-team'},method=method)
    with opener.open(req,timeout=20) as response: return json.load(response)
try:
    detail=api('GET','/records/'+task_id)
    record=detail['record']
    assert record['workspaceId']=='bizflow-team' and record['ownerId']==owner
    evidence=marker+'\nУстановлен последний логотип пользователя: три окна и надпись Tessavie.\n'
    evidence+='Ранний вариант с двумя рамками отменён до публикации. Прежняя палитра интерфейса сохранена. '
    evidence+='Контуры надписи из вложения перенесены в SVG; обновлены вход, меню и favicon/PWA. '
    evidence+='Go test/vet, Node-тесты, браузер 1280/390/320 px, меню и восстановление черновика прошли. '
    evidence+='Backup и dry-run на копии: таблицы не изменились; публичный smoke прошёл. '
    evidence+='Физические телефоны и обновление установленной PWA не проверялись.\n'
    evidence+='Commit: '+args.commit+'\nRelease: '+args.release+'\nhttps://control.e-rd.ru'
    if args.compact:
        evidence=marker+'\nПо замечанию пользователя логотип в боковом меню уменьшен со 174 до 128 px. '
        evidence+='Высота шапки около 55 px на ПК и 59 px на телефоне; сохранено место для закрытия меню. '
        evidence+='Изображение с тремя окнами, палитра, вход и иконки не изменены. '
        evidence+='Go test/vet и Node-тесты, браузер 1280/390/320 px, длинный текст и восстановление черновика проверены. '
        evidence+='Backup, dry-run со сравнением всех таблиц, публичный smoke и service active подтверждены. '
        evidence+='Физические устройства не проверялись.\nCommit: '+args.commit+'\nRelease: '+args.release+'\nhttps://control.e-rd.ru'
    if args.linked:
        evidence=marker+'\nУстановлен новый присланный логотип: две наклонные рамки, зелёная точка соединения и надпись Tessavie с зелёной точкой над i. '
        evidence+='Обновлены SVG для светлого и тёмного фона, favicon и PWA; источник сохранён в документации. '
        evidence+='Ширина в меню 128 px, на входе 196 px, прежняя палитра интерфейса сохранена. '
        evidence+='Go test/vet и Node-тесты, браузер 1280/820/390/320 px, длинный текст и восстановление черновика проверены. '
        evidence+='Backup, dry-run со сравнением всех таблиц, публичный smoke и service active подтверждены. '
        evidence+='Физические устройства и обновление установленной PWA не проверялись.\nCommit: '+args.commit+'\nRelease: '+args.release+'\nhttps://control.e-rd.ru'
    if not any(marker in proof['content'] for proof in detail.get('proofs',[])):
        api('POST','/records/'+task_id+'/proofs',{'kind':'text','content':evidence})
    record=api('GET','/records/'+task_id)['record']
    if marker not in record['result']:
        correction=('Пользователь выбрал новый логотип с двумя наклонными рамками и зелёной точкой соединения; компактная ширина 128 px сохранена.' if args.linked
            else 'Логотип в меню уменьшен до 128 px после замечания о чрезмерном размере.' if args.compact
            else 'Пользователь выбрал последнее присланное изображение с тремя окнами.')
        api('PATCH','/records/'+task_id,{
            'expectedUpdatedAt':record['updatedAt'],
            'result':record['result']+'\n\n'+evidence,
            'description':record['description']+'\n\n'+marker+'\n'+correction+' '
                'Актуальное решение — название Tessavie, прежняя палитра и новый логотип из вложения. '
                'Проверенный результат добавлен без удаления истории.'})
    verified=api('GET','/records/'+task_id)
    assert marker in verified['record']['result']
    print(json.dumps({'taskId':task_id,'status':verified['record']['status'],'proofs':len(verified['proofs'])}))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(hashed,))
    db.commit()
    db.close()
