#!/usr/bin/env bash
set -Eeuo pipefail

: "${RELEASE_NAME:?Set release name}"
: "${CANDIDATE_COMMIT:?Set source commit}"
: "${EXPECTED_SHA256:?Set binary hash}"
: "${EXPECTED_PREVIOUS:?Set verified previous release}"
[[ "$RELEASE_NAME" =~ ^20260908-page-forms-[a-f0-9]+$ ]]
[[ "$CANDIDATE_COMMIT" =~ ^[a-f0-9]{7,40}$ ]]
[[ "$EXPECTED_SHA256" =~ ^[a-f0-9]{64}$ ]]

exec 9>/run/business-control-deploy.lock
flock -n 9
root=/opt/business-control
release="$root/releases/$RELEASE_NAME"
staged=/tmp/business-control-page-forms
db=/var/lib/business-control/business-control.db
previous=$(readlink -f "$root/current")
test "$previous" = "$EXPECTED_PREVIOUS"
backup="/var/lib/business-control/backups/pre-page-forms-$(date -u +%Y%m%dT%H%M%SZ)"
dry=''
dry_pid=''
switch_started=0
release_created=0

cleanup() {
  result=$?
  trap - EXIT
  if [[ -n "$dry_pid" ]]; then kill "$dry_pid" 2>/dev/null || true; wait "$dry_pid" 2>/dev/null || true; fi
  if [[ -n "$dry" && "$dry" == /tmp/tessavie-page-forms-check.* ]]; then rm -rf -- "$dry"; fi
  if [[ "$result" -ne 0 && "$switch_started" -eq 1 ]]; then
    systemctl stop business-control || true
    ln -sfn "$previous" "$root/current.next"
    mv -Tf "$root/current.next" "$root/current"
    systemctl start business-control
    printf 'ROLLED_BACK=%s\n' "$previous" >&2
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
test ! -e "$release"
printf '%s  %s\n' "$EXPECTED_SHA256" "$staged" | sha256sum -c -
python3 - <<'PY'
import socket
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 18631))
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

dry=$(mktemp -d /tmp/tessavie-page-forms-check.XXXXXX)
cp "$backup/business-control.db" "$dry/check.db"
mkdir "$dry/uploads"
chown -R business-control:business-control "$dry"
runuser -u business-control -- env BUSINESS_REMINDERS_ENABLED=false BUSINESS_ADDRESS=127.0.0.1:18631 BUSINESS_DATABASE_PATH="$dry/check.db" BUSINESS_UPLOAD_PATH="$dry/uploads" "$release/business-control" > "$dry/server.log" 2>&1 &
dry_pid=$!
for attempt in $(seq 1 30); do
  if curl --max-time 3 -fsS http://127.0.0.1:18631/api/health > "$dry/health.json" 2>/dev/null; then break; fi
  test "$attempt" -lt 30
  sleep 1
done
python3 /tmp/verify-page-forms-migration.py "$backup/business-control.db" "$dry/check.db"

check_http() {
  local base="$1"
  curl --max-time 15 -fsS "$base/" > "$dry/index.html"
  grep -qF 'app.js?v=20260908-page-forms-3' "$dry/index.html"
  grep -qF 'styles.css?v=20260908-page-forms-3' "$dry/index.html"
  curl --max-time 15 -fsS "$base/app.js?v=20260908-page-forms-3" > "$dry/app.js"
  grep -qF 'chat-workspace.js?v=20260908-page-forms-3' "$dry/app.js"
  grep -qF 'data-chat-outbox' "$dry/app.js"
  grep -qF 'data-planner-journal' "$dry/app.js"
  grep -qF 'editPageBlockTitle' "$dry/app.js"
  grep -qF 'reviewPending' "$dry/app.js"
  grep -qF 'data-chat-thread-archive' "$dry/app.js"
  grep -qF 'data-chat-archive-folder' "$dry/app.js"
  grep -qF 'data-chat-files' "$dry/app.js"
  grep -qF 'collection-default-config' "$dry/app.js"
  grep -qF 'page-apps.js?v=20260908-page-forms-3' "$dry/app.js"
  curl --max-time 15 -fsS "$base/page-apps.js?v=20260908-page-forms-3" > "$dry/page-apps.js"
  grep -qF 'createPageAppUI' "$dry/page-apps.js"
  grep -qF 'data-builder-page-name' "$dry/page-apps.js"
  grep -qF 'data-app-record-create' "$dry/page-apps.js"
  grep -qF 'renderRecordLists' "$dry/page-apps.js"
  curl --max-time 15 -fsS "$base/page-forms.js?v=20260908-page-forms-3" > "$dry/page-forms.js"
  grep -qF 'mountPageForms' "$dry/page-forms.js"
  grep -qF 'pageFormPayload' "$dry/page-forms.js"
  curl --max-time 15 -fsS "$base/field-conflicts.js?v=20260908-page-forms-3" > "$dry/field-conflicts.js"
  grep -qF 'reviewFieldConflict' "$dry/field-conflicts.js"
  grep -qF 'fieldEditBaseline' "$dry/app.js"
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/page-app/templates")" = 401
  curl --max-time 15 -fsS "$base/chat-workspace.js?v=20260908-page-forms-3" > "$dry/chat.js"
  grep -qF 'createChatWorkspaceUI' "$dry/chat.js"
  curl --max-time 15 -fsS "$base/life-map.js?v=20260908-page-forms-3" > "$dry/life.js"
  grep -qF 'life-map-overview' "$dry/life.js"
  curl --max-time 15 -fsS "$base/chat-groups.js?v=20260908-page-forms-3" > "$dry/groups.js"
  grep -qF 'createChatGroupUI' "$dry/groups.js"
  curl --max-time 15 -fsS "$base/personal-calendar.js?v=20260908-page-forms-3" > "$dry/calendar.js"
  grep -qF 'openRecurrence' "$dry/calendar.js"
  grep -qF 'bindPersonalRecurrenceScope' "$dry/app.js"
  curl --max-time 15 -fsS "$base/personal-today.js?v=20260908-page-forms-3" > "$dry/today.js"
  grep -qF 'todayHiddenBlocks' "$dry/today.js"
  grep -qF 'value.workBusyCount' "$dry/today.js"
  grep -qF 'openRecurrence(forecast)' "$dry/today.js"
  grep -qF 'today-empty-block' "$dry/app.js"
  curl --max-time 15 -fsS "$base/styles.css?v=20260908-page-forms-3" > "$dry/styles.css"
  grep -qF -- '--chat-menu-left' "$dry/styles.css"
  curl --max-time 15 -fsS "$base/sw.js" > "$dry/sw.js"
  grep -qF 'tessavie-shell-20260908-page-forms-3' "$dry/sw.js"
  ! grep -qF 'client.navigate(' "$dry/sw.js"
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/chat/threads")" = 401
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/chat/threads/unknown/history")" = 401
}

check_http http://127.0.0.1:18631
kill "$dry_pid"
wait "$dry_pid" 2>/dev/null || true
dry_pid=''
printf 'DRY_RUN=ok\n'
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
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='064_page_app_composition.sql';")" = 1
printf 'RELEASE=%s\nCOMMIT=%s\nSHA256=%s\nDEPLOY=ok\n' "$release" "$CANDIDATE_COMMIT" "$EXPECTED_SHA256"
