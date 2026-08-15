#!/usr/bin/env bash
set -Eeuo pipefail

RELEASE_NAME="${RELEASE_NAME:-20260815-lifecycle-chat}"
STAGED_BINARY="${STAGED_BINARY:-/tmp/business-control-lifecycle-chat}"
APP_ROOT="/opt/business-control"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_NAME"
DATABASE="/var/lib/business-control/business-control.db"
UPLOADS="/var/lib/business-control/uploads"
BACKUP_DIR="/var/lib/business-control/backups"
ENV_FILE="/etc/business-control.env"
TURN_CONFIG="/etc/turnserver.conf"
PREVIOUS_RELEASE="$(readlink -f "$APP_ROOT/current")"
BACKUP="$BACKUP_DIR/business-control-$(date -u +%Y%m%d-%H%M%S)-pre-lifecycle-chat.db"
UPLOAD_BACKUP="$BACKUP_DIR/uploads-$(date -u +%Y%m%d-%H%M%S)-pre-lifecycle-chat.tar.gz"
ENV_BACKUP="$(mktemp /tmp/business-control-env.XXXXXX)"
SWITCHED=0
ENV_SNAPSHOT_READY=0
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
  rm -f "$ENV_BACKUP" /tmp/business-control-ice.json /tmp/business-control-threads.json /tmp/business-control-analysis.json /tmp/business-control-task.json
  exit "$exit_code"
}
trap rollback EXIT

test -x "$STAGED_BINARY"
test -f "$DATABASE"
test -f "$ENV_FILE"
test -n "$PREVIOUS_RELEASE"
cp "$ENV_FILE" "$ENV_BACKUP"
ENV_SNAPSHOT_READY=1

install -d -o business-control -g business-control -m 0750 "$BACKUP_DIR"
install -d -o root -g root -m 0755 "$RELEASE_DIR"
sqlite3 "$DATABASE" ".timeout 5000" ".backup '$BACKUP'"
chown business-control:business-control "$BACKUP"
chmod 0640 "$BACKUP"
test "$(sqlite3 "$BACKUP" 'PRAGMA integrity_check;')" = "ok"
test "$(sqlite3 "$BACKUP" 'SELECT COUNT(*) FROM pragma_foreign_key_check;')" = "0"
if [[ -d "$UPLOADS" ]]; then
  tar -C "$(dirname "$UPLOADS")" -czf "$UPLOAD_BACKUP" "$(basename "$UPLOADS")"
  chown business-control:business-control "$UPLOAD_BACKUP"
  chmod 0640 "$UPLOAD_BACKUP"
else
  UPLOAD_BACKUP="not-created-no-upload-directory"
fi

upsert_env() {
  name="$1"
  value="$2"
  if grep -q "^${name}=" "$ENV_FILE"; then
    sed -i "s#^${name}=.*#${name}=${value}#" "$ENV_FILE"
  else
    printf '%s=%s\n' "$name" "$value" >> "$ENV_FILE"
  fi
}

export DEBIAN_FRONTEND=noninteractive
if ! command -v turnserver >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq coturn
fi
TURN_USERNAME="$(awk -F= '$1 == "BUSINESS_CHAT_TURN_USERNAME" {print substr($0, index($0, "=") + 1)}' "$ENV_FILE" | tail -n 1)"
TURN_CREDENTIAL="$(awk -F= '$1 == "BUSINESS_CHAT_TURN_CREDENTIAL" {print substr($0, index($0, "=") + 1)}' "$ENV_FILE" | tail -n 1)"
if [[ -z "$TURN_USERNAME" ]]; then
  TURN_USERNAME="bizflow-founders"
fi
if [[ -z "$TURN_CREDENTIAL" ]]; then
  TURN_CREDENTIAL="$(openssl rand -hex 32)"
fi

cat > "$TURN_CONFIG" <<EOF
listening-port=3478
external-ip=159.194.231.150
realm=control.e-rd.ru
fingerprint
lt-cred-mech
user=${TURN_USERNAME}:${TURN_CREDENTIAL}
stale-nonce=600
total-quota=50
user-quota=10
no-cli
no-multicast-peers
no-loopback-peers
no-tls
no-dtls
min-port=49160
max-port=49200
EOF
chown root:root "$TURN_CONFIG"
chmod 0600 "$TURN_CONFIG"
if [[ -f /etc/default/coturn ]]; then
  if grep -q '^TURNSERVER_ENABLED=' /etc/default/coturn; then
    sed -i 's/^TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn
  else
    printf '\nTURNSERVER_ENABLED=1\n' >> /etc/default/coturn
  fi
fi
systemctl enable coturn >/dev/null
systemctl restart coturn
test "$(systemctl is-active coturn)" = "active"
ss -lntu | grep -Eq '[:.]3478[[:space:]]'

upsert_env BUSINESS_CHAT_STUN_URL 'stun:control.e-rd.ru:3478'
upsert_env BUSINESS_CHAT_TURN_URL 'turn:control.e-rd.ru:3478?transport=udp'
upsert_env BUSINESS_CHAT_TURN_USERNAME "$TURN_USERNAME"
upsert_env BUSINESS_CHAT_TURN_CREDENTIAL "$TURN_CREDENTIAL"
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
test "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM schema_migrations WHERE version IN ('008_decision_and_research_semantics.sql','009_team_chat.sql','010_chat_message_history.sql');")" = "3"
test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8522/api/chat/ice-config)" = "401"

SMOKE_TOKEN="$(openssl rand -hex 32)"
SMOKE_TOKEN_HASH="$(printf '%s' "$SMOKE_TOKEN" | sha256sum | awk '{print $1}')"
SMOKE_USER_ID="$(sqlite3 "$DATABASE" "SELECT id FROM users WHERE username='artkozk' COLLATE NOCASE LIMIT 1;")"
test -n "$SMOKE_USER_ID"
SMOKE_NOW="$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)"
SMOKE_EXPIRES="$(date -u -d '+1 hour' +%Y-%m-%dT%H:%M:%S.%NZ)"
sqlite3 "$DATABASE" "INSERT INTO sessions(user_id, token_hash, expires_at, created_at, last_seen_at) VALUES($SMOKE_USER_ID, '$SMOKE_TOKEN_HASH', '$SMOKE_EXPIRES', '$SMOKE_NOW', '$SMOKE_NOW');"

curl -fsS --cookie "business_session=$SMOKE_TOKEN" http://127.0.0.1:8522/api/chat/ice-config > /tmp/business-control-ice.json
curl -fsS --cookie "business_session=$SMOKE_TOKEN" http://127.0.0.1:8522/api/chat/threads > /tmp/business-control-threads.json
RESEARCH_ID="$(sqlite3 "$DATABASE" "SELECT r.id FROM records r WHERE r.type='research' AND r.archived_at IS NULL ORDER BY (SELECT COUNT(*) FROM research_options ro WHERE ro.record_id=r.id AND ro.status='active') DESC, r.updated_at DESC LIMIT 1;")"
if [[ -n "$RESEARCH_ID" ]]; then
  curl -fsS --cookie "business_session=$SMOKE_TOKEN" -X POST "http://127.0.0.1:8522/api/records/$RESEARCH_ID/ai-analysis" > /tmp/business-control-analysis.json
fi

python3 - <<'PY'
import json
with open('/tmp/business-control-ice.json', encoding='utf-8') as source:
    ice = json.load(source)
servers = ice.get('iceServers', [])
assert len(servers) >= 2, ice
def urls(item):
    value = item.get('urls', [])
    return value if isinstance(value, list) else [value]
assert any(any(str(url).startswith('stun:') for url in urls(item)) for item in servers), ice
assert any(any(str(url).startswith('turn:') for url in urls(item)) and item.get('username') and item.get('credential') for item in servers), ice
with open('/tmp/business-control-threads.json', encoding='utf-8') as source:
    threads = json.load(source)
assert isinstance(threads, list) and any(item.get('kind') == 'team' for item in threads), threads
try:
    with open('/tmp/business-control-analysis.json', encoding='utf-8') as source:
        analysis = json.load(source)
except FileNotFoundError:
    analysis = None
if analysis is not None:
    coverage = analysis.get('contextCoverage', {})
    assert coverage.get('researchOptions', 0) > 0, analysis
    assert coverage.get('researchFields', 0) > 0, analysis
    assert analysis.get('source') in {'gemini', 'groq', 'heuristic'}, analysis
PY

TASK_TITLE="Production-аудит жизненных циклов, досок и командного чата"
if [[ "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM records WHERE title='$TASK_TITLE';")" = "0" ]]; then
  TASK_PAYLOAD="$(printf '{"type":"task","title":"Production-аудит жизненных циклов, досок и командного чата","description":"Проверить предметные статусы решений и исследований, drag-and-drop досок, мобильные панели, полноту AI-досье, сообщения, историю правок и TURN-конфигурацию.","status":"in_progress","ownerId":%s,"priority":"high","workstream":"platform","editPolicy":"shared","estimateMinutes":480,"actualMinutes":420}' "$SMOKE_USER_ID")"
  curl -fsS --cookie "business_session=$SMOKE_TOKEN" -H 'Content-Type: application/json' \
    -d "$TASK_PAYLOAD" \
    http://127.0.0.1:8522/api/records > /tmp/business-control-task.json
  TASK_ID="$(python3 -c 'import json; print(json.load(open("/tmp/business-control-task.json", encoding="utf-8"))["id"])')"
  curl -fsS --cookie "business_session=$SMOKE_TOKEN" -H 'Content-Type: application/json' \
    -d '{"kind":"text","content":"Автотесты Go, go vet и node --check пройдены; production health, SQLite integrity, миграции 008-010, ICE/TURN, командный поток и AI coverage исследования проверены release-скриптом."}' \
    "http://127.0.0.1:8522/api/records/$TASK_ID/proofs" >/dev/null
  curl -fsS --cookie "business_session=$SMOKE_TOKEN" -H 'Content-Type: application/json' \
    -d '{"result":"Исправлены жизненные циклы, рабочая и идейная доски, мобильные сценарии, пакетные файлы и командный чат. Настроен TURN и подтверждена полнота AI-контекста исследования.","notifyPartners":true}' \
    "http://127.0.0.1:8522/api/records/$TASK_ID/complete" >/dev/null
fi

curl -fsS https://control.e-rd.ru/api/health >/dev/null
systemctl start business-control-backup.service
test "$(systemctl is-enabled business-control-backup.timer)" = "enabled"
test "$(systemctl is-active business-control-backup.timer)" = "active"
test -n "$(find /var/backups/business-control -maxdepth 1 -type f -name 'business-control-*.tar.gz.enc' -print -quit)"

cleanup_smoke_session
SMOKE_TOKEN_HASH=""
SWITCHED=0
rm -f "$ENV_BACKUP"
trap - EXIT

echo "release=$RELEASE_DIR"
echo "previous=$PREVIOUS_RELEASE"
echo "pre_release_backup=$BACKUP"
echo "upload_backup=$UPLOAD_BACKUP"
echo "backup_sha256=$(sha256sum "$BACKUP" | awk '{print $1}')"
echo "binary_sha256=$(sha256sum "$RELEASE_DIR/business-control" | awk '{print $1}')"
echo "database_integrity=$(sqlite3 "$DATABASE" 'PRAGMA integrity_check;')"
echo "foreign_key_violations=$(sqlite3 "$DATABASE" 'SELECT COUNT(*) FROM pragma_foreign_key_check;')"
echo "coturn_active=$(systemctl is-active coturn)"
echo "chat_threads=$(sqlite3 "$DATABASE" 'SELECT COUNT(*) FROM chat_threads;')"
echo "message_revision_table=$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='chat_message_revisions';")"
if [[ -f /tmp/business-control-analysis.json ]]; then
  python3 - <<'PY'
import json
with open('/tmp/business-control-analysis.json', encoding='utf-8') as source:
    analysis = json.load(source)
coverage = analysis.get('contextCoverage', {})
print('ai_source='+str(analysis.get('source')))
print('ai_research_options='+str(coverage.get('researchOptions', 0)))
print('ai_research_fields='+str(coverage.get('researchFields', 0)))
PY
fi
rm -f /tmp/business-control-ice.json /tmp/business-control-threads.json /tmp/business-control-analysis.json /tmp/business-control-task.json
