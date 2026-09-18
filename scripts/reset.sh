#!/usr/bin/env bash
# scripts/reset.sh — CATMS full database reset
# Owner: Dev1 (CATMS-012)
# Usage: ./scripts/reset.sh
#
# Drops the development database, recreates it from scratch, runs every migration
# in order, and loads the tiny deterministic fixture.
# DESTRUCTIVE — all dev data is lost.
#
# Implemented in: CATMS-011 (Compose) + CATMS-012 (migration runner)

set -euo pipefail

echo "❌  reset.sh not yet implemented — implement in CATMS-012"
echo "    This script will: drop DB → recreate → run all migrations → load tiny seed"
exit 1
