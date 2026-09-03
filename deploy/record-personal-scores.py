"""Verify independent scores and complete only their existing canonical task."""
import argparse, datetime, hashlib, json, secrets, sqlite3, time, urllib.parse, urllib.request
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('--commit',required=True)
parser.add_argument('--release',required=True)
parser.add_argument('--sha256',required=True)
args=parser.parse_args()
assert len(args.commit)==40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260903-personal-scores-')
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
    task_id='aa7c0389686c6955947685f0092396d5'
    detail=api('/records/'+task_id);task=detail['record']
    assert task['workspaceId']=='bizflow-team' and task['ownerId']==1 and task['status'] in ('in_progress','completed')
    assert db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='032_personal_criterion_scores.sql'").fetchone()[0]==1
    schema=db.execute("SELECT sql FROM sqlite_master WHERE name='criterion_scores'").fetchone()[0]
    assert 'UNIQUE(record_id, criterion_id, evaluated_by)' in schema
    assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    assert not db.execute('PRAGMA foreign_key_check').fetchall()
    pairs=db.execute("SELECT DISTINCT cs.record_id FROM criterion_scores cs JOIN records r ON r.id=cs.record_id WHERE r.workspace_id='bizflow-team'").fetchall()
    inspected=0
    for (record_id,) in pairs:
        relations=api('/records/'+record_id+'/relations')
        rows=relations['scores']
        expected=db.execute('SELECT COUNT(*) FROM criterion_scores WHERE record_id=?',(record_id,)).fetchone()[0]
        assert len(rows)==expected
        assert len({(row['criterionId'],row['evaluatedBy']) for row in rows})==len(rows)
        assert all('criterionWeight' in row for row in rows)
        assert isinstance(relations['scoreDecisions'],list)
        inspected+=len(rows)
    exported=api('/export')
    assert exported['schemaVersion']==16 and 'criterionDecisions' in exported['tables']
    assert len(exported['tables']['criterionScores'])==inspected
    marker='[verified:personal-scores-'+args.commit[:7]+']'
    evidence=marker+'\nНезависимые оценки каждого участника с обоснованием, веса и отдельный явно утверждаемый итог. Пустое поле отличается от 0. Голоса и снятие собственной оценки сохраняют историю; новые позиции помечают итог для пересмотра. Существующие оценки сохранены с авторами.\nПроверки: два аккаунта и конкурентные записи, 409 для устаревшей вкладки одного автора, права утверждения/изменения веса и изоляция проектов; миграция старой схемы сохраняет ID, автора, ноль, текст и даты. Go-тесты, vet и 95 Node-тестов успешны.\nБраузер: позиции 0 и 8 дают среднее 4; отдельный итог 6 не заменяет голоса. Вес 0 исключает критерий; проверен экран 320 px. Физические устройства не проверялись.\nProduction: '+str(inspected)+' существующих оценок сверено через API и БД; экспорт версии 16 содержит оценки и отдельные итоги.\nCommit: '+args.commit+'\nRelease: '+args.release+'\nSHA256: '+args.sha256+'\nКонтракт: docs/architecture/PERSONAL_CRITERION_SCORES_CONTRACT_2026_09_03.md. Отчёт: docs/operations/ACTIVE_TASKS_RELEASES_2026_09_03.md.'
    if not any(marker in proof['content'] for proof in detail.get('proofs',[])):
        api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
    if task['status']!='completed':
        api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
    print(json.dumps({'id':task_id,'status':api('/records/'+task_id)['record']['status'],'verifiedExistingScores':inspected,'exportVersion':exported['schemaVersion']},ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
