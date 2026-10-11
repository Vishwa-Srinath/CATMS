#!/usr/bin/env bash
# =============================================================================
# scripts/backup.sh — CATMS PostgreSQL database backup
# Owner: Dev1 (Lead & Platform) | Issue: CATMS-077
# Usage: ./scripts/backup.sh [output-dir]
#
# Creates a timestamped custom-format pg_dump of the CATMS database.
# Default output: ./backups/catms_YYYYMMDD_HHMMSS.dump
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"

# Load environment configuration if available
if [[ -f "${ENV_FILE}" ]]; then
  set -o allexport
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +o allexport
fi

DB_NAME="${POSTGRES_DB:-catms_dev}"
DB_USER="${POSTGRES_SUPERUSER:-catms_super}"
DB_PASS="${POSTGRES_SUPERUSER_PASSWORD:-change_me_super}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_HOST="${POSTGRES_HOST:-localhost}"

OUTPUT_DIR="${1:-${REPO_ROOT}/backups}"
mkdir -p "${OUTPUT_DIR}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${OUTPUT_DIR}/catms_${TIMESTAMP}.dump"

echo "╔══════════════════════════════════════════════╗"
echo "║  CATMS — Database Backup Execution          ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  Database:   ${DB_NAME}"
echo "  Target:     ${BACKUP_FILE}"
echo "  Started:    $(date)"
echo ""

# Prefer running through running docker container catms_postgres if available
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^catms_postgres$"; then
  echo "  ℹ  Running pg_dump inside Docker container 'catms_postgres'..."
  docker exec -e PGPASSWORD="${DB_PASS}" catms_postgres \
    pg_dump -U "${DB_USER}" -d "${DB_NAME}" -F c -b -v > "${BACKUP_FILE}"
elif command -v pg_dump >/dev/null 2>&1; then
  echo "  ℹ  Running local pg_dump against ${DB_HOST}:${DB_PORT}..."
  PGPASSWORD="${DB_PASS}" pg_dump \
    -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
    -F c -b -v -f "${BACKUP_FILE}"
else
  echo "  ❌ Neither Docker container 'catms_postgres' nor local pg_dump is available."
  exit 1
fi

if [[ -f "${BACKUP_FILE}" ]] && [[ $(stat -c%s "${BACKUP_FILE}" 2>/dev/null || stat -f%z "${BACKUP_FILE}" 2>/dev/null) -gt 0 ]]; then
  SIZE_BYTES=$(stat -c%s "${BACKUP_FILE}" 2>/dev/null || stat -f%z "${BACKUP_FILE}" 2>/dev/null)
  echo ""
  echo "  ✅ Backup created successfully!"
  echo "     File: ${BACKUP_FILE}"
  echo "     Size: ${SIZE_BYTES} bytes"
  echo ""
  exit 0
else
  echo ""
  echo "  ❌ Backup failed: created file is empty or missing."
  rm -f "${BACKUP_FILE}"
  exit 1
fi
