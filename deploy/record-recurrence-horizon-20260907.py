"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

commit = 'c7d76bdf4283b5467422ea0c3b906890571ac128'
release = '/opt/business-control/releases/20260907-recurrence-horizon-c7d76bd'
sha = '5a29a9e343e9ad5eca5243e8c887997a006f5d2695830fbf56e5b005efd47675'
backup = '/var/lib/business-control/backups/pre-recurrence-horizon-20260907T125001Z'
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

marker='[release:recurrence-horizon-20260907]'
evidence=(marker+'\nВыпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. '
 'SC-64: месяц и день показывают будущие повторения до завершения текущего. Просмотр не создаёт строки; явное открытие создаёт экземпляр атомарно, повтор запроса возвращает тот же ID. Перенос/пропуск/архив/завершение исключают прогноз исходной даты. Учтены пересечения со скрытой рабочей занятостью. Ручной путь: прогноз 14→открытие→перенос16 с разовым текстом→перезагрузка→21 исходный шаблон. 320/1280 px, кнопка44, desktop680. Исправлен личный старт вместо командного обзора. 226 Node, полный Go 51.399s; 110 таблиц без изменений; HTTPS/health/assets/nginx/integrity/FK проверены. Контракт docs/architecture/PERSONAL_RECURRENCE_HORIZON_2026_09_07.md. Сводка Сегодня и мини-виджеты пока используют реальные экземпляры: это остаётся в общей календарной цели, как и дальнейшее развитие конструктора/чата.')
try:
 receipt={'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'preservedTables':110,'schema':'059_personal_recurrence_templates.sql','nodeTests':226,'goTests':'go test ./... passed; internal/app 51.399s','tasks':[]}
 for task_id in ['0311dbcf668203acd4ffb32461307d9b','6e4f34f50ea37062254b52d8d63292b6','f1a7f01c558ae9a84bc6e5cb90f2c73f']:
  detail=api('/records/'+task_id)
  if not any(marker in proof['content'] for proof in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
  if task_id=='0311dbcf668203acd4ffb32461307d9b' and detail['record']['status']!='completed':api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
  receipt['tasks'].append({'id':task_id,'status':api('/records/'+task_id)['record']['status']})
 path='/records/40842b928756f5898e49a6ea09629584';record=api(path)['record']
 if marker not in record['description']:api(path,'PATCH',{'description':record['description']+'\n\n'+evidence,'expectedUpdatedAt':record['updatedAt']})
 Path('/tmp/tessavie-recurrence-horizon-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2))
 print(json.dumps(receipt,ensure_ascii=False))
 record=api('/records/a288364706d6c9f0ff683003aea39009')['record']
 print(json.dumps({'nextTask':record['title'],'status':record['status'],'description':record['description']},ensure_ascii=False))
finally:
 db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
