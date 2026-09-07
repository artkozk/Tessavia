"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

commit = '40e9495ff62cb55bc79d9500dafb11d656f97c57'
release = '/opt/business-control/releases/20260907-usability-recovery-40e9495'
sha = '9924560cd781077e4630ae75f9c2eb0bf4a1a55c59500bfb7e1bfeebc56de9a9'
backup = '/var/lib/business-control/backups/pre-usability-recovery-20260907T203050Z'
assert str(Path('/opt/business-control/current').resolve()) == release
assert hashlib.sha256(Path(release+'/business-control').read_bytes()).hexdigest() == sha
assert Path(backup+'/business-control.db').is_file()
db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=20)
db.execute('PRAGMA foreign_keys=ON')
assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not db.execute('PRAGMA foreign_key_check').fetchall()
assert db.execute("SELECT count(*) FROM schema_migrations WHERE version='063_task_completion_review.sql'").fetchone()[0] == 1
assert db.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchone()[0] == 113
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

marker='[release:usability-recovery-20260907]'
evidence=(marker+' Выпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. '
 'SC-72: завершение задачи отделено от просмотра результата; выбранная done-колонка и дата сохраняются, принимающий уведомлён, администратор может вернуть в работу с причиной. Исправлены фильтр активных на доске и её обновление после возврата. Личная замена заголовков блоков, восстановление исходного текста, скрытие/возврат блоков и полей чтения; личные тексты не публикуются в наборах. Карта времени показывает весь горизонт, детализация раскрывается отдельно; вкладки компактны. Полный Go internal/app 70.189 s; финальный web 1.007 s, 233 Node и go vet прошли. Локальный браузер: завершение/возврат без reload, proof/history сохранены; заголовок/скрытие/save/reload/отмена/восстановление; карта 320/1280 px, 4175 недель и 960 месяцев. Dry run сравнил 113 таблиц: восстановлена одна legacy-задача review100 с последним submitted, остальные данные неизменны. Production HTTPS/assets/health/nginx/integrity/FK успешны. Контракты TASK_COMPLETION_REVIEW_2026_09_07.md и USABILITY_VISUAL_RECOVERY_2026_09_07.md. Большие направления конструктора/визуала/чата не закрываются; физические телефоны не проверялись.')
scoped=['52c498b3ad2f538cf123d4e93b451a80','431e76a3ee0d16d9561580dfd70fd80e','f1255834acdea742463798840208706b']
try:
 receipt={'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'verifiedTables':113,'recoveredLegacyTasks':1,'schema':'063_task_completion_review.sql','nodeTests':233,'assets':'20260907-usability-recovery-5','tasks':[]}
 for task_id in scoped+['6e4f34f50ea37062254b52d8d63292b6','f1a7f01c558ae9a84bc6e5cb90f2c73f']:
  detail=api('/records/'+task_id)
  if not any(marker in proof['content'] for proof in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
  if task_id in scoped and detail['record']['status']!='completed':
   assert detail['record']['ownerId']==user[0] and detail['record']['authorId']==user[0]
   api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
  refreshed=api('/records/'+task_id)
  assert any(marker in proof['content'] for proof in refreshed.get('proofs',[]))
  if task_id in scoped:assert refreshed['record']['status']=='completed'
  receipt['tasks'].append({'id':task_id,'status':refreshed['record']['status']})
 Path('/tmp/tessavie-usability-recovery-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps(receipt,ensure_ascii=False))
finally:
 db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
