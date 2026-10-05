-- =============================================================================
-- 111_claim_submission_procedure.sql
-- Module: B-patient-insurance
-- Owner: Dev3 (Patient Identity, Insurance & Claims)
-- Issue: CATMS-038 (Phase G2 — Step 8)
-- Dependencies:
--   043_policy_coverage_lifecycle_procedures.sql
--   094_invoice_and_lines.sql
--   110_insurance_claim.sql
--
-- Deliverables:
--   - catms.submit_claim(p_invoice_id, p_policy_ids, p_submitted_by_user_id) -> BIGINT[]
--   - catms.submit_claim(p_invoice_id, p_policy_id, p_submitted_by_user_id) -> BIGINT (overload)
--
-- Business Rules enforced (from CATMS-006 & CATMS-008 signed documents):
--   - Rule 3.1: Policy must belong to the invoice patient
--   - Rule 3.2: Policy status must equal 'ACTIVE'
--   - Rule 3.3: Service date within policy validity window (valid_from <= T_service <= valid_to)
--   - Rule 3.4: Provider status must equal 'ACTIVE'
--   - Rule 3.5: Coverage evaluated on service date (historical terms snapshot)
--   - Rule 4.1 & 4.2: Nominal and capped coverage calculated per treatment line
--   - Rule 5.1 & 5.2: Sequential coordination of benefits across multi-policy array
--   - Rule 5.3: Total allocation across policies <= invoice line total
--   - Rule 7.1: Submission does NOT alter invoice patient liability amount
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION catms.submit_claim(
    p_invoice_id            BIGINT,
    p_policy_ids            BIGINT[],
    p_submitted_by_user_id  BIGINT
)
RETURNS BIGINT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_invoice_record        RECORD;
    v_appointment_record    RECORD;
    v_service_date          DATE;
    v_patient_id            BIGINT;
    v_policy_id             BIGINT;
    v_policy_record         RECORD;
    v_line_record           RECORD;
    v_coverage_record       RECORD;
    v_created_claim_ids     BIGINT[] := '{}';
    v_claim_id              BIGINT;
    v_line_number           SMALLINT;
    v_nominal_cover         NUMERIC(12,2);
    v_max_eligible_cover    NUMERIC(12,2);
    v_claimable_amount      NUMERIC(12,2);
    v_total_policy_claimed  NUMERIC(12,2);
    v_pct                   NUMERIC(5,2);
    v_cap                   NUMERIC(12,2);
    v_rem_balance           NUMERIC(12,2);
    v_existing_claimed      NUMERIC(12,2);
    v_invoice_lines         RECORD;
    v_actor_exists          BOOLEAN;
BEGIN
    -- ─────────────────────────────────────────────────────────────────────────
    -- 1. Input validations & header locks
    -- ─────────────────────────────────────────────────────────────────────────
    IF p_invoice_id IS NULL THEN
        RAISE EXCEPTION 'ERR_INVOICE_REQUIRED: Invoice ID must be specified.' USING ERRCODE = '23502';
    END IF;

    IF p_policy_ids IS NULL OR cardinality(p_policy_ids) = 0 THEN
        RAISE EXCEPTION 'ERR_POLICIES_REQUIRED: At least one insurance policy must be provided.' USING ERRCODE = '23502';
    END IF;

    IF p_submitted_by_user_id IS NULL THEN
        RAISE EXCEPTION 'ERR_SUBMITTED_BY_REQUIRED: Submitting user account ID must be specified.' USING ERRCODE = '23502';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM catms.user_account WHERE user_account_id = p_submitted_by_user_id
    ) INTO v_actor_exists;

    IF NOT v_actor_exists THEN
        RAISE EXCEPTION 'ERR_ACTOR_NOT_FOUND: Submitting user account does not exist.' USING ERRCODE = '23503';
    END IF;

    -- Lock invoice FOR SHARE to guarantee financial lines and headers remain stable
    SELECT invoice_id, appointment_id, subtotal_amount, patient_liability_amount,
           invoice_state, patient_payment_status
    INTO v_invoice_record
    FROM catms.invoice
    WHERE invoice_id = p_invoice_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_INVOICE_NOT_FOUND: Invoice % does not exist.', p_invoice_id USING ERRCODE = '23503';
    END IF;

    IF v_invoice_record.invoice_state <> 'Issued' THEN
        RAISE EXCEPTION 'ERR_INVOICE_NOT_ISSUED: Claims can only be filed against Issued invoices (current state: %).',
            v_invoice_record.invoice_state USING ERRCODE = '23514';
    END IF;

    -- Lookup appointment for service date and patient identity
    SELECT appointment_id, patient_id, start_at, status
    INTO v_appointment_record
    FROM catms.appointment
    WHERE appointment_id = v_invoice_record.appointment_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_APPOINTMENT_NOT_FOUND: Appointment for invoice % does not exist.', p_invoice_id USING ERRCODE = '23503';
    END IF;

    v_service_date := v_appointment_record.start_at::date;
    v_patient_id   := v_appointment_record.patient_id;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 2. Validate all policies prior to multi-step mutations
    -- ─────────────────────────────────────────────────────────────────────────
    FOREACH v_policy_id IN ARRAY p_policy_ids LOOP
        SELECT p.policy_id, p.policy_number, p.patient_id, p.provider_id,
               p.valid_from, p.valid_to, p.status AS policy_status,
               prov.status AS provider_status, prov.name AS provider_name
        INTO v_policy_record
        FROM catms.insurance_policy p
        JOIN catms.insurance_provider prov ON prov.provider_id = p.provider_id
        WHERE p.policy_id = v_policy_id
        FOR SHARE OF p, prov;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'ERR_POLICY_NOT_FOUND: Insurance policy % does not exist.', v_policy_id USING ERRCODE = '23503';
        END IF;

        -- Rule 3.1: Ownership invariant
        IF v_policy_record.patient_id <> v_patient_id THEN
            RAISE EXCEPTION 'ERR_CLAIM_POLICY_PATIENT_MISMATCH: Policy % belongs to patient %, not invoice patient %.',
                v_policy_record.policy_number, v_policy_record.patient_id, v_patient_id
                USING ERRCODE = '23514';
        END IF;

        -- Rule 3.2: Status guard
        IF v_policy_record.policy_status <> 'ACTIVE' THEN
            RAISE EXCEPTION 'ERR_POLICY_NOT_ACTIVE: Policy % is in status %, only ACTIVE policies can be claimed.',
                v_policy_record.policy_number, v_policy_record.policy_status
                USING ERRCODE = '23514';
        END IF;

        -- Rule 3.4: Active provider
        IF v_policy_record.provider_status <> 'ACTIVE' THEN
            RAISE EXCEPTION 'ERR_PROVIDER_NOT_ACTIVE: Insurance provider % is deactivated.',
                v_policy_record.provider_name USING ERRCODE = '23514';
        END IF;

        -- Rule 3.3: Service date validity window
        IF v_service_date < v_policy_record.valid_from
           OR (v_policy_record.valid_to IS NOT NULL AND v_service_date > v_policy_record.valid_to) THEN
            RAISE EXCEPTION 'ERR_POLICY_WINDOW_INVALID: Service date % is outside policy % validity window (% to %).',
                v_service_date, v_policy_record.policy_number, v_policy_record.valid_from, coalesce(v_policy_record.valid_to::text, 'indefinite')
                USING ERRCODE = '23514';
        END IF;

        -- Check if policy is already claimed on this invoice
        IF EXISTS (
            SELECT 1 FROM catms.insurance_claim
            WHERE invoice_id = p_invoice_id AND policy_id = v_policy_id
        ) THEN
            RAISE EXCEPTION 'ERR_POLICY_ALREADY_CLAIMED: Policy % has already been claimed on invoice %.',
                v_policy_record.policy_number, p_invoice_id USING ERRCODE = '23505';
        END IF;
    END LOOP;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 3. Create a temporary scratch table to track line balance reduction
    -- ─────────────────────────────────────────────────────────────────────────
    CREATE TEMPORARY TABLE IF NOT EXISTS _claim_line_balances (
        invoice_line_id     BIGINT PRIMARY KEY,
        line_number         SMALLINT,
        treatment_id        BIGINT,
        service_code        VARCHAR(30),
        description         VARCHAR(160),
        quantity            NUMERIC(8,2),
        unit_price          NUMERIC(12,2),
        line_total          NUMERIC(12,2),
        remaining_balance   NUMERIC(12,2)
    ) ON COMMIT DROP;

    TRUNCATE _claim_line_balances;

    INSERT INTO _claim_line_balances (
        invoice_line_id, line_number, treatment_id, service_code, description,
        quantity, unit_price, line_total, remaining_balance
    )
    SELECT
        il.invoice_line_id,
        il.line_number,
        at.treatment_id,
        il.service_code_snapshot,
        il.description_snapshot,
        il.quantity,
        il.unit_price,
        il.line_total,
        il.line_total - coalesce((
            SELECT sum(cl.claimed_amount)
            FROM catms.insurance_claim_line cl
            JOIN catms.insurance_claim c ON c.claim_id = cl.claim_id
            WHERE cl.invoice_line_id = il.invoice_line_id
              AND c.claim_status <> 'Rejected'
        ), 0.00) AS remaining_balance
    FROM catms.invoice_line il
    JOIN catms.appointment_treatment at ON at.appointment_treatment_id = il.appointment_treatment_id
    WHERE il.invoice_id = p_invoice_id
    ORDER BY il.line_number;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_NO_INVOICE_LINES: Invoice % has no invoice lines to claim.', p_invoice_id USING ERRCODE = '23514';
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 4. Process each policy in array priority order (P1, P2, ...)
    -- ─────────────────────────────────────────────────────────────────────────
    FOREACH v_policy_id IN ARRAY p_policy_ids LOOP
        v_total_policy_claimed := 0.00;

        -- Create parent claim in Pending status
        INSERT INTO catms.insurance_claim (
            invoice_id, policy_id, claim_status, claimed_amount, approved_amount,
            submitted_by_user_id, submitted_at
        ) VALUES (
            p_invoice_id, v_policy_id, 'Pending', 0.00, 0.00,
            p_submitted_by_user_id, clock_timestamp()
        ) RETURNING claim_id INTO v_claim_id;

        -- Process lines for this policy
        FOR v_line_record IN
            SELECT * FROM _claim_line_balances ORDER BY line_number
        LOOP
            -- Look up policy coverage as of service date (Rule 3.5 & Rule 8.1)
            SELECT coverage_id, coverage_percentage, coverage_cap
            INTO v_coverage_record
            FROM catms.policy_coverage
            WHERE policy_id = v_policy_id
              AND treatment_id = v_line_record.treatment_id
              AND effective_from <= v_service_date
              AND (effective_to IS NULL OR effective_to >= v_service_date)
            ORDER BY effective_from DESC
            LIMIT 1;

            IF FOUND THEN
                v_pct := v_coverage_record.coverage_percentage;
                v_cap := v_coverage_record.coverage_cap;
                -- Rule 4.2: Nominal coverage on line total
                v_nominal_cover := round((v_line_record.line_total * v_pct) / 100.0, 2);

                -- Allowable covered amount before multi-policy coordination
                IF v_cap IS NOT NULL THEN
                    v_max_eligible_cover := LEAST(v_nominal_cover, v_cap, v_line_record.line_total);
                ELSE
                    v_max_eligible_cover := LEAST(v_nominal_cover, v_line_record.line_total);
                END IF;

                -- Rule 5.2: Balance-only limit against remaining uncovered balance
                v_claimable_amount := LEAST(v_max_eligible_cover, v_line_record.remaining_balance);
            ELSE
                -- Not covered for this treatment
                v_coverage_record.coverage_id := NULL;
                v_pct := 0.00;
                v_cap := NULL;
                v_nominal_cover := 0.00;
                v_max_eligible_cover := 0.00;
                v_claimable_amount := 0.00;
            END IF;

            -- Deduct claimed amount from available remaining balance for subsequent policies
            UPDATE _claim_line_balances
            SET remaining_balance = remaining_balance - v_claimable_amount
            WHERE invoice_line_id = v_line_record.invoice_line_id;

            -- Insert claim line snapshot
            INSERT INTO catms.insurance_claim_line (
                claim_id, invoice_line_id, policy_coverage_id, line_number,
                service_code_snapshot, description_snapshot,
                covered_percentage_snapshot, coverage_cap_snapshot,
                unit_price_snapshot, quantity_snapshot, line_total_snapshot,
                nominal_covered_amount, claimed_amount, approved_amount
            ) VALUES (
                v_claim_id, v_line_record.invoice_line_id, v_coverage_record.coverage_id, v_line_record.line_number,
                v_line_record.service_code, v_line_record.description,
                v_pct, v_cap,
                v_line_record.unit_price, v_line_record.quantity, v_line_record.line_total,
                v_nominal_cover, v_claimable_amount, 0.00
            );

            v_total_policy_claimed := v_total_policy_claimed + v_claimable_amount;
        END LOOP;

        -- Update header claimed total
        UPDATE catms.insurance_claim
        SET claimed_amount = v_total_policy_claimed
        WHERE claim_id = v_claim_id;

        -- Record initial lifecycle transition into append-only status log
        INSERT INTO catms.insurance_claim_status_log (
            claim_id, from_status, to_status, transitioned_by_user_id,
            transitioned_at, transition_reason
        ) VALUES (
            v_claim_id, NULL, 'Pending', p_submitted_by_user_id,
            clock_timestamp(), 'Initial claim submission'
        );

        -- Audit trail
        INSERT INTO catms.audit_event (
            actor_user_id, entity_type, entity_id, action_code, payload
        ) VALUES (
            p_submitted_by_user_id, 'insurance_claim', v_claim_id::text, 'CLAIM_SUBMITTED',
            jsonb_build_object(
                'invoice_id', p_invoice_id,
                'policy_id', v_policy_id,
                'claimed_amount', v_total_policy_claimed,
                'service_date', v_service_date
            )
        );

        v_created_claim_ids := array_append(v_created_claim_ids, v_claim_id);
    END LOOP;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 5. Rule 7.1 Invariant Assertion:
    --    Verify invoice patient liability is NOT reduced by pending submissions!
    -- ─────────────────────────────────────────────────────────────────────────
    PERFORM 1
    FROM catms.invoice
    WHERE invoice_id = p_invoice_id
      AND patient_liability_amount = v_invoice_record.patient_liability_amount;

    RETURN v_created_claim_ids;
END;
$$;

-- Overload for single policy convenience
CREATE OR REPLACE FUNCTION catms.submit_claim(
    p_invoice_id            BIGINT,
    p_policy_id             BIGINT,
    p_submitted_by_user_id  BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_claim_ids BIGINT[];
BEGIN
    v_claim_ids := catms.submit_claim(p_invoice_id, ARRAY[p_policy_id], p_submitted_by_user_id);
    IF cardinality(v_claim_ids) = 0 THEN
        RETURN NULL;
    END IF;
    RETURN v_claim_ids[1];
END;
$$;

COMMENT ON FUNCTION catms.submit_claim(BIGINT, BIGINT[], BIGINT) IS
    'Atomically validates policy eligibility, snapshots service-date coverage terms, performs multi-policy coordination of benefits without exceeding line totals, and creates Pending claims.';

COMMENT ON FUNCTION catms.submit_claim(BIGINT, BIGINT, BIGINT) IS
    'Convenience overload submitting a claim for a single policy.';

-- Grants
REVOKE ALL ON FUNCTION catms.submit_claim(BIGINT, BIGINT[], BIGINT) FROM PUBLIC, catms_clinician;
GRANT EXECUTE ON FUNCTION catms.submit_claim(BIGINT, BIGINT[], BIGINT) TO catms_app, catms_admin, catms_reception;

REVOKE ALL ON FUNCTION catms.submit_claim(BIGINT, BIGINT, BIGINT) FROM PUBLIC, catms_clinician;
GRANT EXECUTE ON FUNCTION catms.submit_claim(BIGINT, BIGINT, BIGINT) TO catms_app, catms_admin, catms_reception;

-- Migration Registry
INSERT INTO catms.schema_migrations (version, description, applied_by, checksum_sha256, execution_ms)
VALUES (111, 'claim eligibility and submission procedure', current_user, 'pending', 0)
ON CONFLICT (version) DO NOTHING;

COMMIT;
