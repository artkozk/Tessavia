#!/usr/bin/env bash
set -Eeuo pipefail

: "${RELEASE_NAME:?Set release name}"
: "${CANDIDATE_COMMIT:?Set source commit}"
: "${EXPECTED_SHA256:?Set expected binary hash}"
[[ "$RELEASE_NAME" =~ ^20260902-navigation-layout-[a-f0-9]+$ ]]
[[ "$CANDIDATE_COMMIT" =~ ^[a-f0-9]{7,40}$ ]]
[[ "$EXPECTED_SHA256" =~ ^[a-f0-9]{64}$ ]]
exec 9>/run/business-control-deploy.lock
flock -n 9

root=/opt/business-control
release="$root/releases/$RELEASE_NAME"
staged=/tmp/business-control-navigation-layout
db=/var/lib/business-control/business-control.db
previous=$(readlink -f "$root/current")
backup="/var/lib/business-control/backups/pre-navigation-layout-$(date -u +%Y%m%dT%H%M%SZ)"
dry=''
dry_pid=''
switch_started=0

cleanup() {
  result=$?
  trap - EXIT
  if [[ -n "$dry_pid" ]]; then kill "$dry_pid" 2>/dev/null || true; wait "$dry_pid" 2>/dev/null || true; fi
  if [[ -n "$dry" && "$dry" == /tmp/bizflow-layout-check.* ]]; then rm -rf -- "$dry"; fi
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

test -f "$staged"
test -f "$db"
test -x "$previous/business-control"
test ! -e "$release"
printf '%s  %s\n' "$EXPECTED_SHA256" "$staged" | sha256sum -c -
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
dry=$(mktemp -d /tmp/bizflow-layout-check.XXXXXX)
cp "$backup/business-control.db" "$dry/check.db"
mkdir "$dry/uploads"
chown -R business-control:business-control "$dry"
runuser -u business-control -- env BUSINESS_ADDRESS=127.0.0.1:18537 BUSINESS_DATABASE_PATH="$dry/check.db" BUSINESS_UPLOAD_PATH="$dry/uploads" "$release/business-control" > "$dry/server.log" 2>&1 &
dry_pid=$!
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:18537/api/health > "$dry/health.json" 2>/dev/null; then break; fi
  test "$attempt" -lt 30
  sleep 1
done
curl -fsS http://127.0.0.1:18537/ > "$dry/index.html"
grep -q '20260902-navigation-layout-1' "$dry/index.html"
test "$(sqlite3 "$dry/check.db" 'PRAGMA integrity_check;')" = ok
test "$(sqlite3 "$dry/check.db" 'SELECT COUNT(*) FROM pragma_foreign_key_check;')" = 0
test "$(sqlite3 "$dry/check.db" "SELECT COUNT(*) FROM schema_migrations WHERE version='020_interface_layout.sql';")" = 1
kill "$dry_pid"
wait "$dry_pid" 2>/dev/null || true
dry_pid=''
printf 'DRY_RUN=ok\n'

switch_started=1
systemctl stop business-control
ln -sfn "$release" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
systemctl start business-control
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8522/api/health > "$backup/local-health.json" 2>/dev/null; then break; fi
  test "$attempt" -lt 30
  sleep 1
done
curl -fsS http://127.0.0.1:8522/ > "$backup/local-index.html"
curl -fsS https://control.e-rd.ru/ > "$backup/public-index.html"
curl -fsS https://control.e-rd.ru/api/health > "$backup/public-health.json"
grep -q '20260902-navigation-layout-1' "$backup/local-index.html"
grep -q '20260902-navigation-layout-1' "$backup/public-index.html"
test "$(systemctl is-active business-control)" = active
test "$(sqlite3 "$db" 'PRAGMA integrity_check;')" = ok
test "$(sqlite3 "$db" 'SELECT COUNT(*) FROM pragma_foreign_key_check;')" = 0
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='020_interface_layout.sql';")" = 1
printf 'RELEASE=%s\nCOMMIT=%s\nSHA256=%s\nDEPLOY=ok\n' "$release" "$CANDIDATE_COMMIT" "$EXPECTED_SHA256"
