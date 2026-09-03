# Развёртывание аватаров профиля BizFlow

Дата: 1 сентября 2026 года.

## Назначение

Выпуск добавляет проверяемую загрузку, замену и удаление аватара, единое отображение фото в командных интерфейсах и ограничение публичного профиля участниками общих активных пространств.

Пользовательское поведение описано в `docs/product/BIZFLOW_PROFILE_AVATAR_RELEASE_2026_09_01.md`, серверный контракт — в `docs/architecture/PROFILE_AVATAR_SECURITY_CONTRACT_2026_09_01.md`.

## Разрешённая площадка

Развёртывание выполнено только на `159.194.231.150`. Публичная точка входа: `https://control.e-rd.ru`. Перед каждой SSH-сессией вручную сверялся fingerprint:

`SHA256:a4LvCCBB6DSXcbZcq46hJKxln8FCIVCckJBpt9O8Olo`

Старый адрес из общего `AGENTS.md` не использовался.

## Локальные проверки

До commit выполнены:

1. `go test ./...`;
2. `go vet ./...`;
3. `node --check web/app.js`;
4. `git diff --check`;
5. отдельный интеграционный тест полного жизненного цикла аватара;
6. browser-проверка desktop;
7. browser-проверка 390 × 844;
8. browser-проверка 320 × 760;
9. проверка `scrollWidth` документа, dialog и редактора;
10. проверка browser console на warning/error.

Коммит `553ba5e` отправлен в `origin/main` до production-переключения.

## Сборка

- commit: `553ba5e`;
- release: `/opt/business-control/releases/20260901-profile-avatar-553ba5e`;
- binary: `/opt/business-control/releases/20260901-profile-avatar-553ba5e/business-control`;
- SHA-256: `3720da8c5244a093f51db16ac2cbc1cbf3d5ba4432b55d704ab9c787e8227b58`;
- asset marker: `20260901-profile-avatar-1`;
- предыдущий release: `/opt/business-control/releases/20260901-mobile-layout-e3d622a`.

Linux AMD64 binary собран с `CGO_ENABLED=0`, `-trimpath`, `-ldflags="-s -w"`. Контрольная сумма совпала локально, после SFTP и после установки в release-каталог.

## Резервная копия

Перед запуском кандидата создан backup:

`/var/lib/business-control/backups/pre-profile-avatar-20260901T195947Z`

Содержимое:

- согласованная SQLite-копия `business-control.db`;
- `uploads.tar.gz`;
- `SHA256SUMS`;
- `previous-release.txt`;
- `candidate-commit.txt`.

Контрольные суммы:

- SQLite: `ef8186d3a46fac47e18f8b46bc8fc94846a18082751c0fce958191864c867ec6`;
- uploads: `812234352e59cf0271b813769bdf2072402e861c84c54dc78fb175371db1358e`.

На backup `PRAGMA integrity_check` вернул `ok`, `PRAGMA foreign_key_check` не вернул строк.

## Dry-run на копии

Кандидат запущен на `127.0.0.1:18533` с копией backup-БД и отдельным временным каталогом uploads. Production продолжал обслуживать запросы предыдущим релизом.

Подтверждены:

- health `status=ok`;
- marker `20260901-profile-avatar-1`;
- применение миграции `017_profile_avatars.sql`;
- наличие всех четырёх avatar-полей в `users`;
- `integrity_check=ok`;
- отсутствие нарушений внешних ключей;
- сохранение 2 пользователей и 56 существовавших карточек.

Временный процесс и его БД удалены после проверки.

## Первая попытка переключения и автоматический rollback

Первая production-попытка не прошла health. Systemd вернул `203/EXEC Permission denied`. Причиной был режим установленного binary `0750 root:root`: сервис запускается пользователем и группой `business-control`, поэтому не мог исполнить root-owned файл. Каталог релиза имел корректный режим `0755`; проблема относилась только к binary.

Скрипт не дождался health и автоматически:

1. вернул `/opt/business-control/current` на `/opt/business-control/releases/20260901-mobile-layout-e3d622a`;
2. перезапустил предыдущий релиз;
3. подтвердил его `active` и локальный health 200.

Кандидат не начал выполнение, поэтому production-миграция в этой попытке не запускалась. Backup не восстанавливался: повреждения или изменения данных не было.

После диагностики binary получил режим `0755`, совпадающий с предыдущими релизами. До повторного переключения выполнено `runuser -u business-control -- test -x <binary>`. Этот шаг теперь обязателен для следующих deployment-скриптов.

## Успешное production-переключение

После проверки исполнимости символьная ссылка атомарно переключена на новый release, сервис перезапущен. Подтверждены:

- `business-control=active`;
- `nginx=active`;
- local health `status=ok`;
- public health `status=ok`;
- local/public marker `20260901-profile-avatar-1`;
- mode binary `0755`;
- четыре avatar-поля в production `users`;
- `integrity_check=ok`;
- `foreign_key_check` — 0 строк;
- после успешного запуска в журнале нет `panic`, `fatal`, `migration error`.

После создания самодокументирующей задачи production содержит 2 пользователей и 57 карточек.

## Авторизованный smoke

Через краткоживущую техническую сессию `artkozk` проверены:

- `/api/me`;
- `/api/users` — видны 2 участника общего пространства;
- собственный публичный профиль;
- `/api/ai/health`.

AI на момент проверки: `source=gemini`, `providerAvailable=true`. Техническая сессия удалена сразу после smoke.

## Самодокументирование в BizFlow

Создана и завершена задача:

- ID: `0e6c9ce1277373c7f2f14275776e6929`;
- название: `Добавить безопасные аватары профиля`;
- родитель: `1168ce733dc42915ee54c9dd8d6b773f`;
- состояние: `completed`;
- прогресс: `100`;
- приложено текстовое доказательство с commit, тестами, browser-матрицей, release, SHA-256 и backup.

Родительская задача `Расширить профили и управление участниками` оставлена `in_progress` и поднята с 45% до 55%. Она не завершена, потому что изоляция нескольких команд, приглашения и роли остаются следующей работой.

## Rollback

Для обычного rollback:

1. остановить `business-control`;
2. вернуть `/opt/business-control/current` на `/opt/business-control/releases/20260901-mobile-layout-e3d622a`;
3. запустить сервис;
4. проверить local/public health и предыдущий marker;
5. выполнить `integrity_check` и `foreign_key_check`.

Миграция только добавляет поля с безопасными default. Предыдущий binary их игнорирует, поэтому обычный rollback не требует восстановления БД. Backup применяется только при отдельно подтверждённом повреждении данных, иначе будут потеряны пользовательские изменения после релиза.

После исправления режима binary повторный rollback не потребовался.


## Актуализация бренда — 03.09.2026

Актуальное название продукта — **Tessavie**, по новому прямому запросу пользователя.
Упоминания BizFlow выше, старые имена файлов и прежние ограничения сохранены как
история решений; актуальное оформление и правила совместимости описаны в
[контракте Tessavie](../architecture/TESSAVIE_BRAND_CONTRACT_2026_09_03.md). Переименование интерфейса и логотипа теперь разрешено
и реализуется этим выпуском; пользовательские данные и история не переписываются.
