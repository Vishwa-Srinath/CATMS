#!/usr/bin/env bash
# scripts/restore.sh — CATMS database restore from backup
# Owner: Dev1 (CATMS-077)
# Usage: ./scripts/restore.sh <backup-file.dump>
#
# Drops the current development database and restores from the given pg_dump file.
# DESTRUCTIVE — all current dev data is replaced.
#
# Implemented in: CATMS-077 (backup/restore runbook)

set -euo pipefail

echo "❌  restore.sh not yet implemented — implement in CATMS-077"
echo "    Usage: ./scripts/restore.sh <path-to.dump>"
echo "    This script will: drop DB → recreate → pg_restore from given dump file"
exit 1
