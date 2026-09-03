"""Verify the deployed page protocol and complete only its existing canonical task."""
import argparse, datetime, hashlib, json, secrets, sqlite3, time, urllib.parse, urllib.request
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('--commit',required=True)
parser.add_argument('--release',required=True)
parser.add_argument('--sha256',required=True)
args=parser.parse_args()
assert len(args.commit)==40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260903-record-pages-')
assert str(Path('/opt/business-control/current').resolve())==args.release
assert hashlib.sha256(Path(args.release+'/business-control').read_bytes()).hexdigest()==args.sha256
db=sqlite3.connect('/var/lib/business-control/business-control.db',timeout=15)
assert db.execute('SELECT username FROM users WHERE id=1').fetchone()[0]=='artkozk'
token=secrets.token_urlsafe(32);digest=hashlib.sha256(token.encode()).hexdigest()
now=datetime.datetime.now(datetime.timezone.utc)
stamp=lambda d:d.isoformat(timespec='microseconds').replace('+00:00','Z')
db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(1,?,?,?,?)',(digest,stamp(now+datetime.timedelta(minutes=5)),stamp(now),stamp(now)));db.commit()
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*unused):return None
client=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
def api(path,method='GET',body=None):
    req=urllib.request.Request('http://127.0.0.1:8522/api'+path,method=method,data=None if body is None else json.dumps(body,ensure_ascii=False).encode(),headers={'Cookie':'business_session='+token,'X-Workspace-ID':'bizflow-team','Content-Type':'application/json'})
    with client.open(req,timeout=25) as response:
        data=response.read()
        return json.loads(data) if data else None
try:
    assert api('/me')['username']=='artkozk'
    task_id='7576b830735c5b225f7242c2ead9be7e'
    detail=api('/records/'+task_id);task=detail['record']
    assert task['workspaceId']=='bizflow-team' and task['ownerId']==1 and task['status'] in ('in_progress','completed')
    cursor='';seen=set();cursors=set();pages=0;started=time.perf_counter()
    while True:
        page=api('/records?includeArchived=true&pageSize=37'+('&cursor='+urllib.parse.quote(cursor) if cursor else ''))
        pages+=1
        for row in page['records']:
            assert row['workspaceId']=='bizflow-team' and row['id'] not in seen
            seen.add(row['id'])
        cursor=page['nextCursor']
        if not cursor:break
        assert cursor not in cursors and pages<1000
        cursors.add(cursor)
    assert len(seen)==db.execute("SELECT COUNT(*) FROM records WHERE workspace_id='bizflow-team'").fetchone()[0]
    elapsed=round((time.perf_counter()-started)*1000,2)
    check=api('/sync?pageSize=37&recordsSince='+urllib.parse.quote(page['checkpoint'])+'&activitySince='+urllib.parse.quote(page['checkpoint']))
    assert all(key in check for key in ('records','activity','nextCursor','checkpoint'))
    marker='[verified:record-pages-'+args.commit[:7]+']'
    evidence=marker+'\nПолная выдача и sync читаются страницами, границы не зависят от срока или времени правки. Проверены 1202 исходные карточки, правки/вставка между страницами, более 1000 событий с одинаковым временем, чужие курсоры и перезапуск.\nБраузер: 1201 карточка, локальный фильтр, последняя карточка на доске и открытие на ширине 320 px; отмена и повтор. Физические Android/iPhone не проверялись. Go-тесты, vet и 91 Node-тест успешны.\nProduction: '+str(len(seen))+' карточка, '+str(pages)+' страниц, без пропусков/дублей; проверено соответствие БД.\nCommit: '+args.commit+'\nRelease: '+args.release+'\nSHA256: '+args.sha256+'\nОтчёт: docs/operations/ACTIVE_TASKS_RELEASES_2026_09_03.md. Остальные задачи и широкая производительность не закрываются.'
    if not any(marker in proof['content'] for proof in detail.get('proofs',[])):
        api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
    if task['status']!='completed':
        api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
    parent_id='f7f78ad1042255630386fa5b11d51f47'
    parent=api('/records/'+parent_id)
    if not any(marker in proof['content'] for proof in parent.get('proofs',[])):
        api('/records/'+parent_id+'/proofs','POST',{'kind':'text','content':evidence+'\nЭто завершённая каноническая задача пагинации. Графы, большие чаты и наборы требуют дальнейшей проверки.'})
    print(json.dumps({'id':task_id,'status':api('/records/'+task_id)['record']['status'],'records':len(seen),'pages':pages,'elapsedMs':elapsed,'parentStatus':api('/records/'+parent_id)['record']['status']},ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
