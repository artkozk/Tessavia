"""Record the bounded profile release in existing Tessavie work; never print tokens."""
import argparse, datetime, hashlib, json, secrets, sqlite3, time, urllib.request
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('--complete',action='store_true')
parser.add_argument('--commit')
parser.add_argument('--release')
parser.add_argument('--sha256')
args=parser.parse_args()
db=sqlite3.connect('/var/lib/business-control/business-control.db',timeout=15)
assert db.execute('SELECT username FROM users WHERE id=1').fetchone()[0]=='artkozk'
token=secrets.token_urlsafe(32);digest=hashlib.sha256(token.encode()).hexdigest()
now=datetime.datetime.now(datetime.timezone.utc)
stamp=lambda v:v.isoformat(timespec='microseconds').replace('+00:00','Z')
db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(1,?,?,?,?)',(digest,stamp(now+datetime.timedelta(minutes=5)),stamp(now),stamp(now)));db.commit()
def api(path,method='GET',body=None):
    request=urllib.request.Request('http://127.0.0.1:8522/api'+path,method=method,data=None if body is None else json.dumps(body,ensure_ascii=False).encode(),headers={'Cookie':'business_session='+token,'Content-Type':'application/json','X-Workspace-ID':'bizflow-team'})
    with urllib.request.urlopen(request,timeout=25) as response:
        data=response.read()
        return json.loads(data) if data else None
try:
    parent_id='f7f78ad1042255630386fa5b11d51f47'
    parent=api('/records/'+parent_id)['record']
    assert parent['workspaceId']=='bizflow-team' and parent['ownerId']==1
    marker='[release:profile-loading-2026-09-03]'
    title='Открывать профиль без ожидания активности и лишних загрузок'
    description=marker+'\nЗапрос пользователя: длительный экран «Загружаем активность artkozk» при небольших данных.\nКритерии: основные поля и закрытие доступны до ответа; личные настройки отдельным коротким запросом без заметок; статистика и AI загружаются по раскрытию; сохранение не ждёт все проектные разделы; поздний ответ сохраняет ввод; незагруженные приватные поля не затираются; ошибка текущего пароля не выдаётся за потерю сессии; проверить узкий экран и права двух аккаунтов.\nГраницы: не закрывать большую задачу производительности и остальные дефекты аудита. Сетевые скачки не считать устранёнными без измерения. Миграций нет, палитра и компактный логотип сохранены.\nКонтракт: docs/architecture/PROFILE_LOADING_CONTRACT_2026_09_03.md. Отчёт: docs/operations/PROFILE_LOADING_RELEASE_2026_09_03.md. Сроки и трудозатраты не назначены.'
    records=api('/records?includeArchived=true')
    assert len(records)<500 and len(records)==db.execute("SELECT COUNT(*) FROM records WHERE workspace_id='bizflow-team'").fetchone()[0]
    matches=[r for r in records if marker in r.get('description','') or r['title']==title]
    assert len(matches)<=1
    if matches:
        task=matches[0]
        assert task['ownerId']==1 and task['parentId']==parent_id and marker in task['description']
    else:
        task=api('/records','POST',{'type':'task','title':title,'description':description,'ownerId':1,'parentId':parent_id,'status':'in_progress','priority':'high','workstream':'platform','editPolicy':'owner_only'})
    receipt={'id':task['id'],'title':title,'status':task['status'],'parentId':parent_id,'parentStatus':parent['status']}
    if args.complete:
        assert args.commit and len(args.commit)==40 and all(c in '0123456789abcdef' for c in args.commit)
        assert args.release and args.release.startswith('/opt/business-control/releases/20260903-profile-loading-')
        assert str(Path('/opt/business-control/current').resolve())==args.release
        assert hashlib.sha256(Path(args.release+'/business-control').read_bytes()).hexdigest()==args.sha256
        start=time.perf_counter();basic=api('/users/1/profile?view=basic');elapsed=round((time.perf_counter()-start)*1000,2)
        assert set(basic)=={'user','settings'} and basic['user']['id']==1
        full=api('/users/1/profile')
        assert 'recentActions' in full and 'activity' in full
        receipt.update(basicBytes=len(json.dumps(basic,ensure_ascii=False,separators=(',',':')).encode()),basicMs=elapsed)
        proof_marker='[verified:profile-loading-'+args.commit[:7]+']'
        evidence=proof_marker+'\nПрофиль открывается без ожидания истории. Отдельный компактный ответ, активность/AI по раскрытию, сохранение одним PATCH, поля и черновое редактирование сохраняются при поздних ответах. Ошибка текущего пароля оставляет действующую сессию.\nПроверки: go test ./..., go vet ./..., 85 Node-тестов; браузер с задержками 2/3 секунды, ширина 320, ввод/сохранение/закрытие; полный профиль и приватность проверены. Физические устройства не проверялись.\nCommit: '+args.commit+'\nRelease: '+args.release+'\nSHA256: '+args.sha256+'\nОтчёт: docs/operations/PROFILE_LOADING_RELEASE_2026_09_03.md. Общая производительность, сетевые скачки и остальные найденные дефекты не закрываются.'
        detail=api('/records/'+task['id'])
        if not any(proof_marker in p['content'] for p in detail.get('proofs',[])):
            api('/records/'+task['id']+'/proofs','POST',{'kind':'text','content':evidence})
        if task['status']!='completed':
            api('/records/'+task['id']+'/complete','POST',{'result':evidence,'notifyPartners':False})
        audit_id='3d81cdb847c8fcfdb329639c22f3067a';audit_marker='[audit:stability-2026-09-03:8ce51a5]'
        detail=api('/records/'+audit_id)
        if not any(audit_marker in p['content'] for p in detail.get('proofs',[])):
            api('/records/'+audit_id+'/proofs','POST',{'kind':'text','content':audit_marker+'\nАудит опубликованной версии e492ac4: на синтетических данных воспроизведены перезапись личной заметки старой вкладкой, поздние ответы/неудачная смена проекта, ложный экран входа при ошибке bootstrap, предел 500, замена автора оценки и общий сброс раскладок карты. Контроль приватности заметки пройден.\nОтчёт и диагностические сценарии: docs/product/TESSAVIE_STABILITY_AUDIT_2026_09_03.md; commit 8ce51a5. Аудит не является исправлением перечисленных дефектов. Отдельным выпуском профиля исправлено только лишнее ожидание формы и трактовка ошибки текущего пароля; родительские направления не закрыты.'})
        receipt['status']=api('/records/'+task['id'])['record']['status']
        receipt['parentStatus']=api('/records/'+parent_id)['record']['status']
        receipt['auditRecorded']=True
    print(json.dumps(receipt,ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
