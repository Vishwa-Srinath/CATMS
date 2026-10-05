#!/usr/bin/env bash
# CATMS-036: real-schema payment and claim concurrency tests.
#
# Prerequisites:
# - A fresh disposable database named catms036_concurrency.
# - The actual project migrations, including 110–112 and 130.
# - Application role reference data.
# - This script and its fixture in the same directory.
#
# The script commits fictional test data. Recreate the disposable
# database before another run. It never creates or drops databases.

set -euo pipefail

DB=catms036_concurrency
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$(mktemp -d /tmp/catms036-concurrency.XXXXXX)"

PSQL=(
    psql -X
    -U "${PGUSER:-catms_super}"
    -d "$DB"
    -v ON_ERROR_STOP=1
    -At
)

echo "Test logs: $LOG_DIR"

"${PSQL[@]}" \
    -f "$SCRIPT_DIR/036_payment_claim_fixture.sql" \
    > "$LOG_DIR/fixture.log" 2>&1 || {
        cat "$LOG_DIR/fixture.log"
        exit 1
    }

IFS='|' read -r invoice actor < <(
    "${PSQL[@]}" -c \
        "SELECT invoice_id, actor_id
         FROM public.catms036_test_ids
         WHERE scenario='patient';"
)

IFS='|' read -r claim_invoice claim_actor claim_id < <(
    "${PSQL[@]}" -c \
        "SELECT invoice_id, actor_id, claim_id
         FROM public.catms036_test_ids
         WHERE scenario='claim';"
)

for value in "$invoice" "$actor" "$claim_invoice" "$claim_actor" "$claim_id"; do
    if [[ ! "$value" =~ ^[0-9]+$ ]]; then
        echo "FAIL: missing or invalid fixture identifier."
        exit 1
    fi
done

assert_true() {
    local sql="$1"
    local description="$2"

    if [[ "$("${PSQL[@]}" -c "$sql")" != "t" ]]; then
        echo "FAIL: $description"
        exit 1
    fi
}

# Session A performs an operation and holds its transaction open.
# Session B tries a competing operation.
# Confirm B is blocked, then check its result after A commits.
race() {
    local label="$1"
    local sql_a="$2"
    local sql_b="$3"
    local expected="$4"

    local app_a="catms036_${label}_a_$$"
    local app_b="catms036_${label}_b_$$"
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
        SET statement_timeout='20s';
        BEGIN;
        SET LOCAL ROLE catms_admin;
        $sql_a
        SELECT pg_sleep(5);
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
        echo "FAIL: $label session A did not reach its holding point."
        return 1
    fi

    started=$(date +%s)

    "${PSQL[@]}" -c "
        SET application_name='$app_b';
        SET statement_timeout='20s';
        SET lock_timeout='10s';
        BEGIN;
        SET LOCAL ROLE catms_admin;
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

    if [[ "$rc_a" != 0 || "$blocked" != 1 ]]; then
        cat "$log_a" "$log_b"
        echo "FAIL: $label did not demonstrate successful A and blocked B."
        return 1
    fi

    if [[ "$expected" == "OK" ]]; then
        if [[ "$rc_b" != 0 ]]; then
            cat "$log_b"
            echo "FAIL: $label session B unexpectedly failed."
            return 1
        fi
    else
        if [[ "$rc_b" == 0 ]] ||
           ! grep -Fq "$expected" "$log_b"; then
            cat "$log_b"
            echo "FAIL: $label expected $expected."
            return 1
        fi
    fi

    echo "PASS: $label; B blocked by A; elapsed $((finished-started)) seconds."
}

# ------------------------------------------------------------
# 1. Identical concurrent requests: exactly one receipt.
# ------------------------------------------------------------

duplicate_key=00000000-0000-4000-8000-000000036001

duplicate_sql="
    SELECT catms.post_payment_idempotent(
        $invoice, 'Patient', 1000, 'Cash',
        $actor, '$duplicate_key'
    );
"

race duplicate "$duplicate_sql" "$duplicate_sql" OK

assert_true "
    SELECT count(*)=1
    FROM catms.payment
    WHERE invoice_id=$invoice;
" "duplicate requests created more than one receipt"

assert_true "
    SELECT patient_paid_amount=1000
    FROM catms.invoice WHERE invoice_id=$invoice;
" "duplicate request changed the paid total twice"

assert_true "
    SELECT count(*)=1
    FROM catms.audit_event
    WHERE entity_type='payment'
      AND action_code='PAYMENT_POSTED'
      AND entity_id=(
          SELECT payment_id::text FROM catms.payment
          WHERE idempotency_key='$duplicate_key'
      );
" "duplicate request created duplicate audit entries"

# ------------------------------------------------------------
# 2. Competing payments: balance must not be exceeded.
# Invoice is 10,000; already paid 1,000.
# A pays 8,000; B's 2,000 must then be rejected.
# ------------------------------------------------------------

cap_key_a=00000000-0000-4000-8000-000000036002
cap_key_b=00000000-0000-4000-8000-000000036003

race payment_cap \
    "SELECT catms.post_payment_idempotent(
        $invoice,'Patient',8000,'Card',$actor,'$cap_key_a'
    );" \
    "SELECT catms.post_payment_idempotent(
        $invoice,'Patient',2000,'Cash',$actor,'$cap_key_b'
    );" \
    PAYMENT_OVER_CAP

assert_true "
    SELECT patient_paid_amount=9000
    FROM catms.invoice WHERE invoice_id=$invoice;
" "concurrent payment cap produced the wrong total"

assert_true "
    SELECT NOT EXISTS (
        SELECT 1 FROM catms.payment
        WHERE idempotency_key='$cap_key_b'
    );
" "rejected payment left a receipt"

# ------------------------------------------------------------
# 3. Competing reversals: original amount is 8,000.
# A reverses 6,000; B's 3,000 must then be rejected.
# ------------------------------------------------------------

payment_id=$(
    "${PSQL[@]}" -c "
        SELECT payment_id FROM catms.payment
        WHERE idempotency_key='$cap_key_a';
    "
)

[[ "$payment_id" =~ ^[0-9]+$ ]]

race reversal_cap \
    "SELECT catms.reverse_payment(
        $payment_id,6000,'Concurrent correction A',$actor
    );" \
    "SELECT catms.reverse_payment(
        $payment_id,3000,'Concurrent correction B',$actor
    );" \
    REVERSAL_OVER_CAP

assert_true "
    SELECT count(*)=1 AND sum(amount)=6000
    FROM catms.payment_reversal
    WHERE payment_id=$payment_id;
" "concurrent reversals exceeded the allowed amount"

assert_true "
    SELECT patient_paid_amount=3000
    FROM catms.invoice WHERE invoice_id=$invoice;
" "reversal did not reconcile the patient total"

assert_true "
    SELECT amount=8000 AND payment_status='PartiallyReversed'
    FROM catms.payment WHERE payment_id=$payment_id;
" "original receipt facts/status are incorrect"

# ------------------------------------------------------------
# 4. Real claim resolution concurrent with insurer receipt.
# A approves 6,000 of an 8,000 claim and holds its transaction.
# B must wait and then accept the 6,000 insurer receipt.
# ------------------------------------------------------------

claim_payment_key=00000000-0000-4000-8000-000000036004

race claim_resolution \
    "SELECT catms.resolve_claim(
        $claim_id,'PartiallyApproved',6000,$claim_actor
    );" \
    "SELECT catms.post_payment_idempotent(
        $claim_invoice,'Insurer',6000,'BankTransfer',
        $claim_actor,'$claim_payment_key',$claim_id
    );" \
    OK

assert_true "
    SELECT claim_status='PartiallyApproved' AND approved_amount=6000
    FROM catms.insurance_claim WHERE claim_id=$claim_id;
" "real claim resolution did not persist"

assert_true "
    SELECT approved_insurance_amount=6000
       AND patient_liability_amount=4000
       AND insurer_paid_amount=6000
       AND patient_paid_amount=0
       AND patient_payment_status='Unpaid'
    FROM catms.invoice WHERE invoice_id=$claim_invoice;
" "claim/payment concurrency left incorrect invoice totals"

assert_true "
    SELECT count(*)=1 AND sum(amount)=6000
    FROM catms.payment WHERE invoice_id=$claim_invoice;
" "claim/payment concurrency produced incorrect receipts"

echo "PASS: all four CATMS-036 concurrency scenarios."
echo "Logs retained at: $LOG_DIR"
echo "Remove the disposable test database after reviewing the results."