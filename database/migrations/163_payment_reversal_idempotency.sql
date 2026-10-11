-- CATMS-076 / Dev4 -- make compensating payment reversals safely retryable.
BEGIN;

ALTER TABLE catms.payment_reversal
    ADD COLUMN idempotency_key UUID;

CREATE UNIQUE INDEX uq_payment_reversal_idempotency_key
    ON catms.payment_reversal(idempotency_key);

-- Historical reversals keep a NULL key. All new application reversals use the
-- required five-argument procedure below.
DROP FUNCTION catms.reverse_payment(BIGINT, NUMERIC, TEXT, BIGINT);

CREATE FUNCTION catms.reverse_payment(
    p_payment_id BIGINT,
    p_amount NUMERIC,
    p_reason TEXT,
    p_reversed_by_user_id BIGINT,
    p_idempotency_key UUID
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_id BIGINT;
    v_existing catms.payment_reversal%ROWTYPE;
BEGIN
    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'REVERSAL_KEY_REQUIRED: Supply a UUID for this request.';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 OR p_amount='NaN'::numeric
       OR p_amount > 9999999999.99 OR p_amount <> round(p_amount,2) THEN
        RAISE EXCEPTION 'REVERSAL_AMOUNT_INVALID: Use a positive amount with at most two decimal places.';
    END IF;
    IF p_reason IS NULL OR length(trim(p_reason))=0 OR length(p_reason)>250 THEN
        RAISE EXCEPTION 'REVERSAL_REASON_REQUIRED: Supply a reason of 1 to 250 characters.';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('catms.reversal:' || p_idempotency_key::text, 0)
    );

    SELECT * INTO v_existing
    FROM catms.payment_reversal
    WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF ROW(v_existing.payment_id, v_existing.amount, v_existing.reason,
               v_existing.reversed_by_user_id)
           IS DISTINCT FROM
           ROW(p_payment_id, p_amount, p_reason, p_reversed_by_user_id) THEN
            RAISE EXCEPTION 'REVERSAL_KEY_CONFLICT: This key was already used for different reversal details.';
        END IF;
        RETURN v_existing.payment_reversal_id;
    END IF;

    INSERT INTO catms.payment_reversal(
        payment_id, amount, reason, reversed_by_user_id, idempotency_key
    ) VALUES (
        p_payment_id, p_amount, p_reason, p_reversed_by_user_id, p_idempotency_key
    ) RETURNING payment_reversal_id INTO v_id;
    RETURN v_id;
END;
$$;

COMMENT ON COLUMN catms.payment_reversal.idempotency_key IS
    'Unique client request key; retries return the original reversal instead of creating another refund.';
COMMENT ON TABLE catms.payment_reversal IS
    'Append-only compensating entries. New reversals require a unique idempotency key; historical rows may have NULL keys.';
COMMENT ON FUNCTION catms.reverse_payment(BIGINT, NUMERIC, TEXT, BIGINT, UUID) IS
    'Creates a capped immutable reversal, or returns the existing reversal for an identical idempotent retry.';

REVOKE ALL ON FUNCTION catms.reverse_payment(BIGINT, NUMERIC, TEXT, BIGINT, UUID)
    FROM PUBLIC, catms_app, catms_admin, catms_clinician, catms_reception,
         catms_manager, catms_qa, catms_readonly;
GRANT EXECUTE ON FUNCTION catms.reverse_payment(BIGINT, NUMERIC, TEXT, BIGINT, UUID)
    TO catms_app, catms_admin;

COMMIT;
