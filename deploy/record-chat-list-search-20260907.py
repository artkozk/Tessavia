"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

commit = 'cd7097231115659fe7349f656d20a511e022ebd0'
release = '/opt/business-control/releases/20260907-chat-list-search-cd70972'
sha = 'c9ab1a50089c67aaf69fc932fde36a68d75af9b7b6362a50528b31d050807910'
backup = '/var/lib/business-control/backups/pre-chat-list-search-20260907T170433Z'
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

marker='[release:chat-list-search-20260907]'
evidence=(marker+'\nВыпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. '
 'SC-69: поиск нужного разговора внутри списка по названию, собеседнику и связанной карточке. Несколько слов, регистр и ё/е; порядок закреплений сохраняется. Нулевой результат объясняется, очистка возвращает список. Фильтр не переключает открытый разговор и не трогает черновик. Исправлено закрытие мобильной панели при серверной перерисовке: запрос, фокус и панель сохраняются, выбор результата закрывает её намеренно. Ручная проверка 320/1280: ДИЗАЙНА проекта → группа, COLLEAGUE → DM, пустой результат, очистка, reload, смена SC-24/студии. Независимое изменение личного pin через локальную API-сессию вызвало реальный refresh; фокус, запрос и черновик сохранились. Стандартная браузерная очистка не дублирует кнопку платформы 44×44. Сообщения не отправлялись. web Go 1.010 s и 229 Node прошли. Backend не менялся. Dry run сохранил все строки 112 таблиц; схема 061 без изменений. HTTPS/assets/health/служба/nginx/integrity/FK проверены. Контракт docs/architecture/CHAT_CONVERSATION_SEARCH_2026_09_07.md. Архив, mute, ручная отметка непрочитанным, медиа и доставка остаются открыты.')
try:
 receipt={'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'preservedTables':112,'schema':'061_chat_personal_pins.sql','tables':112,'nodeTests':229,'assets':'20260907-chat-list-search-2','tasks':[]}
 for task_id in ['e402d353a684b074f852fa1fd277d895','6e4f34f50ea37062254b52d8d63292b6','f1a7f01c558ae9a84bc6e5cb90f2c73f']:
  detail=api('/records/'+task_id)
  if not any(marker in proof['content'] for proof in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
  refreshed=api('/records/'+task_id)
  assert any(marker in proof['content'] for proof in refreshed.get('proofs',[]))
  receipt['tasks'].append({'id':task_id,'status':refreshed['record']['status']})
 Path('/tmp/tessavie-chat-list-search-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps(receipt,ensure_ascii=False))
finally:
 db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
