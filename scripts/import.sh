#!/usr/bin/env bash
# scripts/import.sh — CATMS controlled CSV bulk data import
# Owner: Dev1 (CATMS-071)
# Usage: ./scripts/import.sh <csv-file> <import-type>
#
# Validates and imports a CSV file using the controlled import procedures.
# Import types: patients | staff | treatments | policies
#
# Rules:
#   - Only CSV files from database/import/templates/ column format are accepted.
#   - All rows are validated before any database write (atomic import).
#   - Import results show accepted/rejected counts and row-level error reasons.
#   - No real patient data may be imported into this repository's demo environment.
#
# Implemented in: CATMS-071 (controlled import)

set -euo pipefail

echo "❌  import.sh not yet implemented — implement in CATMS-071"
echo "    Usage: ./scripts/import.sh <csv-file> <import-type>"
echo "    Import types: patients | staff | treatments | policies"
exit 1
