PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

CREATE TEMP TABLE release_research_target AS
SELECT r.id AS record_id, u.id AS actor_id
FROM records r
JOIN users u ON u.username = 'artkozk' COLLATE NOCASE
WHERE r.type = 'research'
  AND trim(r.title) = 'Выбор сервера' COLLATE NOCASE
  AND r.archived_at IS NULL
ORDER BY r.updated_at DESC
LIMIT 1;

INSERT INTO research_option_fields(
  id, record_id, name, field_type, sort_order, active, created_by, created_at, updated_at
)
SELECT field_id, t.record_id, field_name, field_type, sort_order, 1, t.actor_id,
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM release_research_target t
CROSS JOIN (
  SELECT 'c214f200000000000000000000000001' AS field_id, 'Цена в месяц' AS field_name, 'number' AS field_type, 10 AS sort_order
  UNION ALL SELECT 'c214f200000000000000000000000002', 'Конфигурация', 'text', 20
  UNION ALL SELECT 'c214f200000000000000000000000003', 'Локация', 'text', 30
  UNION ALL SELECT 'c214f200000000000000000000000004', 'Надёжность', 'rating', 40
  UNION ALL SELECT 'c214f200000000000000000000000005', 'Удобство управления', 'rating', 50
) defaults
WHERE NOT EXISTS (
  SELECT 1 FROM research_option_fields f
  WHERE f.record_id = t.record_id AND trim(f.name) = defaults.field_name COLLATE NOCASE
);

INSERT INTO research_options(
  id, record_id, title, summary_md, pros_md, cons_md, notes_md, rating,
  sort_order, status, created_by, updated_by, created_at, updated_at
)
SELECT option_id, t.record_id, option_title, '', '', '', '', 0,
       sort_order, 'active', t.actor_id, t.actor_id,
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM release_research_target t
CROSS JOIN (
  SELECT 'c214f200000000000000000000000011' AS option_id, 'Begget' AS option_title, 10 AS sort_order
  UNION ALL SELECT 'c214f200000000000000000000000012', 'Timeweb Cloud', 20
) defaults
WHERE NOT EXISTS (
  SELECT 1 FROM research_options o
  WHERE o.record_id = t.record_id AND trim(o.title) = defaults.option_title COLLATE NOCASE
);

INSERT OR IGNORE INTO activity(id, actor_id, entity_type, entity_id, action, details_json, reason, created_at)
SELECT 'c214f200000000000000000000000021', actor_id, 'research', record_id,
       'research_field_created',
       '{"name":"Поля сравнения серверов","releaseSeed":true}',
       'Добавлена единая структура сравнения вариантов исследования',
       strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM release_research_target;

INSERT OR IGNORE INTO activity(id, actor_id, entity_type, entity_id, action, details_json, reason, created_at)
SELECT 'c214f200000000000000000000000022', actor_id, 'research', record_id,
       'research_option_created',
       '{"title":"Begget и Timeweb Cloud","rating":0,"releaseSeed":true}',
       'Существующее исследование переведено на карточки вариантов без выдуманных оценок',
       strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM release_research_target;

INSERT OR IGNORE INTO records(
  id, type, subtype, record_kind, title, description, status,
  author_id, owner_id, priority, workstream, edit_policy, parent_id,
  estimate_minutes, actual_minutes, progress, progress_note, result,
  completed_at, created_at, updated_at
)
SELECT
  'c214f200000000000000000000000031', 'task', '', '',
  'Добавить сравнение вариантов исследования и Markdown',
  'Создать подсущности вариантов с едиными полями, оценкой, плюсами, минусами и Markdown; разделить чтение и редактирование карточки; устранить скачок формы и довести карту связей.',
  'completed', id, id, 'critical', 'platform', 'owner_only',
  CASE WHEN EXISTS(SELECT 1 FROM records WHERE id='d004d7e0000000000000000000000001')
       THEN 'd004d7e0000000000000000000000001' ELSE NULL END,
  300, 330, 100,
  'API, интерфейс, поиск, история, граф, mobile UX и миграция существующего исследования завершены.',
  'В исследовании доступны листаемые карточки вариантов, безопасный Markdown и отдельный режим редактирования. Production развёрнут с backup и smoke-проверкой.',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users
WHERE username='artkozk' COLLATE NOCASE;

INSERT OR IGNORE INTO task_proofs(id, record_id, author_id, kind, content, created_at)
SELECT 'c214f200000000000000000000000032', 'c214f200000000000000000000000031', id, 'text',
       'Go-тесты, статическая проверка JavaScript, desktop/mobile browser QA, SQLite dry-run и production smoke выполнены.',
       strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users
WHERE username='artkozk' COLLATE NOCASE;

INSERT OR IGNORE INTO activity(id, actor_id, entity_type, entity_id, action, details_json, reason, created_at)
SELECT 'c214f200000000000000000000000033', id, 'task', 'c214f200000000000000000000000031',
       'completed',
       '{"status":{"before":"in_progress","after":"completed"},"workstream":"platform"}',
       'Срочный сценарий исследования выпущен и проверен',
       strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users
WHERE username='artkozk' COLLATE NOCASE;

INSERT OR IGNORE INTO records(
  id, type, subtype, record_kind, title, description, status,
  author_id, owner_id, priority, workstream, edit_policy, parent_id,
  estimate_minutes, actual_minutes, progress, progress_note, result,
  completed_at, created_at, updated_at
)
SELECT
  'c314f300000000000000000000000031', 'task', '', '',
  'Добавить горячие клавиши Markdown-редактора',
  'Поддержать полужирный текст, курсив, ссылки, код, заголовки, списки, цитаты и сохранение с клавиатуры; не допустить перехвата Ctrl+K глобальным поиском внутри редактора.',
  'completed', id, id, 'high', 'platform', 'owner_only',
  CASE WHEN EXISTS(SELECT 1 FROM records WHERE id='d004d7e0000000000000000000000001')
       THEN 'd004d7e0000000000000000000000001' ELSE NULL END,
  60, 55, 100,
  'Сочетания используют KeyboardEvent.code и работают при русской и английской раскладке.',
  'Горячие клавиши Markdown проверены в реальном браузере; Ctrl+K внутри редактора создаёт ссылку и не открывает глобальный поиск.',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users
WHERE username='artkozk' COLLATE NOCASE;

INSERT OR IGNORE INTO task_proofs(id, record_id, author_id, kind, content, created_at)
SELECT 'c314f300000000000000000000000032', 'c314f300000000000000000000000031', id, 'text',
       'Проверены Ctrl+B, Ctrl+I, Ctrl+K, Ctrl+`, заголовки, списки, цитата, повторное снятие форматирования и Ctrl+Enter без ошибок консоли.',
       strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users
WHERE username='artkozk' COLLATE NOCASE;

INSERT OR IGNORE INTO activity(id, actor_id, entity_type, entity_id, action, details_json, reason, created_at)
SELECT 'c314f300000000000000000000000033', id, 'task', 'c314f300000000000000000000000031',
       'completed',
       '{"status":{"before":"in_progress","after":"completed"},"workstream":"platform"}',
       'Горячие клавиши Markdown выпущены и проверены',
       strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users
WHERE username='artkozk' COLLATE NOCASE;

INSERT OR IGNORE INTO records(
  id, type, subtype, record_kind, title, description, status,
  author_id, owner_id, priority, workstream, edit_policy, parent_id,
  estimate_minutes, actual_minutes, progress, progress_note, result,
  completed_at, created_at, updated_at
)
SELECT
  'c414f400000000000000000000000031', 'task', '', '',
  'Исправить связи сравнения и горизонтальное управление',
  'Сделать сравнение самостоятельным сценарием создания, показать варианты как внутренние связи, исправить обрезанное меню выбора и добавить прокрутку горизонтальных областей перетаскиванием без выделения текста.',
  'completed', id, id, 'critical', 'platform', 'owner_only',
  CASE WHEN EXISTS(SELECT 1 FROM records WHERE id='d004d7e0000000000000000000000001')
       THEN 'd004d7e0000000000000000000000001' ELSE NULL END,
  180, 175, 100,
  'Компоненты исправлены на общем уровне, поэтому поведение одинаково в карточке, очереди, Markdown-панели, графе и на мобильном экране.',
  'Сравнение создаётся из общего меню и очереди; варианты отражаются во вкладке связей; select не обрезается; горизонтальные области прокручиваются drag-жестом.',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users
WHERE username='artkozk' COLLATE NOCASE;

INSERT OR IGNORE INTO task_proofs(id, record_id, author_id, kind, content, created_at)
SELECT 'c414f400000000000000000000000032', 'c414f400000000000000000000000031', id, 'text',
       'Go-тест проверяет структурные связи исследования; browser QA проверяет desktop/mobile select, переход к варианту и drag-scroll без выделения текста; production проходит backup и smoke.',
       strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users
WHERE username='artkozk' COLLATE NOCASE;

INSERT OR IGNORE INTO activity(id, actor_id, entity_type, entity_id, action, details_json, reason, created_at)
SELECT 'c414f400000000000000000000000033', id, 'task', 'c414f400000000000000000000000031',
       'completed',
       '{"status":{"before":"in_progress","after":"completed"},"workstream":"platform"}',
       'Сценарий сравнения и общие интерактивные компоненты выпущены и проверены',
       strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users
WHERE username='artkozk' COLLATE NOCASE;

DROP TABLE release_research_target;
COMMIT;

SELECT 'release_task=' || COUNT(*)
FROM records
WHERE id='c214f200000000000000000000000031' AND status='completed';
SELECT 'shortcut_task=' || COUNT(*)
FROM records
WHERE id='c314f300000000000000000000000031' AND status='completed';
SELECT 'comparison_ux_task=' || COUNT(*)
FROM records
WHERE id='c414f400000000000000000000000031' AND status='completed';
SELECT 'research_fields=' || COUNT(*)
FROM research_option_fields f
JOIN records r ON r.id=f.record_id
WHERE r.type='research' AND trim(r.title)='Выбор сервера' COLLATE NOCASE AND f.active=1;
SELECT 'research_options=' || COUNT(*)
FROM research_options o
JOIN records r ON r.id=o.record_id
WHERE r.type='research' AND trim(r.title)='Выбор сервера' COLLATE NOCASE AND o.status='active';
PRAGMA integrity_check;
SELECT 'foreign_key_violations=' || COUNT(*) FROM pragma_foreign_key_check;
