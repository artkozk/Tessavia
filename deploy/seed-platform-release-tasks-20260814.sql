PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

INSERT OR IGNORE INTO records(
  id, type, subtype, record_kind, title, description, status,
  author_id, owner_id, priority, workstream, edit_policy, is_root,
  estimate_minutes, actual_minutes, progress, progress_note, result,
  created_at, updated_at
) VALUES (
  'd004d7e0000000000000000000000001', 'goal', '', '',
  'Развитие платформы «Контур»',
  'Отдельная корневая ветка для разработки самой платформы. Она не смешивается с задачами по построению бизнеса.',
  'in_progress',
  (SELECT id FROM users WHERE username = 'artkozk'),
  (SELECT id FROM users WHERE username = 'artkozk'),
  'high', 'platform', 'owner_only', 1,
  0, 0, 35, 'Базовый связанный контур запущен в production.', '',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

INSERT OR IGNORE INTO records(id, type, subtype, record_kind, title, description, status, author_id, owner_id, priority, workstream, edit_policy, parent_id, estimate_minutes, actual_minutes, progress, progress_note, result, completed_at, created_at, updated_at)
VALUES
('d004d7e0000000000000000000000002', 'task', '', '', 'Объединить рабочую очередь и глобальный поиск', 'Собрать задачи, вопросы, исследования, решения, разногласия и встречи в одной очереди; искать также по вопросам, ответам и итогам.', 'completed', (SELECT id FROM users WHERE username='artkozk'), (SELECT id FROM users WHERE username='artkozk'), 'high', 'platform', 'shared', 'd004d7e0000000000000000000000001', 180, 210, 100, 'Реализовано и проверено на desktop и mobile.', 'Единая очередь и глобальный полнотекстовый поиск работают в production.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('d004d7e0000000000000000000000003', 'task', '', '', 'Построить интерактивную карту связей', 'Показать карточки, вопросы, ответы, совместные итоги, причинные и иерархические связи с быстрым переходом.', 'completed', (SELECT id FROM users WHERE username='artkozk'), (SELECT id FROM users WHERE username='artkozk'), 'high', 'platform', 'shared', 'd004d7e0000000000000000000000001', 240, 260, 100, 'Карта проверена визуально на двух viewport.', 'Cytoscape-карта работает локально без CDN, поддерживает поиск, фильтры и локальный режим.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('d004d7e0000000000000000000000004', 'task', '', '', 'Добавить права, направления и иерархию карточек', 'Разделить личные и общие карточки, бизнес и разработку платформы, добавить родителя и продвижение в новый корень.', 'completed', (SELECT id FROM users WHERE username='artkozk'), (SELECT id FROM users WHERE username='artkozk'), 'critical', 'platform', 'shared', 'd004d7e0000000000000000000000001', 240, 280, 100, 'Права защищены backend и объяснены интерфейсом.', 'Личные карточки защищены, общие доступны команде, циклы иерархии запрещены.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('d004d7e0000000000000000000000005', 'task', '', '', 'Добавить активность пользователей и точность оценок', 'Показывать активное взаимодействие с платформой, действия, завершённые карточки и сравнение фактического времени с планом.', 'completed', (SELECT id FROM users WHERE username='artkozk'), (SELECT id FROM users WHERE username='artkozk'), 'normal', 'platform', 'shared', 'd004d7e0000000000000000000000001', 180, 180, 100, 'Heartbeat не считает простаивающую вкладку.', 'Профили активности и поля план/факт доступны участникам.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('d004d7e0000000000000000000000006', 'task', '', '', 'Оптимизировать карточки и мобильный UX', 'Ускорить основное открытие карточки, лениво загружать связи, исправить мобильное меню, диалоги и горизонтальное переполнение.', 'completed', (SELECT id FROM users WHERE username='artkozk'), (SELECT id FROM users WHERE username='artkozk'), 'high', 'platform', 'shared', 'd004d7e0000000000000000000000001', 240, 260, 100, 'Пройдены desktop 1440x900 и mobile 390x844.', 'Карточки открываются с мгновенным loading-state, связи загружаются отдельно, mobile-сценарии доступны без тупиков.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('d004d7e0000000000000000000000007', 'task', '', '', 'Добавить безопасные ИИ-подсказки структуры карточки', 'Предлагать приоритет, направление и родителя, не перезаписывая ручной выбор пользователя; обеспечить fallback без внешнего сервиса.', 'completed', (SELECT id FROM users WHERE username='artkozk'), (SELECT id FROM users WHERE username='artkozk'), 'normal', 'platform', 'shared', 'd004d7e0000000000000000000000001', 180, 170, 100, 'Groq-ready endpoint и локальная эвристика готовы.', 'Автоподсказка работает без ключа; при наличии GROQ_API_KEY автоматически использует Groq.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('d004d7e0000000000000000000000008', 'task', '', '', 'Настроить секрет GROQ_API_KEY на сервере', 'Создать ключ в консоли Groq, передать его безопасным каналом и добавить только в server environment. Не публиковать ключ в карточках, браузере или Git.', 'planned', (SELECT id FROM users WHERE username='artkozk'), (SELECT id FROM users WHERE username='artkozk'), 'normal', 'platform', 'owner_only', 'd004d7e0000000000000000000000001', 20, 0, 0, '', '', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO task_proofs(id, record_id, author_id, kind, content, created_at)
SELECT 'd004d7eproof00000000000000000002', 'd004d7e0000000000000000000000002', id, 'text', 'Интеграционные тесты и браузерный прогон единой очереди и глобального поиска пройдены.', strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM users WHERE username='artkozk';
INSERT OR IGNORE INTO task_proofs(id, record_id, author_id, kind, content, created_at)
SELECT 'd004d7eproof00000000000000000003', 'd004d7e0000000000000000000000003', id, 'text', 'Граф содержит реальные узлы и рёбра; desktop и mobile canvas визуально проверены.', strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM users WHERE username='artkozk';
INSERT OR IGNORE INTO task_proofs(id, record_id, author_id, kind, content, created_at)
SELECT 'd004d7eproof00000000000000000004', 'd004d7e0000000000000000000000004', id, 'text', 'Тесты прав, циклов и продвижения в новый корень пройдены.', strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM users WHERE username='artkozk';
INSERT OR IGNORE INTO task_proofs(id, record_id, author_id, kind, content, created_at)
SELECT 'd004d7eproof00000000000000000005', 'd004d7e0000000000000000000000005', id, 'text', 'Профиль показывает heartbeat, действия, завершённые карточки и план/факт.', strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM users WHERE username='artkozk';
INSERT OR IGNORE INTO task_proofs(id, record_id, author_id, kind, content, created_at)
SELECT 'd004d7eproof00000000000000000006', 'd004d7e0000000000000000000000006', id, 'text', 'Проверены формы, диалоги, меню, закрытие по backdrop и отсутствие горизонтального переполнения.', strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM users WHERE username='artkozk';
INSERT OR IGNORE INTO task_proofs(id, record_id, author_id, kind, content, created_at)
SELECT 'd004d7eproof00000000000000000007', 'd004d7e0000000000000000000000007', id, 'text', 'Локальная классификация и Groq-ready серверный контракт покрыты тестами.', strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM users WHERE username='artkozk';

INSERT OR IGNORE INTO activity(id, actor_id, entity_type, entity_id, action, details_json, reason, created_at)
SELECT 'd004d7eactivity00000000000000001', id, 'goal', 'd004d7e0000000000000000000000001', 'created', '{"title":"Развитие платформы «Контур»","workstream":"platform"}', 'Создана отдельная ветка разработки платформы', strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM users WHERE username='artkozk';

INSERT OR IGNORE INTO activity(id, actor_id, entity_type, entity_id, action, details_json, reason, created_at)
SELECT 'd004d7eactivity0000000000000000' || n, u.id, 'task', 'd004d7e000000000000000000000000' || n, CASE WHEN n = '8' THEN 'created' ELSE 'completed' END, CASE WHEN n = '8' THEN '{"title":"Настроить секрет GROQ_API_KEY на сервере","workstream":"platform"}' ELSE '{"status":{"before":"in_progress","after":"completed"},"workstream":"platform"}' END, CASE WHEN n = '8' THEN 'Для внешней модели нужен секретный ключ владельца' ELSE 'Работа выполнена в релизе d004d7e' END, strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users u CROSS JOIN (SELECT '2' AS n UNION ALL SELECT '3' UNION ALL SELECT '4' UNION ALL SELECT '5' UNION ALL SELECT '6' UNION ALL SELECT '7' UNION ALL SELECT '8')
WHERE u.username='artkozk';

COMMIT;

SELECT 'platform_records=' || COUNT(*) FROM records WHERE workstream='platform';
SELECT 'completed_platform_tasks=' || COUNT(*) FROM records WHERE type='task' AND workstream='platform' AND status='completed';
SELECT 'pending_platform_tasks=' || COUNT(*) FROM records WHERE type='task' AND workstream='platform' AND status='planned';
