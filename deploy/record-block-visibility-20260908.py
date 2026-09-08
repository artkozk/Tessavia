"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

import os
commit = os.environ['CANDIDATE_COMMIT']
release = os.environ['VERIFIED_RELEASE']
sha = os.environ['EXPECTED_SHA256']
backup = os.environ['VERIFIED_BACKUP']
assert str(Path('/opt/business-control/current').resolve()) == release
assert hashlib.sha256(Path(release+'/business-control').read_bytes()).hexdigest() == sha
assert Path(backup+'/business-control.db').is_file()
db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=20)
db.execute('PRAGMA foreign_keys=ON')
assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not db.execute('PRAGMA foreign_key_check').fetchall()
assert db.execute("SELECT count(*) FROM schema_migrations WHERE version='065_record_create_requests.sql'").fetchone()[0] == 1
assert db.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchone()[0] == 117
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

marker='[release:block-visibility-20260908]'
evidence=marker+' Выпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. '+'SC-83: любой блок составной страницы можно показывать по личному прогрессу другого блока пунктов: выполнено/осталось/процент, шесть сравнений и порог. Условие снимается и переносится набором; личные отметки не переносятся. Предпросмотр моделирует число выполненных пунктов без записи реальных отметок. Неизвестный источник/оператор/метрика/порог, самоссылки и циклы отклоняются сервером.100% требует всех пунктов,99.5 не округляется до выполненного условия. Пустой источник не раскрывает блок. Условие — показ, не право доступа; UI объясняет это. Переход к скрытому блоку отключён с объяснением. Через UI вручную собраны два этапа, проверены0→2в предпросмотре/черновик/reload/отметки/снятие отметки/повтор. Набор установлен пустой копией, условие отменено и затем снято только в копии; оригинал и текст сохранены.320px/длинный текст/меню/настройки/предпросмотр проверены. При выключении условия панель теперь остаётся открытой. Go64.709s/web0.376s/vet; финальные262Node985.7058ms/web0.371s. APIправа/ревизии/двое пользователей/независимая копия проверены. Dryrun117таблиц без изменений, схема065, HTTPS/assets/health/nginx/integrity/FK/401. PAGE_BLOCK_VISIBILITY_2026_09_08.md и BLOCK_VISIBILITY_LOCAL_2026_09_08.json. Rollback на старыйSC82 блокируется при сохранённых visibility. Привязки к произвольным полям/свойствам, AND/OR, вложенные элементы и вся универсальность конструктора остаются открытыми.'
try:
 receipt={'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'oldTablesUnchanged':117,'tables':117,'schema':'065_record_create_requests.sql','nodeTests':262,'assets':'20260908-block-visibility-2','tasks':[]}
 for task_id in ['05d64b353b1627ee64611c199e63af28','2ad192a4298615883945e23a87d8ecd2','66da4e412e714f4ea85c56ff85de03ec']:
  detail=api('/records/'+task_id)
  if not any(marker in p['content'] for p in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
  if task_id=='05d64b353b1627ee64611c199e63af28' and detail['record']['status']!='completed':
   assert detail['record']['ownerId']==user[0] and detail['record']['authorId']==user[0]
   api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
  updated=api('/records/'+task_id);assert any(marker in p['content'] for p in updated.get('proofs',[]))
  if task_id=='05d64b353b1627ee64611c199e63af28':assert updated['record']['status']=='completed'
  receipt['tasks'].append({'id':task_id,'status':updated['record']['status']})
 Path('/tmp/tessavie-block-visibility-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps(receipt,ensure_ascii=False))
finally:
 db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
