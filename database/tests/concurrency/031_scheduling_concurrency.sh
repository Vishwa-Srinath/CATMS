#!/usr/bin/env bash
# CATMS-031: real-schema scheduling concurrency tests.
#
# Prerequisites:
# - A disposable test database named catms031_concurrency (or $CATMS_TEST_DB)
# - Migrations applied through 062
# - This script and 031_scheduling_concurrency_fixture.sql in the same directory.
#
# The script commits fictional test data. Recreate the disposable database before another run.

set -euo pipefail

DB="${CATMS_TEST_DB:-catms031_concurrency}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../../.." && pwd)"
LOG_DIR="$(mktemp -d /tmp/catms031-concurrency.XXXXXX)"

PSQL=(
    psql -X
    -h "${PGHOST:-localhost}"
    -p "${PGPORT:-5432}"
    -U "${PGUSER:-catms_super}"
    -d "$DB"
    -v ON_ERROR_STOP=1
    -At
)

ensure_database() {
    local check_db
    check_db=$(psql -X -h "${PGHOST:-localhost}" -p "${PGPORT:-5432}" -U "${PGUSER:-catms_super}" -d postgres -Atc \
        "SELECT 1 FROM pg_database WHERE datname='$DB';" 2>/dev/null || true)

    if [[ "$check_db" != "1" ]]; then
        echo "Creating disposable database $DB..."
        psql -X -h "${PGHOST:-localhost}" -p "${PGPORT:-5432}" -U "${PGUSER:-catms_super}" -d postgres -c \
            "CREATE DATABASE $DB;" >/dev/null

        echo "Applying schema migrations..."
        for m in "$REPO_ROOT"/database/migrations/*.sql; do
            if [[ -f "$m" ]]; then
                "${PSQL[@]}" -f "$m" >/dev/null 2>&1 || {
                    echo "Migration failed on $m"
                    exit 1
                }
            fi
        done
        echo "Migrations applied to $DB."
    fi
}

if [[ "${1:-}" == "--setup" ]] || ! "${PSQL[@]}" -c "SELECT 1;" >/dev/null 2>&1; then
    ensure_database
fi

echo "Test logs: $LOG_DIR"

"${PSQL[@]}" \
    -f "$SCRIPT_DIR/031_scheduling_concurrency_fixture.sql" \
    > "$LOG_DIR/fixture.log" 2>&1 || {
        cat "$LOG_DIR/fixture.log"
        echo "ERROR: Failed to seed 031_scheduling_concurrency_fixture.sql"
        exit 1
    }

IFS='|' read -r branch specialty doc_a doc_b actor_user actor_emp pat_1 pat_2 pat_3 appt_1 appt_2 test_date < <(
    "${PSQL[@]}" -c \
        "SELECT branch_id, specialty_id, doctor_a_id, doctor_b_id,
                actor_user_id, actor_employee_id, patient_1_id, patient_2_id, patient_3_id,
                reschedule_appt_1_id, reschedule_appt_2_id, test_date
         FROM public.catms031_test_ids
         WHERE id=1;"
)

assert_true() {
    local sql="$1"
    local description="$2"

    local res
    res=$("${PSQL[@]}" -c "$sql")
    if [[ "$res" != "t" ]]; then
        echo "FAIL: $description (result: $res)"
        exit 1
    fi
}

# Session A performs an operation and holds transaction open.
# Session B tries competing operation.
# Confirm B is blocked, then check result after A commits.
race() {
    local label="$1"
    local sql_a="$2"
    local sql_b="$3"
    local expected="$4"
    local hold_sec="${5:-4}"

    local app_a="catms031_${label}_a_$$"
    local app_b="catms031_${label}_b_$$"
    local log_a="$LOG_DIR/${label}-a.log"
    local log_b="$LOG_DIR/${label}-b.log"
    local ready=0
    local blocked=0
    local rc_a=0
    local rc_b=0
    local started
    local finished

    "${PSQL[@]}" -c "
        SET application_name='$app_a';
        SET statement_timeout='30s';
        BEGIN;
        SET LOCAL ROLE catms_app;
        $sql_a
        SELECT pg_sleep($hold_sec);
        COMMIT;
    " > "$log_a" 2>&1 &
    local pid_a=$!

    for attempt in $(seq 1 60); do
        if [[ "$("${PSQL[@]}" -c "
            SELECT EXISTS (
                SELECT 1 FROM pg_stat_activity
                WHERE application_name='$app_a'
                  AND wait_event='PgSleep'
            );
        ")" == "t" ]]; then
            ready=1
            break
        fi

        if ! kill -0 "$pid_a" 2>/dev/null; then
            break
        fi

        sleep 0.05
    done

    if [[ "$ready" != 1 ]]; then
        wait "$pid_a" || true
        cat "$log_a"
        echo "FAIL: $label session A did not reach its sleep holding point."
        return 1
    fi

    started=$(date +%s)

    "${PSQL[@]}" -c "
        SET application_name='$app_b';
        SET statement_timeout='30s';
        SET lock_timeout='15s';
        BEGIN;
        SET LOCAL ROLE catms_app;
        $sql_b
        COMMIT;
    " > "$log_b" 2>&1 &
    local pid_b=$!

    for attempt in $(seq 1 60); do
        if [[ "$("${PSQL[@]}" -c "
            SELECT EXISTS (
                SELECT 1
                FROM pg_stat_activity b
                WHERE b.application_name='$app_b'
                  AND EXISTS (
                      SELECT 1
                      FROM pg_stat_activity a
                      WHERE a.application_name='$app_a'
                        AND a.pid = ANY(pg_blocking_pids(b.pid))
                  )
            );
        ")" == "t" ]]; then
            blocked=1
            break
        fi

        if ! kill -0 "$pid_b" 2>/dev/null; then
            break
        fi

        sleep 0.05
    done

    wait "$pid_b" || rc_b=$?
    finished=$(date +%s)
    wait "$pid_a" || rc_a=$?

    if [[ "$rc_a" != 0 ]]; then
        cat "$log_a"
        echo "FAIL: $label session A failed unexpectedly."
        return 1
    fi

    if [[ "$expected" == "OK" ]]; then
        if [[ "$rc_b" != 0 ]]; then
            cat "$log_b"
            echo "FAIL: $label session B unexpectedly failed."
            return 1
        fi
        echo "PASS: $label; both sessions committed successfully in $((finished - started))s."
    else
        if [[ "$rc_b" == 0 ]] || ! grep -E -q "$expected" "$log_b"; then
            cat "$log_b"
            echo "FAIL: $label expected error pattern '$expected'."
            return 1
        fi
        echo "PASS: $label; session B blocked by A and rejected with expected error in $((finished - started))s."
    fi
}

# 1. Simultaneous booking collision on the exact same doctor & time slot.
slot_1_start="${test_date} 09:00:00+00"
slot_1_end="${test_date} 09:30:00+00"

sql_book_a="
    DO \$\$
    DECLARE
        v_id BIGINT;
        v_num CITEXT;
    BEGIN
        CALL catms.book_appointment(
            $pat_1, $doc_a, $branch, $specialty,
            '$slot_1_start'::timestamptz, '$slot_1_end'::timestamptz,
            'Booked', $actor_user, 'Session A concurrent booking',
            v_id, v_num
        );
    END;
    \$\$;
"

sql_book_b="
    DO \$\$
    DECLARE
        v_id BIGINT;
        v_num CITEXT;
    BEGIN
        CALL catms.book_appointment(
            $pat_2, $doc_a, $branch, $specialty,
            '$slot_1_start'::timestamptz, '$slot_1_end'::timestamptz,
            'Booked', $actor_user, 'Session B competing booking',
            v_id, v_num
        );
    END;
    \$\$;
"

race booking_collision "$sql_book_a" "$sql_book_b" "exclusion_violation|ex_appointment_doctor_time_no_overlap"

assert_true "
    SELECT count(*) = 1
    FROM catms.appointment
    WHERE doctor_id = $doc_a
      AND start_at = '$slot_1_start'::timestamptz
      AND status = 'Scheduled';
" "simultaneous booking collision did not yield exactly one appointment"

assert_true "
    SELECT patient_id = $pat_1
    FROM catms.appointment
    WHERE doctor_id = $doc_a
      AND start_at = '$slot_1_start'::timestamptz;
" "winning appointment does not belong to session A"

# 2. Independent concurrent bookings for different doctors at the same time.
slot_2_start="${test_date} 10:00:00+00"
slot_2_end="${test_date} 10:30:00+00"

sql_doc_a_book="
    DO \$\$
    DECLARE v_id BIGINT; v_num CITEXT; BEGIN
        CALL catms.book_appointment(
            $pat_1, $doc_a, $branch, $specialty,
            '$slot_2_start'::timestamptz, '$slot_2_end'::timestamptz,
            'Booked', $actor_user, 'Parallel booking Doctor A',
            v_id, v_num
        );
    END; \$\$;
"

sql_doc_b_book="
    DO \$\$
    DECLARE v_id BIGINT; v_num CITEXT; BEGIN
        CALL catms.book_appointment(
            $pat_2, $doc_b, $branch, $specialty,
            '$slot_2_start'::timestamptz, '$slot_2_end'::timestamptz,
            'Booked', $actor_user, 'Parallel booking Doctor B',
            v_id, v_num
        );
    END; \$\$;
"

race parallel_doctors "$sql_doc_a_book" "$sql_doc_b_book" OK 2

assert_true "
    SELECT count(*) = 2
    FROM catms.appointment
    WHERE start_at = '$slot_2_start'::timestamptz
      AND doctor_id IN ($doc_a, $doc_b)
      AND status = 'Scheduled';
" "parallel doctor bookings at same time did not both commit"

# 3. Concurrent reschedule collision & atomic state preservation.
reschedule_target_start="${test_date} 12:00:00+00"
reschedule_target_end="${test_date} 12:30:00+00"

sql_resched_a="
    CALL catms.reschedule_appointment(
        $appt_1,
        '$reschedule_target_start'::timestamptz,
        '$reschedule_target_end'::timestamptz,
        'Concurrent reschedule A', $actor_emp
    );
"

sql_resched_b="
    CALL catms.reschedule_appointment(
        $appt_2,
        '$reschedule_target_start'::timestamptz,
        '$reschedule_target_end'::timestamptz,
        'Concurrent reschedule B', $actor_emp
    );
"

race reschedule_collision "$sql_resched_a" "$sql_resched_b" "exclusion_violation|ex_appointment_doctor_time_no_overlap"

assert_true "
    SELECT start_at = '$reschedule_target_start'::timestamptz
    FROM catms.appointment WHERE appointment_id = $appt_1;
" "winning reschedule did not update target appointment time"

assert_true "
    SELECT start_at = '${test_date} 14:00:00+00'::timestamptz
       AND end_at   = '${test_date} 14:30:00+00'::timestamptz
       AND status   = 'Scheduled'
    FROM catms.appointment WHERE appointment_id = $appt_2;
" "original appointment did not survive failed reschedule at its original time slot"

assert_true "
    SELECT count(*) = 1
    FROM catms.appointment_schedule_history
    WHERE appointment_id = $appt_1;
" "winning appointment does not have exactly 1 schedule history record"

assert_true "
    SELECT count(*) = 0
    FROM catms.appointment_schedule_history
    WHERE appointment_id = $appt_2;
" "failed appointment left orphaned schedule history records"

# 4. Concurrent new booking vs reschedule into the same target slot.
target_slot_4_start="${test_date} 15:00:00+00"
target_slot_4_end="${test_date} 15:30:00+00"

sql_book_new="
    DO \$\$
    DECLARE v_id BIGINT; v_num CITEXT; BEGIN
        CALL catms.book_appointment(
            $pat_3, $doc_a, $branch, $specialty,
            '$target_slot_4_start'::timestamptz, '$target_slot_4_end'::timestamptz,
            'Booked', $actor_user, 'New patient booking at 15:00',
            v_id, v_num
        );
    END; \$\$;
"

sql_resched_competing="
    CALL catms.reschedule_appointment(
        $appt_2,
        '$target_slot_4_start'::timestamptz,
        '$target_slot_4_end'::timestamptz,
        'Competing reschedule to 15:00', $actor_emp
    );
"

race booking_vs_reschedule "$sql_book_new" "$sql_resched_competing" "exclusion_violation|ex_appointment_doctor_time_no_overlap"

assert_true "
    SELECT count(*) = 1
    FROM catms.appointment
    WHERE doctor_id = $doc_a
      AND start_at = '$target_slot_4_start'::timestamptz
      AND patient_id = $pat_3;
" "new appointment was not created during booking vs reschedule race"

assert_true "
    SELECT start_at = '${test_date} 14:00:00+00'::timestamptz
    FROM catms.appointment WHERE appointment_id = $appt_2;
" "appointment 2 was moved despite reschedule failure"

# 5. Audit Trail Reconciliation
assert_true "
    SELECT count(*) = 1
    FROM catms.appointment_schedule_history
    WHERE appointment_id IN ($appt_1, $appt_2);
" "audit schedule history count does not reconcile with committed changes"

assert_true "
    SELECT old_start_at = '${test_date} 11:00:00+00'::timestamptz
       AND new_start_at = '$reschedule_target_start'::timestamptz
       AND changed_by_employee_id = $actor_emp
    FROM catms.appointment_schedule_history
    WHERE appointment_id = $appt_1;
" "schedule history details do not match committed transition"

echo "PASS: all CATMS-031 scheduling concurrency scenarios."
echo "Logs retained at: $LOG_DIR"
