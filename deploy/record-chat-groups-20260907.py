"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

commit = '21ad00a6a5083a7524aba1cfbd3d2e841fc2e8da'
release = '/opt/business-control/releases/20260907-chat-groups-21ad00a'
sha = 'a1362a12e66c9f1386d35010cf788e8a5481c25b0d004537234eeb68e57c00b7'
backup = '/var/lib/business-control/backups/pre-chat-groups-20260907T105953Z'
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

marker='[release:chat-groups-20260907]'
evidence=(marker+'\nВыпущен '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. '
 'Состав и независимые роли закрытой группы, название, добавление активного коллеги, исключение, передача владения и выход. Последний владелец защищён. '
 'Устаревшее окно получает 409; системные события атомарны и не редактируются автором. Роли проекта не открывают закрытые группы. '
 'Четыре API-аккаунта проверили матрицу прав, восстановление владельца, запрет старых ссылок на файлы, откат при отказе записи события и неизменность команды. '
 'Три синтетических аккаунта в браузере: состав, роли, передача туда/обратно, выход, конфликт двух окон, исключение при открытой переписке. '
 'Повторный допуск восстановил точный черновик исключённого участника. 320/1280 px, диалог 700 px desktop, кнопки 44 px, без нативных стрелок и переполнения. '
 '222 Node, полный Go и финальные asset-проверки прошли. Dry run сохранил 106 исходных таблиц; схема 058, новые таблицы ролей/версий, HTTPS/nginx/health/assets chat-groups-3 проверены. '
 'При изменении состава заканчивается текущий звонок; обработка 204/403 освобождает соединение и микрофон. Физические звонки не проверены. '
 'Контракт docs/architecture/CHAT_GROUP_LIFECYCLE_2026_09_07.md. Полные групповые звонки, offline-кэш и единая лента карточки остаются открыты. Реальные клиентские группы не менялись.')
try:
    assert db.execute("SELECT 1 FROM schema_migrations WHERE version='058_chat_group_lifecycle.sql'").fetchone()
    receipt={'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'preservedTables':106,'schema':'058_chat_group_lifecycle.sql','nodeTests':222,'goTests':'go test ./... passed; final web assets passed','tasks':[]}
    for task_id in ['524e18c09b0fad83704dbc82de46b700','45bbc1b549a12bb12b1c0ab92cf23a84','e402d353a684b074f852fa1fd277d895','6e4f34f50ea37062254b52d8d63292b6','f1a7f01c558ae9a84bc6e5cb90f2c73f']:
        detail=api('/records/'+task_id)
        if not any(marker in proof['content'] for proof in detail.get('proofs',[])):
            api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
        if task_id=='524e18c09b0fad83704dbc82de46b700' and detail['record']['status']!='completed':
            api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
        receipt['tasks'].append({'id':task_id,'status':api('/records/'+task_id)['record']['status']})
    Path('/tmp/tessavie-chat-groups-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2))
    print(json.dumps(receipt,ensure_ascii=False))
    for task_id in ['a288364706d6c9f0ff683003aea39009','0311dbcf668203acd4ffb32461307d9b']:
        record=api('/records/'+task_id)['record']
        print(json.dumps({'nextTask':record['title'],'id':task_id,'description':record['description'],'status':record['status']},ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()