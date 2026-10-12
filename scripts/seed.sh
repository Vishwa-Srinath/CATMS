#!/usr/bin/env bash
# =============================================================================
# scripts/seed.sh — CATMS foundational data seed loader
# Usage:
#   ./scripts/seed.sh
#   DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" ./scripts/seed.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"
TINY_SEED_DIR="${REPO_ROOT}/database/seeds/tiny"

# Colour helpers
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
info()   { printf '  ℹ  %s\n' "$*"; }
ok()     { printf '  ✅ %s\n' "$*"; }
fail()   { printf '  ❌ %s\n' "$*"; }

# Load .env if present and environment vars not already set
if [[ -f "${ENV_FILE}" ]] && [[ -z "${POSTGRES_HOST:-}" ]]; then
  set -o allexport
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +o allexport
fi

DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-catms_dev}"
DB_USER="${POSTGRES_SUPERUSER:-${POSTGRES_USER:-catms_super}}"
DB_PASSWORD="${POSTGRES_SUPERUSER_PASSWORD:-${POSTGRES_PASSWORD:-change_me_super}}"

if [[ "${POSTGRES_SSL:-false}" == "true" ]] || [[ "${POSTGRES_SSL:-false}" == "require" ]]; then
  export PGSSLMODE="${PGSSLMODE:-require}"
fi

export PGPASSWORD="${DB_PASSWORD}"

if [[ -n "${DATABASE_URL:-}" ]]; then
  PSQL=(psql "${DATABASE_URL}" --no-password -v ON_ERROR_STOP=1)
  info "Connecting via DATABASE_URL..."
else
  PSQL=(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" --no-password -v ON_ERROR_STOP=1)
  info "Connecting to ${DB_HOST}:${DB_PORT}/${DB_NAME} as ${DB_USER}..."
fi

SEED_FILES=()
mapfile -t SEED_FILES < <(
  find "${TINY_SEED_DIR}" -maxdepth 1 -name '*.sql' 2>/dev/null | sort -V
)

if [[ ${#SEED_FILES[@]} -eq 0 ]]; then
  fail "No seed files found in ${TINY_SEED_DIR}"
  exit 1
fi

for seed_file in "${SEED_FILES[@]}"; do
  info "Loading $(basename "${seed_file}")..."
  "${PSQL[@]}" -f "${seed_file}" >/dev/null
  ok "$(basename "${seed_file}") loaded"
done

info "Synchronizing database sequences with seeded IDs..."
"${PSQL[@]}" -c "
DO \$\$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT table_schema, table_name, column_name,
           pg_get_serial_sequence(table_schema || '.' || table_name, column_name) AS seq
    FROM information_schema.columns
    WHERE table_schema = 'catms'
      AND (column_default LIKE 'nextval%' OR is_identity = 'YES')
  ) LOOP
    IF r.seq IS NOT NULL THEN
      EXECUTE format(
        'SELECT setval(%L, coalesce((SELECT max(%I) FROM %I.%I), 1), true)',
        r.seq, r.column_name, r.table_schema, r.table_name
      );
    END IF;
  END LOOP;
END \$\$;
" >/dev/null
ok "Database sequences synchronized"

echo ""
green "All foundational seed data loaded successfully ✅"
