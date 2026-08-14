PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

UPDATE records
SET title = 'Развитие платформы «BizFlow»',
    progress = CASE WHEN progress < 72 THEN 72 ELSE progress END,
    progress_note = 'AI-контракт, карточки-досье, интерактивная карта, подвижные шаблоны и мобильная полировка выпущены в production.',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'd004d7e0000000000000000000000001';

UPDATE records
SET status = 'blocked',
    actual_minutes = CASE WHEN actual_minutes < 25 THEN 25 ELSE actual_minutes END,
    progress = CASE WHEN progress < 80 THEN 80 ELSE progress END,
    progress_note = 'Server-only интеграция и fallback готовы, но Groq отвечает 403 Forbidden с production IP. До снятия внешней блокировки используется локальный анализ.',
    result = 'Ключ проверен без раскрытия, однако внешний провайдер отклоняет запросы production-сервера. Задача остаётся заблокированной, чтобы не выдавать fallback за работающий Groq.',
    completed_at = NULL,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'd004d7e0000000000000000000000008';

INSERT OR IGNORE INTO records(
  id, type, subtype, record_kind, title, description, status,
  author_id, owner_id, priority, workstream, edit_policy, parent_id,
  estimate_minutes, actual_minutes, progress, progress_note, result,
  completed_at, created_at, updated_at
) VALUES
(
  'a114f100000000000000000000000001', 'task', '', '',
  'Зафиксировать безопасную роль AI и подключить Groq',
  'Определить, какие рекомендации AI допустимы, исключить автоматическое изменение фактов и решений, добавить серверные подсказки структуры и предметный разбор карточки с локальным fallback.',
  'completed',
  (SELECT id FROM users WHERE username='artkozk'),
  (SELECT id FROM users WHERE username='artkozk'),
  'critical', 'platform', 'owner_only', 'd004d7e0000000000000000000000001',
  240, 285, 100,
  'Контракт покрывает создание карточки, анализ существующей работы и извлечение результатов встречи.',
  'AI предлагает приоритет, время, направление, родителя, пробелы, риски, связи и следующие сущности; любое применение требует явного действия основателя.',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
),
(
  'a114f100000000000000000000000002', 'task', '', '',
  'Перевести карточки и контролы в спокойный рабочий режим',
  'Заменить постоянную административную форму на карточку-досье в режиме чтения, добавить адресное редактирование, единые custom select, тёплую палитру, Onest и устойчивую типографическую иерархию.',
  'completed',
  (SELECT id FROM users WHERE username='artkozk'),
  (SELECT id FROM users WHERE username='artkozk'),
  'high', 'platform', 'shared', 'd004d7e0000000000000000000000001',
  300, 330, 100,
  'Карточка читается как рабочее досье; поля появляются только после явного редактирования.',
  'Обновлены бренд BizFlow, палитра, шрифт, пустые состояния, модальные слои, desktop и mobile select-компоненты.',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
),
(
  'a114f100000000000000000000000003', 'task', '', '',
  'Сделать карту и шаблоны физически интерактивными',
  'Переработать семантику и раскладку узлов, подсветку причинной ветки, масштабирование и групповое перемещение потомков; добавить реальное изменение порядка блоков и красную зону удаления.',
  'completed',
  (SELECT id FROM users WHERE username='artkozk'),
  (SELECT id FROM users WHERE username='artkozk'),
  'high', 'platform', 'shared', 'd004d7e0000000000000000000000001',
  330, 370, 100,
  'Позиции графа сохраняются, локальный режим не захватывает соседние ветки, шаблоны двигаются мышью, касанием и клавиатурой.',
  'Карта различает типы сущностей и фокусирует причинную цепочку; блоки шаблона можно переставить, скрыть перетаскиванием и восстановить.',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
),
(
  'a114f100000000000000000000000004', 'task', '', '',
  'Провести desktop и mobile UX-прогон релиза',
  'Проверить обзор, очередь, карточку, кастомные списки, карту, шаблоны, мобильное меню, закрытие слоёв и отсутствие визуальных тупиков в реальном браузере.',
  'completed',
  (SELECT id FROM users WHERE username='artkozk'),
  (SELECT id FROM users WHERE username='artkozk'),
  'high', 'platform', 'shared', 'd004d7e0000000000000000000000001',
  180, 210, 100,
  'Проверены desktop 1280×720 и mobile 390×844; найденные проблемы исправлялись в ходе прогона.',
  'Мобильная панель имеет явное закрытие, backdrop и свайп; карточки и списки не требуют системных select и не обрезают ключевые данные.',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

INSERT OR IGNORE INTO task_proofs(id, record_id, author_id, kind, content, created_at)
SELECT 'a114f10proof00000000000000000001', 'a114f100000000000000000000000001', id, 'text',
  'Серверные контракты Groq и fallback покрыты Go-тестами; секрет отсутствует в Git и клиентских assets.',
  strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM users WHERE username='artkozk';
INSERT OR IGNORE INTO task_proofs(id, record_id, author_id, kind, content, created_at)
SELECT 'a114f10proof00000000000000000002', 'a114f100000000000000000000000002', id, 'text',
  'Режим чтения, адресное редактирование, Onest и custom select проверены скриншотами desktop и mobile.',
  strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM users WHERE username='artkozk';
INSERT OR IGNORE INTO task_proofs(id, record_id, author_id, kind, content, created_at)
SELECT 'a114f10proof00000000000000000003', 'a114f100000000000000000000000003', id, 'text',
  'Проверены локальная и глобальная карта, сохранение раскладки, подсветка ветки и API изменения порядка шаблона.',
  strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM users WHERE username='artkozk';
INSERT OR IGNORE INTO task_proofs(id, record_id, author_id, kind, content, created_at)
SELECT 'a114f10proof00000000000000000004', 'a114f100000000000000000000000004', id, 'text',
  'node --check, go test, go vet и реальный browser QA выполнены; ошибки консоли на проверенных сценариях отсутствуют.',
  strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM users WHERE username='artkozk';
INSERT OR IGNORE INTO task_proofs(id, record_id, author_id, kind, content, created_at)
SELECT 'a114f10proof00000000000000000008', 'd004d7e0000000000000000000000008', id, 'text',
  'GROQ_API_KEY проверен в защищённом server environment: Groq вернул 403 Forbidden с production IP. Значение не выводилось в журналы и документацию; активный сервис оставлен на быстром локальном fallback.',
  strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM users WHERE username='artkozk';

INSERT OR IGNORE INTO activity(id, actor_id, entity_type, entity_id, action, details_json, reason, created_at)
SELECT 'a114f10activity0000000000000001', id, 'goal', 'd004d7e0000000000000000000000001', 'updated',
  '{"title":{"before":"Развитие платформы «Контур»","after":"Развитие платформы «BizFlow»"},"progress":{"before":52,"after":72}}',
  'Название продукта и прогресс обновлены после визуального и AI-релиза', strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users WHERE username='artkozk';
INSERT OR IGNORE INTO activity(id, actor_id, entity_type, entity_id, action, details_json, reason, created_at)
SELECT 'a114f10activity0000000000000008', id, 'task', 'd004d7e0000000000000000000000008', 'updated',
  '{"status":{"before":"planned","after":"blocked"},"workstream":"platform","providerStatus":403}',
  'Интеграция готова, но production IP получил 403 Forbidden от Groq; сохранён локальный fallback', strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users WHERE username='artkozk';
INSERT OR IGNORE INTO activity(id, actor_id, entity_type, entity_id, action, details_json, reason, created_at)
SELECT 'a114f10activity000000000000000' || n, u.id, 'task', 'a114f10000000000000000000000000' || n, 'completed',
  '{"status":{"before":"in_progress","after":"completed"},"workstream":"platform"}',
  'Задача выполнена в AI и visual refinement релизе', strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users u CROSS JOIN (SELECT '1' AS n UNION ALL SELECT '2' UNION ALL SELECT '3' UNION ALL SELECT '4')
WHERE u.username='artkozk';

COMMIT;

SELECT 'refinement_tasks=' || COUNT(*) FROM records WHERE id LIKE 'a114f10%';
SELECT 'refinement_proofs=' || COUNT(*) FROM task_proofs WHERE record_id LIKE 'a114f10%';
SELECT 'groq_task=' || id || '|' || status || '|' || progress FROM records WHERE id='d004d7e0000000000000000000000008';
SELECT 'platform_goal=' || title || '|' || progress FROM records WHERE id='d004d7e0000000000000000000000001';
PRAGMA integrity_check;
SELECT 'foreign_key_violations=' || COUNT(*) FROM pragma_foreign_key_check;
