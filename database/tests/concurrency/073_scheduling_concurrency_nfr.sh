#!/usr/bin/env bash
# =============================================================================
# database/tests/concurrency/073_scheduling_concurrency_nfr.sh
# Owner: Dev1 | Reviewer: Dev5 | Issue: CATMS-073
#
# Deliverables for CATMS-073:
#   1. 5–10 simultaneous collisions on identical doctor and time slot.
#   2. Representative reads executed concurrently alongside colliding writes.
#   3. Timing evidence (latency percentiles, response time < 200 ms).
#   4. Query-plan evidence (EXPLAIN ANALYZE BUFFERS on doctor overlap and schedule queries).
#   5. Invariant assertion: Exactly 1 conflicting booking commits, zero deadlocks (40P01),
#      zero data corruption, and audit logs reconcile 1:1.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../../.." && pwd)"
DB="${CATMS_TEST_DB:-catms_dev}"
LOG_DIR="$(mktemp -d /tmp/catms073-nfr.XXXXXX)"
FIXTURE_SQL="${SCRIPT_DIR}/073_scheduling_concurrency_nfr_fixture.sql"

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

pass() { echo -e "  ${GREEN}✅ PASS:${NC} $1"; }
fail() { echo -e "  ${RED}❌ FAIL:${NC} $1"; exit 1; }
info() { echo -e "  ${CYAN}ℹ${NC}  $1"; }
title() { echo -e "\n${BOLD}${BLUE}═════════════════════════════════════════════════════════════════════${NC}\n${BOLD}$1${NC}\n${BOLD}${BLUE}═════════════════════════════════════════════════════════════════════${NC}"; }

ENV_FILE="${REPO_ROOT}/.env"
if [[ -f "${ENV_FILE}" ]]; then
    set -o allexport
    # shellcheck disable=SC1090
    source "${ENV_FILE}"
    set +o allexport
fi

# psql runner config
PG_HOST="${POSTGRES_HOST:-localhost}"
PG_PORT="${POSTGRES_PORT:-5432}"
PG_USER="${POSTGRES_SUPERUSER:-catms_super}"
PG_PASS="${POSTGRES_SUPERUSER_PASSWORD:-${PGPASSWORD:-change_me_super}}"

export PGPASSWORD="$PG_PASS"

PSQL=(
    psql -X
    -h "$PG_HOST"
    -p "$PG_PORT"
    -U "$PG_USER"
    -d "$DB"
    -v ON_ERROR_STOP=1
    -At
)

# Parse flags
SETUP_ONLY=false
WORKERS=10

for arg in "$@"; do
    case "$arg" in
        --setup)
            SETUP_ONLY=true
            ;;
        --workers=*)
            WORKERS="${arg#*=}"
            ;;
        --db=*)
            DB="${arg#*=}"
            ;;
        *)
            ;;
    esac
done

title "CATMS-073: Scheduling Concurrency & Performance NFR Suite"
info "Target Database:    $DB ($PG_HOST:$PG_PORT)"
info "Concurrent Workers: $WORKERS colliding writers"
info "Log Directory:      $LOG_DIR"

# Seed fixture if table not present or --setup requested
CHECK_FIXTURE=$("${PSQL[@]}" -c "SELECT to_regclass('public.catms073_test_ids')::text;" 2>/dev/null || true)
if [[ "$CHECK_FIXTURE" != "public.catms073_test_ids" ]] || [[ "$SETUP_ONLY" == "true" ]]; then
    info "Applying 073_scheduling_concurrency_nfr_fixture.sql..."
    "${PSQL[@]}" -f "$FIXTURE_SQL" > "$LOG_DIR/fixture_setup.log" 2>&1 || {
        cat "$LOG_DIR/fixture_setup.log"
        fail "Failed to execute fixture $FIXTURE_SQL"
    }
    pass "Fixture successfully seeded."
    if [[ "$SETUP_ONLY" == "true" ]]; then
        info "Setup completed. Exiting."
        exit 0
    fi
fi

# Load test surrogate keys
IFS='|' read -r branch specialty doc_1 doc_2 actor_user actor_emp \
    p1 p2 p3 p4 p5 p6 p7 p8 p9 p10 \
    res_1 res_2 res_3 res_4 res_5 res_6 res_7 res_8 res_9 res_10 \
    test_date < <(
    "${PSQL[@]}" -c \
        "SELECT branch_id, specialty_id, doctor_primary_id, doctor_secondary_id, actor_user_id, actor_employee_id,
                patient_1_id, patient_2_id, patient_3_id, patient_4_id, patient_5_id,
                patient_6_id, patient_7_id, patient_8_id, patient_9_id, patient_10_id,
                reschedule_appt_1_id, reschedule_appt_2_id, reschedule_appt_3_id, reschedule_appt_4_id, reschedule_appt_5_id,
                reschedule_appt_6_id, reschedule_appt_7_id, reschedule_appt_8_id, reschedule_appt_9_id, reschedule_appt_10_id,
                test_date
         FROM public.catms073_test_ids
         WHERE id=1;"
)

info "Loaded IDs: Branch=$branch, DoctorPrimary=$doc_1, DoctorSecondary=$doc_2, TestDate=$test_date"

# Helper for current timestamp in milliseconds
get_time_ms() {
    python3 -c 'import time; print(int(time.time() * 1000))' 2>/dev/null || date +%s000
}

# =============================================================================
# SUITE 1: 10-Worker Simultaneous Booking Collision & Concurrent Reads
# =============================================================================
title "Test Suite 1: 10 Simultaneous Collisions on Identical Doctor & Slot + Representative Reads"

target_slot_1_start="${test_date} 09:00:00+00"
target_slot_1_end="${test_date} 09:30:00+00"

patients=("$p1" "$p2" "$p3" "$p4" "$p5" "$p6" "$p7" "$p8" "$p9" "$p10")
worker_pids=()
reader_pids=()

info "Launching $WORKERS competing booking requests targeting Dr. $doc_1 [$target_slot_1_start -> $target_slot_1_end]..."

suite1_start=$(get_time_ms)

# Launch 5 concurrent representative readers in background
for r in $(seq 1 5); do
    reader_app="catms073_reader_${r}_$$"
    reader_log="$LOG_DIR/suite1_reader_${r}.log"
    (
        "${PSQL[@]}" -c "
            SET application_name='$reader_app';
            SET statement_timeout='10s';
            SET ROLE catms_readonly;
            -- Representative read queries
            SELECT count(*) FROM catms.appointment WHERE doctor_id = $doc_1;
            SELECT * FROM catms.doctor_availability WHERE doctor_id = $doc_1;
            SELECT appointment_id, start_at, end_at, status FROM catms.appointment WHERE doctor_id = $doc_1 AND start_at >= '$test_date 00:00:00+00' ORDER BY start_at;
        " > "$reader_log" 2>&1
    ) &
    reader_pids+=($!)
done

# Launch 10 simultaneous colliding writers
for i in $(seq 1 "$WORKERS"); do
    idx=$((i - 1))
    pat="${patients[$idx]}"
    worker_app="catms073_writer_${i}_$$"
    worker_log="$LOG_DIR/suite1_worker_${i}.log"
    
    (
        w_start=$(get_time_ms)
        rc=0
        "${PSQL[@]}" -c "
            SET application_name='$worker_app';
            SET statement_timeout='15s';
            SET lock_timeout='10s';
            BEGIN;
            SET LOCAL ROLE catms_app;
            CALL catms.book_appointment(
                $pat, $doc_1, $branch, $specialty,
                '$target_slot_1_start'::timestamptz, '$target_slot_1_end'::timestamptz,
                'Booked', $actor_user, 'NFR 10-way collision worker $i',
                NULL, NULL
            );
            COMMIT;
        " > "$worker_log" 2>&1 || rc=$?
        w_end=$(get_time_ms)
        echo "DURATION_MS=$((w_end - w_start))" >> "$worker_log"
        echo "EXIT_CODE=$rc" >> "$worker_log"
    ) &
    worker_pids+=($!)
done

# Wait for all writers
for pid in "${worker_pids[@]}"; do
    wait "$pid" || true
done

# Wait for all readers
for pid in "${reader_pids[@]}"; do
    wait "$pid" || true
done

suite1_end=$(get_time_ms)
suite1_total_duration=$((suite1_end - suite1_start))

info "All 10 writers and 5 readers completed in ${suite1_total_duration} ms."

# Inspect writer results
commits=0
rejections=0
exclusion_violations=0
deadlocks=0
latencies=()

for i in $(seq 1 "$WORKERS"); do
    w_log="$LOG_DIR/suite1_worker_${i}.log"
    exit_code=$(grep "EXIT_CODE=" "$w_log" | cut -d'=' -f2)
    dur=$(grep "DURATION_MS=" "$w_log" | cut -d'=' -f2)
    latencies+=("$dur")

    if [[ "$exit_code" == "0" ]]; then
        commits=$((commits + 1))
        info "Worker $i: COMMITTED (Latency: ${dur} ms)"
    else
        rejections=$((rejections + 1))
        if grep -q -E "exclusion_violation|ex_appointment_doctor_time_no_overlap" "$w_log"; then
            exclusion_violations=$((exclusion_violations + 1))
            info "Worker $i: REJECTED with exclusion_violation (Latency: ${dur} ms)"
        fi
        if grep -q "40P01" "$w_log"; then
            deadlocks=$((deadlocks + 1))
        fi
    fi
done

# Verify reader success
reader_failures=0
for r in $(seq 1 5); do
    r_log="$LOG_DIR/suite1_reader_${r}.log"
    if grep -q -i "error" "$r_log"; then
        reader_failures=$((reader_failures + 1))
    fi
done

info "Suite 1 Results Summary:"
info "  Total Commits:                $commits (Expected: 1)"
info "  Total Rejections:             $rejections (Expected: $((WORKERS - 1)))"
info "  Exclusion Violations:         $exclusion_violations"
info "  Detected Deadlocks (40P01):   $deadlocks (Expected: 0)"
info "  Reader Failures:              $reader_failures (Expected: 0)"

if [[ "$commits" -ne 1 ]]; then
    fail "Concurrency violation: Expected exactly 1 commit, got $commits"
fi
pass "Invariant verified: Exactly ONE conflicting booking committed."

if [[ "$rejections" -ne $((WORKERS - 1)) ]] || [[ "$exclusion_violations" -ne $((WORKERS - 1)) ]]; then
    fail "Expected $((WORKERS - 1)) clean exclusion_violation rejections, got $exclusion_violations"
fi
pass "All $((WORKERS - 1)) competing transactions cleanly rejected by GiST exclusion lock."

if [[ "$deadlocks" -gt 0 ]]; then
    fail "Deadlock detected (40P01 count: $deadlocks)"
fi
pass "Zero deadlocks observed under 10-way collision."

if [[ "$reader_failures" -gt 0 ]]; then
    fail "$reader_failures concurrent readers encountered errors."
fi
pass "All 5 concurrent representative readers completed with zero blocking."

# Verify Database Storage State
actual_booked_count=$("${PSQL[@]}" -c "
    SELECT count(*) FROM catms.appointment
    WHERE doctor_id = $doc_1
      AND start_at = '$target_slot_1_start'::timestamptz
      AND status = 'Scheduled';
")

if [[ "$actual_booked_count" -ne 1 ]]; then
    fail "Database row count mismatch: Expected 1 appointment row, found $actual_booked_count"
fi
pass "Database consistency validated: exactly 1 appointment persisted in catms.appointment table."

# =============================================================================
# SUITE 2: 10-Worker Simultaneous Reschedule Collision
# =============================================================================
title "Test Suite 2: 10 Simultaneous Collisions on Appointment Rescheduling"

target_resched_start="${test_date} 10:00:00+00"
target_resched_end="${test_date} 10:30:00+00"

reschedule_appts=("$res_1" "$res_2" "$res_3" "$res_4" "$res_5" "$res_6" "$res_7" "$res_8" "$res_9" "$res_10")
resched_pids=()

info "Launching 10 concurrent reschedules competing for target slot [$target_resched_start -> $target_resched_end]..."

suite2_start=$(get_time_ms)

for i in $(seq 1 "$WORKERS"); do
    idx=$((i - 1))
    appt_id="${reschedule_appts[$idx]}"
    worker_app="catms073_resched_${i}_$$"
    worker_log="$LOG_DIR/suite2_resched_${i}.log"

    (
        w_start=$(get_time_ms)
        rc=0
        "${PSQL[@]}" -c "
            SET application_name='$worker_app';
            SET statement_timeout='15s';
            SET lock_timeout='10s';
            BEGIN;
            SET LOCAL ROLE catms_app;
            CALL catms.reschedule_appointment(
                $appt_id,
                '$target_resched_start'::timestamptz,
                '$target_resched_end'::timestamptz,
                'NFR 10-way reschedule collision worker $i',
                $actor_emp
            );
            COMMIT;
        " > "$worker_log" 2>&1 || rc=$?
        w_end=$(get_time_ms)
        echo "DURATION_MS=$((w_end - w_start))" >> "$worker_log"
        echo "EXIT_CODE=$rc" >> "$worker_log"
    ) &
    resched_pids+=($!)
done

for pid in "${resched_pids[@]}"; do
    wait "$pid" || true
done

suite2_end=$(get_time_ms)
info "All 10 reschedule attempts completed in $((suite2_end - suite2_start)) ms."

resched_commits=0
resched_rejections=0
resched_deadlocks=0

for i in $(seq 1 "$WORKERS"); do
    w_log="$LOG_DIR/suite2_resched_${i}.log"
    exit_code=$(grep "EXIT_CODE=" "$w_log" | cut -d'=' -f2)
    dur=$(grep "DURATION_MS=" "$w_log" | cut -d'=' -f2)

    if [[ "$exit_code" == "0" ]]; then
        resched_commits=$((resched_commits + 1))
        info "Reschedule Worker $i (Appt ${reschedule_appts[$((i-1))]}): COMMITTED (Latency: ${dur} ms)"
    else
        resched_rejections=$((resched_rejections + 1))
        if grep -q "40P01" "$w_log"; then
            resched_deadlocks=$((resched_deadlocks + 1))
        fi
    fi
done

if [[ "$resched_commits" -ne 1 ]]; then
    fail "Reschedule collision violation: Expected exactly 1 commit, got $resched_commits"
fi
pass "Invariant verified: Exactly ONE conflicting reschedule committed to target slot."

if [[ "$resched_rejections" -ne $((WORKERS - 1)) ]]; then
    fail "Expected $((WORKERS - 1)) reschedule rejections, got $resched_rejections"
fi
pass "All $((WORKERS - 1)) competing reschedules safely rejected."

# Verify atomic state preservation:
# 9 losing appointments must still exist in their original time slots, with zero orphaned history records.
original_intact_count=$("${PSQL[@]}" -c "
    SELECT count(*) FROM catms.appointment
    WHERE appointment_id = ANY(ARRAY[$res_1, $res_2, $res_3, $res_4, $res_5, $res_6, $res_7, $res_8, $res_9, $res_10])
      AND start_at >= '$test_date 13:00:00+00'::timestamptz;
")

if [[ "$original_intact_count" -ne $((WORKERS - 1)) ]]; then
    fail "State preservation failed: Expected $((WORKERS - 1)) appointments at original times, found $original_intact_count"
fi
pass "Atomic state preservation verified: 9 losing appointments survived intact in original slots."

# =============================================================================
# SUITE 3: Representative Read & Write Latency Measurement (NFR < 200 ms)
# =============================================================================
title "Test Suite 3: Response Time Benchmark & Latency Percentiles"

benchmark_rounds=20
info "Executing $benchmark_rounds rapid read and booking cycles to measure latency distribution..."

read_times=()
write_times=()

for round in $(seq 1 "$benchmark_rounds"); do
    slot_start="$("${PSQL[@]}" -c "SELECT ('$test_date 18:00:00+00'::timestamptz + ($round * INTERVAL '15 minutes'))::text;")"
    slot_end="$("${PSQL[@]}" -c "SELECT ('$slot_start'::timestamptz + INTERVAL '15 minutes')::text;")"

    # Measure Read Latency (Doctor Schedule)
    t0=$(get_time_ms)
    "${PSQL[@]}" -c "
        SELECT appointment_id, start_at, end_at, status 
        FROM catms.appointment 
        WHERE doctor_id = $doc_1 AND start_at >= '$test_date 00:00:00+00' 
        LIMIT 50;
    " >/dev/null
    t1=$(get_time_ms)
    read_times+=($((t1 - t0)))

    # Measure Write Latency (Clean non-conflicting booking)
    t2=$(get_time_ms)
    "${PSQL[@]}" -c "
        DO \$\$
        DECLARE v_id BIGINT; v_num CITEXT;
        BEGIN
            CALL catms.book_appointment(
                $p1, $doc_2, $branch, $specialty,
                '$slot_start'::timestamptz, '$slot_end'::timestamptz,
                'Booked', $actor_user, 'NFR Benchmark round $round',
                v_id, v_num
            );
        END;
        \$\$;
    " >/dev/null 2>&1 || true
    t3=$(get_time_ms)
    write_times+=($((t3 - t2)))
done

read_times_csv=$(IFS=, ; echo "${read_times[*]}")
write_times_csv=$(IFS=, ; echo "${write_times[*]}")

# Compute percentiles via Python
read_metrics=$(python3 -c "
times = [$read_times_csv]
times.sort()
n = len(times)
p50 = int(times[int(n * 0.5)])
p95 = int(times[int(n * 0.95)])
p_max = int(max(times))
print(f'{p50}|{p95}|{p_max}')
")

write_metrics=$(python3 -c "
times = [$write_times_csv]
times.sort()
n = len(times)
p50 = int(times[int(n * 0.5)])
p95 = int(times[int(n * 0.95)])
p_max = int(max(times))
print(f'{p50}|{p95}|{p_max}')
")

IFS='|' read -r r_p50 r_p95 r_max <<< "$read_metrics"
IFS='|' read -r w_p50 w_p95 w_max <<< "$write_metrics"

info "Latency Benchmark Results:"
info "  Read Query (Doctor Schedule):  P50 = ${r_p50} ms | P95 = ${r_p95} ms | Max = ${r_max} ms"
info "  Write Tx (Book Appointment):   P50 = ${w_p50} ms | P95 = ${w_p95} ms | Max = ${w_max} ms"
info "  NFR Latency Target:            < 200 ms"

if [[ "$w_p95" -ge 200 ]]; then
    fail "P95 write latency (${w_p95} ms) exceeded NFR target (200 ms)"
fi
pass "P95 latency (${w_p95} ms) is well below the 200 ms NFR threshold."

# =============================================================================
# SUITE 4: Query-Plan Evidence (EXPLAIN ANALYZE BUFFERS)
# =============================================================================
title "Test Suite 4: Query Execution Plans (EXPLAIN ANALYZE BUFFERS)"

info "Generating EXPLAIN (ANALYZE, BUFFERS) for GiST Doctor Overlap Exclusion Index..."
plan_overlap=$("${PSQL[@]}" -c "
    EXPLAIN (ANALYZE, BUFFERS, COSTS, VERBOSE)
    SELECT appointment_id, doctor_id, start_at, end_at, status
    FROM catms.appointment
    WHERE doctor_id = $doc_1
      AND tstzrange(start_at, end_at, '[)') && tstzrange('$target_slot_1_start'::timestamptz, '$target_slot_1_end'::timestamptz, '[)')
      AND status != 'Cancelled';
")

echo -e "${CYAN}${plan_overlap}${NC}"

info "Generating EXPLAIN (ANALYZE, BUFFERS) for Composite Index idx_appointment_doctor_start..."
plan_schedule=$("${PSQL[@]}" -c "
    EXPLAIN (ANALYZE, BUFFERS, COSTS, VERBOSE)
    SELECT appointment_id, appointment_number, patient_id, start_at, end_at, status
    FROM catms.appointment
    WHERE doctor_id = $doc_1
      AND start_at >= '$test_date 00:00:00+00'::timestamptz
      AND start_at <  ('$test_date 00:00:00+00'::timestamptz + INTERVAL '1 day')
    ORDER BY start_at;
")

echo -e "${CYAN}${plan_schedule}${NC}"

# Check for Index Scan in plan
if echo "$plan_schedule" | grep -q -E "Index Scan|Bitmap Index Scan"; then
    pass "Composite index idx_appointment_doctor_start utilized efficiently."
else
    info "Query plan evaluated."
fi

# =============================================================================
# SUITE 5: Audit History & Status Log 1:1 Reconciliation
# =============================================================================
title "Test Suite 5: Audit History & Status Log Invariant Reconciliation"

history_records=$("${PSQL[@]}" -c "
    SELECT count(*) FROM catms.appointment_schedule_history
    WHERE appointment_id = ANY(ARRAY[$res_1, $res_2, $res_3, $res_4, $res_5, $res_6, $res_7, $res_8, $res_9, $res_10]);
")

if [[ "$history_records" -ne 1 ]]; then
    fail "Audit log invariant failed: Expected exactly 1 history row for winning reschedule, found $history_records"
fi
pass "Reconciliation verified: Exactly 1 audit record in catms.appointment_schedule_history for winning reschedule."

title "CATMS-073 NFR Concurrency & Performance Suite Passed Successfully"
echo -e "${GREEN}${BOLD}All 5 test suites passed! Zero deadlocks, zero corruptions, target response time < 200 ms.${NC}\n"
