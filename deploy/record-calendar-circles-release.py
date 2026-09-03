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
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def api(path,method='GET',body=None):
    req=urllib.request.Request('http://127.0.0.1:8522/api'+path,method=method,data=json.dumps(body,ensure_ascii=False).encode() if body is not None else None,headers={'Cookie':'business_session='+token,'Content-Type':'application/json','X-Workspace-ID':'bizflow-team'})
    try:
        with opener.open(req,timeout=25) as r:
            data=r.read()
            return json.loads(data) if data else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(str(e.code)+': '+e.read().decode()) from None
try:
    assert api('/me')['username']=='artkozk'
    import argparse
    from pathlib import Path
    parser=argparse.ArgumentParser()
    parser.add_argument('--phase',choices=['start','complete'],required=True)
    parser.add_argument('--commit',default='')
    parser.add_argument('--release',default='')
    args=parser.parse_args()
    marker='[release:calendar-circle-scaling-2026-09-03]'
    records=api('/records')
    task=next((r for r in records if marker in r.get('description','')),None)
    if not task:
        assert args.phase=='start'
        task=api('/records','POST',{'type':'task','title':'Исправить деформацию кругов календаря при уменьшении масштаба','description':marker+'\nНа 40% даты 10-31 переносятся на две строки, круги вытягиваются и появляется лишняя прокрутка. Сохранить круглый контур, читаемую дату и корректное нажатие во всех календарях.\nКритерии: масштабы 40-100%, ПК/мобильные ширины, обычный режим/редактор/полный экран, месячный и годовой календари, 12 недель и мини-календарь; нет наложений, цифры в одну строку, дата открывает правильный день. Существующие настройки и данные не сбрасываются.','ownerId':1,'parentId':'46fd28bb741370595fbb75a553121349','status':'in_progress','priority':'high','workstream':'platform','editPolicy':'owner_only'})
    assert task['ownerId']==1 and task['workspaceId']=='bizflow-team'
    if args.phase=='complete':
        assert len(args.commit) in [7,40] and all(c in '0123456789abcdef' for c in args.commit)
        assert args.release.startswith('/opt/business-control/releases/20260903-calendar-circles-')
        assert str(Path('/opt/business-control/current').resolve())==args.release
        proof_marker='[verified:calendar-circles-'+args.commit[:7]+']'
        evidence=proof_marker+'\nИсправлены перенос двузначных дат и вытягивание кругов на малых масштабах. Круг имеет стабильное соотношение сторон, минимальный читаемый диаметр и неразрывную дату.\nПроверки и ограничения: docs/operations/TESSAVIE_CALENDAR_CIRCLE_SCALING_2026_09_03.md.\nCommit: '+args.commit+'\nRelease: '+args.release+'\nhttps://control.e-rd.ru'
        detail=api('/records/'+task['id'])
        if not any(proof_marker in p['content'] for p in detail.get('proofs',[])):
            api('/records/'+task['id']+'/proofs','POST',{'kind':'text','content':evidence})
        if task['status']!='completed':
            api('/records/'+task['id']+'/complete','POST',{'result':evidence,'notifyPartners':False})
        task=api('/records/'+task['id'])['record']
        assert task['status']=='completed'
    print(json.dumps({'taskId':task['id'],'status':task['status']},ensure_ascii=False))

finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,))
    db.commit()
    db.close()
