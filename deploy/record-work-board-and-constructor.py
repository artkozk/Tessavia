import sqlite3, json, urllib.request, urllib.error, hashlib, secrets, datetime
db=sqlite3.connect('/var/lib/business-control/business-control.db', timeout=15)
db.row_factory=sqlite3.Row
assert db.execute("SELECT username FROM users WHERE id=1").fetchone()[0]=='artkozk'
token=secrets.token_urlsafe(32)
digest=hashlib.sha256(token.encode()).hexdigest()
now=datetime.datetime.now(datetime.timezone.utc)
stamp=lambda d:d.isoformat(timespec='microseconds').replace('+00:00','Z')
db.execute("INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(1,?,?,?,?)",(digest,stamp(now+datetime.timedelta(minutes=5)),stamp(now),stamp(now)))
db.commit()
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def api(path,method='GET',body=None):
    req=urllib.request.Request('http://127.0.0.1:8522/api'+path,method=method,data=json.dumps(body,ensure_ascii=False).encode() if body is not None else None,headers={'Cookie':'business_session='+token,'Content-Type':'application/json','X-Workspace-ID':'bizflow-team'})
    try:
        with opener.open(req,timeout=25) as r:
            data=r.read()
            return json.loads(data) if data else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(str(e.code)+': '+e.read().decode()) from None
try:
    assert api('/me')['username']=='artkozk'
    from pathlib import Path
    release='/opt/business-control/releases/20260903-work-board-9a2d462'
    assert str(Path('/opt/business-control/current').resolve())==release
    task_id='7a5daf6b995bf8a4b6503e943dee828c'
    marker='[verified:work-board-9a2d462]'
    evidence=marker+'\nДоска с собственными этапами зарегистрирована в сетке Работы под управлением. В редакторе доступны Доска и Доска и её настройки; ключи и профили сохранены.\nGo test/vet и 68 Node-тестов прошли. Браузер: 1440/390/320 px, пустая и заполненная доска, длинное название, открытие карточки, меню поверх карточек, фильтрация, перенос мышью/клавиатурой, сохранение/отмена, перезагрузка и независимость ПК/телефона. Физические телефоны не проверялись.\nCommit 9a2d462; release '+release+'; SHA256 b8ed994e5a208d5fdcb130bfc81bdb73f79935b317af3e3ff56a5dc5c5bb6f88.\nBackup pre-work-board-20260903T090022Z, dry-run и сравнение строк всех таблиц без изменений, health и ресурсы сайта прошли. Регистрация без кода сохранена.\nhttps://control.e-rd.ru\nОтчёт: docs/operations/TESSAVIE_WORK_BOARD_LAYOUT_2026_09_03.md'
    detail=api('/records/'+task_id)
    assert detail['record']['workspaceId']=='bizflow-team' and detail['record']['ownerId']==1
    if not any(marker in p['content'] for p in detail.get('proofs',[])):
        api('/records/'+task_id+'/proofs','POST',{'kind':'text','content':evidence})
    if detail['record']['status']!='completed':
        api('/records/'+task_id+'/complete','POST',{'result':evidence,'notifyPartners':False})
    assert api('/records/'+task_id)['record']['status']=='completed'
    print(json.dumps({'taskId':task_id,'status':'completed'},ensure_ascii=False))

    updates={
        'a288364706d6c9f0ff683003aea39009':'Из библиотеки добавлять стандартные и собственные поля, менять имя, тип, обязательность, значения по умолчанию, проверку ввода, порядок и отображение. Схема не зависит от фиксированного перечня типов в коде. Не выдавать переименование Задачи за собственный тип. Общие схемы проекта и личные предпочтения разделены. Смена типа поля требует предпросмотра преобразования и сохранения старых значений.',
        '46fd28bb741370595fbb75a553121349':'Из первого экрана настройки меню доступны Добавить из библиотеки и Создать свой пункт. Из мастера создаются источник, поля, вид, пункт меню и экран карточки. Можно добавить стандартный отключённый раздел с учётом роли, смешать типы и настроить все рабочие страницы. Меню ПК/телефона независимо; личное скрытие не меняет доступ. Нужны понятные пустые состояния и проверка всего пути с нуля обычным пользователем.',
        '73b6b7d46b94fc6ded43c44cad503fb5':'Визуальные правила Когда / Если / Сделать для собственных и стандартных типов: события полей, срока, расписания, перехода этапа и связей; действия над разрешёнными карточками, создание связи, предложение отметки цели. Предпросмотр на примере, тестовый запуск без записи, журнал, повторяемость без дублей, защита от циклов и лимиты. Произвольный код не исполняется. Правила не обходят приватность и роли; опасные внешние действия требуют отдельного согласия.',
        'fdc091d467ab98b35e3e87d0675c3621':'Переносимый инструмент содержит типы, библиотеку полей, связи, допустимые переходы, страницы, меню и правила, а не только расположение интерфейса. Применение в новое личное или командное пространство с предпросмотром, переотображением ID и проверкой зависимостей. Пользовательские данные, пароли, сессии и ключи не публикуются. Набор должен работать без разработчика после установки.',
        '2f14988071f0a37c866e60175b02e1e9':'Для инструментов без кода: версия автора, локальная копия, явный diff обновления, сохранение локальных изменений, миграция пользовательских значений и возможность отказа/отката. Обновление шаблона не заменяет схему и данные пользователя молча.',
        '9692385a151e922369c3f1c1edea451e':'Приёмочные примеры собираются только средствами конструктора: личный трекер привычек и заметок; совместное чтение с книгами, сессиями и прогрессом; бизнес-риски с правилами на основе работы проекта. Ни один пример не добавляет отдельный тип/экран в код. Проверить сборку с нуля, публикацию без личных данных, установку другим аккаунтом и работу ПК/телефона.'
    }
    request_marker='[request:no-code-tools-2026-09-03]'
    for record_id,addition in updates.items():
        r=api('/records/'+record_id)['record']
        if request_marker not in r.get('description',''):
            api('/records/'+record_id,'PATCH',{'expectedUpdatedAt':r['updatedAt'],'description':r.get('description','')+'\n\n'+request_marker+'\n'+addition+'\nСначала выпускается исправление порядка доски. Эти критерии являются оставшейся работой, не подтверждением реализации.'})
        print(json.dumps({'updatedTask':record_id,'title':r['title'],'status':r['status']},ensure_ascii=False))
    new_tasks=[
        ('custom-types','Создавать собственные типы работы с нуля без изменения кода','Имя и значок типа, набор стандартных и пользовательских полей, форма/содержимое карточки, допустимые состояния и явное завершение, доступные действия, календарь и представления задаются схемой. Встроенные типы остаются совместимыми. Можно собрать Книгу, Сессию чтения, Привычку без добавления веток по их именам в код. Версионирование схемы, миграция без потери значений, поиск и связи, роли и приватность, понятный мастер с предпросмотром ПК/телефона. Приёмка: пользователь создаёт тип и работает с ним самостоятельно.'),
        ('relation-rules','Настраивать типы связей и правила между пользовательскими карточками','Пользователь задаёт название/обратное название связи, допустимые исходные и целевые типы, один/много, обязательность и применимые ограничения. При создании и изменении карточки правила проверяются сервером; ошибки указывают на конкретное условие. Связи доступны в форме, поиске, списках и графе. Удаление или смена типа связи требует проверки заполненных данных. Нельзя связью получить доступ к чужому проекту или личному пространству. Не все циклы запрещены: запрет выбирается для конкретной иерархии.')
    ]
    records=api('/records')
    for key,title,description in new_tasks:
        item_marker='[request:no-code-tools-2026-09-03:'+key+']'
        r=next((r for r in records if item_marker in r.get('description','')),None)
        if not r:
            r=api('/records','POST',{'type':'task','title':title,'description':item_marker+'\n'+description+'\nСвязанный план: docs/product/NO_CODE_TOOLS_REQUEST_2026_09_03.md. Реализация не выполнена. Сроки и трудозатраты не назначены.','ownerId':1,'parentId':'a288364706d6c9f0ff683003aea39009','status':'planned','priority':'high','workstream':'platform','editPolicy':'owner_only'})
        print(json.dumps({'newTask':r['id'],'title':r['title'],'status':r['status']},ensure_ascii=False))

finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest,))
    db.commit()
    db.close()
