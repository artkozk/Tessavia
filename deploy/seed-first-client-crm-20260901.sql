PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

-- The first CRM workspace is isolated from the BizFlow product workspace.
INSERT OR IGNORE INTO workspaces(
    id, name, slug, kind, owner_id, delete_policy, description, created_at, updated_at
)
SELECT
    'crm-first-client',
    'CRM',
    'crm-first-client',
    'team',
    id,
    'archive_only',
    'Рабочее пространство первой клиентской интеграции CRM',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM users
WHERE username = 'artkozk' COLLATE NOCASE;

INSERT OR IGNORE INTO workspace_members(workspace_id, user_id, role, status, joined_at)
SELECT 'crm-first-client', id, 'owner', 'active', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM users
WHERE username = 'artkozk' COLLATE NOCASE;

-- Project members are invited explicitly; the product team's partner does not
-- automatically belong to this client CRM.

INSERT OR IGNORE INTO workspace_collections(
    id, workspace_id, name, description, card_label, default_record_type,
    sort_order, created_by, created_at, updated_at
)
SELECT
    'crm-first-board',
    'crm-first-client',
    'CRM',
    'Задачи первой интеграции. Этапы и поля настраиваются командой без разработки.',
    'Задача',
    'task',
    10,
    id,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM users
WHERE username = 'artkozk' COLLATE NOCASE;

INSERT OR IGNORE INTO collection_stages(id, collection_id, name, category, color_key, sort_order, created_at, updated_at) VALUES
    ('crm-stage-backlog',  'crm-first-board', 'BACKLOG',     'backlog', 'red',   10, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    ('crm-stage-open',     'crm-first-board', 'OPEN',        'active',  'amber', 20, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    ('crm-stage-progress', 'crm-first-board', 'IN PROGRESS', 'active',  'blue',  30, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    ('crm-stage-done',     'crm-first-board', 'DONE',        'done',    'green', 40, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO collection_fields(
    id, collection_id, field_key, name, field_type, required, show_on_card,
    sort_order, created_at, updated_at
) VALUES
    ('crm-field-source-number', 'crm-first-board', 'source_number', 'Исходный номер', 'text',   1, 1, 10, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    ('crm-field-kind',          'crm-first-board', 'kind',          'Категория',      'select', 0, 1, 20, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO collection_field_options(
    id, field_id, name, color_key, sort_order, created_at, updated_at
) VALUES
    ('crm-option-bug',     'crm-field-kind', 'BUG',     'red',   10, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    ('crm-option-feature', 'crm-field-kind', 'FEATURE', 'amber', 20, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- Cards visible in the supplied CRM screenshot. Exact assignees can be refined
-- after the client sends the remaining source data; initial ownership is artkozk.
INSERT OR IGNORE INTO records(id, workspace_id, collection_id, stage_id, type, title, description, status, author_id, owner_id, progress, created_at, updated_at)
SELECT 'crm-task-147', 'crm-first-client', 'crm-first-board', 'crm-stage-backlog', 'task', 'Парсинг почты для рассылки', 'Импортировано из исходной CRM-доски.', 'planned', id, id, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM users WHERE username = 'artkozk' COLLATE NOCASE;
INSERT OR IGNORE INTO records(id, workspace_id, collection_id, stage_id, type, title, description, status, author_id, owner_id, progress, created_at, updated_at)
SELECT 'crm-task-146', 'crm-first-client', 'crm-first-board', 'crm-stage-backlog', 'task', 'Добавить статистику активных аккаунтов и ответов по лидам', 'Показывать, сколько аккаунтов живых и неактивных, кто ответил и кто не ответил из лидов.', 'planned', id, id, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM users WHERE username = 'artkozk' COLLATE NOCASE;
INSERT OR IGNORE INTO records(id, workspace_id, collection_id, stage_id, type, title, description, status, author_id, owner_id, progress, created_at, updated_at)
SELECT 'crm-task-138', 'crm-first-client', 'crm-first-board', 'crm-stage-backlog', 'task', 'Интегрировать систему таблиц в CRM', 'Импортировано из исходной CRM-доски.', 'planned', id, id, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM users WHERE username = 'artkozk' COLLATE NOCASE;
INSERT OR IGNORE INTO records(id, workspace_id, collection_id, stage_id, type, title, description, status, author_id, owner_id, progress, created_at, updated_at)
SELECT 'crm-task-137', 'crm-first-client', 'crm-first-board', 'crm-stage-backlog', 'task', 'Сделать выдачу аккаунтов', 'Импортировано из исходной CRM-доски.', 'planned', id, id, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM users WHERE username = 'artkozk' COLLATE NOCASE;
INSERT OR IGNORE INTO records(id, workspace_id, collection_id, stage_id, type, title, description, status, author_id, owner_id, progress, created_at, updated_at)
SELECT 'crm-task-136', 'crm-first-client', 'crm-first-board', 'crm-stage-backlog', 'task', 'Ролевой доступ', 'Импортировано из исходной CRM-доски.', 'planned', id, id, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM users WHERE username = 'artkozk' COLLATE NOCASE;
INSERT OR IGNORE INTO records(id, workspace_id, collection_id, stage_id, type, title, description, status, author_id, owner_id, progress, created_at, updated_at)
SELECT 'crm-task-135', 'crm-first-client', 'crm-first-board', 'crm-stage-open', 'task', 'Решить проблему с блоком аккаунтов', 'Импортировано из исходной CRM-доски.', 'in_progress', id, id, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM users WHERE username = 'artkozk' COLLATE NOCASE;
INSERT OR IGNORE INTO records(id, workspace_id, collection_id, stage_id, type, title, description, status, author_id, owner_id, progress, created_at, updated_at)
SELECT 'crm-task-150', 'crm-first-client', 'crm-first-board', 'crm-stage-progress', 'task', 'Проблема статусов', 'Импортировано из исходной CRM-доски.', 'in_progress', id, id, 35, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM users WHERE username = 'artkozk' COLLATE NOCASE;
INSERT OR IGNORE INTO records(id, workspace_id, collection_id, stage_id, type, title, description, status, author_id, owner_id, progress, created_at, updated_at)
SELECT 'crm-task-149', 'crm-first-client', 'crm-first-board', 'crm-stage-progress', 'task', 'Исследовать задержку отображения неотвеченных лидов', 'Неотвеченные лиды высвечиваются спустя 10–15 минут, иногда дольше.', 'in_progress', id, id, 35, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM users WHERE username = 'artkozk' COLLATE NOCASE;
INSERT OR IGNORE INTO records(id, workspace_id, collection_id, stage_id, type, title, description, status, author_id, owner_id, progress, result, completed_at, created_at, updated_at)
SELECT 'crm-task-144', 'crm-first-client', 'crm-first-board', 'crm-stage-done', 'task', 'Исправить фильтр', 'Импортировано из исходной CRM-доски.', 'completed', id, id, 100, 'Состояние DONE перенесено из исходной CRM.', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM users WHERE username = 'artkozk' COLLATE NOCASE;
INSERT OR IGNORE INTO records(id, workspace_id, collection_id, stage_id, type, title, description, status, author_id, owner_id, progress, result, completed_at, created_at, updated_at)
SELECT 'crm-task-148', 'crm-first-client', 'crm-first-board', 'crm-stage-done', 'task', 'Снять ограничения на отписи', 'Импортировано из исходной CRM-доски.', 'completed', id, id, 100, 'Состояние DONE перенесено из исходной CRM.', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM users WHERE username = 'artkozk' COLLATE NOCASE;

INSERT OR IGNORE INTO record_field_values(record_id, field_id, value_json, updated_by, updated_at)
SELECT record_id, 'crm-field-source-number', '"' || substr(record_id, 10) || '"', id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM users
CROSS JOIN (
    SELECT 'crm-task-147' AS record_id UNION ALL SELECT 'crm-task-146' UNION ALL
    SELECT 'crm-task-138' UNION ALL SELECT 'crm-task-137' UNION ALL
    SELECT 'crm-task-136' UNION ALL SELECT 'crm-task-135' UNION ALL
    SELECT 'crm-task-150' UNION ALL SELECT 'crm-task-149' UNION ALL
    SELECT 'crm-task-144' UNION ALL SELECT 'crm-task-148'
)
WHERE username = 'artkozk' COLLATE NOCASE;

INSERT OR IGNORE INTO record_field_values(record_id, field_id, value_json, updated_by, updated_at)
SELECT record_id, 'crm-field-kind', '"crm-option-bug"', id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM users
CROSS JOIN (
    SELECT 'crm-task-135' AS record_id UNION ALL SELECT 'crm-task-150' UNION ALL
    SELECT 'crm-task-149' UNION ALL SELECT 'crm-task-148'
)
WHERE username = 'artkozk' COLLATE NOCASE;

INSERT OR IGNORE INTO record_field_values(record_id, field_id, value_json, updated_by, updated_at)
SELECT 'crm-task-144', 'crm-field-kind', '"crm-option-feature"', id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM users
WHERE username = 'artkozk' COLLATE NOCASE;

INSERT OR IGNORE INTO task_proofs(id, record_id, author_id, kind, content, created_at)
SELECT 'crm-proof-144', 'crm-task-144', id, 'text', 'Состояние DONE подтверждено исходной CRM-доской при импорте.', strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM users WHERE username = 'artkozk' COLLATE NOCASE;
INSERT OR IGNORE INTO task_proofs(id, record_id, author_id, kind, content, created_at)
SELECT 'crm-proof-148', 'crm-task-148', id, 'text', 'Состояние DONE подтверждено исходной CRM-доской при импорте.', strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM users WHERE username = 'artkozk' COLLATE NOCASE;

INSERT OR IGNORE INTO activity(id, actor_id, entity_type, entity_id, action, details_json, reason, created_at, workspace_id)
SELECT 'crm-seed-activity', id, 'collection', 'crm-first-board', 'imported', '{"records":10,"source":"first-client-crm-screenshot"}', 'Перенос первой клиентской CRM', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'crm-first-client'
FROM users
WHERE username = 'artkozk' COLLATE NOCASE;

COMMIT;
