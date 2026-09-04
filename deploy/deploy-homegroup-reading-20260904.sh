#!/usr/bin/env bash
# Execute only on 159.194.231.150. All data/backups remain on that host.
set -Eeuo pipefail
: "${RELEASE_NAME:?}"
: "${CANDIDATE_COMMIT:?}"
: "${EXPECTED_SHA256:?}"
: "${EXPECTED_PREVIOUS:?}"
[[ "$RELEASE_NAME" =~ ^20260904-reading-[a-f0-9]+$ ]]
[[ "$CANDIDATE_COMMIT" =~ ^[a-f0-9]{40}$ ]]
[[ "$EXPECTED_SHA256" =~ ^[a-f0-9]{64}$ ]]
exec 9>/run/business-control-deploy.lock
flock -n 9
root=/opt/business-control
db=/var/lib/business-control/business-control.db
release="$root/releases/$RELEASE_NAME"
staged=/tmp/business-control-reading
previous=$(readlink -f "$root/current")
test "$previous" = "$EXPECTED_PREVIOUS"
test -x "$previous/business-control"
test ! -e "$release"
printf '%s  %s\n' "$EXPECTED_SHA256" "$staged" | sha256sum -c -
backup="/var/lib/business-control/backups/pre-reading-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 0700 "$backup"
sqlite3 "$db" '.timeout 5000' ".backup '$backup/business-control.db'"
tar -C /var/lib/business-control -czf "$backup/uploads.tar.gz" uploads
install -m 0600 /etc/business-control.env "$backup/business-control.env"
printf '%s\n' "$previous" > "$backup/previous-release.txt"
printf '%s\n' "$CANDIDATE_COMMIT" > "$backup/candidate-commit.txt"
(cd "$backup" && sha256sum business-control.db uploads.tar.gz business-control.env > SHA256SUMS)
test "$(sqlite3 "$backup/business-control.db" 'PRAGMA integrity_check;')" = ok
test "$(sqlite3 "$backup/business-control.db" 'SELECT COUNT(*) FROM pragma_foreign_key_check;')" = 0
install -d -m 0755 "$release"
install -m 0755 "$staged" "$release/business-control"
dry=$(mktemp -d /tmp/tessavie-reading-check.XXXXXX)
dry_pid=''; switched=0
cleanup() {
 result=$?
 trap - EXIT
 if [[ -n "$dry_pid" ]]; then kill "$dry_pid" 2>/dev/null || true; wait "$dry_pid" 2>/dev/null || true; fi
 if [[ "$result" -ne 0 && "$switched" -eq 1 ]]; then
   systemctl stop business-control || true
   ln -sfn "$previous" "$root/current.next"
   mv -Tf "$root/current.next" "$root/current"
   systemctl start business-control
   printf 'ROLLED_BACK_BINARY=%s\n' "$previous" >&2
 fi
 # Preserve dry-run logs and additive tables for diagnosis, never restore a stale
 # database over new user writes. Forward-fix is preferred after real usage.
 printf 'BACKUP=%s\nDRY_RUN_DIRECTORY=%s\n' "$backup" "$dry"
 exit "$result"
}
trap cleanup EXIT
python3 - <<'PY'
import socket
with socket.socket() as s: s.bind(('127.0.0.1', 18641))
PY
cp "$backup/business-control.db" "$dry/check.db"
mkdir "$dry/uploads"
chown -R business-control:business-control "$dry"
runuser -u business-control -- env BUSINESS_ADDRESS=127.0.0.1:18641 BUSINESS_DATABASE_PATH="$dry/check.db" BUSINESS_UPLOAD_PATH="$dry/uploads" "$release/business-control" > "$dry/server.log" 2>&1 &
dry_pid=$!
for attempt in $(seq 1 30); do
 if curl --max-time 2 -fsS http://127.0.0.1:18641/api/health >/dev/null 2>&1; then break; fi
 test "$attempt" -lt 30; sleep 1
done
python3 - "$backup/business-control.db" "$dry/check.db" <<'PY'
import sqlite3,sys
old,new=[sqlite3.connect(p) for p in sys.argv[1:]]
assert new.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
assert not new.execute('PRAGMA foreign_key_check').fetchall()
for (table,) in old.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'schema_migrations'"):
    quoted='"'+table.replace('"','""')+'"'
    assert old.execute('SELECT * FROM '+quoted+' ORDER BY rowid').fetchall()==new.execute('SELECT * FROM '+quoted+' ORDER BY rowid').fetchall(), table
assert new.execute("SELECT 1 FROM schema_migrations WHERE version='041_homegroup_reading.sql'").fetchone()
PY
python3 /tmp/seed-homegroup-reading.py --database "$dry/check.db" --base-url http://127.0.0.1:18641 > "$dry/seed.json"
python3 /tmp/seed-homegroup-reading.py --database "$dry/check.db" --base-url http://127.0.0.1:18641 > "$dry/seed-repeat.json"
check_http() {
 local base="$1"
 curl --max-time 15 -fsS "$base/reading.js?v=20260904-reading-1" > "$dry/reading.js"
 grep -q 'export function createReadingUI' "$dry/reading.js"
 curl --max-time 15 -fsS "$base/" > "$dry/index.html"
 grep -q 'app.js?v=20260904-reading-1' "$dry/index.html"
 test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$base/api/reading")" = 401
 test "$(curl --max-time 10 -s -X POST -H 'Content-Type: application/json' -d '{}' -o /dev/null -w '%{http_code}' "$base/api/reading/entries")" = 401
}
check_http http://127.0.0.1:18641
kill "$dry_pid"; wait "$dry_pid" 2>/dev/null || true; dry_pid=''
test "$(readlink -f "$root/current")" = "$previous"
switched=1
systemctl stop business-control
sqlite3 "$db" '.timeout 5000' ".backup '$backup/cutover.db'"
ln -sfn "$release" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
systemctl start business-control
for attempt in $(seq 1 30); do
 if curl --max-time 2 -fsS http://127.0.0.1:8522/api/health >/dev/null 2>&1; then break; fi
 test "$attempt" -lt 30; sleep 1
done
check_http http://127.0.0.1:8522
check_http https://control.e-rd.ru
python3 /tmp/seed-homegroup-reading.py > "$backup/homegroup-receipt.json"
test "$(systemctl is-active business-control)" = active
test "$(sqlite3 "$db" 'PRAGMA integrity_check;')" = ok
test "$(sqlite3 "$db" 'SELECT COUNT(*) FROM pragma_foreign_key_check;')" = 0
printf 'RELEASE=%s\nCOMMIT=%s\nSHA256=%s\nDEPLOY=ok\n' "$release" "$CANDIDATE_COMMIT" "$EXPECTED_SHA256"
