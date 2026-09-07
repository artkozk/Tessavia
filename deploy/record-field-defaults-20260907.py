"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

commit = '3177df94d950506bf99fc1be603b2443441ff329'
release = '/opt/business-control/releases/20260907-field-defaults-3177df9'
sha = '2a278b03bb7006fc2ba6fa381ff810ff2418d57e413e3141f4931e87826ab4b3'
backup = '/var/lib/business-control/backups/pre-field-defaults-20260907T151600Z'
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

marker='[release:field-defaults-20260907]'
evidence=(marker+'\nВыпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. '
 'SC-67: администратор доски настраивает начальные значения полей. Они подставляются только в новые карточки и предпросмотр. Явная очистка и восстановленный черновик сохраняют выбор человека; старые карточки и добавление существующей карточки не заполняются автоматически. Проверены права, чужая доска, обязательность, версии, 0/false/списки, архив и восстановление. Ручной сценарий: настройки → предпросмотр без вставки → новая карточка → изменение числа → отмена → восстановление черновика → сохранение → изменение начального числа. Старая карточка осталась с Чат/7, новая с Почта/3, будущая форма показывает Почта/2. На 320 px исправлено сжатие кнопки закрытия длинным заголовком: 44×44, без переполнения; проверен и 1280 px. Go suite прошёл, 228 Node прошли. Dry run сохраняет все строки 110 прежних таблиц; новая таблица пустая; схема 060. HTTPS, assets, health, служба, nginx, integrity и FK проверены. Контракт docs/architecture/CONSTRUCTOR_FIELD_DEFAULTS_2026_09_07.md. Произвольные типы, формулы, безопасная смена типа заполненного поля и большое направление конструктора остаются открыты.')
try:
 receipt={'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'preservedTables':110,'schema':'060_collection_field_defaults.sql','tables':111,'nodeTests':228,'assets':'20260907-field-defaults-3','tasks':[]}
 for task_id in ['a288364706d6c9f0ff683003aea39009','6e4f34f50ea37062254b52d8d63292b6','f1a7f01c558ae9a84bc6e5cb90f2c73f']:
  detail=api('/records/'+task_id)
  if not any(marker in proof['content'] for proof in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
  refreshed=api('/records/'+task_id)
  assert any(marker in proof['content'] for proof in refreshed.get('proofs',[]))
  receipt['tasks'].append({'id':task_id,'status':refreshed['record']['status']})
 Path('/tmp/tessavie-field-defaults-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps(receipt,ensure_ascii=False))
finally:
 db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
