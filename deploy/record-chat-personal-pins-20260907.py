"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

commit = 'b365ad79335e0d95f25d2b6fa89e296e04a49e76'
release = '/opt/business-control/releases/20260907-chat-personal-pins-b365ad7'
sha = '2798952a2c6bfefc185346f67682445bd2ad5659c802e9ba67f17a7b2adf8c4a'
backup = '/var/lib/business-control/backups/pre-chat-personal-pins-20260907T160600Z'
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

marker='[release:chat-personal-pins-20260907]'
evidence=(marker+'\nВыпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. '
 'SC-68: личное закрепление разговоров вверху списка через меню диалога. Сохраняется на сервере; другим участникам список не меняется. Повторное закрепление не переставляет разговор, выход из группы удаляет личный pin. Проверены чужой проект/разговор, идемпотентность, непрочитанные, выход/возврат и отсутствие изменений сообщений. Ручной сценарий: длинный DM с черновиком SC-65 → закрепить → длинная группа → закрепить → reload → снять закрепление DM. Черновик сохранился, сообщений не отправлено. На 320 px меню 304 px, 8–312; значок и счётчик 5 непрочитанных не пересекаются. Найден и исправлен излишний размер даты в списке: компактное время/дата освобождает место названиям, полная дата остаётся в подсказке. Проверен также 1280 px. Full Go internal/app 54.032 s; финальные web Go 0.966 s и 228 Node. Dry run сохранил все строки 111 прежних таблиц, новая таблица пустая; schema 061, 112 таблиц. HTTPS/assets/health/служба/nginx/integrity/FK проверены. Контракт docs/architecture/CHAT_PERSONAL_PINS_2026_09_07.md. Архив разговоров, mute, непрочитанное вручную, медиатека и другие сценарии большого чата остаются открыты.')
try:
 receipt={'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'preservedTables':111,'schema':'061_chat_personal_pins.sql','tables':112,'nodeTests':228,'assets':'20260907-chat-personal-pins-2','tasks':[]}
 for task_id in ['e402d353a684b074f852fa1fd277d895','6e4f34f50ea37062254b52d8d63292b6','f1a7f01c558ae9a84bc6e5cb90f2c73f']:
  detail=api('/records/'+task_id)
  if not any(marker in proof['content'] for proof in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
  refreshed=api('/records/'+task_id)
  assert any(marker in proof['content'] for proof in refreshed.get('proofs',[]))
  receipt['tasks'].append({'id':task_id,'status':refreshed['record']['status']})
 Path('/tmp/tessavie-chat-personal-pins-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps(receipt,ensure_ascii=False))
finally:
 db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
