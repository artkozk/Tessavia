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
    parser.add_argument('--complete',action='store_true')
    parser.add_argument('--commit')
    parser.add_argument('--release')
    parser.add_argument('--sha256')
    args=parser.parse_args()
    marker='[release:project-first-switcher-2026-09-03]'
    title='Показывать текущий проект первым в переключателе, команду вторичной подписью'
    records=api('/records?includeArchived=true')
    assert len(records)<500 and len(records)==db.execute("SELECT COUNT(*) FROM records WHERE workspace_id='bizflow-team'").fetchone()[0]
    matches=[r for r in records if marker in r.get('description','') or r['title']==title]
    assert len(matches)<=1
    parent='cf8fd7f89027490aceec013d3f10cb3c'
    criteria=marker+'\nЗапрос пользователя: в боковой панели нужно видеть проект текущего бизнеса/стартапа, а не название общей команды.\nКритерии: крупно текущее имя проекта; команда вторичной строкой; роль в подсказке; группировка по командам и текущий проект в раскрытом меню; длинные названия и мобильная ширина без переполнения; изменение выбора обновляет подпись. Личное остаётся отдельной областью.\nГраницы: только навигационная подпись и доступность переключателя. Не переносить проекты/карточки и не менять права. Названия в БД не переписывать без отдельного согласования. Поиск, независимость личной навигации и lifecycle остаются родительскими/смежными задачами; их не закрывать.\nСроки и трудозатраты не назначены. Документация: docs/operations/TESSAVIE_PROJECT_SWITCHER_2026_09_03.md.'
    if matches:
        task=matches[0]
        assert task['ownerId']==1 and task['workspaceId']=='bizflow-team' and task['parentId']==parent and marker in task['description']
    else:
        task=api('/records','POST',{'type':'task','title':title,'description':criteria,'ownerId':1,'parentId':parent,'status':'in_progress','priority':'normal','workstream':'platform','editPolicy':'owner_only'})
    if args.complete:
        assert args.commit and len(args.commit)==40 and all(c in '0123456789abcdef' for c in args.commit)
        assert args.release and args.release.startswith('/opt/business-control/releases/20260903-project-switcher-')
        assert str(Path('/opt/business-control/current').resolve())==args.release
        assert hashlib.sha256(Path(args.release+'/business-control').read_bytes()).hexdigest()==args.sha256
        detail=api('/records/'+task['id'])
        proof_marker='[verified:project-switcher-'+args.commit[:7]+']'
        evidence=proof_marker+'\nВыпущен переключатель с названием текущего проекта первым и командой во второй строке; выбор отмечается aria-current, роль доступна в подсказке, длинные названия переносятся. Проекты остаются сгруппированы по командам. Права и данные не переносились.\nПроверки: unit-тесты, go test ./..., go vet ./..., браузер ПК и мобильной ширины. Запуск на копии базы сохранил все данные, публичные ресурсы и health проверены.\nДокумент: docs/operations/TESSAVIE_PROJECT_SWITCHER_2026_09_03.md\nCommit: '+args.commit+'\nRelease: '+args.release+'\nSHA256: '+args.sha256
        if not any(proof_marker in p['content'] for p in detail.get('proofs',[])):
            api('/records/'+task['id']+'/proofs','POST',{'kind':'text','content':evidence})
        if task['status']!='completed':
            api('/records/'+task['id']+'/complete','POST',{'result':evidence,'notifyPartners':False})
    task=api('/records/'+task['id'])['record']
    print(json.dumps({'id':task['id'],'title':task['title'],'status':task['status'],'parent':parent,'parentStatus':api('/records/'+parent)['record']['status']},ensure_ascii=False))

finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,))
    db.commit()
    db.close()
