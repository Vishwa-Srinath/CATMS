#!/usr/bin/env bash
# =============================================================================
# scripts/reset.sh — CATMS full database reset
# Owner: Dev1  |  Issue: CATMS-012
# Usage: ./scripts/reset.sh [--test] [--no-seed]
#
#   --test      Reset the disposable test database (port 5433) instead of dev
#   --no-seed   Run migrations only — do not load the tiny seed fixture
#
# What this does:
#   1. Drop the target database (catms_dev or catms_test)
#   2. Recreate it from scratch (empty)
#   3. Re-run the init script to create roles (catms_app, catms_readonly)
#   4. Run all migrations via scripts/migrate.sh
#   5. Load the tiny deterministic seed fixture (unless --no-seed)
#
# DESTRUCTIVE — all data in the target database is lost.
# Never run against a database with real patient data.
#
# Uses the superuser connection (POSTGRES_SUPERUSER) which has DROP DATABASE
# privilege. The app role (POSTGRES_USER) cannot do this by design.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"
INIT_SQL="${REPO_ROOT}/infra/docker/postgres/init/01_create_roles.sql"
TINY_SEED_DIR="${REPO_ROOT}/database/seeds/tiny"

# ── colour helpers ────────────────────────────────────────────────────────────
red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
info()   { printf '  ℹ  %s\n' "$*"; }
ok()     { printf '  ✅ %s\n' "$*"; }
fail()   { printf '  ❌ %s\n' "$*"; }

# ── parse flags ───────────────────────────────────────────────────────────────
TEST_MODE=false
NO_SEED=false

for arg in "$@"; do
  case "${arg}" in
    --test)    TEST_MODE=true ;;
    --no-seed) NO_SEED=true ;;
    *)
      red "Unknown argument: ${arg}"
      info "Usage: ./scripts/reset.sh [--test] [--no-seed]"
      exit 1
      ;;
  esac
done

# ── load .env ─────────────────────────────────────────────────────────────────
if [[ -f "${ENV_FILE}" ]] && [[ -z "${POSTGRES_HOST:-}" ]]; then
  set -o allexport
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +o allexport
fi

# ── connection settings ───────────────────────────────────────────────────────
if [[ "${TEST_MODE}" == "true" ]]; then
  PG_HOST="${POSTGRES_HOST:-localhost}"
  PG_PORT="5433"
  PG_DB="catms_test"
  PG_SUPER="${POSTGRES_SUPERUSER:-catms_super}"
  export PGPASSWORD="${POSTGRES_SUPERUSER_PASSWORD:-catms_test_password}"
  MODE_LABEL="TEST"
else
  PG_HOST="${POSTGRES_HOST:-localhost}"
  PG_PORT="${POSTGRES_PORT:-5432}"
  PG_DB="${POSTGRES_DB:-catms_dev}"
  PG_SUPER="${POSTGRES_SUPERUSER:-catms_super}"
  export PGPASSWORD="${POSTGRES_SUPERUSER_PASSWORD:-change_me_super}"
  MODE_LABEL="DEV"
fi

# ── safety prompt (dev mode only) ─────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  CATMS — Database Reset  ⚠️  DESTRUCTIVE          ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Target:   ${PG_HOST}:${PG_PORT}/${PG_DB}"
echo "  Mode:     ${MODE_LABEL}"
echo ""

if [[ "${TEST_MODE}" == "false" ]]; then
  read -r -p "  This will DESTROY all data in '${PG_DB}'. Type 'yes' to confirm: " CONFIRM
  if [[ "${CONFIRM}" != "yes" ]]; then
    yellow "Aborted."
    exit 0
  fi
  echo ""
fi

# Helper: run psql against the postgres maintenance database (not catms_dev)
psql_maint() {
  psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_SUPER}" -d postgres \
       -v ON_ERROR_STOP=1 --no-psqlrc "$@"
}

# ── 1. Terminate existing connections ─────────────────────────────────────────
info "Terminating existing connections to '${PG_DB}'..."
psql_maint -c "
  SELECT pg_terminate_backend(pid)
  FROM   pg_stat_activity
  WHERE  datname = '${PG_DB}'
    AND  pid <> pg_backend_pid();
" >/dev/null 2>&1 || true
ok "Connections terminated"

# ── 2. Drop database ──────────────────────────────────────────────────────────
info "Dropping database '${PG_DB}'..."
psql_maint -c "DROP DATABASE IF EXISTS \"${PG_DB}\";" >/dev/null 2>&1
ok "Database dropped"

# ── 3. Recreate database ──────────────────────────────────────────────────────
info "Creating database '${PG_DB}'..."
psql_maint -c "CREATE DATABASE \"${PG_DB}\" ENCODING 'UTF8' LC_COLLATE 'en_US.UTF-8' LC_CTYPE 'en_US.UTF-8';" >/dev/null 2>&1
ok "Database created"

# ── 4. Re-run init SQL (create roles if not exists) ───────────────────────────
info "Applying role init script..."
PGPASSWORD="${PGPASSWORD}" psql \
  -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_SUPER}" -d "${PG_DB}" \
  -v ON_ERROR_STOP=1 --no-psqlrc -f "${INIT_SQL}" >/dev/null 2>&1
ok "Roles initialised"

# ── 5. Run all migrations ─────────────────────────────────────────────────────
info "Running migration runner..."
echo ""

if [[ "${TEST_MODE}" == "true" ]]; then
  bash "${SCRIPT_DIR}/migrate.sh" --test
else
  bash "${SCRIPT_DIR}/migrate.sh"
fi

# ── 6. Load tiny seed fixture ─────────────────────────────────────────────────
if [[ "${NO_SEED}" == "false" ]]; then
  echo ""
  info "Loading tiny seed fixture..."

  SEED_FILES=()
  mapfile -t SEED_FILES < <(
    find "${TINY_SEED_DIR}" -maxdepth 1 -name '*.sql' 2>/dev/null | sort -V
  )

  if [[ ${#SEED_FILES[@]} -eq 0 ]]; then
    yellow "  ⚠️  No seed files found in ${TINY_SEED_DIR}"
    yellow "  Seed fixture will be added in CATMS-025/CATMS-042 (Dev2/Dev3 modules)"
  else
    for seed_file in "${SEED_FILES[@]}"; do
      info "  Loading $(basename "${seed_file}")..."
      PGPASSWORD="${PGPASSWORD}" psql \
        -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_SUPER}" -d "${PG_DB}" \
        -v ON_ERROR_STOP=1 --no-psqlrc -f "${seed_file}" >/dev/null 2>&1
      ok "  $(basename "${seed_file}")"
    done
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────"
green "Reset complete — ${PG_DB} is clean and up to date."
echo ""
info "Connect: psql -h ${PG_HOST} -p ${PG_PORT} -U ${PG_SUPER} -d ${PG_DB}"
info "Verify:  ./scripts/verify.sh"
echo ""
