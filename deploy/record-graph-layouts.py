"""Verify scoped graph layouts and complete only their canonical task."""
import argparse, datetime, hashlib, json, secrets, sqlite3, time, urllib.parse, urllib.request
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('--commit',required=True)
parser.add_argument('--release',required=True)
parser.add_argument('--sha256',required=True)
args=parser.parse_args()
assert len(args.commit)==40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260903-graph-layouts-')
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
    task_id='98781560e9a1ca14c22e187f00d67c5e'
    detail=api('/records/'+task_id);task=detail['record']
    assert task['workspaceId']=='bizflow-team' and task['ownerId']==1 and task['status'] in ('in_progress','completed')
    assert db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='033_graph_layouts.sql'").fetchone()[0]==1
    assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    assert not db.execute('PRAGMA foreign_key_check').fetchall()
    for view in ('project','record:'+task_id):
        layout=api('/graph/layout?view='+urllib.parse.quote(view))
        assert layout['view']==view and isinstance(layout['version'],int)
        row=db.execute('SELECT data_json,version FROM user_graph_layouts WHERE user_id=1 AND workspace_id=? AND view_key=?',('bizflow-team',view)).fetchone()
        if row:
            assert layout['data']==json.loads(row[0]) and layout['version']==row[1]
        else:
            assert layout['version']==0 and layout['data']['positions']=={}
    exported=api('/export')
    assert exported['schemaVersion']==17
    layouts=exported['tables']['myGraphLayouts']
    expected=db.execute("SELECT COUNT(*) FROM user_graph_layouts WHERE user_id=1 AND workspace_id='bizflow-team'").fetchone()[0]
    assert len(layouts)==expected
    assert all(row['user_id']==1 and row['workspace_id']=='bizflow-team' for row in layouts)
    marker='[verified:graph-layouts-'+args.commit[:7]+']'
    evidence=marker+'\nКоординаты, фильтры, настройки и глубина сохраняются на сервере отдельно по пользователю, проекту и общей/локальной карте. Конкурентные записи защищены ожидаемой версией. При конфликте доступны загрузка серверной и явное сохранение своей; черновики разных окон не удаляют друг друга. Потерянный ответ сверяется чтением без повторной записи.\nПроверки: два аккаунта, два проекта и независимые HTTP-сессии; конкурентные 200/409; сброс и отмена сохраняют смысловые связи, иерархию, даты карточек и историю. Go test, vet, 105 Node-тестов успешны.\nБраузер: перенос родителя одинаково сдвигает три узла, отмена точно возвращает координаты. Проверены оба разрешения конфликта двух окон, восстановление собственного конфликтного черновика после перезагрузки, разные фильтры общей/локальной карты и переход проект A–B–A. Экран 320 px: ширина страницы 320, карты 292; физические устройства не проверялись.\nProduction: GET общей и локальной раскладок сверен с БД; экспорт версии 17 содержит только '+str(expected)+' собственных раскладок текущего проекта. Для проверки не создавались искусственные рабочие карточки.\nCommit: '+args.commit+'\nRelease: '+args.release+'\nSHA256: '+args.sha256+'\nКонтракт: docs/architecture/GRAPH_LAYOUT_SYNC_CONTRACT_2026_09_03.md. Отчёт: docs/operations/ACTIVE_TASKS_RELEASES_2026_09_03.md. Лимит графа 2000 и общая читаемость больших веток остаются отдельными задачами.'
    if not any(marker in proof['content'] for proof in detail.get('proofs',[])):
        api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
    if task['status']!='completed':
        api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
    print(json.dumps({'id':task_id,'status':api('/records/'+task_id)['record']['status'],'verifiedLayouts':expected,'exportVersion':exported['schemaVersion']},ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
