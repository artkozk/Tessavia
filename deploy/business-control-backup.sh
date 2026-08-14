#!/usr/bin/env bash
set -euo pipefail

database_path="${BUSINESS_DATABASE_PATH:-/var/lib/business-control/business-control.db}"
backup_directory="${BUSINESS_BACKUP_DIRECTORY:-/var/lib/business-control/backups}"
retention_days="${BUSINESS_BACKUP_RETENTION_DAYS:-30}"
timestamp="$(date -u +%Y%m%d-%H%M%S)"
temporary_backup="${backup_directory}/.business-control-${timestamp}.db.tmp"
final_backup="${backup_directory}/business-control-${timestamp}.db"

install -d -o business-control -g business-control -m 0750 "${backup_directory}"

if [[ ! -f "${database_path}" ]]; then
  echo "Database does not exist: ${database_path}" >&2
  exit 1
fi

cleanup() {
  rm -f -- "${temporary_backup}"
}
trap cleanup EXIT

sqlite3 "${database_path}" ".timeout 5000" ".backup '${temporary_backup}'"

integrity_result="$(sqlite3 "${temporary_backup}" "PRAGMA integrity_check;")"
if [[ "${integrity_result}" != "ok" ]]; then
  echo "Backup integrity check failed: ${integrity_result}" >&2
  exit 1
fi

chown business-control:business-control "${temporary_backup}"
chmod 0640 "${temporary_backup}"
mv -- "${temporary_backup}" "${final_backup}"
find "${backup_directory}" -maxdepth 1 -type f -name 'business-control-*.db' -mtime "+${retention_days}" -delete

echo "Created verified backup: ${final_backup}"
