-- 131_payment_reversal_idempotency.sql
-- Module: D-clinical-billing
-- Owner: Dev4 (Clinical Care, Invoicing & Payments)
-- Issue: CATMS-035 (Phase G2)
--
-- Adds idempotency key support to catms.payment_reversal to prevent duplicate reversals on retry.

BEGIN;

-- 1. Add idempotency_key column and unique constraint
ALTER TABLE catms.payment_reversal
    ADD COLUMN IF NOT EXISTS idempotency_key UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_payment_reversal_idempotency'
    ) THEN
        ALTER TABLE catms.payment_reversal
            ADD CONSTRAINT uq_payment_reversal_idempotency UNIQUE (idempotency_key);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payment_reversal_idempotency
    ON catms.payment_reversal(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- 2. Upgrade catms.reverse_payment to accept optional idempotency key with advisory locking
DROP FUNCTION IF EXISTS catms.reverse_payment(BIGINT, NUMERIC, TEXT, BIGINT, UUID);
DROP FUNCTION IF EXISTS catms.reverse_payment(BIGINT, NUMERIC, TEXT, BIGINT);

CREATE OR REPLACE FUNCTION catms.reverse_payment(
    p_payment_id BIGINT,
    p_amount NUMERIC,
    p_reason TEXT,
    p_reversed_by_user_id BIGINT,
    p_idempotency_key UUID
)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_existing catms.payment_reversal%ROWTYPE;
    v_id BIGINT;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        -- Advisory transaction lock prevents concurrent reversals with identical idempotency key
        PERFORM pg_advisory_xact_lock(hashtextextended('catms.payment_reversal:' || p_idempotency_key::text, 0));
        SELECT * INTO v_existing
        FROM catms.payment_reversal
        WHERE idempotency_key = p_idempotency_key;
        IF FOUND THEN
            IF ROW(v_existing.payment_id, v_existing.amount, v_existing.reason)
               IS DISTINCT FROM ROW(p_payment_id, p_amount, p_reason) THEN
                RAISE EXCEPTION 'REVERSAL_KEY_CONFLICT: This idempotency key was already used for different reversal inputs.';
            END IF;
            RETURN v_existing.payment_reversal_id;
        END IF;
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 OR p_amount = 'NaN'::numeric
       OR p_amount > 9999999999.99 OR p_amount <> round(p_amount, 2) THEN
        RAISE EXCEPTION 'REVERSAL_AMOUNT_INVALID: Use a positive amount with at most two decimal places.';
    END IF;
    IF p_reason IS NULL OR length(trim(p_reason)) = 0 OR length(p_reason) > 250 THEN
        RAISE EXCEPTION 'REVERSAL_REASON_REQUIRED: Supply a reason of 1 to 250 characters.';
    END IF;

    INSERT INTO catms.payment_reversal(payment_id, amount, reason, reversed_by_user_id, idempotency_key)
    VALUES(p_payment_id, p_amount, p_reason, p_reversed_by_user_id, p_idempotency_key)
    RETURNING payment_reversal_id INTO v_id;

    RETURN v_id;
END;
$$;

-- 3. Maintain backward-compatible 4-argument overload for existing procedures and tests
CREATE OR REPLACE FUNCTION catms.reverse_payment(
    p_payment_id BIGINT,
    p_amount NUMERIC,
    p_reason TEXT,
    p_reversed_by_user_id BIGINT
)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    RETURN catms.reverse_payment(p_payment_id, p_amount, p_reason, p_reversed_by_user_id, NULL);
END;
$$;

-- 4. Ensure permissions for application roles
GRANT EXECUTE ON FUNCTION catms.reverse_payment(BIGINT, NUMERIC, TEXT, BIGINT, UUID) TO catms_app, catms_admin;
GRANT EXECUTE ON FUNCTION catms.reverse_payment(BIGINT, NUMERIC, TEXT, BIGINT) TO catms_app, catms_admin;

COMMENT ON COLUMN catms.payment_reversal.idempotency_key IS 'UUID idempotency token provided by client to prevent duplicate reversals on network retry.';

COMMIT;
