"""Verify private scope and record a shipped stage without completing umbrella tasks."""
import argparse, datetime, fcntl, hashlib, json, secrets, sqlite3, urllib.request
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--commit', required=True); p.add_argument('--release', required=True); p.add_argument('--sha256', required=True)
args = p.parse_args()
assert len(args.commit) == 40 and all(c in '0123456789abcdef' for c in args.commit)
assert args.release.startswith('/opt/business-control/releases/20260904-first-use-')
assert str(Path('/opt/business-control/current').resolve()) == args.release
assert hashlib.sha256(Path(args.release+'/business-control').read_bytes()).hexdigest() == args.sha256
lock = open('/run/business-control-personal-batch-task.lock', 'w')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=15)
assert db.execute('SELECT username FROM users WHERE id=1').fetchone()[0] == 'artkozk'
assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not db.execute('PRAGMA foreign_key_check').fetchall()
token = secrets.token_urlsafe(32); digest = hashlib.sha256(token.encode()).hexdigest()
now = datetime.datetime.now(datetime.timezone.utc)
stamp = lambda value: value.isoformat(timespec='microseconds').replace('+00:00', 'Z')
db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(1,?,?,?,?)',
           (digest, stamp(now+datetime.timedelta(minutes=5)), stamp(now), stamp(now)))
db.commit()
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *unused): return None
client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
def api(path, method='GET', body=None, workspace='bizflow-team'):
    request = urllib.request.Request('http://127.0.0.1:8522/api'+path, method=method,
        data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
        headers={'Cookie':'business_session='+token, 'X-Workspace-ID':workspace, 'Content-Type':'application/json'})
    with client.open(request, timeout=25) as response:
        raw=response.read(); return json.loads(raw) if raw else None
try:
    assert db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='042_journey_preferences.sql'").fetchone()[0]==1
    preferences=api('/me/journey')
    assert isinstance(preferences['tipsEnabled'],bool) and isinstance(preferences['dismissed'],list)
    other=db.execute('SELECT id FROM personal_notes WHERE owner_id<>1 AND archived_at IS NULL LIMIT 1').fetchone()
    if other:
        try:
            api('/personal/notes/'+other[0]+'/plan','POST',{'title':'Private scope verification','requestKey':secrets.token_hex(16),'expectedUpdatedAt':'not-owned'})
            raise AssertionError('Foreign note accepted')
        except urllib.error.HTTPError as error:assert error.code==404
    assert 'user_journey_preferences' not in json.dumps(api('/export'))
    print('AUTHENTICATED_JOURNEY_SCOPE=ok')
    common='Проверки: go test ./..., go vet ./..., 176 Node-тестов. Локальный браузер: потеря ответа после capture и разбора, reload, одна заметка/одно дело/одна связь; холодный запуск без сети и восстановление очереди; сохранённый старый черновик с файлами; новая регистрация и первое дело; desktop/320 px. Миграция 042 проверена на копии БД с полным сравнением прежних таблиц. Физические телефоны и независимые новые пользователи не проверялись. Контракт: docs/architecture/FIRST_USE_AND_INBOX_TRIAGE_2026_09_04.md.'
    results={
      '54f7cd0225c5ef0f5eba56e3ffb71e51':'Выпущен этап первого шага и помощи: вводная про личные планы и команду, добровольные действия в пустом Сегодня, скрытые нулевые сводки, свёрнутые расширенные параметры нового дела с сохранением черновиков. Помощь зависит от личного/командного контекста и раздела, доступна через боковое меню на mobile. Подсказки конструктора/связей/публикации закрываются и отключаются для аккаунта через приватный API. Палитра, логотип, существующие настройки сохранены. Остаются готовые CRM/исследовательские наборы, дальнейшее постепенное раскрытие конструктора и проверка самостоятельного прохождения реальными новыми людьми.',
      '36cceab2931f04d7d2d79878ab2475d5':'Выпущен текстовый этап единых входящих: короткая запись без обязательных метаданных использует общий outbox и доступна при холодном запуске без сети. После локального commit показывается ожидание сервера; повтор и смена аккаунта защищены. Сделать делом создаёт личное действие и связь prepares_for, сохраняет исходную заметку, файлы и историю, убирает только признак входящего. Квитанция, исходная версия и транзакция защищают от дублей и частичного применения; конфликт даёт возможность проверить свежий оригинал и остановить прежнюю попытку. Голос/AI, мобильные источники и полная сквозная интеграция всех форматов остаются отдельными критериями.'
    }
    for task_id,result in results.items():
        detail=api('/records/'+task_id);task=detail['record'];assert task['workspaceId']=='bizflow-team'
        marker='[verified:first-use-'+args.commit[:7]+']'
        evidence=marker+'\n'+result+'\n'+common+'\nCommit: '+args.commit+'\nRelease: '+args.release+'\nSHA256: '+args.sha256
        if not any(marker in proof['content'] for proof in detail.get('proofs',[])):api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
        task=api('/records/'+task_id)['record']
        if marker not in task['description']:
            api('/records/'+task_id,'PATCH',{'status':'in_progress','description':task['description']+'\n\n'+evidence,'expectedUpdatedAt':task['updatedAt'],'reason':'Выпущен проверенный этап; оставшиеся критерии сохраняются в работе'})
    print(json.dumps({'taskStatuses':{task_id:api('/records/'+task_id)['record']['status'] for task_id in results}},ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,));db.commit();db.close()
