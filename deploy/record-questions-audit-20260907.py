"""Verify the deployed release and append evidence to existing scoped tasks."""
import datetime
import hashlib
import json
import secrets
import sqlite3
import urllib.request
from pathlib import Path

commit = '843114abf07778b004e4c4f7f0bdf337a8c8fd77'
release = '/opt/business-control/releases/20260907-questions-843114a'
sha = '2dd8fa174d1a6f78ed7c4987312954a59122c478e5bd6eaf92b28d77e05f871d'
backup = '/var/lib/business-control/backups/pre-questions-20260907T064540Z'
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

marker = '[hands-on:20260907-matrix55]'
report = 'docs/product/TESSAVIE_HANDS_ON_RESULTS_2026_09_07.md'
summary = ('Ручной браузерный прогон 55 сценариев: 32 пройденных цепочки, 15 частично, 6 с дефектом, 2 без аппаратной проверки. '
    'Это синтетические аккаунты и локальная копия. Не закрывает реальный аппаратный звонок, запись медиа, внешнюю почту, '
    'потерю ответа после записи сервером, экспорт/восстановление и конкретную жалобу клиента о смене исполнителя. '+report)
notes = {
    '6e4f34f50ea37062254b52d8d63292b6': summary,
    'f1a7f01c558ae9a84bc6e5cb90f2c73f': summary+' Проверены длинные карточки, фильтры, 320 px чат, заполненная команда, сохранение размера блока. Не считать весь визуал всех устройств принятым.',
    '45bbc1b549a12bb12b1c0ab92cf23a84': 'P1. SC-31: чат карточки и вкладка Обсуждение содержат разные сообщения, из карточки нет перехода в её разговор. SC-32: поиск кириллицей за 200 сообщений работает, но после перехода к старому сообщению нельзя постепенно читать вперёд. SC-33: черновики сохраняются, выбор разговора при reload сбрасывается. Приёмка: единая понятная переписка карточки без потери старых комментариев; видимый переход из карточки; контекст до и после найденного; сохранение текущего разговора и черновика.',
    'e402d353a684b074f852fa1fd277d895': 'Приоритет после срочных исправлений: чат карточки и комментарии, загрузка истории вперёд, видимая локальная отправка, управление группой. Пересылка и медиа идут после надёжности этого цикла. Текст, ответы, реакции, закрепление, личное сохранение, повторное открытие DM проверены; полноценный Telegram-parity не принят.',
    '3d9a860505030ea14061633f22b115fd': 'SC-37: остановлен локальный сервер, сообщение поставлено в очередь, после старта подтверждено автоматически и после reload ровно один экземпляр. Открытые проблемы: ожидающее сообщение не видно в переписке, blocked-запись нельзя исправить. Приёмка: пузырь ожидания/ошибки/повтора в диалоге с тем же idempotency key; восстановление blocked без переписывания и дубля; отдельный тест потери ответа после записи.',
    '367c7dcd4dc87dc1847ae53dd5f56d0c': 'SC-44 исправлен: порог ответов ограничен активными участниками workspace, прошлые ответы сохраняются, нового участника не подменяют. SC-45: два варианта, оценки, поле сравнения, вывод, завершение и решение с источником пройдены. Остаётся UX: добавление вариантов спрятано за Редактировать/Содержание, переход редактирования сбрасывает вкладку, подсказки про облачных провайдеров не универсальны, счётчик 0/0 не отражает сравнение.',
    'be5f232ab56aa47ae05bada70c13388d': 'SC-46: у решения со входящим leads_to инспектор пишет «приводит к [источник]», хотя направление обратное. Две линии (родитель и смысловая) требуют понятного различия. Приёмка: направление и роль источника очевидны в обеих концах связи и на 320 px; изменение подписей не переписывает историю связей.',
    'a884188bdc07d57ebe3c48987d208815': 'SC-55: пользовательский путь копии и восстановления в интерфейсе не найден. Backup перед деплоем и сохранность 104 таблиц проверены, но не заменяют центр данных. Приёмка: состав выгрузки, приватность, вложения и связи, пробное восстановление в отдельное пространство с отчётом; без перезаписи рабочего production для теста.',
    '07a3522ffe51ab9bd7187a4a2a75c504': 'SC-38: наличие кнопок записи не считается аппаратной приёмкой. Нужны реальные запись, отмена, воспроизведение, повтор отправки и отказ разрешения на устройствах. Этот прогон не записывал окружающий звук и не подтверждал видеокружки.',
    'eb3e4591f3bf0f22989bc8c947ab6b54': 'SC-39 остаётся без аппаратной приёмки: нужны два реальных устройства, входящий/ответ, звук, завершение с обеих сторон, восстановление сети. Не маркировать пройденным по модульным тестам.',
    '54f7cd0225c5ef0f5eba56e3ffb71e51': 'SC-01/04: регистрация с локальным тестовым кодом открыла пустое личное пространство; мысль → Разобрать → Сохранить в заметках прошла без лишней задачи. Реальная доставка почты не проверена. Входящие нужны как разбор, календарь как назначенное время. Редкие модули и конструктор не должны мешать первым действиям.'
}
priority_ids = ['45bbc1b549a12bb12b1c0ab92cf23a84','e402d353a684b074f852fa1fd277d895','3d9a860505030ea14061633f22b115fd','524e18c09b0fad83704dbc82de46b700','0311dbcf668203acd4ffb32461307d9b','4420e0be29f8c092c19243aa9d102d38']
try:
    receipt = {'commit':commit,'release':release,'sha256':sha,'backup':backup,'checkedAt':stamp(now),'scenarioCounts':{'passed':32,'partial':15,'failed':6,'not_verified':2},'tasks':[]}
    for task_id, content in notes.items():
        print('AUDIT_TASK', task_id, flush=True)
        detail = api('/records/'+task_id)
        if task_id == '367c7dcd4dc87dc1847ae53dd5f56d0c' and detail['record']['status'] == 'planned':
            api('/records/'+task_id,'PATCH',{'status':'in_progress','expectedUpdatedAt':detail['record']['updatedAt'],'reason':'Сценарий вопросов и исследования фактически пройден, исправлен блокирующий дефект; UX-работа продолжается'})
        if not any(marker in p['content'] for p in detail.get('proofs',[])):
            api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':marker+'\n'+content+'\n'+report})
        receipt['tasks'].append({'id':task_id,'status':api('/records/'+task_id)['record']['status']})
    for task_id in priority_ids:
        task = api('/records/'+task_id)['record']
        if task['priority'] != 'high':
            api('/records/'+task_id,'PATCH',{'priority':'high','expectedUpdatedAt':task['updatedAt'],'reason':'Приоритет подтверждён ручным аудитом по жалобам первых клиентов: базовые действия раньше новых модулей'})
    title = 'Не блокировать решение команды аккаунтами из других пространств'
    key = '[hands-on:questions-active-members]'
    found = db.execute("SELECT id FROM records WHERE workspace_id='bizflow-team' AND (title=? OR instr(description,?)>0)",(title,key)).fetchone()
    if found:
        task = api('/records/'+found[0])['record']
    else:
        task = api('/records','POST',{'type':'task','title':title,'description':key+'\nSC-44: три участника не могли сохранить итог из-за четвёртого аккаунта вне команды. Приёмка: активные участники workspace задают порог; старые ответы сохраняются, не подменяют новых; запись и AI проверяют тот же контракт.','ownerId':user[0],'parentId':'367c7dcd4dc87dc1847ae53dd5f56d0c','status':'in_progress','priority':'high','workstream':'platform','editPolicy':'owner_only'})
    detail = api('/records/'+task['id'])
    evidence = key+'\nОпубликован '+commit+'; '+release+'; SHA256 '+sha+'; backup '+backup+'. Полный go test ./... и 207 Node-тестов прошли. Dry run сохранил 104 таблицы, integrity/FK и HTTP/HTTPS проверены. Ручной UI: 1/3 → 3/3 → общий итог → задача с исходной ссылкой. Интеграционный тест меняет состав участников и сохраняет исторические ответы. Контракт docs/architecture/QUESTION_WORKSPACE_MEMBERSHIP_2026_09_07.md.'
    if not any(key in p['content'] for p in detail.get('proofs',[])):
        api('/records/'+task['id']+'/proofs','POST',{'kind':'text','content':evidence})
    if detail['record']['status'] != 'completed':
        api('/records/'+task['id']+'/complete','POST',{'result':evidence,'notifyPartners':False})
    finished = api('/records/'+task['id'])['record']
    assert finished['status'] == 'completed', finished['status']
    receipt['tasks'].append({'id':finished['id'],'title':finished['title'],'status':finished['status']})
    Path('/tmp/tessavie-questions-audit-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2))
    print(json.dumps(receipt,ensure_ascii=False))
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,))
    db.commit()
    db.close()

