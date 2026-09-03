#!/usr/bin/env bash
set -Eeuo pipefail
: "${RELEASE_NAME:?Set release name}"
: "${CANDIDATE_COMMIT:?Set source commit}"
: "${EXPECTED_SHA256:?Set binary hash}"
: "${EXPECTED_PREVIOUS:?Set verified previous release}"
[[ "$RELEASE_NAME" =~ ^20260903-work-toolbar-[a-f0-9]+$ ]]
[[ "$CANDIDATE_COMMIT" =~ ^[a-f0-9]{40}$ ]]
[[ "$EXPECTED_SHA256" =~ ^[a-f0-9]{64}$ ]]
exec 9>/run/business-control-deploy.lock
flock -n 9
root=/opt/business-control
release="$root/releases/$RELEASE_NAME"
staged=/tmp/business-control-work-scope
db=/var/lib/business-control/business-control.db
previous=$(readlink -f "$root/current")
test "$previous" = "$EXPECTED_PREVIOUS"
test -f "$staged"; test -f "$db"; test -x "$previous/business-control"; test ! -e "$release"
backup="/var/lib/business-control/backups/pre-work-scope-$(date -u +%Y%m%dT%H%M%SZ)"
dry=''; dry_pid=''; switch_started=0
cleanup() {
  result=$?
  trap - EXIT
  if [[ -n "$dry_pid" ]]; then kill "$dry_pid" 2>/dev/null || true; wait "$dry_pid" 2>/dev/null || true; fi
  if [[ -n "$dry" && "$dry" == /tmp/tessavie-work-scope-check.* ]]; then rm -rf -- "$dry"; fi
  if [[ "$result" -ne 0 && "$switch_started" -eq 1 ]]; then
    systemctl stop business-control || true
    ln -sfn "$previous" "$root/current.next"
    mv -Tf "$root/current.next" "$root/current"
    systemctl start business-control
    printf 'ROLLED_BACK=%s\n' "$previous" >&2
  fi
  exit "$result"
}
trap cleanup EXIT
printf '%s  %s\n' "$EXPECTED_SHA256" "$staged" | sha256sum -c -
python3 - <<'PY'
import socket
with socket.socket() as s: s.bind(('127.0.0.1', 18626))
PY
install -d -m 0700 "$backup"
sqlite3 "$db" '.timeout 5000' ".backup '$backup/business-control.db'"
tar -C /var/lib/business-control -czf "$backup/uploads.tar.gz" uploads
install -m 0600 /etc/business-control.env "$backup/business-control.env"
printf '%s\n' "$previous" > "$backup/previous-release.txt"
printf '%s\n' "$CANDIDATE_COMMIT" > "$backup/candidate-commit.txt"
(cd "$backup" && sha256sum business-control.db uploads.tar.gz business-control.env > SHA256SUMS)
test "$(sqlite3 "$backup/business-control.db" 'PRAGMA integrity_check;')" = ok
test "$(sqlite3 "$backup/business-control.db" 'SELECT COUNT(*) FROM pragma_foreign_key_check;')" = 0
printf 'BACKUP=%s\n' "$backup"
install -d -m 0755 "$release"
install -m 0755 "$staged" "$release/business-control"
cmp -- "$staged" "$release/business-control"
dry=$(mktemp -d /tmp/tessavie-work-scope-check.XXXXXX)
cp "$backup/business-control.db" "$dry/check.db"
mkdir "$dry/uploads"
chown -R business-control:business-control "$dry"
runuser -u business-control -- env BUSINESS_ADDRESS=127.0.0.1:18626 BUSINESS_DATABASE_PATH="$dry/check.db" BUSINESS_UPLOAD_PATH="$dry/uploads" "$release/business-control" > "$dry/server.log" 2>&1 &
dry_pid=$!
for attempt in $(seq 1 30); do
  if curl --max-time 3 -fsS http://127.0.0.1:18626/api/health > "$dry/health.json" 2>/dev/null; then break; fi
  test "$attempt" -lt 30; sleep 1
done
python3 - "$backup/business-control.db" "$dry/check.db" <<'PY'
import sqlite3, sys
before, after = [sqlite3.connect('file:'+p+'?mode=ro', uri=True) for p in sys.argv[1:]]
table_query = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
tables = before.execute(table_query).fetchall()
assert tables == after.execute(table_query).fetchall()
for (table,) in tables:
    name = '"'+table.replace('"','""')+'"'
    assert before.execute('PRAGMA table_info('+name+')').fetchall() == after.execute('PRAGMA table_info('+name+')').fetchall(), table
    query = 'SELECT * FROM '+name+' ORDER BY rowid'
    assert before.execute(query).fetchall() == after.execute(query).fetchall(), table+' content changed'
assert after.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='035_personal_planning.sql'").fetchone()[0] == 1
assert after.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not after.execute('PRAGMA foreign_key_check').fetchall()
print('DATA_PRESERVATION=ok')
PY
check_http() {
  local base="$1"
  curl --max-time 15 -fsS "$base/" > "$dry/index.html"
  grep -q '<title>Tessavie</title>' "$dry/index.html"
  grep -q '20260903-work-scope-1' "$dry/index.html"
  curl --max-time 15 -fsS "$base/app.js" > "$dry/app.js"
  grep -qF 'function hasOtherProjectParticipants()' "$dry/app.js"
  grep -qF 'function workScopeOptions()' "$dry/app.js"
  grep -qF 'Работа других участников' "$dry/app.js"
  test "$(grep -cF "else if (state.workScope === 'partner')" "$dry/app.js")" = 2
  grep -qF 'id="work-owner-select"' "$dry/app.js"
  grep -qF 'function personalPlanContextFields(' "$dry/app.js"
  grep -qF 'data-switch-personal=' "$dry/app.js"
  grep -qF 'class="collection-page-actions"' "$dry/app.js"
  grep -qF "from './outbox-ui.js?v=20260903-offline-outbox-2'" "$dry/app.js"
  curl --max-time 15 -fsS "$base/styles.css" > "$dry/styles.css"
  grep -qF '.work-scope { width: max-content; max-width: 100%; justify-self: start; }' "$dry/styles.css"
  grep -qF 'input:where(:not([type="checkbox"]):not([type="radio"]))' "$dry/styles.css"
  grep -qF '.collection-page-heading > .collection-page-actions' "$dry/styles.css"
  curl --max-time 15 -fsS "$base/sw.js" > "$dry/sw.js"
  grep -qF 'tessavie-shell-20260903-work-scope-1' "$dry/sw.js"
  curl --max-time 15 -fsS "$base/offline-outbox.js?v=20260903-offline-outbox-2" > /dev/null
  curl --max-time 15 -fsS "$base/outbox-ui.js?v=20260903-offline-outbox-2" > /dev/null
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/records?pageSize=200")" = 401
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/personal/search?q=test")" = 401
  test "$(curl --max-time 10 -s -X POST -H 'Content-Type: application/json' -d '{}' -o /dev/null -w '%{http_code}' "$base/api/personal/projects")" = 401
}
check_http http://127.0.0.1:18626
kill "$dry_pid"; wait "$dry_pid" 2>/dev/null || true; dry_pid=''
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
  test "$attempt" -lt 30; sleep 1
done
check_http http://127.0.0.1:8522
check_http https://control.e-rd.ru
curl --max-time 15 -fsS https://control.e-rd.ru/api/health > "$backup/public-health.json"
test "$(systemctl is-active business-control)" = active
test "$(sqlite3 "$db" 'PRAGMA integrity_check;')" = ok
test "$(sqlite3 "$db" 'SELECT COUNT(*) FROM pragma_foreign_key_check;')" = 0
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='035_personal_planning.sql';")" = 1
printf 'RELEASE=%s\nCOMMIT=%s\nSHA256=%s\nDEPLOY=ok\n' "$release" "$CANDIDATE_COMMIT" "$EXPECTED_SHA256"
