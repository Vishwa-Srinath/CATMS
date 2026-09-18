#!/usr/bin/env bash
# scripts/test.sh — CATMS full test suite runner
# Owner: Dev1 (CATMS-014)
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
# Implemented in: CATMS-014 (CI foundation)

set -euo pipefail

echo "❌  test.sh not yet implemented — implement in CATMS-014"
echo "    This script will: spin disposable DB → run migrations → run selected test layers"
exit 1
