#!/usr/bin/env bash
# =============================================================================
# scripts/start.sh — CATMS local development startup
# Owner: Dev1  |  Issue: CATMS-011
# Usage:
#   ./scripts/start.sh          — start postgres (and API+web when CATMS-013 is done)
#   ./scripts/start.sh --fresh  — destroy dev volume then start clean
#   ./scripts/start.sh --db     — start postgres only (default during G1 phase)
#
# Implemented in:
#   CATMS-011: Compose service + this script
#   CATMS-012: migration runner (invoked after compose up)
#   CATMS-013: API + web profiles (activate --profile app)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/infra/compose.yaml"
ENV_FILE="${REPO_ROOT}/.env"

# ── helpers ──────────────────────────────────────────────────────────────────
red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
info()   { printf '  ℹ  %s\n' "$*"; }
ok()     { printf '  ✅ %s\n' "$*"; }
fail()   { printf '  ❌ %s\n' "$*"; }

# ── pre-flight ────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  CATMS — Local Development Startup           ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# 1. .env must exist
if [[ ! -f "${ENV_FILE}" ]]; then
  fail ".env file not found at repo root."
  info "Run:  cp infra/.env.example .env  then fill in the values."
  exit 1
fi
ok ".env found"

# 2. Docker must be running
if ! docker info >/dev/null 2>&1; then
  fail "Docker is not running. Start Docker Desktop / Docker Engine and retry."
  exit 1
fi
ok "Docker is running"

# ── parse flags ───────────────────────────────────────────────────────────────
FRESH=false
DB_ONLY=false

for arg in "$@"; do
  case "${arg}" in
    --fresh) FRESH=true ;;
    --db)    DB_ONLY=true ;;
    *)
      red "Unknown argument: ${arg}"
      info "Usage: ./scripts/start.sh [--fresh] [--db]"
      exit 1
      ;;
  esac
done

# ── destroy volume if --fresh ─────────────────────────────────────────────────
if [[ "${FRESH}" == "true" ]]; then
  yellow "⚠️  --fresh: stopping containers and destroying dev volume..."
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" down -v --remove-orphans 2>/dev/null || true
  ok "Dev volume destroyed"
fi

# ── bring up postgres ─────────────────────────────────────────────────────────
echo ""
info "Starting PostgreSQL 16..."

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up --detach --wait postgres

ok "PostgreSQL is healthy on 127.0.0.1:${POSTGRES_PORT:-5432}"

# ── run migration runner ──────────────────────────────────────────────────────
if [[ -f "${SCRIPT_DIR}/migrate.sh" ]]; then
  info "Running migration runner (CATMS-012)..."
  bash "${SCRIPT_DIR}/migrate.sh"
else
  yellow "⚠️  Migration runner (scripts/migrate.sh) not yet implemented — CATMS-012"
  info "After CATMS-012 is merged, migrations will run automatically here."
fi

# ── start app profile when not DB-only ───────────────────────────────────────
if [[ "${DB_ONLY}" == "false" ]]; then
  # Check if API/web services are implemented yet (CATMS-013 deliverable)
  if docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" config --services 2>/dev/null \
       | grep -q '^api$'; then
    info "Starting API + web (--profile app)..."
    docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" \
      --profile app up --detach --wait
    ok "API:      http://localhost:${API_PORT:-3000}/api/v1/health"
    ok "Frontend: http://localhost:5173"
  else
    yellow "⚠️  API and web services not yet configured — CATMS-013 pending"
    info "Start the frontend manually: cd frontend && npm run dev"
  fi
fi

echo ""
echo "────────────────────────────────────────────────"
green "CATMS stack is running."
echo ""
info "PostgreSQL: 127.0.0.1:${POSTGRES_PORT:-5432}  DB: ${POSTGRES_DB:-catms_dev}"
info "Stop:  docker compose -f infra/compose.yaml down"
info "Reset: ./scripts/reset.sh"
info "Verify: ./scripts/verify.sh"
echo ""
