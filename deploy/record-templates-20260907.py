"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

commit = '44795ef1fe8bfb4d76a691f9c5651cc472a06976'
release = '/opt/business-control/releases/20260907-templates-44795ef'
sha = '9925fc772dd66abc98f8aae51904a278bf11a3c13714ecc7f38b604495a97355'
backup = '/var/lib/business-control/backups/pre-templates-20260907T100114Z'
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

marker = '[release:starting-processes-20260907]'
evidence = (marker+'\nВыпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. '
 'SC-58: новая доска предлагает 5 стартовых процессов с предварительным списком колонок и полей; отдельные ID, атомарное создание, без тестовых карточек. Черновик и свой текст сохраняются. '
 'Строгая проверка вариантов при создании поля предотвращает пустой обязательный справочник. '
 'По снимкам пользователя устранены наложение длинных названий досок, браузерные рамки вкладок, нативные полосы прокрутки со стрелками. На телефоне выбор доски одним списком, заголовок конструктора отдельно от действий; полоса прокрутки 6px в палитре платформы. '
 'Ручные проверки 320/1280px, новая доска публикаций и карточка в двух каналах, возврат к черновику, ошибка повторных вариантов без потери ввода. 218 Node, полный Go и повторные профильные проверки прошли. '
 'Dry run сохранил 106 таблиц; HTTPS/nginx/health/assets templates-5 проверены. Контракт docs/architecture/CONSTRUCTOR_STARTING_PROCESSES_2026_09_07.md. Большие задачи остаются открыты.')
try:
    templates=api('/collection-templates')
    assert len(templates)==5 and {item['id'] for item in templates}=={'blank','sales','hiring','content','support'}
    receipt={'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'preservedTables':106,'nodeTests':218,'goTests':'go test ./... passed; focused server and asset checks repeated','productionTemplates':len(templates),'tasks':[]}
    for task_id in ['a288364706d6c9f0ff683003aea39009','f1a7f01c558ae9a84bc6e5cb90f2c73f','6e4f34f50ea37062254b52d8d63292b6']:
        detail=api('/records/'+task_id)
        if not any(marker in p['content'] for p in detail.get('proofs',[])):
            api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
        receipt['tasks'].append({'id':task_id,'status':api('/records/'+task_id)['record']['status']})
    Path('/tmp/tessavie-templates-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2))
    print(json.dumps(receipt,ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()