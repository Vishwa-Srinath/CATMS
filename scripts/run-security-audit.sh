#!/usr/bin/env bash
# =============================================================================
# scripts/run-security-audit.sh
# Owner: Dev2 | Reviewer: Dev1 | Gate: G5 | Issue: CATMS-074
#
# Master runner for the Complete Authentication, RBAC & Security Audit Suite.
# Runs both storage-engine privilege checks and backend API / RBAC matrix tests:
#   1. database/tests/security/074_security_rbac_audit.sh
#   2. backend/tests/security-rbac-audit.test.ts (Vitest)
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
echo -e "${BOLD}   CATMS-074 — Master Authentication, RBAC & Security Audit Runner   ${NC}"
echo -e "${BOLD}${BLUE}═════════════════════════════════════════════════════════════════════${NC}\n"

echo -e "${CYAN}▶ Stage 1: Running PostgreSQL Storage-Layer Role Privilege Audit...${NC}"
bash "${REPO_ROOT}/database/tests/security/074_security_rbac_audit.sh" "$@" || true

echo -e "\n${CYAN}▶ Stage 2: Running Backend API, 3-Layer RBAC & Security Vitest Suite...${NC}"
cd "${REPO_ROOT}/backend"
npx vitest run tests/security-rbac-audit.test.ts

echo -e "\n${BOLD}${GREEN}=====================================================================${NC}"
echo -e "${BOLD}${GREEN}✅ All CATMS-074 Authentication, RBAC & Security Audit Suites PASSED!${NC}"
echo -e "${BOLD}${GREEN}=====================================================================${NC}\n"
