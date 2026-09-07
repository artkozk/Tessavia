"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

commit = '2cd7fcec5039cfcd6de21099c81be1e25ae0da30'
release = '/opt/business-control/releases/20260907-chat-archive-2cd7fce'
sha = '7358a1875e484f1ff64757a3b7f744da94d86d3ddff071cd0da89a933ed26e5b'
backup = '/var/lib/business-control/backups/pre-chat-archive-20260907T191349Z'
assert str(Path('/opt/business-control/current').resolve()) == release
assert hashlib.sha256(Path(release+'/business-control').read_bytes()).hexdigest() == sha
assert Path(backup+'/business-control.db').is_file()
db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=20)
db.execute('PRAGMA foreign_keys=ON')
assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not db.execute('PRAGMA foreign_key_check').fetchall()
assert db.execute("SELECT count(*) FROM schema_migrations WHERE version='062_chat_personal_archives.sql'").fetchone()[0] == 1
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

marker='[release:chat-archive-20260907]'
evidence=(marker+'\nВыпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. '
 'SC-71: личный архив разговоров. Убрать в архив/Вернуть из архива в меню; папка с поиском и счётчиком новых сообщений. Архив хранится на сервере отдельно для каждого участника, сохраняет историю, файлы, закрепление и непрочитанное. Новые сообщения остаются в папке; архив не отключает уведомления. Открытый разговор и черновик остаются доступны. Выход из группы удаляет личную настройку, повторное вступление её не воскрешает. API-тест проверил изоляцию, права и чужой проект, неверные boolean, повторы, новые сообщения, историю, unread, pin и leave/rejoin. Локальный UI: длинная группа, архив/возврат, поиск макеты, пустой архив, новое сообщение синтетического коллеги с Архив 1 · новых 1, reload, черновики SC-70/SC-65, 320 и 1280 px. Рабочим людям ничего не отправлялось. Найденное в первой локальной реализации пересечение обработчика с удалением сообщения исправлено до публикации, подтверждения отменены, сообщений не удалено. Финальные архив/возврат не вызывают лишний диалог; старое действие сообщения проверено отдельно. Полный Go internal/app 55.663 s; после последней UI-правки web 1.001 s и 231 Node прошли. Dry run сохранил все строки прежних 112 таблиц, добавлена пустая chat_personal_archives: схема 062, 113 таблиц. HTTPS/assets/health/служба/nginx/integrity/FK успешны. Контракт docs/architecture/CHAT_PERSONAL_ARCHIVE_2026_09_07.md. Остаются mute, ручное непрочитанное, отдельная галерея/ссылки/альбомы и доставка; большое направление чата не закрыто.')
try:
 receipt={'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'preservedTables':112,'schema':'062_chat_personal_archives.sql','tables':113,'nodeTests':231,'assets':'20260907-chat-archive-2','tasks':[]}
 for task_id in ['e402d353a684b074f852fa1fd277d895','6e4f34f50ea37062254b52d8d63292b6','f1a7f01c558ae9a84bc6e5cb90f2c73f']:
  detail=api('/records/'+task_id)
  if not any(marker in proof['content'] for proof in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
  refreshed=api('/records/'+task_id)
  assert any(marker in proof['content'] for proof in refreshed.get('proofs',[]))
  receipt['tasks'].append({'id':task_id,'status':refreshed['record']['status']})
 Path('/tmp/tessavie-chat-archive-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps(receipt,ensure_ascii=False))
finally:
 db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
