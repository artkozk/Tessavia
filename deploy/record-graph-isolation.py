"""Verify every graph node belongs to its authorized workspace and record the repair."""
import argparse, datetime, hashlib, json, secrets, sqlite3, time, urllib.parse, urllib.request
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('--commit',required=True)
parser.add_argument('--release',required=True)
parser.add_argument('--sha256',required=True)
args=parser.parse_args()
assert len(args.commit)==40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260903-graph-isolation-')
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
def api(path,method='GET',body=None,workspace='bizflow-team'):
    req=urllib.request.Request('http://127.0.0.1:8522/api'+path,method=method,data=None if body is None else json.dumps(body,ensure_ascii=False).encode(),headers={'Cookie':'business_session='+token,'X-Workspace-ID':workspace,'Content-Type':'application/json'})
    with client.open(req,timeout=25) as response:
        data=response.read()
        return json.loads(data) if data else None
try:
    assert api('/me')['username']=='artkozk'
    assert db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='033_graph_layouts.sql'").fetchone()[0]==0, 'Unfinished layouts must not be in this repair release'
    workspaces=api('/workspaces')
    inspected=0
    for workspace in workspaces:
        for archive in ('false','true'):
            graph=api('/graph?includeArchived='+archive,workspace=workspace['id'])
            ids={node['id'] for node in graph['nodes']}
            record_ids={node['recordId'] for node in graph['nodes']}
            for record_id in record_ids:
                assert db.execute('SELECT workspace_id FROM records WHERE id=?',(record_id,)).fetchone()[0]==workspace['id'], 'Wrong workspace in graph'
            assert all(edge['source'] in ids and edge['target'] in ids for edge in graph['edges'])
            inspected+=len(graph['nodes'])
    marker='[verified:graph-isolation-'+args.commit[:7]+']'
    evidence=marker+'\nИсправлены четыре SQL-запроса дочерних узлов карты: вопросы, ответы, принятые итоги и варианты исследований ограничены проектом через родительскую карточку. Регрессионный тест двух проектов/двух аккаунтов воспроизводит утечку на прежнем коде и проходит на исправленном; проверены обычный режим, архив, свои узлы/связи и 403 чужого проекта.\nGo-тесты и vet прошли в чистом checkout. Миграций и изменений оформления нет. Production: '+str(len(workspaces))+' доступных областей, '+str(inspected)+' узлов в двух режимах проверены по БД; чужих родителей и висячих связей нет.\nCommit: '+args.commit+'\nRelease: '+args.release+'\nSHA256: '+args.sha256+'\nОтчёт: docs/operations/GRAPH_PROJECT_ISOLATION_2026_09_03.md. Серверное сохранение раскладок и полный аудит приватности остаются незавершёнными.'
    statuses={}
    for task_id in ('98781560e9a1ca14c22e187f00d67c5e','661f3fd2756a25945b39e4146bbfd716'):
        detail=api('/records/'+task_id)
        assert detail['record']['workspaceId']=='bizflow-team'
        if not any(marker in proof['content'] for proof in detail.get('proofs',[])):
            api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
        statuses[task_id]=api('/records/'+task_id)['record']['status']
    print(json.dumps({'workspaces':len(workspaces),'checkedNodes':inspected,'taskStatuses':statuses},ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
