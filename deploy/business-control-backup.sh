#!/usr/bin/env bash
set -euo pipefail

database_path="${BUSINESS_DATABASE_PATH:-/var/lib/business-control/business-control.db}"
upload_path="${BUSINESS_UPLOAD_PATH:-/var/lib/business-control/uploads}"
backup_directory="${BUSINESS_BACKUP_DIRECTORY:-/var/backups/business-control}"
key_file="${BUSINESS_BACKUP_KEY_FILE:-/etc/business-control-backup.key}"
retention_days="${BUSINESS_BACKUP_RETENTION_DAYS:-30}"
timestamp="$(date -u +%Y%m%d-%H%M%S)"
final_backup="${backup_directory}/business-control-${timestamp}.tar.gz.enc"

install -d -o root -g root -m 0700 "${backup_directory}"
work_directory="$(mktemp -d "${backup_directory}/.business-control-${timestamp}.XXXXXX")"
payload_directory="${work_directory}/payload"
plain_archive="${work_directory}/business-control-${timestamp}.tar.gz"
encrypted_archive="${work_directory}/business-control-${timestamp}.tar.gz.enc"
verification_directory="${work_directory}/verification"

cleanup() {
  rm -rf -- "${work_directory}"
}
trap cleanup EXIT

if [[ ! -f "${database_path}" ]]; then
  echo "Database does not exist: ${database_path}" >&2
  exit 1
fi
if [[ ! -s "${key_file}" ]]; then
  echo "Backup encryption key does not exist: ${key_file}" >&2
  exit 1
fi

install -d -o root -g root -m 0700 "${payload_directory}" "${payload_directory}/uploads" "${verification_directory}"
sqlite3 "${database_path}" ".timeout 5000" ".backup '${payload_directory}/business-control.db'"

integrity_result="$(sqlite3 "${payload_directory}/business-control.db" "PRAGMA integrity_check;")"
if [[ "${integrity_result}" != "ok" ]]; then
  echo "Backup integrity check failed: ${integrity_result}" >&2
  exit 1
fi

if [[ -d "${upload_path}" ]]; then
  cp -a -- "${upload_path}/." "${payload_directory}/uploads/"
fi

(
  cd "${payload_directory}"
  find . -type f ! -name MANIFEST.sha256 -print0 | sort -z | xargs -0 sha256sum > MANIFEST.sha256
)
tar -C "${payload_directory}" -czf "${plain_archive}" .
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in "${plain_archive}" -out "${encrypted_archive}" -pass "file:${key_file}"

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "${encrypted_archive}" -out "${verification_directory}/verified.tar.gz" -pass "file:${key_file}"
tar -C "${verification_directory}" -xzf "${verification_directory}/verified.tar.gz"
(
  cd "${verification_directory}"
  sha256sum -c MANIFEST.sha256
)
test "$(sqlite3 "${verification_directory}/business-control.db" 'PRAGMA integrity_check;')" = "ok"

install -o root -g root -m 0600 "${encrypted_archive}" "${final_backup}"
find "${backup_directory}" -maxdepth 1 -type f -name 'business-control-*.tar.gz.enc' -mtime "+${retention_days}" -delete

echo "Created encrypted and verified local backup: ${final_backup}"
