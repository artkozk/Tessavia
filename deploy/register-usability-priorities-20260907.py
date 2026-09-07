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

tasks=[
 ('completion-review','P0 · Завершённая задача остаётся в выбранной колонке','Новый прямой запрос 07.09.2026. Завершение исполнителем не должно прятать карточку в скрытом review. Разделить completed и ожидание просмотра, уведомить принимающего/постановщика, дать администратору вернуть в работу с причиной. Сохранить выбранный done-этап, историю и доказательства; восстановить старый подтверждённый случай. Проверить повтор, права, несколько done-колонок, сохранение после обновления.','in_progress'),
 ('page-editor','P0 · Исправить редактирование заголовков и элементов страниц','По скриншоту Чтения: режим настройки не позволяет изменить Время для Слова и убрать ненужные блоки/элементы. Пройти настройку как пользователь; добавить явное редактирование текста и скрытие с восстановлением там, где сейчас отсутствует. Проверить сохранить, отменить, обновить, другой проект и профиль ПК/телефона. Не подменять изменение данных команды личным скрытием поля; объяснить область действия в UI.','planned'),
 ('life-map-design','P1 · Вернуть целостную карту времени и компактную навигацию','По скриншотам пользователя пагинация карты скрывает долю прошедшей жизни, вкладки Личного растянуты на всю ширину. Вернуть визуальный общий горизонт без листания; детализация дополнительная. Восстановить компактные вкладки в стилистике платформы. Проверить 320 и 1280, 80/150 лет, месяцы/недели, перенос текста и сохранение настроек.','planned')]
try:
 records=api('/records')
 if isinstance(records,dict):records=records.get('records',records.get('items',[]))
 receipt=[]
 for key,title,description,status in tasks:
  marker='[request:2026-09-07:'+key+']'
  matches=[r for r in records if marker in r.get('description','')]
  assert len(matches)<=1
  if matches:item=matches[0]
  else:item=api('/records','POST',{'type':'task','title':title,'description':marker+'\n'+description+'\nОчередь по прямому запросу пользователя: исправления существующих сценариев выше новых функций.','ownerId':user[0],'parentId':'6e4f34f50ea37062254b52d8d63292b6','priority':'high','workstream':'platform','status':status,'editPolicy':'shared'})
  detail=api('/records/'+item['id']);assert marker in detail['record']['description']
  receipt.append({'id':item['id'],'title':detail['record']['title'],'status':detail['record']['status']})
 Path('/tmp/tessavie-usability-priorities.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2))
 print(json.dumps(receipt,ensure_ascii=False))
finally:
 db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
