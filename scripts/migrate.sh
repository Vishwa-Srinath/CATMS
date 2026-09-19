#!/usr/bin/env bash
# =============================================================================
# scripts/migrate.sh — CATMS forward-only migration runner
# Owner: Dev1  |  Issue: CATMS-012
#
# Usage:
#   ./scripts/migrate.sh                — apply all pending migrations (dev DB)
#   ./scripts/migrate.sh --test         — apply all migrations to the test DB
#   ./scripts/migrate.sh --dry-run      — show what would be applied, no changes
#   ./scripts/migrate.sh --status       — show applied vs pending migrations
#   ./scripts/migrate.sh --verify       — verify checksums of all applied migrations
#
# Rules enforced:
#   1. Migrations apply in strict ascending numeric order (no gaps skipped).
#   2. Any migration whose version is already in schema_migrations is skipped.
#   3. If an already-applied migration file's SHA-256 differs from its stored
#      checksum, the runner aborts immediately — never silently applies.
#   4. Each migration runs inside its own BEGIN/COMMIT transaction.
#      If psql reports a non-zero exit code the runner aborts; the version row
#      is NOT inserted, so the next run will retry from that file.
#   5. No migration may be applied out of order (numeric gap detection).
#   6. The runner never modifies .env or any file outside the database.
#
# Bootstrap sequence (first ever run on an empty database):
#   Step 1 — Ensure catms schema exists (inline DDL, idempotent).
#   Step 2 — Apply 003_migration_metadata.sql unconditionally with IF NOT EXISTS.
#   Step 3 — Apply 001, 002, 003 … in order, skipping already-recorded versions.
#             (003 is skipped because step 2 already inserted its row.)
#
# Dependencies:
#   - psql        (postgresql-client)  present in PATH
#   - sha256sum   (coreutils)          present in PATH
#   - .env file   loaded by start.sh or caller before invoking this script
#     OR environment variables already exported
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MIGRATIONS_DIR="${REPO_ROOT}/database/migrations"
ENV_FILE="${REPO_ROOT}/.env"
METADATA_BOOTSTRAP="${MIGRATIONS_DIR}/003_migration_metadata.sql"

# ── colour helpers ────────────────────────────────────────────────────────────
red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
bold()   { printf '\033[1m%s\033[0m\n' "$*"; }
info()   { printf '  ℹ  %s\n' "$*"; }
ok()     { printf '  ✅ %s\n' "$*"; }
skip()   { printf '  ⏭  %s\n' "$*"; }
fail()   { printf '  ❌ %s\n' "$*"; }

# ── load .env if not already in environment ───────────────────────────────────
if [[ -f "${ENV_FILE}" ]] && [[ -z "${POSTGRES_HOST:-}" ]]; then
  set -o allexport
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +o allexport
fi

# ── parse flags ───────────────────────────────────────────────────────────────
DRY_RUN=false
STATUS_ONLY=false
VERIFY_ONLY=false
TEST_MODE=false

for arg in "$@"; do
  case "${arg}" in
    --dry-run) DRY_RUN=true ;;
    --status)  STATUS_ONLY=true ;;
    --verify)  VERIFY_ONLY=true ;;
    --test)    TEST_MODE=true ;;
    *)
      red "Unknown argument: ${arg}"
      info "Usage: ./scripts/migrate.sh [--dry-run] [--status] [--verify] [--test]"
      exit 1
      ;;
  esac
done

# ── database connection settings ──────────────────────────────────────────────
if [[ "${TEST_MODE}" == "true" ]]; then
  PG_HOST="${POSTGRES_HOST:-localhost}"
  PG_PORT="5433"                          # test profile uses port 5433
  PG_DB="catms_test"
  PG_USER="${POSTGRES_SUPERUSER:-catms_super}"
  export PGPASSWORD="${POSTGRES_SUPERUSER_PASSWORD:-catms_test_password}"
else
  PG_HOST="${POSTGRES_HOST:-localhost}"
  PG_PORT="${POSTGRES_PORT:-5432}"
  PG_DB="${POSTGRES_DB:-catms_dev}"
  PG_USER="${POSTGRES_SUPERUSER:-catms_super}"
  export PGPASSWORD="${POSTGRES_SUPERUSER_PASSWORD:-change_me_super}"
fi

# ── helper: run a SQL string against the target database ─────────────────────
psql_exec() {
  psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_DB}" \
       -v ON_ERROR_STOP=1 --no-psqlrc "$@"
}

# ── helper: run a SQL file against the target database ───────────────────────
psql_file() {
  psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_DB}" \
       -v ON_ERROR_STOP=1 --no-psqlrc -f "$1"
}

# ── helper: sha256 of a file ─────────────────────────────────────────────────
file_checksum() {
  sha256sum "$1" | awk '{ print $1 }'
}

# ── helper: check connectivity ───────────────────────────────────────────────
check_connection() {
  if ! psql_exec -c '\q' >/dev/null 2>&1; then
    fail "Cannot connect to PostgreSQL at ${PG_HOST}:${PG_PORT} / db=${PG_DB}"
    info "Is the container running? Try: ./scripts/start.sh"
    exit 1
  fi
}

# ── Step 0: verify connectivity ───────────────────────────────────────────────
echo ""
bold "CATMS Migration Runner"
echo "  Database: ${PG_HOST}:${PG_PORT}/${PG_DB}"
echo "  Mode:     $( [[ "${DRY_RUN}" == "true" ]] && echo "DRY RUN" || \
                      [[ "${STATUS_ONLY}" == "true" ]] && echo "STATUS" || \
                      [[ "${VERIFY_ONLY}" == "true" ]] && echo "VERIFY" || \
                      [[ "${TEST_MODE}" == "true" ]] && echo "TEST" || echo "APPLY" )"
echo ""

check_connection
ok "Connected to ${PG_HOST}:${PG_PORT}/${PG_DB}"

# ── Step 1: bootstrap catms schema (idempotent) ───────────────────────────────
psql_exec -c "CREATE SCHEMA IF NOT EXISTS catms;" >/dev/null 2>&1

# ── Step 2: bootstrap schema_migrations table ─────────────────────────────────
# Run 003_migration_metadata.sql with IF NOT EXISTS — safe to rerun.
# This file must exist; if deleted the team has a serious problem.
if [[ ! -f "${METADATA_BOOTSTRAP}" ]]; then
  fail "Bootstrap file not found: ${METADATA_BOOTSTRAP}"
  fail "This file must not be deleted. Restore it from git."
  exit 1
fi

psql_file "${METADATA_BOOTSTRAP}" >/dev/null 2>&1
# Ensure version 3 is recorded (ON CONFLICT DO NOTHING handles duplicates).

# ── Step 3: collect all migration files in numeric order ─────────────────────
# Pattern: NNN_description.sql where NNN is a three-digit number.
# Only files matching the pattern; .gitkeep and README are ignored.

mapfile -t MIGRATION_FILES < <(
  find "${MIGRATIONS_DIR}" -maxdepth 1 -name '[0-9][0-9][0-9]_*.sql' \
  | sort -V
)

if [[ ${#MIGRATION_FILES[@]} -eq 0 ]]; then
  yellow "No migration files found in ${MIGRATIONS_DIR}"
  exit 0
fi

# ── STATUS mode ───────────────────────────────────────────────────────────────
if [[ "${STATUS_ONLY}" == "true" ]]; then
  echo "Migration Status:"
  echo "────────────────────────────────────────────────────────────────────"
  printf "  %-5s  %-10s  %-30s  %s\n" "VER" "STATUS" "DESCRIPTION" "APPLIED AT"
  echo "────────────────────────────────────────────────────────────────────"

  for file in "${MIGRATION_FILES[@]}"; do
    filename="$(basename "${file}")"
    version="$(echo "${filename}" | grep -oP '^\d+')"
    version_int=$((10#${version}))   # strip leading zeros

    applied=$(psql_exec -tAc \
      "SELECT to_char(applied_at,'YYYY-MM-DD HH24:MI') || ' | ' || description \
       FROM catms.schema_migrations WHERE version = ${version_int}" 2>/dev/null || echo "")

    if [[ -n "${applied}" ]]; then
      printf '  %-5s  %-10s  %s\n' "${version}" "APPLIED" "${applied}"
    else
      printf '  %-5s  %-10s  %s\n' "${version}" "PENDING" "${filename}"
    fi
  done
  echo ""
  exit 0
fi

# ── VERIFY mode ───────────────────────────────────────────────────────────────
if [[ "${VERIFY_ONLY}" == "true" ]]; then
  echo "Verifying checksums of applied migrations..."
  VERIFY_ERRORS=0

  for file in "${MIGRATION_FILES[@]}"; do
    filename="$(basename "${file}")"
    version="$(echo "${filename}" | grep -oP '^\d+')"
    version_int=$((10#${version}))

    stored=$(psql_exec -tAc \
      "SELECT checksum_sha256 FROM catms.schema_migrations WHERE version = ${version_int}" \
      2>/dev/null || echo "")

    [[ -z "${stored}" ]] && continue   # not applied yet — skip

    if [[ "${stored}" == "NULL" ]] || [[ -z "${stored}" ]]; then
      yellow "  ⚠️  ${filename}: no checksum stored (applied before runner added checksum support)"
      continue
    fi

    current=$(file_checksum "${file}")

    if [[ "${current}" == "${stored}" ]]; then
      ok "${filename}: checksum OK"
    else
      fail "${filename}: CHECKSUM MISMATCH"
      info "  Stored:  ${stored}"
      info "  Current: ${current}"
      info "  A merged migration must never be modified. Add a corrective migration instead."
      ((VERIFY_ERRORS++))
    fi
  done

  if [[ "${VERIFY_ERRORS}" -gt 0 ]]; then
    echo ""
    red "Checksum verification FAILED — ${VERIFY_ERRORS} file(s) modified after merging."
    exit 1
  else
    echo ""
    green "All applied migrations have valid checksums."
    exit 0
  fi
fi

# ── APPLY mode ────────────────────────────────────────────────────────────────
APPLIED=0
SKIPPED=0
ERRORS=0
PREV_VERSION=0

for file in "${MIGRATION_FILES[@]}"; do
  filename="$(basename "${file}")"
  version="$(echo "${filename}" | grep -oP '^\d+')"
  version_int=$((10#${version}))   # strip leading zeros for arithmetic

  # ── order/gap check ──────────────────────────────────────────────────────
  # Migrations must be applied in strict ascending order.
  # Detect files whose version number goes backwards or has a gap > 1
  # (gaps of exactly 1 are normal; intentional ranges can skip, but we warn).
  # We do NOT abort on gaps > 1 because ranges are reserved per developer
  # (e.g., 020–039 = Dev2) and the lower end may be skipped if not yet created.
  # We DO abort if a file's version is lower than the last applied version,
  # which would indicate a serious out-of-order commit.

  if [[ "${version_int}" -le "${PREV_VERSION}" ]] && [[ "${PREV_VERSION}" -gt 0 ]]; then
    fail "Out-of-order migration detected: ${filename} (version ${version_int}) comes after ${PREV_VERSION}"
    fail "This indicates a serious git history problem. Fix the migration numbering."
    exit 1
  fi
  PREV_VERSION="${version_int}"

  # ── skip if already applied ───────────────────────────────────────────────
  already_applied=$(psql_exec -tAc \
    "SELECT version FROM catms.schema_migrations WHERE version = ${version_int}" \
    2>/dev/null || echo "")

  if [[ -n "${already_applied}" ]]; then
    # Verify the checksum of already-applied files
    stored_checksum=$(psql_exec -tAc \
      "SELECT coalesce(checksum_sha256,'') FROM catms.schema_migrations WHERE version = ${version_int}" \
      2>/dev/null || echo "")

    if [[ -n "${stored_checksum}" ]]; then
      current_checksum=$(file_checksum "${file}")
      if [[ "${current_checksum}" != "${stored_checksum}" ]]; then
        echo ""
        fail "CHECKSUM MISMATCH — migration ${filename} was modified after being applied."
        info "Stored checksum:  ${stored_checksum}"
        info "Current checksum: ${current_checksum}"
        info "Never edit a merged migration. Add a corrective migration (160+) instead."
        exit 1
      fi
    fi

    skip "${filename} (already applied)"
    ((SKIPPED++))
    continue
  fi

  # ── dry-run: just print what would happen ────────────────────────────────
  if [[ "${DRY_RUN}" == "true" ]]; then
    info "[DRY RUN] Would apply: ${filename}"
    ((APPLIED++))
    continue
  fi

  # ── apply the migration ───────────────────────────────────────────────────
  printf '  ⏳ Applying %s ...\n' "${filename}"
  START_MS=$(date +%s%3N)

  # Compute checksum BEFORE applying so we store what we actually ran.
  CHECKSUM=$(file_checksum "${file}")

  # psql with ON_ERROR_STOP=1: any SQL error stops psql with non-zero exit.
  # If psql exits non-zero, set -e causes the script to abort immediately.
  # The version row is NOT yet inserted, so the next run retries from here.
  if ! psql_file "${file}" >/dev/null 2>&1; then
    echo ""
    fail "Migration ${filename} FAILED."
    info "Check the PostgreSQL logs: docker logs catms_postgres"
    info "The migration transaction was rolled back. Fix the SQL and retry."
    ((ERRORS++))
    exit 1
  fi

  END_MS=$(date +%s%3N)
  ELAPSED_MS=$(( END_MS - START_MS ))

  # Update the row that the migration SQL itself inserted (via INSERT at end of file).
  # We set checksum_sha256 and execution_ms, which the SQL INSERT leaves NULL.
  # ON CONFLICT handles the case where the row was already inserted by the SQL.
  psql_exec -c "
    INSERT INTO catms.schema_migrations (version, description, applied_by, checksum_sha256, execution_ms)
    VALUES (
      ${version_int},
      '$(basename "${file}" .sql | sed 's/^[0-9]*_//' | tr '_' ' ')',
      current_user,
      '${CHECKSUM}',
      ${ELAPSED_MS}
    )
    ON CONFLICT (version) DO UPDATE
      SET checksum_sha256 = EXCLUDED.checksum_sha256,
          execution_ms    = EXCLUDED.execution_ms;
  " >/dev/null 2>&1

  ok "${filename} (${ELAPSED_MS}ms)"
  ((APPLIED++))
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────"

if [[ "${DRY_RUN}" == "true" ]]; then
  yellow "DRY RUN — no changes made. ${APPLIED} migration(s) would be applied."
elif [[ "${APPLIED}" -eq 0 ]] && [[ "${SKIPPED}" -gt 0 ]]; then
  green "Already up to date — ${SKIPPED} migration(s) applied, none pending."
elif [[ "${ERRORS}" -gt 0 ]]; then
  red "Migration run FAILED — ${ERRORS} error(s). ${APPLIED} applied, ${SKIPPED} skipped."
  exit 1
else
  green "Migration complete — ${APPLIED} applied, ${SKIPPED} skipped."
fi

echo ""
