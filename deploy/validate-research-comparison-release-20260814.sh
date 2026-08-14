#!/usr/bin/env bash
set -Eeuo pipefail

DATABASE="${DATABASE:-/var/lib/business-control/business-control.db}"
TEST_DATABASE="${TEST_DATABASE:-/tmp/research-comparison-release-test.db}"
MIGRATION_SQL="${MIGRATION_SQL:-/tmp/006_research_comparison.sql}"
SEED_SQL="${SEED_SQL:-/tmp/seed-research-comparison-release-20260814.sql}"

cleanup() {
  rm -f "$TEST_DATABASE" "$TEST_DATABASE-wal" "$TEST_DATABASE-shm"
}
trap cleanup EXIT

test -f "$DATABASE"
test -f "$MIGRATION_SQL"
test -f "$SEED_SQL"
cleanup
sqlite3 "$DATABASE" ".backup '$TEST_DATABASE'"
test -s "$TEST_DATABASE"

if [[ "$(sqlite3 "$TEST_DATABASE" "SELECT COUNT(*) FROM schema_migrations WHERE version='006_research_comparison.sql';")" = "0" ]]; then
  {
    echo 'BEGIN IMMEDIATE;'
    cat "$MIGRATION_SQL"
    echo "INSERT INTO schema_migrations(version, applied_at) VALUES('006_research_comparison.sql', strftime('%Y-%m-%dT%H:%M:%fZ','now'));"
    echo 'COMMIT;'
  } | sqlite3 -bail "$TEST_DATABASE"
fi

sqlite3 -bail "$TEST_DATABASE" < "$SEED_SQL"
first_options="$(sqlite3 "$TEST_DATABASE" "SELECT COUNT(*) FROM research_options WHERE id LIKE 'c214f2%';")"
first_fields="$(sqlite3 "$TEST_DATABASE" "SELECT COUNT(*) FROM research_option_fields WHERE id LIKE 'c214f2%';")"
sqlite3 -bail "$TEST_DATABASE" < "$SEED_SQL"

test "$(sqlite3 "$TEST_DATABASE" 'PRAGMA integrity_check;')" = "ok"
test "$(sqlite3 "$TEST_DATABASE" 'SELECT COUNT(*) FROM pragma_foreign_key_check;')" = "0"
test "$(sqlite3 "$TEST_DATABASE" "SELECT COUNT(*) FROM schema_migrations WHERE version='006_research_comparison.sql';")" = "1"
test "$(sqlite3 "$TEST_DATABASE" "SELECT COUNT(*) FROM records WHERE id='c214f200000000000000000000000031' AND status='completed';")" = "1"
test "$(sqlite3 "$TEST_DATABASE" "SELECT COUNT(*) FROM task_proofs WHERE id='c214f200000000000000000000000032';")" = "1"
test "$(sqlite3 "$TEST_DATABASE" "SELECT COUNT(*) FROM records WHERE id='c314f300000000000000000000000031' AND status='completed';")" = "1"
test "$(sqlite3 "$TEST_DATABASE" "SELECT COUNT(*) FROM task_proofs WHERE id='c314f300000000000000000000000032';")" = "1"
test "$(sqlite3 "$TEST_DATABASE" "SELECT COUNT(*) FROM records WHERE id='c414f400000000000000000000000031' AND status='completed';")" = "1"
test "$(sqlite3 "$TEST_DATABASE" "SELECT COUNT(*) FROM task_proofs WHERE id='c414f400000000000000000000000032';")" = "1"
test "$(sqlite3 "$TEST_DATABASE" "SELECT COUNT(*) FROM research_options WHERE id LIKE 'c214f2%';")" = "$first_options"
test "$(sqlite3 "$TEST_DATABASE" "SELECT COUNT(*) FROM research_option_fields WHERE id LIKE 'c214f2%';")" = "$first_fields"

target_count="$(sqlite3 "$TEST_DATABASE" "SELECT COUNT(*) FROM records r JOIN users u ON u.id=r.author_id WHERE r.type='research' AND trim(r.title)='Выбор сервера' COLLATE NOCASE AND u.username='artkozk' COLLATE NOCASE;")"
if [[ "$target_count" -gt 0 ]]; then
  test "$first_options" -ge 2
  test "$first_fields" -ge 5
fi

echo "dry_run=ok"
echo "seeded_fields=$first_fields"
echo "seeded_options=$first_options"
