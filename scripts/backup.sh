#!/usr/bin/env bash
# scripts/backup.sh — CATMS database backup
# Owner: Dev1 (CATMS-077)
# Usage: ./scripts/backup.sh [output-dir]
#
# Creates a timestamped pg_dump of the development database.
# Output: ./backups/catms_YYYYMMDD_HHMMSS.dump (custom format)
#
# The backup file is excluded from git via .gitignore.
# NEVER commit a backup file — it may contain demo patient data.
#
# Implemented in: CATMS-077 (backup/restore runbook)

set -euo pipefail

echo "❌  backup.sh not yet implemented — implement in CATMS-077"
echo "    This script will: pg_dump --format=custom catms_dev > backups/catms_TIMESTAMP.dump"
exit 1
