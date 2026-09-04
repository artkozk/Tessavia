#!/usr/bin/env bash
# Run only on the approved Tessavie host after verifying the current release.
set -Eeuo pipefail
: "${RELEASE_NAME:?Set release name}"
: "${CANDIDATE_COMMIT:?Set full source commit}"
: "${EXPECTED_SHA256:?Set binary hash}"
: "${EXPECTED_PREVIOUS:?Set verified previous release}"
[[ "$RELEASE_NAME" =~ ^20260905-reading-reflections-[a-f0-9]+$ ]]
[[ "$CANDIDATE_COMMIT" =~ ^[a-f0-9]{40}$ ]]
[[ "$EXPECTED_SHA256" =~ ^[a-f0-9]{64}$ ]]
test "$(hostname)" = "cqydlbhvzt"

exec 9>/run/business-control-deploy.lock
flock -n 9
root=/opt/business-control
db=/var/lib/business-control/business-control.db
staged=/tmp/business-control-reading-reflections
release="$root/releases/$RELEASE_NAME"
previous=$(readlink -f "$root/current")
backup="/var/lib/business-control/backups/pre-reading-reflections-$(date -u +%Y%m%dT%H%M%SZ)"
nginx_config=/etc/nginx/sites-enabled/business-control
dry=''
dry_pid=''
switch_started=0
release_created=0

cleanup() {
  result=$?
  trap - EXIT
  if [[ -n "$dry_pid" ]]; then kill "$dry_pid" 2>/dev/null || true; wait "$dry_pid" 2>/dev/null || true; fi
  if [[ "$result" -ne 0 && "$switch_started" -eq 1 ]]; then
    systemctl stop business-control || true
    ln -sfn "$previous" "$root/current.next"
    mv -Tf "$root/current.next" "$root/current"
    systemctl start business-control
    printf 'ROLLED_BACK_BINARY=%s\n' "$previous" >&2
  fi
  if [[ "$result" -ne 0 && "$switch_started" -eq 0 && "$release_created" -eq 1 ]]; then
    [[ "$release" == "$root/releases/$RELEASE_NAME" ]]
    rm -rf -- "$release"
  fi
  if [[ "$result" -eq 0 && -n "$dry" && "$dry" == /tmp/tessavie-reading-reflections-check.* ]]; then
    rm -rf -- "$dry"
  elif [[ -n "$dry" ]]; then
    printf 'DRY_RUN_DIRECTORY=%s\n' "$dry" >&2
  fi
  exit "$result"
}
trap cleanup EXIT

test "$previous" = "$EXPECTED_PREVIOUS"
test -x "$previous/business-control"
test -f "$staged"
test -f "$db"
test ! -e "$release"
printf '%s  %s\n' "$EXPECTED_SHA256" "$staged" | sha256sum -c -
python3 - <<'PY'
import socket
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 18628))
PY

install -d -m 0700 "$backup"
sqlite3 "$db" '.timeout 5000' ".backup '$backup/business-control.db'"
tar -C /var/lib/business-control -czf "$backup/uploads.tar.gz" uploads
install -m 0600 /etc/business-control.env "$backup/business-control.env"
cp -L -- "$nginx_config" "$backup/business-control.nginx.conf"
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

dry=$(mktemp -d /tmp/tessavie-reading-reflections-check.XXXXXX)
cp "$backup/business-control.db" "$dry/check.db"
mkdir "$dry/uploads"
chown -R business-control:business-control "$dry"
runuser -u business-control -- env BUSINESS_REMINDERS_ENABLED=false BUSINESS_ADDRESS=127.0.0.1:18628 BUSINESS_DATABASE_PATH="$dry/check.db" BUSINESS_UPLOAD_PATH="$dry/uploads" "$release/business-control" > "$dry/server.log" 2>&1 &
dry_pid=$!
for attempt in $(seq 1 30); do
  if curl --max-time 3 -fsS http://127.0.0.1:18628/api/health > "$dry/health.json" 2>/dev/null; then break; fi
  test "$attempt" -lt 30
  sleep 1
done
python3 /tmp/verify-reading-reflections-migration.py "$backup/business-control.db" "$dry/check.db"

check_http() {
  local base="$1"
  curl --max-time 15 -fsS "$base/" > "$dry/index.html"
  grep -qF '20260905-reading-grid-1' "$dry/index.html"
  grep -qF '<title>Tessavie</title>' "$dry/index.html"
  curl --max-time 15 -fsS "$base/reading.js?v=20260905-reading-grid-1" > "$dry/reading.js"
  grep -qF 'data-reflection-new' "$dry/reading.js"
  grep -qF '/reflections/${item.id}' "$dry/reading.js"
  grep -qF 'data-reading-fast' "$dry/reading.js"
  grep -qF '<h4>Ветхий Завет</h4>' "$dry/reading.js"
  grep -qF '<h4>Новый Завет</h4>' "$dry/reading.js"
  curl --max-time 15 -fsS "$base/sw.js" > "$dry/sw.js"
  grep -qF 'tessavie-shell-20260905-reading-grid-1' "$dry/sw.js"
  curl --max-time 15 -fsS "$base/personal-waiting.js?v=20260904-waiting-ping-1" > "$dry/personal-waiting.js"
  grep -qF 'createPersonalWaitingUI' "$dry/personal-waiting.js"
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/reading")" = 401
  test "$(curl --max-time 10 -s -X POST -H 'Content-Type: application/json' -d '{}' -o /dev/null -w '%{http_code}' "$base/api/reading/reflections")" = 401
  test "$(curl --max-time 10 -s -X PATCH -H 'Content-Type: application/json' -d '{}' -o /dev/null -w '%{http_code}' "$base/api/reading/reflections/not-owned")" = 401
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/personal/waiting")" = 401
}

check_http http://127.0.0.1:18628
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
grep -qF 'client_max_body_size 16m;' "$nginx_config"
nginx -t
check_http http://127.0.0.1:8522
check_http https://control.e-rd.ru
curl --max-time 15 -fsS https://control.e-rd.ru/api/health > "$backup/public-health.json"
test "$(systemctl is-active business-control)" = active
test "$(sqlite3 "$db" 'PRAGMA integrity_check;')" = ok
test "$(sqlite3 "$db" 'SELECT COUNT(*) FROM pragma_foreign_key_check;')" = 0
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='055_reading_reflections.sql';")" = 1
printf 'RELEASE=%s\nCOMMIT=%s\nSHA256=%s\nDEPLOY=ok\n' "$release" "$CANDIDATE_COMMIT" "$EXPECTED_SHA256"
