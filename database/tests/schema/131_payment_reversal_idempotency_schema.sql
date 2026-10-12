-- CATMS-076: reversal idempotency schema contract.
BEGIN;
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT count(*) INTO v_count
    FROM information_schema.columns
    WHERE table_schema = 'catms'
      AND table_name = 'payment_reversal'
      AND column_name = 'idempotency_key'
      AND udt_name = 'uuid';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'payment_reversal.idempotency_key UUID column is missing';
    END IF;

    SELECT count(*) INTO v_count
    FROM pg_indexes
    WHERE schemaname = 'catms'
      AND tablename = 'payment_reversal'
      AND indexname = 'uq_payment_reversal_idempotency'
      AND indexdef ILIKE '%UNIQUE%';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'payment reversal idempotency unique index is missing';
    END IF;

    IF to_regprocedure('catms.reverse_payment(bigint,numeric,text,bigint,uuid)') IS NULL THEN
        RAISE EXCEPTION 'idempotent reverse_payment procedure signature is missing';
    END IF;
END;
$$;
ROLLBACK;
