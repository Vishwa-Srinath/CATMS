-- CATMS-035 / Dev4 -- proposed migration 130 (reserve number before promotion).
-- DRAFT: requires 094 and Dev3's CATMS-037/039 implementation and review.
-- Claim column names below follow the Production Implementation ERD.
-- Run with psql -X -v ON_ERROR_STOP=1. Never apply a partial selection.
BEGIN;

DO $$
BEGIN
    IF to_regclass('catms.insurance_claim') IS NULL THEN
        RAISE EXCEPTION 'PAYMENT_DEPENDENCY_MISSING: Apply and verify Dev3 claim migrations first.';
    END IF;
    -- Check the interface at migration time; table existence alone does NOT
    -- prove CATMS-039's resolution workflow has been implemented/tested.
    PERFORM claim_id, invoice_id, claim_status, approved_amount
    FROM catms.insurance_claim LIMIT 0;
END;
$$;

LOCK TABLE catms.payment IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM catms.payment) THEN
        RAISE EXCEPTION 'PAYMENT_MIGRATION_DATA_PRESENT: Existing receipts need a reviewed data migration.';
    END IF;
END;
$$;

CREATE SEQUENCE catms.receipt_number_seq AS BIGINT;
ALTER TABLE catms.payment RENAME COLUMN payment_date TO paid_at;
ALTER TABLE catms.payment
    DROP CONSTRAINT chk_payment_amount,
    DROP CONSTRAINT chk_payment_method,
    ADD COLUMN receipt_number VARCHAR(36) NOT NULL DEFAULT
        ('RCT-' || nextval('catms.receipt_number_seq'::regclass)::text),
    ADD COLUMN insurance_claim_id BIGINT REFERENCES catms.insurance_claim(claim_id) ON DELETE RESTRICT,
    ADD COLUMN payment_status VARCHAR(30) NOT NULL DEFAULT 'Settled',
    ADD COLUMN reference_number VARCHAR(100),
    ADD COLUMN idempotency_key UUID NOT NULL,
    ADD COLUMN received_by_user_id BIGINT NOT NULL REFERENCES catms.user_account(user_account_id) ON DELETE RESTRICT,
    ADD CONSTRAINT uq_payment_receipt UNIQUE (receipt_number),
    ADD CONSTRAINT uq_payment_idempotency UNIQUE (idempotency_key),
    ADD CONSTRAINT chk_payment_amount CHECK (amount > 0 AND amount <> 'NaN'::numeric),
    ADD CONSTRAINT chk_payment_method CHECK (payment_method IN ('Cash','Card','BankTransfer','Online')),
    ADD CONSTRAINT chk_payment_status CHECK (payment_status IN ('Pending','Settled','Voided','PartiallyReversed','Reversed')),
    ADD CONSTRAINT chk_payment_claim_payer CHECK (
        (payer_type = 'Patient' AND insurance_claim_id IS NULL)
        OR (payer_type = 'Insurer' AND insurance_claim_id IS NOT NULL));
ALTER SEQUENCE catms.receipt_number_seq OWNED BY catms.payment.receipt_number;
CREATE INDEX idx_payment_invoice ON catms.payment(invoice_id);
CREATE INDEX idx_payment_claim ON catms.payment(insurance_claim_id) WHERE insurance_claim_id IS NOT NULL;

CREATE TABLE catms.payment_reversal (
    payment_reversal_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_id BIGINT NOT NULL REFERENCES catms.payment(payment_id) ON DELETE RESTRICT,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0 AND amount <> 'NaN'::numeric),
    reason VARCHAR(250) NOT NULL CHECK (length(trim(reason)) > 0),
    reversed_by_user_id BIGINT NOT NULL REFERENCES catms.user_account(user_account_id) ON DELETE RESTRICT,
    reversed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payment_reversal_payment ON catms.payment_reversal(payment_id);

-- Shared ledger calculation: one row per receipt prevents double counting
-- when a receipt has several reversals. Not granted to application callers.
CREATE FUNCTION catms.payment_net(p_invoice_id BIGINT, p_payer TEXT, p_claim_id BIGINT DEFAULT NULL)
RETURNS NUMERIC LANGUAGE sql STABLE
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT coalesce(sum(p.amount - coalesce(r.reversed,0)),0)
    FROM catms.payment p
    LEFT JOIN (
        SELECT payment_id, sum(amount) AS reversed
        FROM catms.payment_reversal GROUP BY payment_id
    ) r USING(payment_id)
    WHERE p.invoice_id = p_invoice_id AND p.payer_type = p_payer
      AND p.payment_status IN ('Settled','PartiallyReversed','Reversed')
      AND (p_claim_id IS NULL OR p.insurance_claim_id = p_claim_id);
$$;

CREATE FUNCTION catms.refresh_invoice_receipts(p_invoice_id BIGINT)
RETURNS VOID LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_patient NUMERIC; v_insurer NUMERIC;
BEGIN
    PERFORM 1 FROM catms.invoice WHERE invoice_id=p_invoice_id FOR UPDATE;
    v_patient := catms.payment_net(p_invoice_id,'Patient');
    v_insurer := catms.payment_net(p_invoice_id,'Insurer');
    UPDATE catms.invoice
    SET patient_paid_amount=v_patient, insurer_paid_amount=v_insurer,
        patient_payment_status=CASE
            WHEN v_patient >= patient_liability_amount THEN 'Paid'
            WHEN v_patient > 0 THEN 'PartiallyPaid' ELSE 'Unpaid' END
    WHERE invoice_id=p_invoice_id;
    -- Preserve approved amount/liability (Dev3 owns these), document state,
    -- and finalized_at. Patient payment status describes only the patient.
END;
$$;

CREATE FUNCTION catms.guard_payment_write()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_invoice catms.invoice%ROWTYPE; v_claim catms.insurance_claim%ROWTYPE;
    v_reversed NUMERIC; v_expected TEXT;
BEGIN
    IF TG_OP IN ('DELETE','TRUNCATE') THEN
        RAISE EXCEPTION 'PAYMENT_IMMUTABLE: Use a compensating reversal.';
    END IF;
    IF TG_OP='UPDATE' THEN
        IF (to_jsonb(NEW)-'payment_status') IS DISTINCT FROM (to_jsonb(OLD)-'payment_status') THEN
            RAISE EXCEPTION 'PAYMENT_IMMUTABLE: Receipt facts cannot be edited.';
        END IF;
        SELECT coalesce(sum(amount),0) INTO v_reversed
        FROM catms.payment_reversal WHERE payment_id=OLD.payment_id;
        v_expected := CASE WHEN v_reversed=0 THEN 'Settled'
            WHEN v_reversed=OLD.amount THEN 'Reversed' ELSE 'PartiallyReversed' END;
        IF NEW.payment_status IS DISTINCT FROM v_expected THEN
            RAISE EXCEPTION 'PAYMENT_STATUS_DERIVED: Status must match reversal history.';
        END IF;
        RETURN NEW;
    END IF;

    -- Match CATMS-039: lock the claim before locking the invoice.
    IF NEW.payer_type = 'Insurer' THEN
        PERFORM 1
        FROM catms.insurance_claim
        WHERE claim_id = NEW.insurance_claim_id
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'PAYMENT_APPROVED_CLAIM_REQUIRED: The claim does not exist.';
        END IF;
    END IF;

    SELECT * INTO v_invoice FROM catms.invoice WHERE invoice_id=NEW.invoice_id FOR UPDATE;
    IF NOT FOUND OR v_invoice.invoice_state <> 'Issued' THEN
        RAISE EXCEPTION 'PAYMENT_REQUIRES_ISSUED: An issued invoice is required.';
    END IF;
    IF NEW.payment_status IS DISTINCT FROM 'Settled' THEN
        RAISE EXCEPTION 'PAYMENT_STATE_UNSUPPORTED: This workflow posts settled receipts only.';
    END IF;
    IF NEW.payer_type='Patient' THEN
        IF NEW.insurance_claim_id IS NOT NULL THEN
            RAISE EXCEPTION 'PAYMENT_CLAIM_MISMATCH: Patient receipts cannot reference a claim.';
        END IF;
        IF catms.payment_net(NEW.invoice_id,'Patient') + NEW.amount > v_invoice.patient_liability_amount THEN
            RAISE EXCEPTION 'PAYMENT_OVER_CAP: Patient receipt exceeds outstanding patient liability.';
        END IF;
    ELSIF NEW.payer_type='Insurer' THEN
        -- The claim is already locked before the invoice; validate its details.
        SELECT * INTO v_claim FROM catms.insurance_claim
        WHERE claim_id=NEW.insurance_claim_id FOR SHARE;
        IF NOT FOUND OR v_claim.invoice_id <> NEW.invoice_id
           OR v_claim.claim_status NOT IN ('Approved','PartiallyApproved')
           OR v_claim.approved_amount IS NULL OR v_claim.approved_amount <= 0
           OR v_claim.approved_amount='NaN'::numeric THEN
            RAISE EXCEPTION 'PAYMENT_APPROVED_CLAIM_REQUIRED: Use an approved claim for this invoice.';
        END IF;
        IF catms.payment_net(NEW.invoice_id,'Insurer',NEW.insurance_claim_id)+NEW.amount > v_claim.approved_amount
           OR catms.payment_net(NEW.invoice_id,'Insurer')+NEW.amount > v_invoice.approved_insurance_amount THEN
            RAISE EXCEPTION 'PAYMENT_OVER_CAP: Insurer receipt exceeds claim or invoice outstanding coverage.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_payment_write BEFORE INSERT OR UPDATE OR DELETE ON catms.payment
FOR EACH ROW EXECUTE FUNCTION catms.guard_payment_write();
CREATE TRIGGER trg_payment_no_truncate BEFORE TRUNCATE ON catms.payment
FOR EACH STATEMENT EXECUTE FUNCTION catms.guard_payment_write();

CREATE FUNCTION catms.guard_payment_reversal()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_invoice BIGINT; v_payment catms.payment%ROWTYPE; v_reversed NUMERIC;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'REVERSAL_IMMUTABLE: Reversal history is append-only.';
    END IF;
    SELECT invoice_id INTO v_invoice FROM catms.payment WHERE payment_id=NEW.payment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND: Receipt does not exist.'; END IF;
    PERFORM 1 FROM catms.invoice WHERE invoice_id=v_invoice FOR UPDATE;
    SELECT * INTO v_payment FROM catms.payment WHERE payment_id=NEW.payment_id FOR UPDATE;
    IF v_payment.payment_status NOT IN ('Settled','PartiallyReversed') THEN
        RAISE EXCEPTION 'REVERSAL_NOT_AVAILABLE: Receipt has no reversible balance.';
    END IF;
    SELECT coalesce(sum(amount),0) INTO v_reversed FROM catms.payment_reversal WHERE payment_id=NEW.payment_id;
    IF v_reversed+NEW.amount > v_payment.amount THEN
        RAISE EXCEPTION 'REVERSAL_OVER_CAP: Total reversals cannot exceed the original receipt.';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_payment_reversal BEFORE INSERT OR UPDATE OR DELETE ON catms.payment_reversal
FOR EACH ROW EXECUTE FUNCTION catms.guard_payment_reversal();
CREATE TRIGGER trg_reversal_no_truncate BEFORE TRUNCATE ON catms.payment_reversal
FOR EACH STATEMENT EXECUTE FUNCTION catms.guard_payment_reversal();

CREATE FUNCTION catms.after_payment_ledger_insert()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_invoice BIGINT;
BEGIN
    IF TG_TABLE_NAME='payment' THEN
        v_invoice := NEW.invoice_id;
        INSERT INTO catms.audit_event(actor_user_id,entity_type,entity_id,action_code)
        VALUES(NEW.received_by_user_id,'payment',NEW.payment_id::text,'PAYMENT_POSTED');
    ELSE
        UPDATE catms.payment p SET payment_status=CASE
            WHEN (SELECT sum(amount) FROM catms.payment_reversal WHERE payment_id=p.payment_id)=p.amount
            THEN 'Reversed' ELSE 'PartiallyReversed' END
        WHERE p.payment_id=NEW.payment_id RETURNING invoice_id INTO v_invoice;
        INSERT INTO catms.audit_event(actor_user_id,entity_type,entity_id,action_code)
        VALUES(NEW.reversed_by_user_id,'payment_reversal',NEW.payment_reversal_id::text,'PAYMENT_REVERSED');
    END IF;
    PERFORM catms.refresh_invoice_receipts(v_invoice);
    RETURN NULL;
END;
$$;
CREATE TRIGGER trg_payment_ledger_insert AFTER INSERT ON catms.payment
FOR EACH ROW EXECUTE FUNCTION catms.after_payment_ledger_insert();
CREATE TRIGGER trg_reversal_ledger_insert AFTER INSERT ON catms.payment_reversal
FOR EACH ROW EXECUTE FUNCTION catms.after_payment_ledger_insert();

CREATE FUNCTION catms.post_payment_idempotent(
    p_invoice_id BIGINT, p_payer_type TEXT, p_amount NUMERIC,
    p_payment_method TEXT, p_received_by_user_id BIGINT, p_idempotency_key UUID,
    p_insurance_claim_id BIGINT DEFAULT NULL, p_reference_number TEXT DEFAULT NULL
)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_existing catms.payment%ROWTYPE; v_id BIGINT;
BEGIN
    IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'PAYMENT_KEY_REQUIRED: Supply a UUID for this request.'; END IF;
    IF p_amount IS NULL OR p_amount <= 0 OR p_amount='NaN'::numeric
       OR p_amount > 9999999999.99 OR p_amount <> round(p_amount,2) THEN
        RAISE EXCEPTION 'PAYMENT_AMOUNT_INVALID: Use a positive amount with at most two decimal places.';
    END IF;
    IF p_payer_type IS NULL OR p_payer_type NOT IN ('Patient','Insurer')
       OR p_payment_method IS NULL OR p_payment_method NOT IN ('Cash','Card','BankTransfer','Online') THEN
        RAISE EXCEPTION 'PAYMENT_TYPE_INVALID: Payer and tender method are separate fields.';
    END IF;
    IF length(p_reference_number)>100 THEN RAISE EXCEPTION 'PAYMENT_REFERENCE_TOO_LONG: Maximum 100 characters.'; END IF;
    -- Serialize the same key, including attempts against different invoices.
    -- Hash collisions only add waiting; UUID uniqueness remains authoritative.
    PERFORM pg_advisory_xact_lock(hashtextextended('catms.payment:'||p_idempotency_key::text,0));
    SELECT * INTO v_existing FROM catms.payment WHERE idempotency_key=p_idempotency_key;
    IF FOUND THEN
        IF ROW(v_existing.invoice_id,v_existing.payer_type,v_existing.amount,v_existing.payment_method,
               v_existing.received_by_user_id,v_existing.insurance_claim_id,v_existing.reference_number)
           IS DISTINCT FROM ROW(p_invoice_id,p_payer_type,p_amount,p_payment_method,
               p_received_by_user_id,p_insurance_claim_id,p_reference_number) THEN
            RAISE EXCEPTION 'PAYMENT_KEY_CONFLICT: This key was already used for different inputs.';
        END IF;
        RETURN v_existing.payment_id;
    END IF;
    INSERT INTO catms.payment(invoice_id,payer_type,amount,payment_method,received_by_user_id,
        idempotency_key,insurance_claim_id,reference_number)
    VALUES(p_invoice_id,p_payer_type,p_amount,p_payment_method,p_received_by_user_id,
        p_idempotency_key,p_insurance_claim_id,p_reference_number) RETURNING payment_id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE FUNCTION catms.reverse_payment(
    p_payment_id BIGINT, p_amount NUMERIC, p_reason TEXT, p_reversed_by_user_id BIGINT
)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_id BIGINT;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 OR p_amount='NaN'::numeric
       OR p_amount > 9999999999.99 OR p_amount <> round(p_amount,2) THEN
        RAISE EXCEPTION 'REVERSAL_AMOUNT_INVALID: Use a positive amount with at most two decimal places.';
    END IF;
    IF p_reason IS NULL OR length(trim(p_reason))=0 OR length(p_reason)>250 THEN
        RAISE EXCEPTION 'REVERSAL_REASON_REQUIRED: Supply a reason of 1 to 250 characters.';
    END IF;
    INSERT INTO catms.payment_reversal(payment_id,amount,reason,reversed_by_user_id)
    VALUES(p_payment_id,p_amount,p_reason,p_reversed_by_user_id)
    RETURNING payment_reversal_id INTO v_id;
    RETURN v_id;
END;
$$;

COMMENT ON TABLE catms.payment IS 'Settled receipts; immutable facts, with status derived from append-only reversals. Insurance is a payer, not a method.';
COMMENT ON TABLE catms.payment_reversal IS 'Compensating entries; original receipt facts remain unchanged. This ERD interface has no reversal idempotency key.';
COMMENT ON FUNCTION catms.refresh_invoice_receipts(BIGINT) IS 'Recomputes receipt caches and patient-only status. CATMS-039 must invoke this internally after changing liability, under the same invoice lock.';

REVOKE ALL ON catms.payment,catms.payment_reversal FROM PUBLIC,catms_app,catms_admin,
    catms_clinician,catms_reception,catms_manager,catms_qa,catms_readonly;
GRANT SELECT ON catms.payment,catms.payment_reversal TO catms_app,catms_admin,catms_qa,catms_readonly;
REVOKE ALL ON FUNCTION catms.payment_net(BIGINT,TEXT,BIGINT),catms.refresh_invoice_receipts(BIGINT),
    catms.guard_payment_write(),catms.guard_payment_reversal(),catms.after_payment_ledger_insert(),
    catms.post_payment_idempotent(BIGINT,TEXT,NUMERIC,TEXT,BIGINT,UUID,BIGINT,TEXT),
    catms.reverse_payment(BIGINT,NUMERIC,TEXT,BIGINT)
FROM PUBLIC,catms_app,catms_admin,catms_clinician,catms_reception,catms_manager,catms_qa,catms_readonly;
GRANT EXECUTE ON FUNCTION catms.post_payment_idempotent(BIGINT,TEXT,NUMERIC,TEXT,BIGINT,UUID,BIGINT,TEXT),
    catms.reverse_payment(BIGINT,NUMERIC,TEXT,BIGINT) TO catms_app,catms_admin;

COMMIT;
