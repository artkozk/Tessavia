#!/usr/bin/env bash
set -Eeuo pipefail

: "${RELEASE_NAME:?Set release name}"
: "${CANDIDATE_COMMIT:?Set source commit}"
: "${EXPECTED_SHA256:?Set binary hash}"
: "${EXPECTED_PREVIOUS:?Set verified previous release}"
[[ "$RELEASE_NAME" =~ ^20260914-finance-expenses-[a-f0-9]+$ ]]
[[ "$CANDIDATE_COMMIT" =~ ^[a-f0-9]{40}$ ]]
release_suffix=${RELEASE_NAME#20260914-finance-expenses-}
[[ "$CANDIDATE_COMMIT" == "$release_suffix"* ]]
[[ "$EXPECTED_SHA256" =~ ^[a-f0-9]{64}$ ]]
test "$EXPECTED_PREVIOUS" = /opt/business-control/releases/20260913-personal-navigation-2ae5847

exec 9>/run/business-control-deploy.lock
flock -n 9
root=/opt/business-control
release="$root/releases/$RELEASE_NAME"
staged=/tmp/business-control-finance-expenses
db=/var/lib/business-control/business-control.db
previous=$(readlink -f "$root/current")
test "$previous" = "$EXPECTED_PREVIOUS"
backup="/var/lib/business-control/backups/pre-finance-expenses-$(date -u +%Y%m%dT%H%M%SZ)"
dry=''
dry_pid=''
switch_started=0
release_created=0

cleanup() {
  result=$?
  trap - EXIT
  if [[ -n "$dry_pid" ]]; then kill "$dry_pid" 2>/dev/null || true; wait "$dry_pid" 2>/dev/null || true; fi
  if [[ -n "$dry" && "$dry" == /tmp/tessavie-finance-expenses-check.* ]]; then rm -rf -- "$dry"; fi
  if [[ "$result" -ne 0 && "$switch_started" -eq 1 ]]; then
    systemctl stop business-control || true
    # A previous binary does not support recorded expenses or component library. Inspect the
    # stopped, latest database and never delete new user data to force rollback.
    if python3 /tmp/verify-finance-expenses-migration.py --rollback-safe "$db"; then
      ln -sfn "$previous" "$root/current.next"
      mv -Tf "$root/current.next" "$root/current"
      systemctl start business-control
      printf 'ROLLED_BACK=%s\n' "$previous" >&2
    else
      systemctl start business-control || true
      printf 'ROLLBACK_BLOCKED=keep_candidate_and_data; compatible_fix_required\n' >&2
    fi

  elif [[ "$result" -ne 0 && "$release_created" -eq 1 ]]; then
    [[ "$release" == "$root/releases/$RELEASE_NAME" ]]
    rm -rf -- "$release"
  fi
  exit "$result"
}
trap cleanup EXIT

test -f "$staged"
test -f "$db"
test -x "$previous/business-control"
printf '%s  %s\n' '8fed30e4a01bb30cd6e28a3cc46dc9fbc6e41c2ca9c51181e76e14465329633a' "$previous/business-control" | sha256sum -c -
test ! -e "$release"
printf '%s  %s\n' "$EXPECTED_SHA256" "$staged" | sha256sum -c -
python3 - <<'PY'
import socket
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 18637))
PY

install -d -m 0700 "$backup"
sqlite3 "$db" '.timeout 5000' ".backup '$backup/business-control.db'"
tar -C /var/lib/business-control -czf "$backup/uploads.tar.gz" uploads
install -m 0600 /etc/business-control.env "$backup/business-control.env"
cp -L -- /etc/nginx/sites-enabled/business-control "$backup/business-control.nginx.conf"
chmod 0600 "$backup/business-control.nginx.conf"
printf '%s\n' "$previous" > "$backup/previous-release.txt"
printf '%s\n' "$CANDIDATE_COMMIT" > "$backup/candidate-commit.txt"
(cd "$backup" && sha256sum business-control.db uploads.tar.gz business-control.env business-control.nginx.conf > SHA256SUMS)
test "$(sqlite3 "$backup/business-control.db" 'PRAGMA integrity_check;')" = ok
test "$(sqlite3 "$backup/business-control.db" 'SELECT COUNT(*) FROM pragma_foreign_key_check;')" = 0
printf 'BACKUP=%s\n' "$backup"

install -d -m 0755 "$release"
release_created=1
install -m 0755 "$staged" "$release/business-control"
cmp -- "$staged" "$release/business-control"
rm -f -- "$staged"

dry=$(mktemp -d /tmp/tessavie-finance-expenses-check.XXXXXX)
cp "$backup/business-control.db" "$dry/check.db"
mkdir "$dry/uploads"
chown -R business-control:business-control "$dry"
runuser -u business-control -- env BUSINESS_REMINDERS_ENABLED=false BUSINESS_ADDRESS=127.0.0.1:18637 BUSINESS_DATABASE_PATH="$dry/check.db" BUSINESS_UPLOAD_PATH="$dry/uploads" "$release/business-control" > "$dry/server.log" 2>&1 &
dry_pid=$!
for attempt in $(seq 1 30); do
  if curl --max-time 3 -fsS http://127.0.0.1:18637/api/health > "$dry/health.json" 2>/dev/null; then break; fi
  test "$attempt" -lt 30
  sleep 1
done
python3 /tmp/verify-finance-expenses-migration.py "$backup/business-control.db" "$dry/check.db"

check_http() {
  local base="$1"
  curl --max-time 15 -fsS "$base/" > "$dry/index.html"
  grep -qF 'app.js?v=20260914-finance-expenses-1' "$dry/index.html"
  grep -qF 'styles.css?v=20260914-finance-expenses-1' "$dry/index.html"
  grep -qF 'settings-hub.css?v=20260914-finance-expenses-1' "$dry/index.html"
  grep -qF 'personal-finance.css?v=20260914-finance-expenses-1' "$dry/index.html"
  grep -qF 'page-sheets.css?v=20260914-finance-expenses-1' "$dry/index.html"
  curl --max-time 15 -fsS "$base/app.js?v=20260914-finance-expenses-1" > "$dry/app.js"
  grep -qF 'chat-workspace.js?v=20260914-finance-expenses-1' "$dry/app.js"
  grep -qF 'data-chat-outbox' "$dry/app.js"
  grep -qF 'data-planner-journal' "$dry/app.js"
  grep -qF 'editPageBlockTitle' "$dry/app.js"
  grep -qF 'reviewPending' "$dry/app.js"
  grep -qF 'data-chat-thread-archive' "$dry/app.js"
  grep -qF 'data-chat-archive-folder' "$dry/app.js"
  grep -qF 'data-chat-files' "$dry/app.js"
  grep -qF 'collection-default-config' "$dry/app.js"
  grep -qF 'page-apps.js?v=20260914-finance-expenses-1' "$dry/app.js"
  grep -qF 'settings-hub.js?v=20260914-finance-expenses-1' "$dry/app.js"
  grep -qF 'createSettingsHub' "$dry/app.js"
  curl --max-time 15 -fsS "$base/settings-hub.js?v=20260914-finance-expenses-1" > "$dry/settings-hub.js"
  grep -qF 'createSettingsHub' "$dry/settings-hub.js"
  grep -qF 'settings-hub' "$dry/settings-hub.js"
  curl --max-time 15 -fsS "$base/settings-hub.css?v=20260914-finance-expenses-1" > "$dry/settings-hub.css"
  grep -qF '.settings-hub' "$dry/settings-hub.css"
  grep -qF 'personal-finance.js?v=20260914-finance-expenses-1' "$dry/app.js"
  curl --max-time 15 -fsS "$base/personal-finance.js?v=20260914-finance-expenses-1" > "$dry/personal-finance.js"
  grep -qF 'createPersonalFinanceUI' "$dry/personal-finance.js"
  grep -qF 'data-personal-finance' "$dry/personal-finance.js"
  curl --max-time 15 -fsS "$base/personal-finance.css?v=20260914-finance-expenses-1" > "$dry/personal-finance.css"
  grep -qF '.finance-totals' "$dry/personal-finance.css"
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/personal/finance")" = 401
  grep -qF 'function changeCalendarScope(scope)' "$dry/app.js"
  grep -qF 'function savedPageLayout(profile)' "$dry/app.js"
  grep -qF 'Both scopes display the same calendar surface' "$dry/app.js"
  grep -qF 'calendarContextWorkspaceId' "$dry/app.js"
  if grep -qF 'conversion-preview' "$dry/app.js"; then
    printf 'CANDIDATE_REJECTED=unfinished_field_conversion_UI\n' >&2
    return 1
  fi
  curl --max-time 15 -fsS "$base/personal-navigation.js?v=20260914-finance-expenses-1" > "$dry/personal-navigation.js"
  grep -qF 'calendarContextWorkspaceId' "$dry/personal-navigation.js"
  grep -qF 'route.calendarContextWorkspaceId === route.workspaceId' "$dry/personal-navigation.js"
  grep -qF 'personalNavigationItems' "$dry/personal-navigation.js"
  grep -qF 'personalNavigationTarget' "$dry/personal-navigation.js"
  grep -qF 'navigationItemVisible' "$dry/personal-navigation.js"
  curl --max-time 15 -fsS "$base/page-apps.js?v=20260914-finance-expenses-1" > "$dry/page-apps.js"
  curl --max-time 15 -fsS "$base/page-record-bindings.js?v=20260914-finance-expenses-1" > "$dry/bindings.js"
  grep -qF 'recordBindingText' "$dry/bindings.js"
  grep -qF 'data-binding-remove' "$dry/bindings.js"
  curl --max-time 15 -fsS "$base/page-element-styles.js?v=20260914-finance-expenses-1" > "$dry/elements.js"
  grep -qF 'applyElementStyles' "$dry/elements.js"
  grep -qF 'data-element-reset' "$dry/elements.js"
  curl --max-time 15 -fsS "$base/page-form-elements.js?v=20260914-finance-expenses-1" > "$dry/form-elements.js"
  grep -qF 'prepareFormElements' "$dry/form-elements.js"
  grep -qF 'migrateFormElementStyles' "$dry/form-elements.js"
  grep -qF 'createPageAppUI' "$dry/page-apps.js"
  grep -qF 'page-sheets.js?v=20260914-finance-expenses-1' "$dry/page-apps.js"
  grep -qF 'createPageSheetUI' "$dry/page-apps.js"
  curl --max-time 15 -fsS "$base/page-sheets.js?v=20260914-finance-expenses-1" > "$dry/page-sheets.js"
  grep -qF 'evaluateSheet' "$dry/page-sheets.js"
  grep -qF 'expectedValuesRevision' "$dry/page-sheets.js"
  grep -qF 'sheetDecimal' "$dry/page-sheets.js"
  curl --max-time 15 -fsS "$base/page-sheets.css?v=20260914-finance-expenses-1" > "$dry/page-sheets.css"
  grep -qF '.app-sheet' "$dry/page-sheets.css"
  grep -qF 'sheetValue' "$dry/elements.js"
  grep -qF 'data-finance-expense-add' "$dry/personal-finance.js"
  grep -qF 'financeAccountBalances' "$dry/personal-finance.js"
  grep -qF 'data-finance-history-kind' "$dry/personal-finance.js"
  curl --max-time 15 -fsS "$base/page-labels.js?v=20260914-finance-expenses-1" > "$dry/page-labels.js"
  grep -qF 'updatePageTexts' "$dry/page-labels.js"
  curl --max-time 15 -fsS "$base/page-components.js?v=20260914-finance-expenses-1" > "$dry/page-components.js"
  grep -qF '/api/page-app/components' "$dry/page-components.js"
  curl --max-time 15 -fsS "$base/page-components.css?v=20260914-finance-expenses-1" > "$dry/page-components.css"
  test -s "$dry/page-components.css"
  test "$(curl --max-time 10 -s -X POST -o /dev/null -w '%{http_code}' "$base/api/personal/finance/expenses")" = 401
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/page-app/components")" = 401
  test "$(curl --max-time 10 -s -X POST -o /dev/null -w '%{http_code}' "$base/api/workspace/pages/unknown/app/component")" = 401
  grep -qF 'expectedPayerRevision' "$dry/personal-finance.js"
  grep -qF '/counterparties' "$dry/personal-finance.js"
  test "$(curl --max-time 10 -s -X PUT -o /dev/null -w '%{http_code}' "$base/api/workspace/pages/unknown/app/sheets/unknown")" = 401
  test "$(curl --max-time 10 -s -X POST -o /dev/null -w '%{http_code}' "$base/api/personal/finance/counterparties")" = 401
  curl --max-time 15 -fsS "$base/page-block-visibility.js?v=20260914-finance-expenses-1" > "$dry/visibility.js"
  grep -qF 'blockVisible' "$dry/visibility.js"
  grep -qF 'previewVisibilityMarks' "$dry/visibility.js"
  grep -qF 'data-visibility-add' "$dry/visibility.js"
  grep -qF 'visibilityLeaves' "$dry/visibility.js"
  grep -qF 'data-visibility-toggle' "$dry/visibility.js"
  grep -qF 'data-builder-page-name' "$dry/page-apps.js"
  grep -qF 'data-app-record-create' "$dry/page-apps.js"
  grep -qF 'renderRecordLists' "$dry/page-apps.js"
  curl --max-time 15 -fsS "$base/page-forms.js?v=20260914-finance-expenses-1" > "$dry/page-forms.js"
  grep -qF 'mountPageForms' "$dry/page-forms.js"
  grep -qF 'pageFormPayload' "$dry/page-forms.js"
  grep -qF 'Idempotency-Key' "$dry/page-forms.js"
  curl --max-time 15 -fsS "$base/page-record-actions.js?v=20260914-finance-expenses-1" > "$dry/page-record-actions.js"
  grep -qF 'openPageRecordAction' "$dry/page-record-actions.js"
  grep -qF 'schemaHash' "$dry/page-record-actions.js"
  grep -qF 'data-action-operation' "$dry/page-record-actions.js"
  grep -qF 'data-action-source-field' "$dry/page-record-actions.js"
  grep -qF 'compatibleActionSourceFields' "$dry/page-record-actions.js"
  grep -qF 'data-change-add' "$dry/page-record-actions.js"
  grep -qF 'expectedChangeCount' "$dry/page-record-actions.js"
  grep -qF 'app-action-dialog-body' "$dry/page-record-actions.js"
  curl --max-time 15 -fsS "$base/page-action-conditions.js?v=20260914-finance-expenses-1" > "$dry/page-action-conditions.js"
  grep -qF 'conditionMatches' "$dry/page-action-conditions.js"
  grep -qF 'conditionConfig' "$dry/page-action-conditions.js"
  grep -qF 'data-condition-mode' "$dry/page-action-conditions.js"
  grep -qF 'conditionReview' "$dry/page-action-conditions.js"
  grep -qF 'expectedConditionCount' "$dry/page-record-actions.js"
  curl --max-time 15 -fsS "$base/field-conflicts.js?v=20260914-finance-expenses-1" > "$dry/field-conflicts.js"
  grep -qF 'reviewFieldConflict' "$dry/field-conflicts.js"
  grep -qF 'fieldEditBaseline' "$dry/app.js"
  curl --max-time 15 -fsS "$base/page-data-sources.js?v=20260914-finance-expenses-1" > "$dry/data.js"
  grep -qF 'readingCompletionRequest' "$dry/data.js"
  grep -qF 'data-source-reader' "$dry/data.js"
  curl --max-time 15 -fsS "$base/vendor/synodal/43.json" > "$dry/book.json"
  python3 - "$dry/book.json" <<'PYBOOK'
import json,sys
book=json.load(open(sys.argv[1]))
assert book['bookId']==43 and len(book['chapters'])==21
assert book['chapters'][0][0]['text'].startswith('В начале было Слово')
PYBOOK
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/page-app/templates")" = 401
  curl --max-time 15 -fsS "$base/chat-workspace.js?v=20260914-finance-expenses-1" > "$dry/chat.js"
  grep -qF 'createChatWorkspaceUI' "$dry/chat.js"
  curl --max-time 15 -fsS "$base/life-map.js?v=20260914-finance-expenses-1" > "$dry/life.js"
  grep -qF 'life-map-overview' "$dry/life.js"
  curl --max-time 15 -fsS "$base/chat-groups.js?v=20260914-finance-expenses-1" > "$dry/groups.js"
  grep -qF 'createChatGroupUI' "$dry/groups.js"
  curl --max-time 15 -fsS "$base/personal-calendar.js?v=20260914-finance-expenses-1" > "$dry/calendar.js"
  grep -qF 'openRecurrence' "$dry/calendar.js"
  grep -qF 'bindPersonalRecurrenceScope' "$dry/app.js"
  curl --max-time 15 -fsS "$base/personal-today.js?v=20260914-finance-expenses-1" > "$dry/today.js"
  grep -qF 'todayHiddenBlocks' "$dry/today.js"
  grep -qF 'useProgressiveToday' "$dry/today.js"
  grep -qF 'adaptiveToday' "$dry/today.js"
  grep -qF 'const cosmetic = new Set' "$dry/today.js"
  grep -qF 'value.workBusyCount' "$dry/today.js"
  grep -qF 'openRecurrence(forecast)' "$dry/today.js"
  grep -qF 'today-empty-block' "$dry/app.js"
  curl --max-time 15 -fsS "$base/styles.css?v=20260914-finance-expenses-1" > "$dry/styles.css"
  grep -qF -- '--chat-menu-left' "$dry/styles.css"
  curl --max-time 15 -fsS "$base/page-composition.js?v=20260914-finance-expenses-1" > "$dry/composition.js"
  grep -qF 'duplicateBlockTree' "$dry/composition.js"
  grep -qF 'groupChoices' "$dry/composition.js"
  curl --max-time 15 -fsS "$base/page-calculations.js?v=20260914-finance-expenses-1" > "$dry/calculations.js"
  grep -qF 'evaluateCalculation' "$dry/calculations.js"
  grep -qF 'bindCalculationConfig' "$dry/calculations.js"
  curl --max-time 15 -fsS "$base/page-record-card.js?v=20260914-finance-expenses-1" > "$dry/card.js"
  grep -qF "recordCardBody" "$dry/card.js"
  grep -qF "bindRecordCardConfig" "$dry/card.js"
  curl --max-time 15 -fsS "$base/sw.js" > "$dry/sw.js"
  grep -qF 'tessavie-shell-20260914-finance-expenses-1' "$dry/sw.js"
  grep -qF 'settings-hub.js?v=20260914-finance-expenses-1' "$dry/sw.js"
  grep -qF 'settings-hub.css?v=20260914-finance-expenses-1' "$dry/sw.js"
  grep -qF 'personal-finance.js?v=20260914-finance-expenses-1' "$dry/sw.js"
  grep -qF 'personal-finance.css?v=20260914-finance-expenses-1' "$dry/sw.js"
  grep -qF 'page-sheets.js?v=20260914-finance-expenses-1' "$dry/sw.js"
  grep -qF 'page-sheets.css?v=20260914-finance-expenses-1' "$dry/sw.js"
  if grep -qF 'client.navigate(' "$dry/sw.js"; then
    printf 'CANDIDATE_REJECTED=service_worker_navigation_override\n' >&2
    return 1
  fi
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/chat/threads")" = 401
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/chat/threads/unknown/history")" = 401
}

check_http http://127.0.0.1:18637
kill "$dry_pid"
wait "$dry_pid" 2>/dev/null || true
dry_pid=''
printf 'DRY_RUN=ok\n'

# Trial rollback is allowed only before any new expense/component data exists.
python3 /tmp/verify-finance-expenses-migration.py --rollback-safe "$dry/check.db"
runuser -u business-control -- env BUSINESS_REMINDERS_ENABLED=false BUSINESS_ADDRESS=127.0.0.1:18637 BUSINESS_DATABASE_PATH="$dry/check.db" BUSINESS_UPLOAD_PATH="$dry/uploads" "$previous/business-control" > "$dry/rollback-server.log" 2>&1 &
dry_pid=$!
for attempt in $(seq 1 30); do
  if curl --max-time 3 -fsS http://127.0.0.1:18637/api/health > "$dry/rollback-health.json" 2>/dev/null; then break; fi
  test "$attempt" -lt 30
  sleep 1
done
curl --max-time 15 -fsS http://127.0.0.1:18637/ > "$dry/rollback-index.html"
grep -qF 'app.js?v=20260913-personal-navigation-1' "$dry/rollback-index.html"
python3 /tmp/verify-finance-expenses-migration.py "$backup/business-control.db" "$dry/check.db"
kill "$dry_pid"
wait "$dry_pid" 2>/dev/null || true
dry_pid=''
printf 'ROLLBACK_COMPATIBILITY=ok\n'
test "$(readlink -f "$root/current")" = "$previous"

switch_started=1
systemctl stop business-control
sqlite3 "$db" '.timeout 5000' ".backup '$backup/cutover.db'"
test "$(sqlite3 "$backup/cutover.db" 'PRAGMA integrity_check;')" = ok
tar -C /var/lib/business-control -czf "$backup/cutover-uploads.tar.gz" uploads
(cd "$backup" && sha256sum cutover.db cutover-uploads.tar.gz >> SHA256SUMS)
ln -sfn "$release" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
systemctl start business-control
for attempt in $(seq 1 30); do
  if curl --max-time 3 -fsS http://127.0.0.1:8522/api/health > "$backup/local-health.json" 2>/dev/null; then break; fi
  test "$attempt" -lt 30
  sleep 1
done
nginx -t
check_http http://127.0.0.1:8522
check_http https://control.e-rd.ru
curl --max-time 15 -fsS https://control.e-rd.ru/api/health > "$backup/public-health.json"
test "$(systemctl is-active business-control)" = active
test "$(sqlite3 "$db" 'PRAGMA integrity_check;')" = ok
test "$(sqlite3 "$db" 'SELECT COUNT(*) FROM pragma_foreign_key_check;')" = 0
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='065_record_create_requests.sql';")" = 1
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='066_personal_finance.sql';")" = 1
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")" = 127
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='067_personal_finance_counterparties.sql';")" = 1
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='068_page_app_sheet_values.sql';")" = 1
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='069_personal_finance_expenses.sql';")" = 1
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='070_page_app_components.sql';")" = 1
printf 'RELEASE=%s\nCOMMIT=%s\nSHA256=%s\nDEPLOY=ok\n' "$release" "$CANDIDATE_COMMIT" "$EXPECTED_SHA256"
