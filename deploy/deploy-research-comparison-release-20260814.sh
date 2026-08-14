#!/usr/bin/env bash
set -Eeuo pipefail

RELEASE_NAME="${RELEASE_NAME:-20260814-research-comparison}"
APP_ROOT="/opt/business-control"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_NAME"
STAGED_BINARY="${STAGED_BINARY:-/tmp/business-control-research-comparison}"
MIGRATION_SQL="${MIGRATION_SQL:-/tmp/006_research_comparison.sql}"
SEED_SQL="${SEED_SQL:-/tmp/seed-research-comparison-release-20260814.sql}"
DATABASE="/var/lib/business-control/business-control.db"
BACKUP_DIR="/var/lib/business-control/backups"
ENV_FILE="/etc/business-control.env"
PREVIOUS_RELEASE="$(readlink -f "$APP_ROOT/current")"
BACKUP="$BACKUP_DIR/business-control-$(date -u +%Y%m%d-%H%M%S)-pre-research-comparison.db"
SWITCHED=0
DATABASE_MUTATED=0

rollback() {
  exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    echo "deployment failed; restoring application and database" >&2
    systemctl stop business-control || true
    if [[ $DATABASE_MUTATED -eq 1 && -s "$BACKUP" ]]; then
      rm -f "$DATABASE-wal" "$DATABASE-shm"
      install -o business-control -g business-control -m 0640 "$BACKUP" "$DATABASE.restore"
      mv -f "$DATABASE.restore" "$DATABASE"
    fi
    if [[ $SWITCHED -eq 1 && -n "$PREVIOUS_RELEASE" ]]; then
      ln -sfn "$PREVIOUS_RELEASE" "$APP_ROOT/current.next"
      mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"
    fi
    systemctl start business-control || true
  fi
  exit "$exit_code"
}
trap rollback EXIT

test -x "$STAGED_BINARY"
test -f "$MIGRATION_SQL"
test -f "$SEED_SQL"
test -f "$DATABASE"
test -f "$ENV_FILE"
mkdir -p "$BACKUP_DIR" "$RELEASE_DIR"

systemctl stop business-control
sqlite3 "$DATABASE" ".backup '$BACKUP'"
chown business-control:business-control "$BACKUP"
chmod 0640 "$BACKUP"
test "$(sqlite3 "$BACKUP" 'PRAGMA integrity_check;')" = "ok"

if [[ "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM schema_migrations WHERE version='006_research_comparison.sql';")" = "0" ]]; then
  {
    echo 'BEGIN IMMEDIATE;'
    cat "$MIGRATION_SQL"
    echo "INSERT INTO schema_migrations(version, applied_at) VALUES('006_research_comparison.sql', strftime('%Y-%m-%dT%H:%M:%fZ','now'));"
    echo 'COMMIT;'
  } | sqlite3 -bail "$DATABASE"
  DATABASE_MUTATED=1
fi

sqlite3 -bail "$DATABASE" < "$SEED_SQL"
DATABASE_MUTATED=1
chown business-control:business-control "$DATABASE" "$DATABASE-wal" "$DATABASE-shm" 2>/dev/null || true
install -o root -g root -m 0755 "$STAGED_BINARY" "$RELEASE_DIR/business-control"
ln -sfn "$RELEASE_DIR" "$APP_ROOT/current.next"
mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"
SWITCHED=1
systemctl start business-control

for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8522/api/health >/dev/null; then
    break
  fi
  if [[ "$attempt" = "30" ]]; then
    echo "health check timed out" >&2
    exit 1
  fi
  sleep 1
done

test "$(systemctl is-active business-control)" = "active"
test "$(sqlite3 "$DATABASE" 'PRAGMA integrity_check;')" = "ok"
test "$(sqlite3 "$DATABASE" 'SELECT COUNT(*) FROM pragma_foreign_key_check;')" = "0"
test "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM schema_migrations WHERE version='006_research_comparison.sql';")" = "1"
test "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM records WHERE id='c214f200000000000000000000000031' AND status='completed';")" = "1"
test "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM task_proofs WHERE id='c214f200000000000000000000000032';")" = "1"
test "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM records WHERE id='c314f300000000000000000000000031' AND status='completed';")" = "1"
test "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM task_proofs WHERE id='c314f300000000000000000000000032';")" = "1"
test "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM records WHERE id='c414f400000000000000000000000031' AND status='completed';")" = "1"
test "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM task_proofs WHERE id='c414f400000000000000000000000032';")" = "1"

target_id="$(sqlite3 "$DATABASE" "SELECT r.id FROM records r JOIN users u ON u.id=r.author_id WHERE r.type='research' AND trim(r.title)='Выбор сервера' COLLATE NOCASE AND u.username='artkozk' COLLATE NOCASE ORDER BY r.updated_at DESC LIMIT 1;")"
if [[ -n "$target_id" ]]; then
  test "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM research_options WHERE record_id='$target_id' AND status='active';")" -ge 2
  test "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM research_option_fields WHERE record_id='$target_id' AND active=1;")" -ge 5
fi

SWITCHED=0
DATABASE_MUTATED=0
trap - EXIT
echo "release=$RELEASE_DIR"
echo "previous=$PREVIOUS_RELEASE"
echo "backup=$BACKUP"
echo "backup_sha256=$(sha256sum "$BACKUP" | awk '{print $1}')"
echo "database_integrity=$(sqlite3 "$DATABASE" 'PRAGMA integrity_check;')"
echo "research_target=${target_id:-not-found}"
