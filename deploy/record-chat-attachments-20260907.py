"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

commit = 'a65c0ec50cdf1e3f47ab542eae5a5b87e9356044'
release = '/opt/business-control/releases/20260907-chat-attachments-a65c0ec'
sha = '941512306f0dba9b5e9ee6d4fe78b5b18d98c850ee68cd9cb65d152e36a2f742'
backup = '/var/lib/business-control/backups/pre-chat-attachments-20260907T181052Z'
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

marker='[release:chat-attachments-20260907]'
evidence=(marker+'\nВыпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. '
 'SC-70: режим Файлы и медиа в меню разговора. Сервер фильтрует вложения до ограничения страницы; старые файлы доступны за длинной текстовой историей. Поиск по имени, страницы и переход Открыть в переписке с последующим чтением контекста. Файлы и Сохранённые не гасят непрочитанные всего разговора; исправлен существовавший дефект этого условия. Черновики сохраняются. После явной отправки текста из вложений открывается обычная переписка с результатом. Проверены 60 файлов + 240 текстов, 50+10 без потерь, кириллица, архив, права и курсоры. Локальный UI: файл и изображение, поиск отчёт, возврат/Следующие сообщения, тестовая отправка, пустой DM, черновики SC-70/SC-65. На 320 px полное имя документа теперь переносится с расширением; проверен 1280 px. Рабочим людям сообщения не отправлялись. Full Go internal/app 54.713 s, web 1.001 s, 230 Node прошли. Независимый устаревший по реальным часам тест сводок исправлен без изменения production-кода уведомлений; добавлена проверка истечения. Dry run сохранил 112 таблиц и строки, схема 061 без миграции; HTTPS/assets/health/служба/nginx/integrity/FK проверены. Контракт docs/architecture/CHAT_ATTACHMENTS_VIEW_2026_09_07.md. Это единый список вложений; галерея, ссылки, альбомы, архив/mute/ручное непрочитанное и доставка остаются открыты.')
try:
 receipt={'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'preservedTables':112,'schema':'061_chat_personal_pins.sql','tables':112,'nodeTests':230,'assets':'20260907-chat-attachments-2','tasks':[]}
 for task_id in ['e402d353a684b074f852fa1fd277d895','6e4f34f50ea37062254b52d8d63292b6','f1a7f01c558ae9a84bc6e5cb90f2c73f']:
  detail=api('/records/'+task_id)
  if not any(marker in proof['content'] for proof in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
  refreshed=api('/records/'+task_id)
  assert any(marker in proof['content'] for proof in refreshed.get('proofs',[]))
  receipt['tasks'].append({'id':task_id,'status':refreshed['record']['status']})
 Path('/tmp/tessavie-chat-attachments-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps(receipt,ensure_ascii=False))
finally:
 db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
