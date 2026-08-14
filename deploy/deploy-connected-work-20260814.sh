#!/usr/bin/env bash
set -Eeuo pipefail

RELEASE_NAME="20260814-connected-work-d004d7e"
APP_ROOT="/opt/business-control"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_NAME"
STAGED_BINARY="/tmp/business-control-d004d7e"
DATABASE="/var/lib/business-control/business-control.db"
BACKUP_DIR="/var/lib/business-control/backups"
PREVIOUS_RELEASE="$(readlink -f "$APP_ROOT/current")"
BACKUP="$BACKUP_DIR/business-control-$(date -u +%Y%m%d-%H%M%S)-pre-connected-work.db"
SWITCHED=0

rollback() {
  exit_code=$?
  if [[ $exit_code -ne 0 && $SWITCHED -eq 1 ]]; then
    echo "deployment failed; rolling application back to $PREVIOUS_RELEASE" >&2
    ln -sfn "$PREVIOUS_RELEASE" "$APP_ROOT/current.next"
    mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"
    systemctl restart business-control || true
  fi
  exit "$exit_code"
}
trap rollback EXIT

test -x "$STAGED_BINARY"
test -f "$DATABASE"
mkdir -p "$BACKUP_DIR" "$RELEASE_DIR"

systemctl stop business-control
sqlite3 "$DATABASE" ".backup '$BACKUP'"
chown business-control:business-control "$BACKUP"
chmod 0640 "$BACKUP"
test "$(sqlite3 "$BACKUP" 'PRAGMA integrity_check;')" = "ok"

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
test "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM schema_migrations WHERE version IN ('004_record_priority.sql','005_collaboration_hierarchy_activity.sql');")" = "2"
test "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM pragma_table_info('records') WHERE name IN ('priority','workstream','edit_policy','parent_id','is_root','actual_minutes');")" = "6"

SWITCHED=0
trap - EXIT
echo "release=$RELEASE_DIR"
echo "previous=$PREVIOUS_RELEASE"
echo "backup=$BACKUP"
echo "backup_sha256=$(sha256sum "$BACKUP" | awk '{print $1}')"
echo "database_integrity=$(sqlite3 "$DATABASE" 'PRAGMA integrity_check;')"
echo "users=$(sqlite3 "$DATABASE" 'SELECT COUNT(*) FROM users;')"
echo "records=$(sqlite3 "$DATABASE" 'SELECT COUNT(*) FROM records;')"
