"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

commit = '441de704305beac460d637830029034e55c38388'
release = '/opt/business-control/releases/20260907-calendar-work-441de70'
sha = 'abe0f33b50479b7d96178b10fbed1c2e1dee2f2d539a16a4e47f5c1c01f21fa2'
backup = '/var/lib/business-control/backups/pre-calendar-work-20260907T080502Z'
assert str(Path('/opt/business-control/current').resolve()) == release
assert hashlib.sha256(Path(release+'/business-control').read_bytes()).hexdigest() == sha
assert Path(backup+'/business-control.db').is_file()
db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=20)
db.execute('PRAGMA foreign_keys=ON')
assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not db.execute('PRAGMA foreign_key_check').fetchall()
user = db.execute("SELECT id FROM users WHERE username='artkozk'").fetchone()
assert user and db.execute("SELECT 1 FROM workspace_members WHERE workspace_id='bizflow-team' AND user_id=? AND status='active'", user).fetchone()
token = secrets.token_urlsafe(32)
digest = hashlib.sha256(token.encode()).hexdigest()
now = datetime.datetime.now(datetime.timezone.utc)
def stamp(value): return value.isoformat(timespec='microseconds').replace('+00:00', 'Z')
db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)', (user[0], digest, stamp(now+datetime.timedelta(minutes=5)), stamp(now), stamp(now)))
db.commit()
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *unused): return None
client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
def api(path, method='GET', body=None):
    request = urllib.request.Request('http://127.0.0.1:8522/api'+path, method=method, data=None if body is None else json.dumps(body, ensure_ascii=False).encode(), headers={'Cookie':'business_session='+token, 'X-Workspace-ID':'bizflow-team', 'Content-Type':'application/json'})
    with client.open(request, timeout=25) as response:
        raw = response.read()
        return json.loads(raw) if raw else None

marker = '[release:personal-work-calendar-20260907]'
evidence = (marker+'\nВыпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. '
    'SC-56: личный календарь и расписание показывают назначенную пользователю работу всех доступных проектов по флажку. '
    'Личный временной блок не меняет командный дедлайн. Скрытые рабочие интервалы участвуют в проверке. '
    'Проверены показ и скрытие, создание личного пересечения, просмотр обеих записей, подтверждение и отмена, перенос с новым согласием, перезагрузка и открытие оригинальной карточки. '
    '320/1280 px без горизонтального переполнения; 213 Node, весь go test ./... прошли. Миграция сохранила схемы и строки 104 прежних таблиц, добавлены две новые пустые таблицы и одна миграция. '
    'Служба, nginx, HTTPS/assets, integrity/FK проверены. Учитываются пользовательские процессы конструктора без сброса настроек страниц. '
    'Один временной блок на рабочую карточку; будущие не созданные экземпляры повторений остаются отдельной задачей. '
    'Контракт и ручные шаги: docs/architecture/PERSONAL_WORK_CALENDAR_2026_09_07.md.')
try:
    overview=api('/personal/calendar?from=2026-09-01&to=2026-10-01&timezone=Europe%2FMoscow')
    assert isinstance(overview['work'],list) and isinstance(overview['conflicts'],list)
    assert db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='057_personal_calendar_work.sql'").fetchone()[0]==1
    receipt={'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'preservedTables':104,'addedTables':2,'nodeTests':213,'goTests':'go test ./... passed','productionCalendarApi':'200 with expected shape; private content omitted','tasks':[]}
    for task_id in ['b87ad8e45df20a57217a4e02e4eb8423','40842b928756f5898e49a6ea09629584','a288364706d6c9f0ff683003aea39009','6e4f34f50ea37062254b52d8d63292b6']:
        detail=api('/records/'+task_id)
        if detail['record']['type']=='task':
            if not any(marker in p['content'] for p in detail.get('proofs',[])):
                api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
        elif marker not in detail['record']['description']:
            api('/records/'+task_id,'PATCH',{'description':detail['record']['description']+'\n\n'+evidence,'expectedUpdatedAt':detail['record']['updatedAt'],'reason':'Дополнение результата календарного этапа; история и статус цели сохранены'})
        if task_id=='b87ad8e45df20a57217a4e02e4eb8423' and detail['record']['status']!='completed':
            api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
        receipt['tasks'].append({'id':task_id,'status':api('/records/'+task_id)['record']['status']})
    Path('/tmp/tessavie-personal-calendar-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2))
    print(json.dumps(receipt,ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
