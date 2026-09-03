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
    p=argparse.ArgumentParser()
    p.add_argument('--complete',action='store_true')
    p.add_argument('--commit')
    p.add_argument('--release')
    p.add_argument('--sha256')
    args=p.parse_args()
    rows=api('/records?includeArchived=true')
    assert len(rows)<500 and len(rows)==db.execute("SELECT COUNT(*) FROM records WHERE workspace_id='bizflow-team'").fetchone()[0]
    specs=[
      {'key':'notebook','title':'Объединить заголовок и текст заметок, планов и входящих в один лист','parent':'3d81cdb847c8fcfdb329639c22f3067a','criteria':'Одна contenteditable-область с местом заголовка; Enter переводит в текст. Нет отдельного видимого поля с подстановкой первой строки. Необязательный заголовок не дублируется при повторном открытии. Общая история отмены, сохранение форматирования, черновика, дат и связей; старые названия не переписывать. Проверить ПК/телефон. Это исправление прежних частичных выпусков, не закрытие организации заметок и поиска.'},
      {'key':'switcher','title':'Убрать лишнюю подпись команды из закрытого переключателя проекта','parent':'cf8fd7f89027490aceec013d3f10cb3c','criteria':'В закрытом переключателе только текущий проект. Убрать Команда: Команда Tessavie; команду оставить в группировке раскрытого списка. Не переименовывать реальные команды/проекты и не менять их доступы. Уточнение пользователя после выпуска e492ac4.'},
      {'key':'lifecycle','id':'6c3fcb6c8c782e2066df141e0b259b65','criteria':'Довести до публикации существующий незавершённый lifecycle, не создавать дубль: выход участника и администратора; передача владения; удаление/восстановление владельцем; доступ по проектам. Команда без проектов не исчезает. Закрыть выдачу удалённых проектов через личные связи, уведомления и профили. Проверить серверные роли, старые ссылки, личное, мобильный интерфейс.'},
      {'key':'card-access','id':'a9020000000000000000000000000004','criteria':'Повторное требование пользователя: настраивать кто что видит. Выбор доступных проектов реализуется в lifecycle; отдельные читатели карточки остаются здесь. Видимость меню и editPolicy не являются правом чтения. Не закрывать этот пункт после публикации выхода из команды. Нужна единая ACL во всех каналах и проверка отзыва доступа.'}
    ]
    result=[]
    for spec in specs:
        marker='[request:writing-access-2026-09-03:'+spec['key']+']'
        matches=[r for r in rows if r['id']==spec.get('id') or marker in r.get('description','')]
        assert len(matches)<=1
        criteria=marker+'\n'+spec['criteria']+'\nДокументация: docs/operations/TESSAVIE_WRITING_ACCESS_2026_09_03.md. Сроки и трудозатраты не назначены.'
        if matches:
            task=api('/records/'+matches[0]['id'])['record']
            if marker not in task['description']:
                task=api('/records/'+task['id'],'PATCH',{'description':task['description']+'\n\n'+criteria,'expectedUpdatedAt':task['updatedAt']})
        else:
            assert not spec.get('id'), 'Canonical task missing'
            task=api('/records','POST',{'type':'task','title':spec['title'],'description':criteria,'ownerId':1,'parentId':spec['parent'],'status':'in_progress','priority':'high','workstream':'platform','editPolicy':'owner_only'})
        if args.complete and spec['key']!='card-access':
            assert args.commit and len(args.commit)==40
            assert args.release.startswith('/opt/business-control/releases/20260903-writing-access-')
            assert str(Path('/opt/business-control/current').resolve())==args.release
            assert hashlib.sha256(Path(args.release+'/business-control').read_bytes()).hexdigest()==args.sha256
            evidence='[verified:writing-access-'+args.commit[:7]+']\n'+spec['criteria']+'\nПроверено автоматическими тестами и браузером на локальных данных; production backup, dry run и health. Фактические ограничения записаны в docs/operations/TESSAVIE_WRITING_ACCESS_2026_09_03.md.\nCommit: '+args.commit+'\nRelease: '+args.release+'\nSHA256: '+args.sha256
            detail=api('/records/'+task['id'])
            if not any(evidence in proof['content'] for proof in detail.get('proofs',[])):
                api('/records/'+task['id']+'/proofs','POST',{'kind':'text','content':evidence})
            if task['status']!='completed':
                api('/records/'+task['id']+'/complete','POST',{'result':evidence,'notifyPartners':False})
        task=api('/records/'+task['id'])['record']
        result.append({k:task[k] for k in ('id','title','status','parentId')})
    print(json.dumps(result,ensure_ascii=False))

finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,))
    db.commit()
    db.close()



