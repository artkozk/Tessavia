#!/usr/bin/env bash
set -Eeuo pipefail

RELEASE_NAME="${RELEASE_NAME:-20260815-ai-proxy}"
STAGED_BINARY="${STAGED_BINARY:-/tmp/business-control-ai-proxy}"
APP_ROOT="/opt/business-control"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_NAME"
DATABASE="/var/lib/business-control/business-control.db"
BACKUP_DIR="/var/lib/business-control/backups"
ENV_FILE="/etc/business-control.env"
PREVIOUS_RELEASE="$(readlink -f "$APP_ROOT/current")"
BACKUP="$BACKUP_DIR/business-control-$(date -u +%Y%m%d-%H%M%S)-pre-ai-proxy.db"
ENV_BACKUP="$(mktemp /tmp/business-control-env.XXXXXX)"
ENV_SNAPSHOT_READY=0
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
  if [[ $exit_code -ne 0 ]]; then
    if [[ $ENV_SNAPSHOT_READY -eq 1 ]]; then
      install -o root -g root -m 0600 "$ENV_BACKUP" "$ENV_FILE" || true
    fi
    if [[ $SWITCHED -eq 1 && -n "$PREVIOUS_RELEASE" ]]; then
      echo "deployment failed; restoring previous release" >&2
      systemctl stop business-control || true
      ln -sfn "$PREVIOUS_RELEASE" "$APP_ROOT/current.next"
      mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"
    fi
    systemctl start business-control || true
  fi
  rm -f "$ENV_BACKUP" /tmp/business-control-ai-health.json /tmp/business-control-ai-suggestion.json
  exit "$exit_code"
}
trap rollback EXIT

test -x "$STAGED_BINARY"
test -f "$DATABASE"
test -f "$ENV_FILE"
grep -Eq '^GEMINI_API_KEY=.+$' "$ENV_FILE"
grep -Eq '^AI_PROXY_URL=.+$' "$ENV_FILE"
cp "$ENV_FILE" "$ENV_BACKUP"
ENV_SNAPSHOT_READY=1
install -d -o business-control -g business-control -m 0750 "$BACKUP_DIR"
install -d -o root -g root -m 0755 "$RELEASE_DIR"

sqlite3 "$DATABASE" ".timeout 5000" ".backup '$BACKUP'"
chown business-control:business-control "$BACKUP"
chmod 0640 "$BACKUP"
test "$(sqlite3 "$BACKUP" 'PRAGMA integrity_check;')" = "ok"
test "$(sqlite3 "$BACKUP" 'SELECT COUNT(*) FROM pragma_foreign_key_check;')" = "0"

upsert_env() {
  name="$1"
  value="$2"
  if grep -q "^${name}=" "$ENV_FILE"; then
    sed -i "s#^${name}=.*#${name}=${value}#" "$ENV_FILE"
  else
    printf '%s=%s\n' "$name" "$value" >> "$ENV_FILE"
  fi
}
upsert_env GEMINI_MODEL gemini-2.5-flash
upsert_env GEMINI_BASE_URL https://generativelanguage.googleapis.com/v1beta
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
curl -fsS --cookie "business_session=$SMOKE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"type":"task","title":"Проверить рабочий канал Gemini","description":"Классифицируй внутреннюю тестовую задачу без изменения данных"}' \
  http://127.0.0.1:8522/api/ai/suggest-record > /tmp/business-control-ai-suggestion.json
python3 - <<'PY'
import json
with open('/tmp/business-control-ai-health.json', encoding='utf-8') as source:
    health = json.load(source)
assert health.get('configured') is True, health
assert health.get('provider') == 'gemini', health
assert health.get('model') == 'gemini-2.5-flash', health
assert health.get('route') == 'proxy', health
assert health.get('providerAvailable') is True, health
assert health.get('source') == 'gemini', health
with open('/tmp/business-control-ai-suggestion.json', encoding='utf-8') as source:
    suggestion = json.load(source)
assert suggestion.get('source') == 'gemini', suggestion
assert suggestion.get('priority') in {'low', 'normal', 'high', 'critical'}, suggestion
assert suggestion.get('workstream') in {'business', 'platform', 'operations'}, suggestion
assert isinstance(suggestion.get('estimateMinutes'), int), suggestion
PY
cleanup_smoke_session
SMOKE_TOKEN_HASH=""

systemctl start business-control-backup.service
test "$(systemctl is-enabled business-control-backup.timer)" = "enabled"
test "$(systemctl is-active business-control-backup.timer)" = "active"
test -n "$(find /var/backups/business-control -maxdepth 1 -type f -name 'business-control-*.tar.gz.enc' -print -quit)"

SWITCHED=0
rm -f "$ENV_BACKUP"
trap - EXIT
echo "release=$RELEASE_DIR"
echo "previous=$PREVIOUS_RELEASE"
echo "pre_release_backup=$BACKUP"
echo "backup_sha256=$(sha256sum "$BACKUP" | awk '{print $1}')"
echo "binary_sha256=$(sha256sum "$RELEASE_DIR/business-control" | awk '{print $1}')"
echo "database_integrity=$(sqlite3 "$DATABASE" 'PRAGMA integrity_check;')"
echo "foreign_key_violations=$(sqlite3 "$DATABASE" 'SELECT COUNT(*) FROM pragma_foreign_key_check;')"
python3 - <<'PY'
import json
with open('/tmp/business-control-ai-health.json', encoding='utf-8') as source:
    health = json.load(source)
with open('/tmp/business-control-ai-suggestion.json', encoding='utf-8') as source:
    suggestion = json.load(source)
print('ai_provider='+str(health.get('provider')))
print('ai_model='+str(health.get('model')))
print('ai_route='+str(health.get('route')))
print('ai_available='+str(health.get('providerAvailable')).lower())
print('ai_source='+str(health.get('source')))
print('suggestion_source='+str(suggestion.get('source')))
PY
rm -f /tmp/business-control-ai-health.json /tmp/business-control-ai-suggestion.json
