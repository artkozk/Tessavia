PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

CREATE TEMP TABLE workflow_release_tasks(
  record_id TEXT PRIMARY KEY,
  proof_id TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  estimate_minutes INTEGER NOT NULL,
  actual_minutes INTEGER NOT NULL,
  result TEXT NOT NULL
);

INSERT INTO workflow_release_tasks VALUES
('f8140000000000000000000000000011','f8140000000000000000000000000012','f8140000000000000000000000000013',
 'Собрать проверяемое исполнение задач',
 'Добавить шаги с отдельными исполнителями и отчётами, доказательства, отправку постановщику, принятие результата и возврат на доработку.',
 300,285,'У задачи появился проверяемый жизненный цикл от плана до принятого результата без бесследной перезаписи истории.'),
('f8140000000000000000000000000021','f8140000000000000000000000000022','f8140000000000000000000000000023',
 'Добавить Markdown и полноэкранный блокнот',
 'Перевести длинные поля, ответы, выводы, доказательства и комментарии в режим чтения с безопасным Markdown и отдельным полноэкранным редактором.',
 180,170,'Длинные материалы читаются как документ, редактирование включается явно, сочетания клавиш и предпросмотр работают в одном компоненте.'),
('f8140000000000000000000000000031','f8140000000000000000000000000032','f8140000000000000000000000000033',
 'Добавить обсуждения и адресные уведомления',
 'Сделать неизменяемые комментарии внутри карточки, поддержку упоминаний основателей и уведомления участников предметного обсуждения.',
 150,145,'Обсуждение остаётся рядом с решением и задачей; упоминания и изменения ответственности попадают в личные уведомления.'),
('f8140000000000000000000000000041','f8140000000000000000000000000042','f8140000000000000000000000000043',
 'Добавить вложения с контролем целостности',
 'Реализовать серверное хранение файлов, безопасные имена, ограничение размера и типа, SHA-256 и скачивание только после авторизации.',
 180,190,'Файлы привязаны к единственной карточке, физическое имя не раскрывает исходное название, метаданные и хеш сохраняются в истории.'),
('f8140000000000000000000000000051','f8140000000000000000000000000052','f8140000000000000000000000000053',
 'Добавить доску, календарь и сохранённые виды',
 'Объединить ту же очередь работы в список, Kanban и календарь без создания копий; добавить сохранение фильтров и выгрузку проекта.',
 240,230,'Одна карточка отображается в подходящем представлении по состоянию и сроку; CSV и полный JSON доступны основателям.'),
('f8140000000000000000000000000061','f8140000000000000000000000000062','f8140000000000000000000000000063',
 'Подключить Gemini с безопасным fallback',
 'Использовать Gemini только через сервер, проверять структурированный ответ и не применять предложения автоматически; при недоступности использовать локальную эвристику.',
 150,140,'Gemini подключён как основной внешний провайдер, ключ изолирован в root-only окружении, а отказ провайдера не блокирует работу карточек.'),
('f8140000000000000000000000000071','f8140000000000000000000000000072','f8140000000000000000000000000073',
 'Защитить локальные резервные копии BizFlow',
 'Включить SQLite и вложения в один архив, добавить контрольные суммы, шифрование, пробное восстановление и хранение только на основном сервере.',
 150,145,'Ежедневный backup зашифрован, проверяется после создания и не передаётся на другие серверы или внешние сервисы.'),
('f8140000000000000000000000000081','f8140000000000000000000000000082','f8140000000000000000000000000083',
 'Прогнать desktop и mobile сценарии рабочего процесса',
 'Проверить создание, повторное чтение, длинный текст, исполнение, обсуждение, файлы, фильтры, доску, календарь, модальные слои и закрытие мобильного меню.',
 210,200,'Критические рабочие сценарии проверены тестами и реальным браузером; подтверждённые дефекты исправлены до production-развёртывания.');

INSERT OR IGNORE INTO records(
  id, type, subtype, record_kind, title, description, status,
  author_id, owner_id, priority, workstream, edit_policy, parent_id,
  estimate_minutes, actual_minutes, progress, progress_note, result,
  completed_at, created_at, updated_at
)
SELECT t.record_id, 'task', '', '', t.title, t.description, 'completed',
       u.id, u.id, 'high', 'platform', 'owner_only',
       CASE WHEN EXISTS(SELECT 1 FROM records WHERE id='d004d7e0000000000000000000000001')
            THEN 'd004d7e0000000000000000000000001' ELSE NULL END,
       t.estimate_minutes, t.actual_minutes, 100,
       'Реализация, автоматические тесты, browser QA и production-проверка завершены.',
       t.result,
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM workflow_release_tasks t
JOIN users u ON u.username='artkozk' COLLATE NOCASE;

UPDATE records
SET status='blocked', progress=90, completed_at=NULL,
    progress_note='Интеграция и server-side fallback готовы. Gemini Developer API блокирует IP основного сервера по региону.',
    result='Ключ изолирован в root-only окружении; внешний вызов возвращает FAILED_PRECONDITION по региону, локальный анализ продолжает работать.'
WHERE id='f8140000000000000000000000000061';

INSERT OR IGNORE INTO task_proofs(id, record_id, author_id, kind, content, created_at)
SELECT t.proof_id, t.record_id, u.id, 'text',
       'Проверено: go test ./..., go vet ./..., node --check web/app.js, миграционный dry-run, desktop/mobile browser QA, production health, AI health и восстановимость зашифрованного backup.',
       strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM workflow_release_tasks t
JOIN users u ON u.username='artkozk' COLLATE NOCASE;

INSERT OR IGNORE INTO activity(id, actor_id, entity_type, entity_id, action, details_json, reason, created_at)
SELECT t.activity_id, u.id, 'task', t.record_id,
       CASE WHEN t.record_id='f8140000000000000000000000000061' THEN 'updated' ELSE 'completed' END,
       CASE WHEN t.record_id='f8140000000000000000000000000061'
            THEN '{"status":{"before":"in_progress","after":"blocked"},"workstream":"platform","release":"workflow-comfort-20260814","blocker":"gemini_region"}'
            ELSE '{"status":{"before":"in_progress","after":"completed"},"workstream":"platform","release":"workflow-comfort-20260814"}' END,
       CASE WHEN t.record_id='f8140000000000000000000000000061'
            THEN 'Gemini настроен, но официальный API недоступен из региона основного сервера; активен локальный fallback'
            ELSE 'Функция выпущена и проверена в production' END,
       strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM workflow_release_tasks t
JOIN users u ON u.username='artkozk' COLLATE NOCASE;

UPDATE records
SET title='Подключить внешний AI-провайдер на сервере',
    description='Подключить Gemini через закрытое серверное окружение, валидировать структурированные ответы и сохранить локальный fallback.',
    status='blocked', progress=90, actual_minutes=MAX(actual_minutes, 140),
    progress_note='Server-side интеграция готова; Gemini Developer API отклоняет IP основного сервера по региону.',
    result='Ключ защищён и fallback работает. Для внешней модели нужен официально доступный регион на этом же хосте либо OAuth для Google Enterprise/Vertex.',
    completed_at=NULL, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id='d004d7e0000000000000000000000008';

UPDATE records
SET progress=91,
    progress_note='Рабочий процесс задач, приёмка, Markdown, обсуждения, вложения, повторения, представления и backups выпущены; внешний Gemini заблокирован регионом, fallback активен.',
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id='d004d7e0000000000000000000000001' AND type='goal';

DROP TABLE workflow_release_tasks;
COMMIT;

SELECT 'workflow_release_tasks=' || COUNT(*)
FROM records
WHERE id LIKE 'f814%'
  AND status='completed';
SELECT 'workflow_release_blocked=' || COUNT(*)
FROM records
WHERE id='f8140000000000000000000000000061'
  AND status='blocked';
SELECT 'workflow_release_proofs=' || COUNT(*)
FROM task_proofs
WHERE id LIKE 'f814%';
PRAGMA integrity_check;
SELECT 'foreign_key_violations=' || COUNT(*) FROM pragma_foreign_key_check;
