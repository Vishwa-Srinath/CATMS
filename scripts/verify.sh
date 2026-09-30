#!/usr/bin/env bash
# =============================================================================
# scripts/verify.sh — CATMS environment pre-flight verification
# Owner: Dev1  |  Issue: CATMS-011 (platform) + CATMS-082 (clean-clone check)
# Usage: ./scripts/verify.sh
#
# Checks:
#   1. Docker is running
#   2. .env file exists with all required variables
#   3. PostgreSQL container is healthy
#   4. PostgreSQL is accepting connections on the expected port
#   5. catms_app role exists in PostgreSQL
#   6. Migration runner status (once CATMS-012 is merged)
#   7. API health endpoint (once CATMS-013 is merged)
#
# Exit 0 = all checks passed.
# Exit 1 = at least one required check failed.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/infra/compose.yaml"
ENV_FILE="${REPO_ROOT}/.env"

PASS=0
FAIL=0

# ── helpers ───────────────────────────────────────────────────────────────────
ok()   { printf '  ✅ PASS  %s\n' "$*"; ((PASS++)); }
fail() { printf '  ❌ FAIL  %s\n' "$*"; ((FAIL++)); }
warn() { printf '  ⚠️  WARN  %s\n' "$*"; }
info() { printf '  ℹ  INFO  %s\n' "$*"; }

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  CATMS — Pre-flight Environment Verification  ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 1. Docker ─────────────────────────────────────────────────────────────────
echo "[ Docker ]"
if docker info >/dev/null 2>&1; then
  ok "Docker daemon is running"
else
  fail "Docker is not running — start Docker Desktop or Docker Engine"
fi

# ── 2. .env file ──────────────────────────────────────────────────────────────
echo ""
echo "[ Environment ]"

if [[ ! -f "${ENV_FILE}" ]]; then
  fail ".env not found — run: cp infra/.env.example .env"
else
  ok ".env file exists"

  # Load .env so we can use the variables below
  # shellcheck disable=SC2046
  set -o allexport
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +o allexport

  # Required variable list (CATMS-011 minimum set)
  REQUIRED_VARS=(
    POSTGRES_HOST POSTGRES_PORT POSTGRES_DB
    POSTGRES_USER POSTGRES_PASSWORD
    POSTGRES_SUPERUSER POSTGRES_SUPERUSER_PASSWORD
  )

  ALL_VARS_OK=true
  for var in "${REQUIRED_VARS[@]}"; do
    if [[ -z "${!var:-}" ]]; then
      fail "Required variable \$${var} is empty or missing in .env"
      ALL_VARS_OK=false
    fi
  done

  # Warn about insecure defaults
  if [[ "${POSTGRES_PASSWORD:-}" == "change_me_dev" ]]; then
    warn "\$POSTGRES_PASSWORD is still the default placeholder — fine for dev, rotate before demo"
  fi
  if [[ "${JWT_SECRET:-}" == "replace_with_64_plus_random_hex_characters" ]] || \
     [[ "${#JWT_SECRET:-}" -lt 64 ]]; then
    warn "\$JWT_SECRET is too short or is still the placeholder — generate a 64+ char secret"
  fi

  [[ "${ALL_VARS_OK}" == "true" ]] && ok "All required environment variables are set"
fi

# ── 3. PostgreSQL container health ───────────────────────────────────────────
echo ""
echo "[ PostgreSQL container ]"

PG_CONTAINER="catms_postgres"
if docker inspect --format='{{.State.Health.Status}}' "${PG_CONTAINER}" 2>/dev/null | grep -q "^healthy$"; then
  ok "Container '${PG_CONTAINER}' is healthy"
else
  # Check if container even exists
  if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${PG_CONTAINER}$"; then
    PG_STATUS=$(docker inspect --format='{{.State.Status}}' "${PG_CONTAINER}" 2>/dev/null || echo "unknown")
    fail "Container '${PG_CONTAINER}' exists but status is '${PG_STATUS}' (not healthy)"
    info "Run: ./scripts/start.sh"
  else
    fail "Container '${PG_CONTAINER}' not found — run: ./scripts/start.sh"
  fi
fi

# ── 4. PostgreSQL connectivity ────────────────────────────────────────────────
echo ""
echo "[ PostgreSQL connectivity ]"

PG_HOST="${POSTGRES_HOST:-localhost}"
PG_PORT="${POSTGRES_PORT:-5432}"
PG_DB="${POSTGRES_DB:-catms_dev}"
PG_SUPER="${POSTGRES_SUPERUSER:-catms_super}"
PG_SUPER_PASS="${POSTGRES_SUPERUSER_PASSWORD:-change_me_super}"

if PGPASSWORD="${PG_SUPER_PASS}" psql \
     -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_SUPER}" -d "${PG_DB}" \
     -c '\q' >/dev/null 2>&1; then
  ok "PostgreSQL accepting connections on ${PG_HOST}:${PG_PORT} / db=${PG_DB}"
else
  fail "Cannot connect to PostgreSQL on ${PG_HOST}:${PG_PORT}"
  info "psql must be installed locally: sudo apt install postgresql-client"
  info "Or: docker exec -it catms_postgres psql -U ${PG_SUPER} -d ${PG_DB}"
fi

# ── 5. Application role exists ────────────────────────────────────────────────
echo ""
echo "[ Database roles ]"

for role in catms_app catms_readonly; do
  ROLE_EXISTS=$(PGPASSWORD="${PG_SUPER_PASS}" psql \
    -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_SUPER}" -d "${PG_DB}" \
    -tAc "SELECT 1 FROM pg_roles WHERE rolname='${role}'" 2>/dev/null || echo "")

  if [[ "${ROLE_EXISTS}" == "1" ]]; then
    ok "Role '${role}' exists"
  else
    fail "Role '${role}' not found — init scripts may not have run (check: docker compose down -v && ./scripts/start.sh --fresh)"
  fi
done

# ── 6. Migration runner (CATMS-012) ──────────────────────────────────────────
echo ""
echo "[ Migration runner ]"

if [[ -f "${SCRIPT_DIR}/migrate.sh" ]]; then
  info "scripts/migrate.sh found — checking migration history table..."
  MHIST=$(PGPASSWORD="${PG_SUPER_PASS}" psql \
    -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_SUPER}" -d "${PG_DB}" \
    -tAc "SELECT COUNT(*) FROM catms.schema_migrations" 2>/dev/null || echo "ERROR")
  if [[ "${MHIST}" == "ERROR" ]]; then
    warn "catms.schema_migrations table not found — CATMS-012 not yet applied"
  else
    ok "catms.schema_migrations found — ${MHIST} migration(s) recorded"
  fi
else
  warn "scripts/migrate.sh not yet created — CATMS-012 pending"
fi

# ── 7. API health (CATMS-013) ─────────────────────────────────────────────────
echo ""
echo "[ API health ]"

API_PORT="${API_PORT:-3000}"
API_HEALTH="http://localhost:${API_PORT}/api/v1/health"

if command -v curl >/dev/null 2>&1; then
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "${API_HEALTH}" 2>/dev/null || echo "000")
  if [[ "${HTTP_STATUS}" == "200" ]]; then
    ok "API health endpoint responded 200 at ${API_HEALTH}"
  else
    warn "API not responding (HTTP ${HTTP_STATUS}) — CATMS-013 may not be deployed yet"
  fi
else
  warn "curl not installed — skipping API health check"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────"
echo ""
echo "  Results:  ✅ ${PASS} passed   ❌ ${FAIL} failed"
echo ""

if [[ "${FAIL}" -gt 0 ]]; then
  printf '\033[31m  Verification failed — fix the items above before running the stack.\033[0m\n'
  echo ""
  exit 1
else
  printf '\033[32m  All checks passed — environment is ready.\033[0m\n'
  echo ""
  exit 0
fi
