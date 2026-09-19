#!/usr/bin/env bash
# =============================================================================
# scripts/test.sh — CATMS full test suite runner
# Owner: Dev1 | Issue: CATMS-014
# Usage: ./scripts/test.sh [--layer schema|rules|api|frontend|all]
#
# Runs the full test suite against the disposable test database (compose.test.yaml).
# Layers:
#   schema    → database/tests/schema/   (PK/FK/UQ/CHECK structure tests)
#   rules     → database/tests/rules/    (business rule + concurrency tests)
#   api       → backend/tests/           (Supertest integration tests)
#   frontend  → frontend/src/            (Vitest unit/component tests)
#   all       → all layers in sequence (default)
#
# Requirements:
#   - Docker and docker compose must be installed and running
#   - psql client must be in PATH (postgresql-client)
#   - Node.js 20+ and npm must be in PATH
#
# Sequence:
#   1. Spin up tmpfs postgres via compose.test.yaml (disposable, no disk writes)
#   2. Wait for postgres to be healthy
#   3. Run migrate.sh --test (applies all migrations to catms_test)
#   4. Run selected test layers
#   5. Tear down the test container (data already gone — tmpfs)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── colour helpers ────────────────────────────────────────────────────────────
red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
bold()   { printf '\033[1m%s\033[0m\n' "$*"; }
info()   { printf '  ℹ  %s\n' "$*"; }
ok()     { printf '  ✅ %s\n' "$*"; }
fail()   { printf '  ❌ %s\n' "$*"; }
section(){ echo ""; bold "──── $* ────"; }

# ── parse --layer flag ────────────────────────────────────────────────────────
LAYER="all"

for arg in "$@"; do
  case "${arg}" in
    --layer=*) LAYER="${arg#--layer=}" ;;
    --layer)   shift; LAYER="${1:-all}" ;;
    *)
      red "Unknown argument: ${arg}"
      info "Usage: ./scripts/test.sh [--layer schema|rules|api|frontend|all]"
      exit 1
      ;;
  esac
done

case "${LAYER}" in
  schema|rules|api|frontend|all) ;;
  *)
    red "Unknown layer: ${LAYER}. Choose: schema|rules|api|frontend|all"
    exit 1
    ;;
esac

# ── test database settings (matches compose.test.yaml) ───────────────────────
export POSTGRES_HOST="localhost"
export POSTGRES_SUPERUSER="catms_super_test"
export POSTGRES_SUPERUSER_PASSWORD="catms_test_password"
export PGPASSWORD="${POSTGRES_SUPERUSER_PASSWORD}"

PG_PORT="5433"
PG_DB="catms_test"

# ── track overall results ─────────────────────────────────────────────────────
PASS=0
FAIL=0
CONTAINER_STARTED=false

# ── cleanup trap — always stop containers ─────────────────────────────────────
cleanup() {
  if [[ "${CONTAINER_STARTED}" == "true" ]]; then
    section "Tear down"
    docker compose \
      -f "${REPO_ROOT}/infra/compose.yaml" \
      -f "${REPO_ROOT}/infra/compose.test.yaml" \
      down --volumes --remove-orphans 2>/dev/null || true
    info "Test container stopped."
  fi
}
trap cleanup EXIT

# ── Step 1: start disposable postgres ────────────────────────────────────────
section "Starting test PostgreSQL (tmpfs)"
docker compose \
  -f "${REPO_ROOT}/infra/compose.yaml" \
  -f "${REPO_ROOT}/infra/compose.test.yaml" \
  up --detach --wait postgres
CONTAINER_STARTED=true
ok "Test container started"

# ── Step 2: wait for postgres to be ready ────────────────────────────────────
section "Waiting for PostgreSQL"
for i in $(seq 1 30); do
  if pg_isready -h "${POSTGRES_HOST}" -p "${PG_PORT}" -U "${POSTGRES_SUPERUSER}" >/dev/null 2>&1; then
    ok "PostgreSQL ready"
    break
  fi
  info "Attempt ${i}/30 — waiting 2s..."
  sleep 2
done

if ! pg_isready -h "${POSTGRES_HOST}" -p "${PG_PORT}" -U "${POSTGRES_SUPERUSER}" >/dev/null 2>&1; then
  fail "PostgreSQL did not become ready in time"
  exit 1
fi

# ── Step 3: run migrations ────────────────────────────────────────────────────
section "Running migrations (test mode)"
bash "${SCRIPT_DIR}/migrate.sh" --test
ok "Migrations applied"

# ── helper: run a test step, track pass/fail ──────────────────────────────────
run_step() {
  local label="$1"
  shift
  section "${label}"
  if "$@"; then
    ok "${label} PASSED"
    ((PASS++))
  else
    fail "${label} FAILED"
    ((FAIL++))
    # Do not exit immediately — run remaining layers so we get all failures
  fi
}

# ── Layer: schema ──────────────────────────────────────────────────────────────
run_schema() {
  local schema_dir="${REPO_ROOT}/database/tests/schema"
  if [[ ! -d "${schema_dir}" ]] || [[ -z "$(ls "${schema_dir}"/*.sql 2>/dev/null)" ]]; then
    yellow "No schema tests found in ${schema_dir} — will be added in CATMS-015+ (Dev2/Dev3 modules)"
    return 0
  fi

  local errors=0
  for f in "${schema_dir}"/*.sql; do
    info "Running $(basename "${f}")..."
    if ! PGPASSWORD="${POSTGRES_SUPERUSER_PASSWORD}" psql \
         -h "${POSTGRES_HOST}" -p "${PG_PORT}" \
         -U "${POSTGRES_SUPERUSER}" -d "${PG_DB}" \
         -v ON_ERROR_STOP=1 -f "${f}" >/dev/null 2>&1; then
      fail "$(basename "${f}") failed"
      ((errors++))
    fi
  done
  [[ "${errors}" -eq 0 ]]
}

# ── Layer: rules ──────────────────────────────────────────────────────────────
run_rules() {
  local rules_dir="${REPO_ROOT}/database/tests/rules"
  if [[ ! -d "${rules_dir}" ]] || [[ -z "$(ls "${rules_dir}"/*.sql 2>/dev/null)" ]]; then
    yellow "No rules tests found in ${rules_dir} — will be added in CATMS-061+ (Dev1 appointments)"
    return 0
  fi

  local errors=0
  for f in "${rules_dir}"/*.sql; do
    info "Running $(basename "${f}")..."
    if ! PGPASSWORD="${POSTGRES_SUPERUSER_PASSWORD}" psql \
         -h "${POSTGRES_HOST}" -p "${PG_PORT}" \
         -U "${POSTGRES_SUPERUSER}" -d "${PG_DB}" \
         -v ON_ERROR_STOP=1 -f "${f}" >/dev/null 2>&1; then
      fail "$(basename "${f}") failed"
      ((errors++))
    fi
  done
  [[ "${errors}" -eq 0 ]]
}

# ── Layer: api (backend Vitest / Supertest) ───────────────────────────────────
run_api() {
  cd "${REPO_ROOT}/backend"
  if [[ ! -f node_modules/.bin/vitest ]]; then
    info "Installing backend dependencies..."
    npm ci --silent
  fi
  ./node_modules/.bin/vitest run
}

# ── Layer: frontend (Vitest) ──────────────────────────────────────────────────
run_frontend() {
  cd "${REPO_ROOT}/frontend"
  if [[ ! -d node_modules ]]; then
    info "Installing frontend dependencies..."
    npm ci --silent
  fi
  npm test
}

# ── Step 4: run selected layers ───────────────────────────────────────────────
case "${LAYER}" in
  schema)   run_step "Database schema tests"   run_schema   ;;
  rules)    run_step "Database rules tests"    run_rules    ;;
  api)      run_step "API tests (Vitest)"      run_api      ;;
  frontend) run_step "Frontend tests (Vitest)" run_frontend ;;
  all)
    run_step "Database schema tests"   run_schema
    run_step "Database rules tests"    run_rules
    run_step "Frontend tests (Vitest)" run_frontend
    run_step "API tests (Vitest)"      run_api
    ;;
esac

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
bold "═══════════════════════════════════════════"
bold " Test Summary"
bold "═══════════════════════════════════════════"
echo "  Passed:  ${PASS}"
echo "  Failed:  ${FAIL}"
echo ""

if [[ "${FAIL}" -gt 0 ]]; then
  red "Test run FAILED — ${FAIL} layer(s) failed."
  exit 1
else
  green "All test layers passed ✅"
fi
