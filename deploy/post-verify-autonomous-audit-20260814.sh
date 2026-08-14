#!/usr/bin/env bash
set -Eeuo pipefail

DATABASE="/var/lib/business-control/business-control.db"
BACKUP_DIR="/var/lib/business-control/backups"
VERIFY_SQL="/tmp/verify-autonomous-audit-20260814.sql"
BACKUP="$BACKUP_DIR/business-control-$(date -u +%Y%m%d-%H%M%S)-post-autonomous-audit.db"

test "$(readlink -f /opt/business-control/current)" = "/opt/business-control/releases/20260814-autonomous-audit-c425d66"
test "$(systemctl is-active business-control)" = "active"
test "$(systemctl is-active nginx)" = "active"
test "$(systemctl is-active business-control-backup.timer)" = "active"
test "$(curl -fsS http://127.0.0.1:8522/api/health)" = '{"status":"ok"}'
test "$(curl -fsS https://control.e-rd.ru/api/health)" = '{"status":"ok"}'
curl -fsS https://control.e-rd.ru/app.js -o /tmp/business-control-production-app.js
grep -q 'sortWorkHierarchy' /tmp/business-control-production-app.js
rm -f /tmp/business-control-production-app.js

sqlite3 -bail "$DATABASE" < "$VERIFY_SQL"
sqlite3 "$DATABASE" ".backup '$BACKUP'"
chown business-control:business-control "$BACKUP"
chmod 0640 "$BACKUP"
test "$(sqlite3 "$BACKUP" 'PRAGMA integrity_check;')" = "ok"
test "$(sqlite3 "$BACKUP" 'SELECT COUNT(*) FROM pragma_foreign_key_check;')" = "0"

echo "post_backup=$BACKUP"
echo "post_backup_bytes=$(stat -c %s "$BACKUP")"
echo "post_backup_sha256=$(sha256sum "$BACKUP" | awk '{print $1}')"
echo "binary_sha256=$(sha256sum /opt/business-control/current/business-control | awk '{print $1}')"
echo "release=$(readlink -f /opt/business-control/current)"
echo "services=business-control:$(systemctl is-active business-control),nginx:$(systemctl is-active nginx),backup-timer:$(systemctl is-active business-control-backup.timer)"
echo "production_verification=ok"
