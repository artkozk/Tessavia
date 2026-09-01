# Production-развёртывание CRM-конструктора BizFlow

Дата: 2 сентября 2026 года по московскому времени.

## Назначение

Выпуск добавляет изолированные команды, настраиваемые доски, этапы, типизированные поля, фильтры и первую клиентскую CRM. Продуктовое поведение описано в `docs/product/BIZFLOW_CONFIGURABLE_CRM_RELEASE_2026_09_02.md`, а серверный контракт — в `docs/architecture/WORKSPACE_CRM_CONSTRUCTOR_CONTRACT_2026_09_02.md`.

## Разрешённая площадка

Развёртывание выполнено только на основном хосте `159.194.231.150`. Публичный адрес: `https://control.e-rd.ru`. Перед SSH-операциями сверен fingerprint:

`SHA256:a4LvCCBB6DSXcbZcq46hJKxln8FCIVCckJBpt9O8Olo`

Другие серверы для binary, production-данных, backup или dry-run не использовались.

## Исходное состояние

До переключения:

- `business-control=active`;
- `nginx=active`;
- local health — `status=ok`;
- предыдущий release — `/opt/business-control/releases/20260901-profile-avatar-553ba5e`;
- asset marker — `20260901-profile-avatar-1`;
- 2 пользователя;
- 57 карточек;
- 17 применённых миграций.

## Локальные проверки

Перед commit выполнены:

1. `go test ./...`;
2. `go vet ./...`;
3. `node --check web/app.js`;
4. `git diff --check`;
5. интеграционные тесты изоляции, ролей, полей, этапов, export и seed;
6. browser-smoke на desktop;
7. browser-smoke `390 × 844`;
8. проверка переключения команды, фильтра `Категория = BUG`, мобильной смены этапа, формы карточки и настроек;
9. проверка `scrollWidth` страницы и диалогов;
10. проверка browser console на warning/error.

Дополнительный `go test -race` на локальной Windows-машине не был запущен: race runtime требует CGO, а в PATH нет `gcc`. Это не заменяет и не отменяет прошедшие обычные и интеграционные тесты.

## Сборка и release

- commit: `bee87fd`;
- branch: `main`;
- push в `origin/main` выполнен до production-операций;
- release: `/opt/business-control/releases/20260902-crm-bee87fd`;
- binary: `/opt/business-control/releases/20260902-crm-bee87fd/business-control`;
- SHA-256: `9b457bf3da2b68f056cd696d42dfccd1d18065897135f6feedb5d63ac1257aec`;
- mode binary: `0755`;
- asset marker: `20260902-crm-constructor-1`.

Linux AMD64 binary собран с `CGO_ENABLED=0`, `-trimpath`, `-ldflags="-s -w"`. SHA-256 совпал локально и после загрузки. До переключения выполнен `runuser -u business-control -- test -x <binary>`.

## Резервная копия

Согласованный backup создан до dry-run и переключения:

`/var/lib/business-control/backups/pre-crm-20260901T212247Z`

Содержимое:

- согласованная SQLite-копия `business-control.db`;
- `uploads.tar.gz`;
- `SHA256SUMS`;
- `previous-release.txt`;
- `candidate-commit.txt`.

Контрольные суммы:

- DB: `0a1f373f79147bfc734dd66874577b6c128cf529bd29cb66626b195b515ba7e7`;
- uploads: `812234352e59cf0271b813769bdf2072402e861c84c54dc78fb175371db1358e`.

На backup `integrity_check=ok`, `foreign_key_check=0`.

## Dry-run на копии

Кандидат запущен под системным пользователем `business-control` на `127.0.0.1:18534`, копии backup-БД и отдельном каталоге uploads. Production в это время обслуживал предыдущий release.

Первый запус dry-run не создал log и PID: родительский каталог принадлежал root. Кандидат не начал работу, production не менялся. Права точечно исправлены, после чего dry-run прошёл.

Подтверждены:

- health `status=ok`;
- marker `20260902-crm-constructor-1`;
- миграция `018_workspace_crm_constructor.sql`;
- пять новых таблиц и три поля границы в `records`;
- сохранение 2 пользователей и 57 карточек;
- двукратный seed без дубликатов;
- счётчики seed `1 workspace, 2 members, 1 collection, 4 stages, 2 fields, 10 records, 2 completed`;
- 0 невалидных JSON-значений;
- `integrity_check=ok`;
- `foreign_key_check=0`.

Процесс и временные dry-run данные удалены после production-smoke.

## Production-переключение

1. Исполнимость binary от service user подтверждена.
2. `business-control` остановлен.
3. `/opt/business-control/current` атомарно переключён на `/opt/business-control/releases/20260902-crm-bee87fd`.
4. Сервис запущен, migration 018 применена.
5. До импорта CRM проверены local health и marker. При ошибке скрипт должен был вернуть предыдущий symlink; rollback не потребовался.
6. Идемпотентный seed применён к production-БД.

После переключения:

- `business-control=active`;
- `nginx=active`;
- local/public health `status=ok`;
- local/public marker `20260902-crm-constructor-1`;
- migration 018 — одна применённая запись;
- основное пространство сохранило 57 карточек до самодокументирующей задачи;
- CRM получила 10 изолированных карточек;
- 2 CRM-карточки завершены с 100%;
- `integrity_check=ok`;
- `foreign_key_check=0`;
- в журнале после переключения нет `panic`, `fatal`, `migration error` и `database is locked`.

## Авторизованный smoke

Через краткоживущую техническую сессию `artkozk` проверены:

- `/api/me`;
- три доступных workspace: личное, основная команда и CRM;
- в CRM — 2 участника, 1 доска, 4 этапа, 2 поля, 10 карточек;
- в CRM-ответе нет карточек другого workspace;
- в основном ответе нет CRM-карточек;
- JSON export CRM имеет `schemaVersion=11`, 10 records и только `workspace_id=crm-first-client`;
- AI health: `source=gemini`, `providerAvailable=true`, `model=gemini-2.5-flash`.

Техническая сессия удалена автоматически сразу после smoke.

## Самодокументирование в BizFlow

В основной учётной записи создана и завершена задача:

- ID: `bee87fd0000000000000000000000001`;
- название: `Добавить конструктор CRM и перенести первую доску`;
- родитель: `Развить BizFlow в личный и командный ассистент`;
- статус: `completed`;
- прогресс: `100`;
- доказательство содержит commit, test, browser, release, SHA-256 и backup.

Прогресс родителя поднят с 30% до 45%. Родитель оставлен `in_progress`: полное управление участниками, импорты и no-code автоматизации ещё не завершены.

После самодокументирования production содержит 58 карточек в `bizflow-team` и 10 в `crm-first-client`.

## Rollback

Миграция 018 только добавляет колонки, таблицы и индексы, но production уже содержит карточки двух команд. Предыдущий binary не фильтровал данные по workspace. Поэтому после seed нельзя просто вернуть symlink на старый release: старый UI может смешать карточки.

Порядок реакции:

1. Для ошибки бизнес-логики предпочтителен forward-fix на текущем binary.
2. При серьёзной ошибке сервис переводится в режим обслуживания, чтобы не допустить смешивания данных.
3. Если forward-fix невозможен, откат к `/opt/business-control/releases/20260901-profile-avatar-553ba5e` выполняется только вместе с восстановлением pre-CRM backup.
4. Восстановление backup удалит все изменения после `2026-09-01T21:22:47Z`, поэтому требует отдельного осознанного решения и предварительного экспорта послерелизных данных.
5. После любого варианта обязательны local/public health, marker, `integrity_check`, `foreign_key_check` и авторизованная проверка границ workspace.

Откат в ходе этого развёртывания не потребовался.
