"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

commit = 'dbf77d77e684e17889336b3a7542363ea9002bab'
release = '/opt/business-control/releases/20260907-today-capacity-dbf77d7'
sha = 'dbe165e2c33bae1c670c42391bedfaf749f1595c41d0a7bea1b1cc0cfb6600fc'
backup = '/var/lib/business-control/backups/pre-today-capacity-20260907T142258Z'
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

marker='[release:today-capacity-20260907]'
evidence=(marker+'\nВыпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. '
 'SC-66: Сегодня показывает прогнозы текущего дня и семи следующих, без вставок при просмотре. Явное открытие создаёт экземпляр, который заменяет прогноз без дубля. Свободное время объединяет личные события, повторения и личные интервалы назначенной работы доступных проектов, даже при скрытом показе. Без границ время неизвестно; ошибки чтения не означают пустой день. Проверены приватность, перенос, отзыв доступа, остановка, ночь и объединение пересечений. Ручной путь: Сегодня → границы09–20 → предпросмотр → Позже → открыть14 → перезагрузка → рабочие интервалы → личный день со скрытой работой. Исправлено сжатие закрытия длинным заголовком личной карточки:44×44,320px без переполнения; desktop-предпросмотр680px. Вторая вкладка подхватывает новый экземпляр при следующем минутном обновлении и открывает его без reload. Полный Go52.748s; 228 Node и web Go после финальных UI-правок. Dry run110 таблиц без изменений, HTTPS/health/assets/служба/nginx/integrity/FK проверены. Контракт docs/architecture/PERSONAL_TODAY_CAPACITY_2026_09_07.md. Мини-виджеты, карты времени целей/проектов и большой конструктор/чат остаются открыты.')
try:
 receipt={'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'preservedTables':110,'schema':'059_personal_recurrence_templates.sql','goTests':'go test ./... passed; internal/app52.748s; web suite repeated after final UI edits','nodeTests':228,'assets':'20260907-today-capacity-4','tasks':[]}
 for task_id in ['40842b928756f5898e49a6ea09629584','6e4f34f50ea37062254b52d8d63292b6','f1a7f01c558ae9a84bc6e5cb90f2c73f']:
  detail=api('/records/'+task_id);r=detail['record']
  if task_id=='40842b928756f5898e49a6ea09629584':
   if marker not in r['description']:api('/records/'+task_id,'PATCH',{'description':r['description']+'\n\n'+evidence,'expectedUpdatedAt':r['updatedAt']})
  elif not any(marker in proof['content'] for proof in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
  receipt['tasks'].append({'id':task_id,'status':api('/records/'+task_id)['record']['status']})
 Path('/tmp/tessavie-today-capacity-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps(receipt,ensure_ascii=False))
finally:
 db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
