PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

UPDATE records
SET progress = CASE WHEN progress < 52 THEN 52 ELSE progress END,
    progress_note = 'Автономный UX-аудит, единая рабочая навигация и мобильный граф запущены в production.',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'd004d7e0000000000000000000000001';

INSERT OR IGNORE INTO records(
  id, type, subtype, record_kind, title, description, status,
  author_id, owner_id, priority, workstream, edit_policy, parent_id,
  estimate_minutes, actual_minutes, progress, progress_note, result,
  completed_at, created_at, updated_at
) VALUES
(
  'c425d660000000000000000000000001', 'task', '', '',
  'Провести автономный аудит интерфейса без списка замечаний',
  'Пройти основные сценарии как главный пользователь на desktop и mobile, самостоятельно найти логические тупики, дубли, бесполезные блоки и визуальные дефекты, затем исправить подтверждённые P1–P2.',
  'completed',
  (SELECT id FROM users WHERE username='artkozk'),
  (SELECT id FROM users WHERE username='artkozk'),
  'critical', 'platform', 'owner_only', 'd004d7e0000000000000000000000001',
  240, 255, 100,
  'Проверены обзор, очередь, вопросы, история, профиль, пустые списки и граф на 1440x900 и 390x844.',
  'Оформлен постоянный промпт аудита и реализованы найденные проблемы навигации, карточек и мобильной работы.',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
),
(
  'c425d660000000000000000000000002', 'task', '', '',
  'Упростить единую очередь и показать иерархию без графа',
  'Убрать дублирующие разделы работы, собрать редкие фильтры в одну панель, стабилизировать локальный поиск и добавить порядок по родительским веткам.',
  'completed',
  (SELECT id FROM users WHERE username='artkozk'),
  (SELECT id FROM users WHERE username='artkozk'),
  'high', 'platform', 'shared', 'd004d7e0000000000000000000000001',
  150, 165, 100,
  'Очередь показывает всю работу, исполнителя, тип, направление, приоритет, статус и родительский контекст.',
  'Фильтры больше не занимают три ряда; встречи, исследования, решения и разногласия работают как типы одной очереди.',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
),
(
  'c425d660000000000000000000000003', 'task', '', '',
  'Доработать карточки, историю и мобильную карту',
  'Показать срок и приоритет вопросов, отделить доступ от исполнения, сделать события истории предметными, добавить пагинацию и исправить вписывание Cytoscape на мобильном.',
  'completed',
  (SELECT id FROM users WHERE username='artkozk'),
  (SELECT id FROM users WHERE username='artkozk'),
  'high', 'platform', 'shared', 'd004d7e0000000000000000000000001',
  210, 225, 100,
  'API карточки измерен, граф и панели проверены в реальном браузере.',
  'Вопросы управляются как работа, история загружается по требованию, мобильная карта показывает всю сеть связей.',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

INSERT OR IGNORE INTO task_proofs(id, record_id, author_id, kind, content, created_at)
SELECT 'c425d66proof00000000000000000001', 'c425d660000000000000000000000001', id, 'text',
  'Автономный промпт, подробный отчёт аудита, go test, go vet, node --check и браузерный QA сохранены в релизе c425d66.',
  strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM users WHERE username='artkozk';
INSERT OR IGNORE INTO task_proofs(id, record_id, author_id, kind, content, created_at)
SELECT 'c425d66proof00000000000000000002', 'c425d660000000000000000000000002', id, 'text',
  'Desktop и mobile очередь проверены: поиск сохраняет фокус, фильтры закрываются по фону и кнопке, иерархия доступна отдельным порядком.',
  strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM users WHERE username='artkozk';
INSERT OR IGNORE INTO task_proofs(id, record_id, author_id, kind, content, created_at)
SELECT 'c425d66proof00000000000000000003', 'c425d660000000000000000000000003', id, 'text',
  'Карточка вопросов, история, событие, профиль и Cytoscape canvas проверены на 390x844; основной API карточки отвечает в среднем за 8,46 мс локально.',
  strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM users WHERE username='artkozk';

INSERT OR IGNORE INTO activity(id, actor_id, entity_type, entity_id, action, details_json, reason, created_at)
SELECT 'c425d66activity0000000000000001', id, 'task', 'c425d660000000000000000000000001', 'completed',
  '{"status":{"before":"in_progress","after":"completed"},"workstream":"platform"}',
  'Автономный аудит и реализация подтверждены тестами и браузерным прогоном', strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users WHERE username='artkozk';
INSERT OR IGNORE INTO activity(id, actor_id, entity_type, entity_id, action, details_json, reason, created_at)
SELECT 'c425d66activity0000000000000002', id, 'task', 'c425d660000000000000000000000002', 'completed',
  '{"status":{"before":"in_progress","after":"completed"},"workstream":"platform"}',
  'Единая очередь и иерархия реализованы в релизе c425d66', strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users WHERE username='artkozk';
INSERT OR IGNORE INTO activity(id, actor_id, entity_type, entity_id, action, details_json, reason, created_at)
SELECT 'c425d66activity0000000000000003', id, 'task', 'c425d660000000000000000000000003', 'completed',
  '{"status":{"before":"in_progress","after":"completed"},"workstream":"platform"}',
  'Карточки, история и мобильная карта исправлены в релизе c425d66', strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users WHERE username='artkozk';

COMMIT;

SELECT 'audit_tasks=' || COUNT(*) FROM records WHERE id LIKE 'c425d66%';
SELECT 'audit_proofs=' || COUNT(*) FROM task_proofs WHERE record_id LIKE 'c425d66%';
SELECT 'platform_goal_progress=' || progress FROM records WHERE id='d004d7e0000000000000000000000001';
PRAGMA integrity_check;
SELECT 'foreign_key_violations=' || COUNT(*) FROM pragma_foreign_key_check;
