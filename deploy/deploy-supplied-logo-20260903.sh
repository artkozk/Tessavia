#!/usr/bin/env bash
set -Eeuo pipefail
: "${RELEASE_NAME:?Set release name}"
: "${CANDIDATE_COMMIT:?Set source commit}"
: "${EXPECTED_SHA256:?Set binary hash}"
: "${EXPECTED_PREVIOUS:?Set verified previous release}"
: "${ASSET_VERSION:=20260903-supplied-logo-1}"
: "${BRAND_VERSION:=supplied-1}"
: "${EXPECTED_LOGO_WIDTH:=}"
[[ "$ASSET_VERSION" =~ ^20260903-(supplied|compact|linked)-logo-1$ ]]
[[ "$BRAND_VERSION" =~ ^(supplied|linked)-1$ ]]
[[ -z "$EXPECTED_LOGO_WIDTH" || "$EXPECTED_LOGO_WIDTH" =~ ^[0-9]{2,3}px$ ]]
[[ "$RELEASE_NAME" =~ ^20260903-supplied-logo-[a-f0-9]+$ ]]
[[ "$CANDIDATE_COMMIT" =~ ^[a-f0-9]{7,40}$ ]]
[[ "$EXPECTED_SHA256" =~ ^[a-f0-9]{64}$ ]]
exec 9>/run/business-control-deploy.lock
flock -n 9
root=/opt/business-control
release="$root/releases/$RELEASE_NAME"
staged=/tmp/business-control-supplied-logo
db=/var/lib/business-control/business-control.db
previous=$(readlink -f "$root/current")
test "$previous" = "$EXPECTED_PREVIOUS"
backup="/var/lib/business-control/backups/pre-supplied-logo-$(date -u +%Y%m%dT%H%M%SZ)"
dry=''; dry_pid=''; switch_started=0
cleanup() {
  result=$?
  trap - EXIT
  if [[ -n "$dry_pid" ]]; then kill "$dry_pid" 2>/dev/null || true; wait "$dry_pid" 2>/dev/null || true; fi
  if [[ -n "$dry" && "$dry" == /tmp/tessavie-logo-check.* ]]; then rm -rf -- "$dry"; fi
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
test -f "$staged"; test -f "$db"; test -x "$previous/business-control"; test ! -e "$release"
printf '%s  %s\n' "$EXPECTED_SHA256" "$staged" | sha256sum -c -
python3 - <<'PY'
import socket
with socket.socket() as s: s.bind(('127.0.0.1', 18547))
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
dry=$(mktemp -d /tmp/tessavie-logo-check.XXXXXX)
cp "$backup/business-control.db" "$dry/check.db"
mkdir "$dry/uploads"
chown -R business-control:business-control "$dry"
runuser -u business-control -- env BUSINESS_ADDRESS=127.0.0.1:18547 BUSINESS_DATABASE_PATH="$dry/check.db" BUSINESS_UPLOAD_PATH="$dry/uploads" "$release/business-control" > "$dry/server.log" 2>&1 &
dry_pid=$!
for attempt in $(seq 1 30); do
  if curl --max-time 3 -fsS http://127.0.0.1:18547/api/health > "$dry/health.json" 2>/dev/null; then break; fi
  test "$attempt" -lt 30; sleep 1
done
python3 - "$backup/business-control.db" "$dry/check.db" <<'PY'
import sqlite3, sys
before, after = [sqlite3.connect('file:'+p+'?mode=ro', uri=True) for p in sys.argv[1:]]
before.row_factory = after.row_factory = sqlite3.Row
tables = [r[0] for r in before.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
for table in tables:
    query = 'SELECT * FROM "'+table.replace('"','""')+'" ORDER BY rowid'
    old, new = [dict(r) for r in before.execute(query)], [dict(r) for r in after.execute(query)]
    assert len(old) == len(new), table+' row count changed'
    for a, b in zip(old, new):
        assert a == b, table+' unexpected content change'
assert after.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not after.execute('PRAGMA foreign_key_check').fetchall()
assert after.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='029_tessavie_brand.sql'").fetchone()[0] == 1
print('DATA_PRESERVATION=ok')
PY
check_http() {
  local base="$1"
  curl --max-time 15 -fsS "$base/" > "$dry/index.html"
  grep -q '<title>Tessavie</title>' "$dry/index.html"
  grep -qF "$ASSET_VERSION" "$dry/index.html"
  ! grep -qi 'bizflow' "$dry/index.html"
  ! grep -q 'tessavie.css\|auth-weave' "$dry/index.html"
  ! grep -q 'brand-symbol' "$dry/index.html"
  grep -qF "tessavie-logo-light.svg?v=$BRAND_VERSION" "$dry/index.html"
  grep -qF "tessavie-logo.svg?v=$BRAND_VERSION" "$dry/index.html"
  curl --max-time 15 -fsS "$base/styles.css" > "$dry/styles.css"
  grep -q -- '--accent: #126a55;' "$dry/styles.css"
  grep -q -- '--nav: #202824;' "$dry/styles.css"
  if [[ -n "$EXPECTED_LOGO_WIDTH" ]]; then
    grep -qF ".brand > .tessavie-logo { width: $EXPECTED_LOGO_WIDTH;" "$dry/styles.css"
  fi
  grep -qF '.personal-create-menu { position: relative; align-self: auto; }' "$dry/styles.css"
  curl --max-time 15 -fsS "$base/manifest.webmanifest" > "$dry/manifest.json"
  python3 -c 'import json,sys; m=json.load(open(sys.argv[1])); assert m["name"]=="Tessavie" and m["background_color"]=="#faf9f5" and m["theme_color"]=="#14725e" and all("?v="+sys.argv[2] in i["src"] for i in m["icons"])' "$dry/manifest.json" "$BRAND_VERSION"
  for asset in tessavie-logo.svg tessavie-logo-light.svg tessavie-mark.svg tessavie-32.png tessavie-180.png tessavie-192.png tessavie-512.png tessavie-maskable-512.png; do
    curl --max-time 15 -fsS "$base/brand/$asset" > /dev/null
  done
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/personal/overview")" = 401
}
check_http http://127.0.0.1:18547
kill "$dry_pid"; wait "$dry_pid" 2>/dev/null || true; dry_pid=''
printf 'DRY_RUN=ok\n'
test "$(readlink -f "$root/current")" = "$previous"
switch_started=1
systemctl stop business-control
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
test "$(sqlite3 "$db" "SELECT COUNT(*) FROM schema_migrations WHERE version='029_tessavie_brand.sql';")" = 1
printf 'RELEASE=%s\nCOMMIT=%s\nSHA256=%s\nDEPLOY=ok\n' "$release" "$CANDIDATE_COMMIT" "$EXPECTED_SHA256"
