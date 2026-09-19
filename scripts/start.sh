#!/usr/bin/env bash
# scripts/start.sh — CATMS local development startup
# Owner: Dev1 (CATMS-011)
# Usage: ./scripts/start.sh [--fresh]
#
# Starts the full Docker Compose stack: PostgreSQL 16, Express API, and Vite frontend.
# With --fresh: tears down volumes and starts clean (equivalent to reset + start).
#
# Prerequisites:
#   - Docker Desktop / Docker Engine running
#   - .env file present (copy from infra/.env.example)
#   - Images built (first run: docker compose build)
#
# Implemented in: CATMS-011 (Compose service) + CATMS-012 (migration runner)

set -euo pipefail

echo "❌  start.sh not yet implemented — implement in CATMS-011"
echo "    This script will: docker compose up + run migrations + seed tiny fixture"
exit 1
