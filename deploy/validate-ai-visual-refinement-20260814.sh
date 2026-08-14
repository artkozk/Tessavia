#!/usr/bin/env bash
set -Eeuo pipefail

DATABASE="${DATABASE:-/var/lib/business-control/business-control.db}"
TEST_DATABASE="${TEST_DATABASE:-/tmp/ai-visual-refinement-seed-test.db}"
SEED_SQL="${SEED_SQL:-/tmp/seed-ai-visual-refinement-tasks-20260814.sql}"

cleanup() {
  rm -f "$TEST_DATABASE" "$TEST_DATABASE-wal" "$TEST_DATABASE-shm"
}
trap cleanup EXIT

test -f "$DATABASE"
test -f "$SEED_SQL"
cleanup
sqlite3 "$DATABASE" ".backup '$TEST_DATABASE'"
test -s "$TEST_DATABASE"
sqlite3 -bail "$TEST_DATABASE" < "$SEED_SQL"
test "$(sqlite3 "$TEST_DATABASE" 'PRAGMA integrity_check;')" = "ok"
test "$(sqlite3 "$TEST_DATABASE" 'SELECT COUNT(*) FROM pragma_foreign_key_check;')" = "0"
test "$(sqlite3 "$TEST_DATABASE" "SELECT COUNT(*) FROM records WHERE id LIKE 'a114f10%' AND status='completed';")" = "4"
test "$(sqlite3 "$TEST_DATABASE" "SELECT COUNT(*) FROM task_proofs WHERE record_id LIKE 'a114f10%';")" = "4"
test "$(sqlite3 "$TEST_DATABASE" "SELECT COUNT(*) FROM records WHERE id='d004d7e0000000000000000000000008' AND status='blocked';")" = "1"
echo "dry_run=ok"
