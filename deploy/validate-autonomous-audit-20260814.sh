#!/usr/bin/env bash
set -Eeuo pipefail

DATABASE="/var/lib/business-control/business-control.db"
TEST_DATABASE="/tmp/autonomous-audit-seed-test.db"
SEED_SQL="/tmp/seed-autonomous-audit-tasks-20260814.sql"
VERIFY_SQL="/tmp/verify-autonomous-audit-20260814.sql"

cleanup() {
  rm -f "$TEST_DATABASE" "$TEST_DATABASE-wal" "$TEST_DATABASE-shm"
}
trap cleanup EXIT

test -f "$DATABASE"
test -f "$SEED_SQL"
test -f "$VERIFY_SQL"
cleanup
sqlite3 "$DATABASE" ".backup '$TEST_DATABASE'"
test -s "$TEST_DATABASE"
sqlite3 -bail "$TEST_DATABASE" < "$SEED_SQL"
sqlite3 -bail "$TEST_DATABASE" < "$VERIFY_SQL"
test "$(sqlite3 "$TEST_DATABASE" 'PRAGMA integrity_check;')" = "ok"
test "$(sqlite3 "$TEST_DATABASE" 'SELECT COUNT(*) FROM pragma_foreign_key_check;')" = "0"
test "$(sqlite3 "$TEST_DATABASE" "SELECT COUNT(*) FROM records WHERE id LIKE 'c425d66%' AND status='completed';")" = "3"
echo "dry_run=ok"
