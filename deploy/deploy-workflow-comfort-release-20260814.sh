#!/usr/bin/env bash
set -Eeuo pipefail

RELEASE_NAME="${RELEASE_NAME:-20260814-workflow-comfort}"
APP_ROOT="/opt/business-control"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_NAME"
STAGED_BINARY="${STAGED_BINARY:-/tmp/business-control-workflow-comfort}"
MIGRATION_SQL="${MIGRATION_SQL:-/tmp/007_workflow_comfort.sql}"
SEED_SQL="${SEED_SQL:-/tmp/seed-workflow-comfort-release-20260814.sql}"
BACKUP_SCRIPT="${BACKUP_SCRIPT:-/tmp/business-control-backup.sh}"
BACKUP_SERVICE="${BACKUP_SERVICE:-/tmp/business-control-backup.service}"
BACKUP_TIMER="${BACKUP_TIMER:-/tmp/business-control-backup.timer}"
DATABASE="/var/lib/business-control/business-control.db"
UPLOADS="/var/lib/business-control/uploads"
BACKUP_DIR="/var/lib/business-control/backups"
ENCRYPTED_BACKUP_DIR="/var/backups/business-control"
ENV_FILE="/etc/business-control.env"
BACKUP_KEY_FILE="/etc/business-control-backup.key"
PREVIOUS_RELEASE="$(readlink -f "$APP_ROOT/current")"
BACKUP="$BACKUP_DIR/business-control-$(date -u +%Y%m%d-%H%M%S)-pre-workflow-comfort.db"
SWITCHED=0
DATABASE_MUTATED=0
SMOKE_TOKEN_HASH=""

cleanup_smoke_session() {
  if [[ -n "$SMOKE_TOKEN_HASH" && -f "$DATABASE" ]]; then
    sqlite3 "$DATABASE" "DELETE FROM sessions WHERE token_hash='$SMOKE_TOKEN_HASH';" || true
  fi
}

rollback() {
  exit_code=$?
  cleanup_smoke_session
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
test -f "$BACKUP_SCRIPT"
test -f "$BACKUP_SERVICE"
test -f "$BACKUP_TIMER"
test -f "$DATABASE"
test -f "$ENV_FILE"
grep -Eq '^GEMINI_API_KEY=.+$' "$ENV_FILE"

install -d -o business-control -g business-control -m 0750 "$UPLOADS" "$BACKUP_DIR"
install -d -o root -g root -m 0700 "$ENCRYPTED_BACKUP_DIR"
install -d -o root -g root -m 0755 "$RELEASE_DIR"
if [[ ! -s "$BACKUP_KEY_FILE" ]]; then
  umask 077
  openssl rand -hex 32 > "$BACKUP_KEY_FILE"
fi
chown root:root "$BACKUP_KEY_FILE"
chmod 0600 "$BACKUP_KEY_FILE"

systemctl stop business-control
sqlite3 "$DATABASE" ".backup '$BACKUP'"
chown business-control:business-control "$BACKUP"
chmod 0640 "$BACKUP"
test "$(sqlite3 "$BACKUP" 'PRAGMA integrity_check;')" = "ok"

if [[ "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM schema_migrations WHERE version='007_workflow_comfort.sql';")" = "0" ]]; then
  {
    echo 'BEGIN IMMEDIATE;'
    cat "$MIGRATION_SQL"
    echo "INSERT INTO schema_migrations(version, applied_at) VALUES('007_workflow_comfort.sql', strftime('%Y-%m-%dT%H:%M:%fZ','now'));"
    echo 'COMMIT;'
  } | sqlite3 -bail "$DATABASE"
  DATABASE_MUTATED=1
fi

sqlite3 -bail "$DATABASE" < "$SEED_SQL"
DATABASE_MUTATED=1
chown business-control:business-control "$DATABASE" "$DATABASE-wal" "$DATABASE-shm" 2>/dev/null || true

install -o root -g root -m 0755 "$STAGED_BINARY" "$RELEASE_DIR/business-control"
install -o root -g root -m 0755 "$BACKUP_SCRIPT" /usr/local/sbin/business-control-backup
install -o root -g root -m 0644 "$BACKUP_SERVICE" /etc/systemd/system/business-control-backup.service
install -o root -g root -m 0644 "$BACKUP_TIMER" /etc/systemd/system/business-control-backup.timer
systemctl daemon-reload
systemctl enable business-control-backup.timer >/dev/null

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
test "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM schema_migrations WHERE version='007_workflow_comfort.sql';")" = "1"
test "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM records WHERE id LIKE 'f814%' AND status='completed';")" = "7"
test "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM records WHERE id='f8140000000000000000000000000061' AND status='blocked';")" = "1"
test -d "$UPLOADS"

SMOKE_TOKEN="$(openssl rand -hex 32)"
SMOKE_TOKEN_HASH="$(printf '%s' "$SMOKE_TOKEN" | sha256sum | awk '{print $1}')"
SMOKE_USER_ID="$(sqlite3 "$DATABASE" "SELECT id FROM users WHERE username='artkozk' COLLATE NOCASE LIMIT 1;")"
test -n "$SMOKE_USER_ID"
SMOKE_NOW="$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)"
SMOKE_EXPIRES="$(date -u -d '+1 hour' +%Y-%m-%dT%H:%M:%S.%NZ)"
sqlite3 "$DATABASE" "INSERT INTO sessions(user_id, token_hash, expires_at, created_at, last_seen_at) VALUES($SMOKE_USER_ID, '$SMOKE_TOKEN_HASH', '$SMOKE_EXPIRES', '$SMOKE_NOW', '$SMOKE_NOW');"

curl -fsS --cookie "business_session=$SMOKE_TOKEN" http://127.0.0.1:8522/api/ai/health > /tmp/business-control-ai-health.json
python3 - <<'PY'
import json
with open('/tmp/business-control-ai-health.json', encoding='utf-8') as source:
    payload = json.load(source)
assert payload.get('provider') == 'gemini', payload
assert payload.get('configured') is True, payload
assert payload.get('source') in {'gemini', 'heuristic'}, payload
if payload.get('source') == 'gemini':
    assert payload.get('providerAvailable') is True, payload
else:
    assert payload.get('providerAvailable') is False, payload
with open('/tmp/business-control-ai-source', 'w', encoding='utf-8') as target:
    target.write(payload['source'])
PY
cleanup_smoke_session
SMOKE_TOKEN_HASH=""

if [[ "$(cat /tmp/business-control-ai-source)" = "gemini" ]]; then
  sqlite3 "$DATABASE" "UPDATE records SET status='completed', progress=100, completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), progress_note='Gemini прошёл production health-check; локальная эвристика остаётся резервным режимом.', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id IN ('f8140000000000000000000000000061','d004d7e0000000000000000000000008');"
fi

backup_output="$(systemctl start business-control-backup.service 2>&1 && journalctl -u business-control-backup.service -n 20 --no-pager)"
printf '%s\n' "$backup_output"
test "$(systemctl is-enabled business-control-backup.timer)" = "enabled"
test -n "$(find /var/backups/business-control -maxdepth 1 -type f -name 'business-control-*.tar.gz.enc' -print -quit)"

SWITCHED=0
DATABASE_MUTATED=0
trap - EXIT
echo "release=$RELEASE_DIR"
echo "previous=$PREVIOUS_RELEASE"
echo "pre_release_backup=$BACKUP"
echo "backup_sha256=$(sha256sum "$BACKUP" | awk '{print $1}')"
echo "database_integrity=$(sqlite3 "$DATABASE" 'PRAGMA integrity_check;')"
echo "gemini_health=$(cat /tmp/business-control-ai-health.json)"
