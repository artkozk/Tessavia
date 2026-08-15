#!/usr/bin/env bash
set -Eeuo pipefail

RELEASE_NAME="${RELEASE_NAME:-20260814-production-quality}"
STAGED_BINARY="${STAGED_BINARY:-/tmp/business-control-production-quality}"
APP_ROOT="/opt/business-control"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_NAME"
DATABASE="/var/lib/business-control/business-control.db"
BACKUP_DIR="/var/lib/business-control/backups"
ENV_FILE="/etc/business-control.env"
PREVIOUS_RELEASE="$(readlink -f "$APP_ROOT/current")"
BACKUP="$BACKUP_DIR/business-control-$(date -u +%Y%m%d-%H%M%S)-pre-production-quality.db"
SWITCHED=0
SMOKE_TOKEN_HASH=""

cleanup_smoke_session() {
  if [[ -n "$SMOKE_TOKEN_HASH" && -f "$DATABASE" ]]; then
    sqlite3 "$DATABASE" "DELETE FROM sessions WHERE token_hash='$SMOKE_TOKEN_HASH';" || true
  fi
}

rollback() {
  exit_code=$?
  cleanup_smoke_session
  if [[ $exit_code -ne 0 && $SWITCHED -eq 1 && -n "$PREVIOUS_RELEASE" ]]; then
    echo "deployment failed; restoring previous release" >&2
    systemctl stop business-control || true
    ln -sfn "$PREVIOUS_RELEASE" "$APP_ROOT/current.next"
    mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"
    systemctl start business-control || true
  fi
  exit "$exit_code"
}
trap rollback EXIT

test -x "$STAGED_BINARY"
test -f "$DATABASE"
test -f "$ENV_FILE"
grep -Eq '^GEMINI_API_KEY=.+$' "$ENV_FILE"
install -d -o business-control -g business-control -m 0750 "$BACKUP_DIR"
install -d -o root -g root -m 0755 "$RELEASE_DIR"

sqlite3 "$DATABASE" ".timeout 5000" ".backup '$BACKUP'"
chown business-control:business-control "$BACKUP"
chmod 0640 "$BACKUP"
test "$(sqlite3 "$BACKUP" 'PRAGMA integrity_check;')" = "ok"
test "$(sqlite3 "$BACKUP" 'SELECT COUNT(*) FROM pragma_foreign_key_check;')" = "0"

if grep -q '^GEMINI_MODEL=' "$ENV_FILE"; then
  sed -i 's#^GEMINI_MODEL=.*#GEMINI_MODEL=gemini-2.5-flash#' "$ENV_FILE"
else
  printf '\nGEMINI_MODEL=gemini-2.5-flash\n' >> "$ENV_FILE"
fi
if grep -q '^GEMINI_BASE_URL=' "$ENV_FILE"; then
  sed -i 's#^GEMINI_BASE_URL=.*#GEMINI_BASE_URL=https://aiplatform.googleapis.com/v1/publishers/google#' "$ENV_FILE"
else
  printf 'GEMINI_BASE_URL=https://aiplatform.googleapis.com/v1/publishers/google\n' >> "$ENV_FILE"
fi
chown root:root "$ENV_FILE"
chmod 0600 "$ENV_FILE"

install -o root -g root -m 0755 "$STAGED_BINARY" "$RELEASE_DIR/business-control"
systemctl stop business-control
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
assert payload.get('configured') is True, payload
assert payload.get('provider') == 'gemini', payload
assert payload.get('model') == 'gemini-2.5-flash', payload
assert payload.get('source') in {'gemini', 'heuristic'}, payload
if payload.get('source') == 'heuristic':
    assert 'биллинг' in payload.get('message', '').lower(), payload
PY
cleanup_smoke_session
SMOKE_TOKEN_HASH=""

systemctl start business-control-backup.service
test "$(systemctl is-enabled business-control-backup.timer)" = "enabled"
test "$(systemctl is-active business-control-backup.timer)" = "active"
test -n "$(find /var/backups/business-control -maxdepth 1 -type f -name 'business-control-*.tar.gz.enc' -print -quit)"

SWITCHED=0
trap - EXIT
echo "release=$RELEASE_DIR"
echo "previous=$PREVIOUS_RELEASE"
echo "pre_release_backup=$BACKUP"
echo "backup_sha256=$(sha256sum "$BACKUP" | awk '{print $1}')"
echo "binary_sha256=$(sha256sum "$RELEASE_DIR/business-control" | awk '{print $1}')"
echo "database_integrity=$(sqlite3 "$DATABASE" 'PRAGMA integrity_check;')"
echo "foreign_key_violations=$(sqlite3 "$DATABASE" 'SELECT COUNT(*) FROM pragma_foreign_key_check;')"
echo "ai_health=$(cat /tmp/business-control-ai-health.json)"
