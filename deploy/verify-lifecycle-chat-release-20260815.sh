#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="/opt/business-control"
DATABASE="/var/lib/business-control/business-control.db"
ENV_FILE="/etc/business-control.env"
EXPECTED_RELEASE="${EXPECTED_RELEASE:-20260815-lifecycle-chat-b306e57}"
INDEX_ASSET="$(mktemp /tmp/business-control-index.XXXXXX)"
JS_ASSET="$(mktemp /tmp/business-control-app.XXXXXX)"
TURN_LOG="$(mktemp /tmp/business-control-turn.XXXXXX)"
trap 'rm -f "$INDEX_ASSET" "$JS_ASSET" "$TURN_LOG"' EXIT

CURRENT_RELEASE="$(readlink -f "$APP_ROOT/current")"
test "$CURRENT_RELEASE" = "$APP_ROOT/releases/$EXPECTED_RELEASE"
test "$(systemctl is-active business-control)" = "active"
test "$(systemctl is-active coturn)" = "active"
test "$(systemctl is-active nginx)" = "active"
curl -fsS http://127.0.0.1:8522/api/health >/dev/null
curl -fsS https://control.e-rd.ru/api/health >/dev/null
test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8522/api/chat/ice-config)" = "401"
ss -lntu | grep -Eq '[:.]3478[[:space:]]'
TURN_USERNAME="$(sed -n 's/^BUSINESS_CHAT_TURN_USERNAME=//p' "$ENV_FILE" | tail -n 1)"
TURN_CREDENTIAL="$(sed -n 's/^BUSINESS_CHAT_TURN_CREDENTIAL=//p' "$ENV_FILE" | tail -n 1)"
test -n "$TURN_USERNAME"
test -n "$TURN_CREDENTIAL"
timeout 20 turnutils_uclient -y -n 3 -u "$TURN_USERNAME" -w "$TURN_CREDENTIAL" -p 3478 159.194.231.150 >"$TURN_LOG" 2>&1
test "$(sqlite3 "$DATABASE" 'PRAGMA integrity_check;')" = "ok"
test "$(sqlite3 "$DATABASE" 'SELECT COUNT(*) FROM pragma_foreign_key_check;')" = "0"
test "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM schema_migrations WHERE version IN ('008_decision_and_research_semantics.sql','009_team_chat.sql','010_chat_message_history.sql');")" = "3"
test "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM records WHERE type='decision' AND (status NOT IN ('completed','cancelled','archived') OR progress <> 100 OR due_at IS NOT NULL OR estimate_minutes <> 0 OR actual_minutes <> 0);")" = "0"
test "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM records WHERE title='Production-аудит жизненных циклов, досок и командного чата' AND status='completed' AND progress=100;")" = "1"
test "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM task_proofs p JOIN records r ON r.id=p.record_id WHERE r.title='Production-аудит жизненных циклов, досок и командного чата';")" -ge "1"
test "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM chat_threads WHERE kind='team';")" -ge "1"
test "$(sqlite3 "$DATABASE" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='chat_message_revisions';")" = "1"
for name in BUSINESS_CHAT_STUN_URL BUSINESS_CHAT_TURN_URL BUSINESS_CHAT_TURN_USERNAME BUSINESS_CHAT_TURN_CREDENTIAL; do
  grep -Eq "^${name}=.+$" "$ENV_FILE"
done
curl -fsS https://control.e-rd.ru/ -o "$INDEX_ASSET"
curl -fsS https://control.e-rd.ru/app.js -o "$JS_ASSET"
grep -q 'BizFlow' "$INDEX_ASSET"
if grep -q 'sync-state' "$JS_ASSET"; then
  echo "legacy sync-state is still present" >&2
  exit 1
fi

echo "release=$CURRENT_RELEASE"
echo "service=active"
echo "domain_health=ok"
echo "database_integrity=ok"
echo "foreign_key_violations=0"
echo "decision_semantics=ok"
echo "development_task=completed_with_proof"
echo "chat_schema=ok"
echo "turn_listener=ok"
echo "turn_allocation=ok"
echo "legacy_sync_state=absent"
