PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

INSERT OR IGNORE INTO records(
    id, workspace_id, type, title, description, status, author_id, owner_id,
    priority, workstream, edit_policy, parent_id, estimate_minutes,
    actual_minutes, progress, progress_note, result, completed_at, created_at, updated_at
)
SELECT
    'a9020000000000000000000000000001', 'bizflow-team', 'task',
    'Разделить команду на проекты и права доступа',
    'Добавить команды с несколькими проектами, роли владельца, администратора и участника, приглашения по ссылке, коду и юзернейму, проектную изоляцию CRM, персонализацию главной и устойчивое мобильное отображение.',
    'completed', id, id, 'critical', 'platform', 'owner_only',
    (SELECT id FROM records WHERE workspace_id = 'bizflow-team' AND type = 'goal' AND workstream = 'platform' ORDER BY is_root DESC, created_at LIMIT 1),
    420, 455, 100,
    'Роли и приглашения проверены интеграционными тестами; desktop и mobile прошли визуальную проверку.',
    'Команда BizFlow содержит изолированные проекты. CRM первой интеграции перенесена внутрь команды. Доступ можно выдать по проекту, ссылке, одноразовому коду или юзернейму. Настройки интерфейса личные для пользователя и проекта.',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM users WHERE username = 'artkozk' COLLATE NOCASE;

INSERT OR IGNORE INTO records(
    id, workspace_id, type, title, description, status, author_id, owner_id,
    priority, workstream, edit_policy, parent_id, estimate_minutes,
    actual_minutes, progress, progress_note, result, created_at, updated_at
)
SELECT
    'a9020000000000000000000000000002', 'bizflow-team', 'task',
    'Подключить доставку кодов и восстановление доступа',
    'Заменить тестовый показ кода регистрации на доставку по подтверждённой почте, добавить повторную отправку, восстановление пароля и журнал защитных событий.',
    'planned', id, id, 'high', 'platform', 'owner_only',
    'a9020000000000000000000000000001', 240, 0, 0, '', '',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM users WHERE username = 'artkozk' COLLATE NOCASE;

INSERT OR IGNORE INTO records(
    id, workspace_id, type, title, description, status, author_id, owner_id,
    priority, workstream, edit_policy, parent_id, estimate_minutes,
    actual_minutes, progress, progress_note, result, created_at, updated_at
)
SELECT
    'a9020000000000000000000000000003', 'bizflow-team', 'task',
    'Публиковать шаблоны персонализации',
    'Позволить сохранить расположение блоков, видимость разделов и рабочие правила как версионируемый шаблон, поделиться им ссылкой и применить одним кликом с предварительным просмотром.',
    'planned', id, id, 'normal', 'platform', 'shared',
    'a9020000000000000000000000000001', 300, 0, 0, '', '',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM users WHERE username = 'artkozk' COLLATE NOCASE;

INSERT OR IGNORE INTO records(
    id, workspace_id, type, title, description, status, author_id, owner_id,
    priority, workstream, edit_policy, parent_id, estimate_minutes,
    actual_minutes, progress, progress_note, result, created_at, updated_at
)
SELECT
    'a9020000000000000000000000000004', 'bizflow-team', 'task',
    'Спроектировать приватность отдельных карточек',
    'Добавить ограниченный список читателей карточки только после сквозного применения прав к поиску, графу, связям, файлам, чату, экспорту, уведомлениям и AI-контексту. До этого закрытая работа ведётся в отдельном проекте.',
    'planned', id, id, 'high', 'platform', 'owner_only',
    'a9020000000000000000000000000001', 420, 0, 0, '', '',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM users WHERE username = 'artkozk' COLLATE NOCASE;

INSERT OR IGNORE INTO task_proofs(id, record_id, author_id, kind, content, created_at)
SELECT 'a902proof00000000000000000000001', 'a9020000000000000000000000000001', id, 'text',
       'Пройдены go test ./..., go vet ./..., проверка JavaScript и адаптивные сценарии 1440x900, 390x844 и 360x800.',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM users WHERE username = 'artkozk' COLLATE NOCASE;

INSERT OR IGNORE INTO activity(id, actor_id, entity_type, entity_id, action, details_json, reason, created_at, workspace_id)
SELECT 'a902activity0000000000000000001', id, 'task', 'a9020000000000000000000000000001', 'completed',
       '{"teamProjects":true,"projectAccess":true,"inviteLink":true,"inviteCode":true,"usernameInvite":true,"registrationChallenge":true,"interfacePreferences":true,"mobileSafeArea":true}',
       'Выпуск команд, проектов, прав доступа и персонализации',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'bizflow-team'
FROM users WHERE username = 'artkozk' COLLATE NOCASE;

COMMIT;
