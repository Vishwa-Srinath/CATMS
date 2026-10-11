#!/usr/bin/env bash
# =============================================================================
# scripts/restore.sh — CATMS PostgreSQL database restore
# Owner: Dev1 (Lead & Platform) | Issue: CATMS-077
# Usage: ./scripts/restore.sh <path-to-backup.dump>
#
# Restores CATMS database from a custom-format pg_dump archive.
# WARNING: Overwrites current database state with the archive snapshot.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <path-to-backup.dump>"
  exit 1
fi

BACKUP_FILE="$1"

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "❌ Error: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

if [[ $(stat -c%s "${BACKUP_FILE}" 2>/dev/null || stat -f%z "${BACKUP_FILE}" 2>/dev/null) -eq 0 ]]; then
  echo "❌ Error: Backup file is empty: ${BACKUP_FILE}"
  exit 1
fi

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

echo "╔══════════════════════════════════════════════╗"
echo "║  CATMS — Database Restore Execution         ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  Archive:    ${BACKUP_FILE}"
echo "  Database:   ${DB_NAME}"
echo "  Started:    $(date)"
echo ""

if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^catms_postgres$"; then
  echo "  ℹ  Restoring via Docker container 'catms_postgres'..."
  docker exec -i -e PGPASSWORD="${DB_PASS}" catms_postgres \
    pg_restore -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists --no-owner --no-privileges -v < "${BACKUP_FILE}" || true
elif command -v pg_restore >/dev/null 2>&1; then
  echo "  ℹ  Restoring via local pg_restore on ${DB_HOST}:${DB_PORT}..."
  PGPASSWORD="${DB_PASS}" pg_restore \
    -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
    --clean --if-exists --no-owner --no-privileges -v "${BACKUP_FILE}" || true
else
  echo "  ❌ Neither Docker container 'catms_postgres' nor local pg_restore is available."
  exit 1
fi

# Re-apply grants to application roles
echo ""
echo "  ℹ  Re-granting schema permissions to catms_app and catms_readonly..."
GRANT_SQL="GRANT USAGE ON SCHEMA catms TO catms_app, catms_readonly;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA catms TO catms_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA catms TO catms_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA catms TO catms_app;
GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA catms TO catms_app;
GRANT SELECT ON ALL TABLES IN SCHEMA catms TO catms_readonly;"

if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^catms_postgres$"; then
  docker exec -e PGPASSWORD="${DB_PASS}" catms_postgres \
    psql -U "${DB_USER}" -d "${DB_NAME}" -c "${GRANT_SQL}" >/dev/null 2>&1
  TABLE_COUNT=$(docker exec -e PGPASSWORD="${DB_PASS}" catms_postgres \
    psql -U "${DB_USER}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'catms';")
else
  PGPASSWORD="${DB_PASS}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "${GRANT_SQL}" >/dev/null 2>&1
  TABLE_COUNT=$(PGPASSWORD="${DB_PASS}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'catms';")
fi

echo "  ✅ Restore finished. Total tables in catms schema: ${TABLE_COUNT}"
echo ""
exit 0
