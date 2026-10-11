#!/usr/bin/env bash
# =============================================================================
# scripts/run-concurrency-nfr.sh
# Owner: Dev1 | Reviewer: Dev5 | Issue: CATMS-073
#
# Master runner for the Scheduling Concurrency and Performance NFR Suite.
# Runs both the storage-engine multi-session race tests and the API concurrency suite:
#   1. database/tests/concurrency/073_scheduling_concurrency_nfr.sh
#   2. backend/tests/scheduling-concurrency-nfr.test.ts (Vitest)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "\n${BOLD}${BLUE}═════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}   CATMS-073 — Master Concurrency & Performance NFR Suite Runner   ${NC}"
echo -e "${BOLD}${BLUE}═════════════════════════════════════════════════════════════════════${NC}\n"

echo -e "${CYAN}▶ Stage 1: Running PostgreSQL Storage Engine Concurrency Test...${NC}"
bash "${REPO_ROOT}/database/tests/concurrency/073_scheduling_concurrency_nfr.sh" "$@"

echo -e "\n${CYAN}▶ Stage 2: Running Backend API Concurrency & Latency Vitest Suite...${NC}"
cd "${REPO_ROOT}/backend"
npx vitest run tests/scheduling-concurrency-nfr.test.ts

echo -e "\n${BOLD}${GREEN}=====================================================================${NC}"
echo -e "${BOLD}${GREEN}✅ All CATMS-073 Concurrency & Performance NFR Suites PASSED!${NC}"
echo -e "${BOLD}${GREEN}=====================================================================${NC}\n"
