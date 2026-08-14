#!/usr/bin/env bash
set -Eeuo pipefail

RELEASE_NAME="${RELEASE_NAME:-20260814-ai-visual-46b3237}"
APP_ROOT="/opt/business-control"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_NAME"
STAGED_BINARY="${STAGED_BINARY:-/tmp/business-control-ai-visual}"
SEED_SQL="${SEED_SQL:-/tmp/seed-ai-visual-refinement-tasks-20260814.sql}"
DATABASE="/var/lib/business-control/business-control.db"
BACKUP_DIR="/var/lib/business-control/backups"
ENV_FILE="/etc/business-control.env"
PREVIOUS_RELEASE="$(readlink -f "$APP_ROOT/current")"
BACKUP="$BACKUP_DIR/business-control-$(date -u +%Y%m%d-%H%M%S)-pre-ai-visual.db"
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
test -f "$SEED_SQL"
test -f "$DATABASE"
test -f "$ENV_FILE"
mkdir -p "$BACKUP_DIR" "$RELEASE_DIR"

systemctl stop business-control
sqlite3 "$DATABASE" ".backup '$BACKUP'"
chown business-control:business-control "$BACKUP"
chmod 0640 "$BACKUP"
test "$(sqlite3 "$BACKUP" 'PRAGMA integrity_check;')" = "ok"

install -o root -g root -m 0755 "$STAGED_BINARY" "$RELEASE_DIR/business-control"
sqlite3 -bail "$DATABASE" < "$SEED_SQL"
DATABASE_MUTATED=1
chown business-control:business-control "$DATABASE" "$DATABASE-wal" "$DATABASE-shm" 2>/dev/null || true
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
test "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM records WHERE id LIKE 'a114f10%' AND status='completed';")" = "4"
test "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM task_proofs WHERE record_id LIKE 'a114f10%';")" = "4"
test "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM records WHERE id='d004d7e0000000000000000000000008' AND status='blocked';")" = "1"

SWITCHED=0
DATABASE_MUTATED=0
trap - EXIT
echo "release=$RELEASE_DIR"
echo "previous=$PREVIOUS_RELEASE"
echo "backup=$BACKUP"
echo "backup_sha256=$(sha256sum "$BACKUP" | awk '{print $1}')"
echo "database_integrity=$(sqlite3 "$DATABASE" 'PRAGMA integrity_check;')"
echo "refinement_tasks=$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM records WHERE id LIKE 'a114f10%' AND status='completed';")"
echo "refinement_proofs=$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM task_proofs WHERE record_id LIKE 'a114f10%';")"
