#!/usr/bin/env bash
# =============================================================================
# scripts/migrate.sh — CATMS forward-only migration runner
# Owner: Dev1  |  Issue: CATMS-012 / CATMS-014
#
# Usage:
#   ./scripts/migrate.sh                — apply all pending migrations (dev DB)
#   ./scripts/migrate.sh --test         — apply all migrations to the test DB
#   ./scripts/migrate.sh --dry-run      — show what would be applied, no changes
#   ./scripts/migrate.sh --status       — show applied vs pending migrations
#   ./scripts/migrate.sh --verify       — verify checksums of all applied migrations
# =============================================================================

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MIGRATIONS_DIR="${REPO_ROOT}/database/migrations"
ENV_FILE="${REPO_ROOT}/.env"

# Load .env if present and environment vars not already set
if [[ -f "${ENV_FILE}" ]] && [[ -z "${POSTGRES_HOST:-}" ]]; then
  set -o allexport
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +o allexport
fi

# Parse flags
DRY_RUN=false
STATUS_ONLY=false
VERIFY_ONLY=false
TEST_MODE=false

for arg in "$@"; do
  case "${arg}" in
    --dry-run) DRY_RUN=true ;;
    --status)  STATUS_ONLY=true ;;
    --verify)  VERIFY_ONLY=true ;;
    --test)    TEST_MODE=true ;;
    *)
      echo "Unknown argument: ${arg}" >&2
      echo "Usage: ./scripts/migrate.sh [--dry-run] [--status] [--verify] [--test]" >&2
      exit 1
      ;;
  esac
done

# DB Connection settings
if [[ "${TEST_MODE}" == "true" ]]; then
  DB_HOST="${POSTGRES_HOST:-localhost}"
  DB_PORT="${POSTGRES_PORT:-5433}"
  DB_NAME="${POSTGRES_DB:-catms_test}"
  DB_USER="${POSTGRES_SUPERUSER:-catms_super_test}"
  DB_PASSWORD="${POSTGRES_SUPERUSER_PASSWORD:-catms_test_password}"
else
  DB_HOST="${POSTGRES_HOST:-localhost}"
  DB_PORT="${POSTGRES_PORT:-5432}"
  DB_NAME="${POSTGRES_DB:-catms_dev}"
  DB_USER="${POSTGRES_SUPERUSER:-catms_super}"
  DB_PASSWORD="${POSTGRES_SUPERUSER_PASSWORD:-change_me_super}"
fi

export PGPASSWORD="${DB_PASSWORD}"

PSQL=(
  psql
  --host="${DB_HOST}"
  --port="${DB_PORT}"
  --username="${DB_USER}"
  --dbname="${DB_NAME}"
  --no-password
  --set=ON_ERROR_STOP=1
)

echo "Connected to ${DB_HOST}:${DB_PORT}/${DB_NAME}"

# Verify connectivity
if ! "${PSQL[@]}" -c '\q' >/dev/null 2>&1; then
  echo "❌ Cannot connect to PostgreSQL at ${DB_HOST}:${DB_PORT}/${DB_NAME}" >&2
  echo "ℹ  Check container status or connection parameters." >&2
  exit 1
fi

# Bootstrap schema and migration table
"${PSQL[@]}" <<'SQL' >/dev/null
CREATE SCHEMA IF NOT EXISTS catms;

CREATE TABLE IF NOT EXISTS catms.schema_migrations (
  version integer PRIMARY KEY,
  description text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text NOT NULL,
  checksum_sha256 text,
  execution_ms integer
);
SQL

# Collect migration files in numeric order
mapfile -t MIGRATION_FILES < <(
  find "${MIGRATIONS_DIR}" -maxdepth 1 -type f -name '[0-9][0-9][0-9]_*.sql' | sort -V
)

if [[ ${#MIGRATION_FILES[@]} -eq 0 ]]; then
  echo "⚠️ No migration files found in ${MIGRATIONS_DIR}"
  exit 0
fi

# Helper for sha256
file_checksum() {
  sha256sum "$1" | awk '{ print $1 }'
}

# STATUS mode
if [[ "${STATUS_ONLY}" == "true" ]]; then
  echo "Migration Status:"
  echo "────────────────────────────────────────────────────────────────────"
  printf "  %-5s  %-10s  %-30s  %s\n" "VER" "STATUS" "DESCRIPTION" "APPLIED AT"
  echo "────────────────────────────────────────────────────────────────────"
  for file in "${MIGRATION_FILES[@]}"; do
    filename="$(basename "${file}")"
    version_str="${filename%%_*}"
    version_int=$((10#${version_str}))
    applied=$("${PSQL[@]}" --tuples-only --command="SELECT to_char(applied_at,'YYYY-MM-DD HH24:MI') || ' | ' || description FROM catms.schema_migrations WHERE version = ${version_int};" 2>/dev/null || echo "")
    if [[ -n "$(echo "${applied}" | tr -d '[:space:]')" ]]; then
      printf '  %-5s  %-10s  %s\n' "${version_str}" "APPLIED" "${applied}"
    else
      printf '  %-5s  %-10s  %s\n' "${version_str}" "PENDING" "${filename}"
    fi
  done
  exit 0
fi

# VERIFY mode
if [[ "${VERIFY_ONLY}" == "true" ]]; then
  echo "Verifying checksums of applied migrations..."
  VERIFY_ERRORS=0
  for file in "${MIGRATION_FILES[@]}"; do
    filename="$(basename "${file}")"
    version_str="${filename%%_*}"
    version_int=$((10#${version_str}))
    stored=$("${PSQL[@]}" --tuples-only --command="SELECT coalesce(checksum_sha256, '') FROM catms.schema_migrations WHERE version = ${version_int};" 2>/dev/null | tr -d '[:space:]' || echo "")
    [[ -z "${stored}" ]] && continue
    current=$(file_checksum "${file}")
    if [[ "${current}" == "${stored}" ]]; then
      echo "  ✅ ${filename}: checksum OK"
    else
      echo "  ❌ ${filename}: CHECKSUM MISMATCH (stored: ${stored}, current: ${current})" >&2
      ((VERIFY_ERRORS++))
    fi
  done
  if [[ "${VERIFY_ERRORS}" -gt 0 ]]; then
    exit 1
  fi
  echo "✅ All checksums verified."
  exit 0
fi

# APPLY mode
APPLIED=0
SKIPPED=0
PREV_VERSION=0

for file in "${MIGRATION_FILES[@]}"; do
  filename="$(basename "${file}")"
  version_str="${filename%%_*}"
  version_int=$((10#${version_str}))

  if [[ "${version_int}" -le "${PREV_VERSION}" ]] && [[ "${PREV_VERSION}" -gt 0 ]]; then
    echo "❌ Out-of-order migration detected: ${filename} comes after ${PREV_VERSION}" >&2
    exit 1
  fi
  PREV_VERSION="${version_int}"

  # Check if already applied
  is_applied=$("${PSQL[@]}" --tuples-only --command="SELECT 1 FROM catms.schema_migrations WHERE version = ${version_int};" 2>/dev/null | tr -d '[:space:]' || echo "")
  if [[ "${is_applied}" == "1" ]]; then
    echo "⏭️  Skipping ${filename} — already applied"
    ((SKIPPED++))
    continue
  fi

  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "[DRY RUN] Would apply: ${filename}"
    ((APPLIED++))
    continue
  fi

  echo "⏳ Applying ${filename} ..."
  START_MS=$(date +%s%3N)
  CHECKSUM=$(file_checksum "${file}")
  DESC="$(echo "${filename}" | sed 's/^[0-9]*_//' | sed 's/\.sql$//' | tr '_' ' ')"

  # ON_ERROR_STOP causes psql to return non-zero on SQL errors.
  # PostgreSQL error output is preserved on stderr.
  "${PSQL[@]}" --file="${file}"

  END_MS=$(date +%s%3N)
  ELAPSED_MS=$(( END_MS - START_MS ))

  # Record migration ONLY after SQL file succeeds
  "${PSQL[@]}" --command="
    INSERT INTO catms.schema_migrations (version, description, applied_by, checksum_sha256, execution_ms)
    VALUES (${version_int}, '${DESC}', current_user, '${CHECKSUM}', ${ELAPSED_MS})
    ON CONFLICT (version) DO UPDATE
      SET checksum_sha256 = EXCLUDED.checksum_sha256,
          execution_ms    = EXCLUDED.execution_ms;
  " >/dev/null

  echo "✅ ${filename} (${ELAPSED_MS}ms)"
  ((APPLIED++))
done

echo ""
if [[ "${DRY_RUN}" == "true" ]]; then
  echo "DRY RUN — ${APPLIED} migration(s) would be applied."
elif [[ "${APPLIED}" -eq 0 ]]; then
  echo "Already up to date — ${SKIPPED} migration(s) applied, 0 pending."
else
  echo "Migration complete — ${APPLIED} applied, ${SKIPPED} skipped."
fi
