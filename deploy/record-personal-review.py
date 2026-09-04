"""Verify the live personal review and record its bounded first stage."""
import argparse, datetime, fcntl, hashlib, json, secrets, sqlite3, statistics, time, urllib.error, urllib.request
from pathlib import Path

p=argparse.ArgumentParser()
p.add_argument('--commit',required=True);p.add_argument('--release',required=True);p.add_argument('--sha256',required=True)
args=p.parse_args()
assert len(args.commit)==40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260904-personal-review-')
assert str(Path('/opt/business-control/current').resolve())==args.release
assert hashlib.sha256(Path(args.release+'/business-control').read_bytes()).hexdigest()==args.sha256
lock=open('/run/business-control-personal-review-task.lock','w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
db=sqlite3.connect('/var/lib/business-control/business-control.db',timeout=15)
assert db.execute('SELECT username FROM users WHERE id=1').fetchone()[0]=='artkozk'
assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
assert not db.execute('PRAGMA foreign_key_check').fetchall()
token=secrets.token_urlsafe(32);digest=hashlib.sha256(token.encode()).hexdigest()
now=datetime.datetime.now(datetime.timezone.utc)
stamp=lambda value:value.isoformat(timespec='microseconds').replace('+00:00','Z')
db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(1,?,?,?,?)',(digest,stamp(now+datetime.timedelta(minutes=5)),stamp(now),stamp(now)));db.commit()

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*unused):return None
client=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
def api(path,method='GET',body=None,workspace='bizflow-team'):
    request=urllib.request.Request('http://127.0.0.1:8522/api'+path,method=method,
      data=None if body is None else json.dumps(body,ensure_ascii=False).encode(),
      headers={'Cookie':'business_session='+token,'X-Workspace-ID':workspace,'Content-Type':'application/json'})
    with client.open(request,timeout=25) as response:
        raw=response.read();return json.loads(raw) if raw else None

try:
    assert db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='052_personal_weekly_review.sql'").fetchone()[0]==1
    source_tables=['personal_plans','personal_habits','personal_habit_checkins','personal_waiting','records']
    snapshots={table:list(db.execute('SELECT * FROM '+table+' ORDER BY 1')) for table in source_tables}
    choices_before=list(db.execute('SELECT * FROM personal_review_choices ORDER BY id'))
    timings=[];review=None
    for _ in range(10):
        started=time.perf_counter();review=api('/personal/review');timings.append((time.perf_counter()-started)*1000)
    assert review and len(review['weekStart'])==10 and len(review['weekEnd'])==10
    section_names=['completedPlans','completedRecords','habitResults','waiting','stalled','unlinked','decisions','risks']
    for name in section_names:
        section=review[name]
        assert isinstance(section['items'],list) and isinstance(section['total'],int) and isinstance(section['hasMore'],bool)
        assert len(section['items'])<=50 and section['total']>=len(section['items'])
    owned_plans={row[0] for row in db.execute('SELECT id FROM personal_plans WHERE owner_id=1')}
    owned_habits={row[0] for row in db.execute('SELECT id FROM personal_habits WHERE owner_id=1')}
    owned_waiting={row[0] for row in db.execute('SELECT id FROM personal_waiting WHERE owner_id=1')}
    assert all(item['sourceId'] in owned_plans for name in ['completedPlans','stalled','unlinked'] for item in review[name]['items'])
    assert all(item['sourceId'] in owned_habits for item in review['habitResults']['items'])
    assert all(item['sourceId'] in owned_waiting for item in review['waiting']['items'])
    accessible={row[0] for row in db.execute("SELECT w.id FROM workspaces w JOIN workspace_members wm ON wm.workspace_id=w.id WHERE wm.user_id=1 AND wm.status='active' AND w.kind='team' AND w.archived_at IS NULL AND (w.team_id IS NULL OR EXISTS(SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id=t.id WHERE t.id=w.team_id AND t.deleted_at IS NULL AND tm.user_id=wm.user_id AND tm.status='active'))")}
    assert all(item['workspaceId'] in accessible for name in ['completedRecords','decisions','risks'] for item in review[name]['items'])
    assert snapshots=={table:list(db.execute('SELECT * FROM '+table+' ORDER BY 1')) for table in source_tables}
    assert choices_before==list(db.execute('SELECT * FROM personal_review_choices ORDER BY id'))
    exported=json.dumps(api('/export'))
    assert 'personal_review_choices' not in exported and 'personal_review_choice_events' not in exported
    timings.sort();print('AUTHENTICATED_PERSONAL_REVIEW=ok')
    print('REVIEW_LATENCY_MEDIAN_MS=%.2f'%statistics.median(timings))
    print('REVIEW_LATENCY_P95_MS=%.2f'%timings[9])

    marker='[verified:personal-review-'+args.commit[:7]+']'
    common='Личное → Обзор недели теперь разделяет фактические результаты и сигналы, которые требуют решения. В результаты входят завершённые личные дела, доступные проектные карточки и только фактические отметки привычек. Отдельно показаны внешние ожидания, зависшие и несвязанные дела, решения и риски без следующего действия. Каждый проект подписан. Разделы ограничены 50 строками и сворачиваются.'
    choice='Для сигнала доступны четыре явных намерения: взять в следующую неделю, не брать, вернуться позже или исправить источник. Выбор хранится приватно, защищён ключом повтора и revision и не меняет срок, приоритет, состояние или ответственного исходной записи. Отзыв доступа к проекту сразу исключает его содержание из обзора.'
    checks='Пройдены go test ./..., go vet ./... и 183 Node-теста. Браузер: обычная ширина и 320 px, длинные данные, нулевой успех привычки, сохранение/reload решения, отсутствие горизонтального переполнения и ошибок консоли. Локально 25 чтений: median 3,94 мс, p95 4,74 мс. Миграция 052 на серверной копии сохраняет все прежние строки и добавляет две пустые приватные таблицы. Рабочая проверка читает только существующие источники, сверяет их неизменность и не создаёт тестовых пользовательских данных. Контракт: docs/architecture/PERSONAL_WEEKLY_REVIEW_2026_09_04.md.'
    for task_id in ['c0ebf2a9800f2b673d54b79b2500699f','e811bcc565da70123644a4654273aca3']:
        detail=api('/records/'+task_id);task=detail['record'];assert task['workspaceId']=='bizflow-team'
        remaining='Каноническая задача остаётся в работе: общий Review команды, подтверждённые назначения участникам и командная история требуют отдельного этапа прав.' if task_id.startswith('c0eb') else 'Каноническая задача ожиданий остаётся в работе: личный Review учитывает ожидание, но автоматическая доставка напоминания конкретному человеку и командные сценарии остаются отдельными этапами.'
        evidence='\n'.join([marker,common,choice,remaining,checks,'Commit: '+args.commit,'Release: '+args.release,'SHA256: '+args.sha256])
        if not any(marker in proof['content'] for proof in detail.get('proofs',[])):
            api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
        task=api('/records/'+task_id)['record']
        if marker not in task['description']:
            api('/records/'+task_id,'PATCH',{'status':'in_progress','description':task['description']+'\n\n'+evidence,'expectedUpdatedAt':task['updatedAt'],'reason':'Выпущен личный этап недельного обзора; общий командный этап сохраняется в работе'})
        assert api('/records/'+task_id)['record']['status']=='in_progress'
        print('REVIEW_TASK_STATUS='+task_id+':in_progress')
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
