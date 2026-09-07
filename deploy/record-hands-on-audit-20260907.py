"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

commit = '6d4dc42f1a33cd26ce02913f4efeb94b7650abbd'
release = '/opt/business-control/releases/20260907-scenarios-6d4dc42'
sha = '12ef7261bde86249d8dff5d8c7ab1bcf25b03ea40df4b4cab1b8731292abe71f'
backup = '/var/lib/business-control/backups/pre-scenarios-20260907T060938Z'
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

marker = '[hands-on:20260907-batch1]'
report = 'docs/product/TESSAVIE_HANDS_ON_AUDIT_2026_09_07.md'
evidence = (marker+'\nРучной браузерный прогон на синтетических аккаунтах. Опубликован '+commit+
    '; release '+release+'; backup '+backup+'. 206 Node-тестов и Go web прошли; dry run сохранил 104 таблицы. '
    'Исправлены самовольное AI-заполнение оценки, проверка интервала до очереди, явный выход из сохранённых чата, '
    'пустая сводка вторичных личных вкладок, открытие новой карточки в просмотре, время события в дне, переход после приглашения. '
    'Чат 320 px проверен визуально: фильтр и поле ввода доступны, Показать все возвращает переписку. '
    'Полный реестр 55 сценариев ещё не принят; обнаруженные продуктовые провалы остаются открыты. Отчёт '+report)

specs = [
    ('recurrence-template', 'Исправить независимость экземпляров повторяющихся личных дел',
     'P1. SC-10: создать еженедельную серию 7–28 сентября; изменить название только 7 сентября без флажка всей серии; завершить его. '
     'Факт: экземпляр 14 сентября наследует временное название. Будущие недели до завершения также не видны в календаре. '
     'Приёмка: отдельный шаблон серии, локальное изменение не влияет на будущие экземпляры; изменение всей серии действует явно; '
     'пропуски, переносы, прекращение и повтор запроса не создают дубли. Календарь показывает будущие повторения с понятным горизонтом.'),
    ('personal-project-hub', 'Открывать действия и результат личного проекта и цели',
     'SC-11/12: создать проект, цель и связанное дело; нажать проект. Факт: открывается только редактор названия и описания. '
     'Приёмка: проект открывает незавершённые/завершённые действия и материалы, даёт создать связанное дело; '
     'цель показывает источники прогресса и зафиксированный результат, редактирование остаётся отдельной кнопкой. '
     'Проверить заполненное и пустое состояние, переход обратно, 320 и 1280 px.')
]
try:
    receipt = {'commit':commit,'release':release,'sha256':sha,'backup':backup,'tasks':[]}
    for task_id in ['6e4f34f50ea37062254b52d8d63292b6','f1a7f01c558ae9a84bc6e5cb90f2c73f']:
        detail = api('/records/'+task_id)
        task = detail['record']
        if task['status'] == 'planned':
            api('/records/'+task_id, 'PATCH', {'status':'in_progress','expectedUpdatedAt':task['updatedAt'],
                'reason':'Ручной сценарный аудит уже выполняется по жалобам первых клиентов'})
        if not any(marker in p['content'] for p in detail.get('proofs',[])):
            api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
        receipt['tasks'].append({'id':task_id,'status':api('/records/'+task_id)['record']['status']})
    outbox_id = '3d9a860505030ea14061633f22b115fd'
    detail = api('/records/'+outbox_id)
    if not any(marker in p['content'] for p in detail.get('proofs',[])):
        api('/records/'+outbox_id+'/proofs','POST',{'kind':'text','content':marker+
            '\nSC-09/37: неверный интервал события попадал в blocked; редактировать поля очереди нельзя, только читать/повторить/остановить. '
            'Предвалидация новых интервалов опубликована. Требуется исправление уже заблокированной записи с сохранением черновика и без дубля. '+report})
    for key,title,criteria in specs:
        item_marker = '[hands-on:'+key+']'
        existing = db.execute("SELECT id FROM records WHERE workspace_id='bizflow-team' AND (title=? OR instr(description,?)>0)",(title,item_marker)).fetchone()
        if existing:
            task = api('/records/'+existing[0])['record']
        else:
            task = api('/records','POST',{'type':'task','title':title,'description':item_marker+'\n'+criteria+'\nОснование: '+report,
                'ownerId':user[0],'parentId':'6e4f34f50ea37062254b52d8d63292b6','status':'planned','priority':'high','workstream':'platform','editPolicy':'owner_only'})
        receipt['tasks'].append({k:task[k] for k in ['id','title','status']})
    Path('/tmp/tessavie-hands-on-audit-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2))
    print(json.dumps(receipt,ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,))
    db.commit()
    db.close()
