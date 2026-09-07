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

marker='[audit:constructor-filled-fields-20260907]'
evidence=marker+' SC-73, действующая сборка 40e9495. Локальный браузер, синтетическая доска SC-67: числовое поле с 3 и 7 переименовано в SC-73 Плановые часы, удалено с возможностью восстановления, найдено в Удалённых, восстановлено. Начальное значение 2, показ на карточке, оба значения сохранены. Исходное имя Часы на проверку возвращено; reload подтвердил две исходные карточки и 3/7. Потеря данных и невозможность переименования/удаления в этом конкретном общем конструкторе не воспроизведены. Смена типа после создания пока недоступна: форма прямо сообщает ограничение. Это оставшийся критерий, а не исправленная функция. Личная настройка страницы и общая схема доски различаются; дальнейшая работа должна делать этот переход понятнее. Production-схемы клиентов не изменялись, деплой приложения не выполнялся, большая задача остаётся in_progress.'
try:
 parent='a288364706d6c9f0ff683003aea39009'
 detail=api('/records/'+parent)
 if not any(marker in p['content'] for p in detail.get('proofs',[])):api('/records/'+parent+'/proofs','POST',{'kind':'text','content':evidence})
 records=api('/records')
 if isinstance(records,dict):records=records.get('records',records.get('items',[]))
 key='[request:constructor-safe-type-conversion-20260907]'
 matches=[r for r in records if key in r.get('description','')];assert len(matches)<=1
 if matches:task=matches[0]
 else:
  task=api('/records','POST',{'type':'task','title':'P1 · Безопасно менять тип заполненного поля с предпросмотром','description':key+' По прямому запросу владельца о гибком конструкторе. SC-73 подтвердил: переименование и удаление/возврат работают, смена типа недоступна. Начать с явно поддержанных пар без потерь (короткий/длинный текст и число/сумма только при сохранении точности), затем расширять по сценариям. До применения показать текущий/новый тип, количество затронутых карточек, примеры значений и несовместимые данные; при несовместимости не применять частично. Сохранить исходные значения и историю преобразования. Проверять права администратора, границу проекта, актуальность схемы и значений между предпросмотром и применением. Начальное значение согласованно преобразуется или операция блокируется с объяснением; старые черновики не должны молча отправлять несовместимые значения. Проверить пустое поле, заполненное, отмену, конкурентное изменение, удаление/восстановление после преобразования, 320/1280 px. Обязательность, порядок, стабильный ID и связи сохраняются. Произвольные формулы и собственные типы не объявлять готовыми этим этапом.','ownerId':user[0],'parentId':parent,'priority':'high','workstream':'platform','status':'planned','editPolicy':'shared'})
 refreshed=api('/records/'+task['id'])['record']
 receipt={'checkedAt':stamp(now),'applicationCommit':commit,'parent':parent,'parentStatus':api('/records/'+parent)['record']['status'],'task':{'id':refreshed['id'],'title':refreshed['title'],'status':refreshed['status']},'auditMarker':marker,'applicationChanged':False}
 Path('/tmp/tessavie-constructor-filled-audit.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps(receipt,ensure_ascii=False))
finally:
 db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
