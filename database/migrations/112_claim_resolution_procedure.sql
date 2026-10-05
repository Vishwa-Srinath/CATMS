-- =============================================================================
-- 112_claim_resolution_procedure.sql
-- Module: B-patient-insurance
-- Owner: Dev3 (Patient Identity, Insurance & Claims)
-- Issue: CATMS-039 (Phase G2 — Step 9)
-- Dependencies:
--   094_invoice_and_lines.sql
--   110_insurance_claim.sql
--   111_claim_submission_procedure.sql
--
-- Deliverables:
--   - catms.resolve_claim(p_claim_id, p_resolution, p_approved_amount, p_resolved_by_user_id, p_rejection_reason, p_line_approvals)
--
-- Business Rules enforced (from CATMS-006 & CATMS-008 signed documents):
--   - Rule 6.0: Only Finance, Admin or Manager roles can resolve claims (RBAC check)
--   - Rule 6.1: Approved, PartiallyApproved, and Rejected are terminal states
--   - Rule 6.2: Transition recorded immutably in insurance_claim_status_log
--   - Rule 7.2: Atomic invoice liability recalculation inside the SAME transaction:
--       approved_insurance_amount = sum(claims in Approved/PartiallyApproved)
--       patient_liability_amount = max(0, subtotal - approved_insurance_amount)
--       patient_payment_status updated accordingly
--   - Partial approval: 0 < approved_amount < claimed_amount; reduces liability by approved portion only
--   - Rejection: approved_amount = 0.00; rejection_reason is mandatory
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION catms.resolve_claim(
    p_claim_id              BIGINT,
    p_resolution            VARCHAR,
    p_approved_amount       NUMERIC(12,2),
    p_resolved_by_user_id   BIGINT,
    p_rejection_reason      TEXT DEFAULT NULL,
    p_line_approvals        JSONB DEFAULT NULL
)
RETURNS catms.insurance_claim_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_claim_record          RECORD;
    v_invoice_record        RECORD;
    v_resolution_enum       catms.insurance_claim_status;
    v_has_permission        BOOLEAN := FALSE;
    v_total_invoice_approved NUMERIC(12,2);
    v_new_patient_liability NUMERIC(12,2);
    v_new_payment_status    VARCHAR(20);
    v_line_elem             JSONB;
    v_inv_line_id           BIGINT;
    v_line_approved         NUMERIC(12,2);
    v_sum_line_approved     NUMERIC(12,2) := 0.00;
    v_line_count            INTEGER;
BEGIN
    -- ─────────────────────────────────────────────────────────────────────────
    -- 1. Argument validation
    -- ─────────────────────────────────────────────────────────────────────────
    IF p_claim_id IS NULL THEN
        RAISE EXCEPTION 'ERR_CLAIM_REQUIRED: Claim ID must be provided.' USING ERRCODE = '23502';
    END IF;

    IF p_resolution IS NULL OR length(trim(p_resolution)) = 0 THEN
        RAISE EXCEPTION 'ERR_RESOLUTION_REQUIRED: Resolution status must be provided.' USING ERRCODE = '23502';
    END IF;

    IF p_resolved_by_user_id IS NULL THEN
        RAISE EXCEPTION 'ERR_RESOLVED_BY_REQUIRED: Resolving user account ID must be specified.' USING ERRCODE = '23502';
    END IF;

    IF p_approved_amount IS NULL OR p_approved_amount < 0 OR p_approved_amount = 'NaN'::NUMERIC THEN
        RAISE EXCEPTION 'ERR_APPROVED_AMOUNT_INVALID: Approved amount must be non-negative numeric.' USING ERRCODE = '23514';
    END IF;

    -- Validate and cast resolution status enum
    BEGIN
        v_resolution_enum := p_resolution::catms.insurance_claim_status;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'ERR_INVALID_RESOLUTION_STATUS: Resolution % is not one of Approved, PartiallyApproved, Rejected.',
            p_resolution USING ERRCODE = '22P02';
    END;

    IF v_resolution_enum = 'Pending' THEN
        RAISE EXCEPTION 'ERR_CANNOT_RESOLVE_TO_PENDING: Cannot resolve a claim to Pending status.' USING ERRCODE = '23514';
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 2. RBAC check (Rule 9 / Rule 6.0):
    --    Only Finance, Admin or Manager roles can resolve claims.
    --    Receptionists and Clinicians are strictly prohibited.
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT EXISTS (
        SELECT 1
        FROM catms.user_account_role uar
        JOIN catms.app_role ar ON ar.app_role_id = uar.app_role_id
        WHERE uar.user_account_id = p_resolved_by_user_id
          AND upper(ar.role_code) IN ('ADMIN', 'ADMINFINANCE', 'MANAGER', 'BRANCHMANAGER')
          AND uar.valid_from <= clock_timestamp()
          AND (uar.valid_to IS NULL OR uar.valid_to >= clock_timestamp())
    ) INTO v_has_permission;

    IF NOT v_has_permission THEN
        RAISE EXCEPTION 'ERR_INSUFFICIENT_PRIVILEGE: User account % does not possess finance or administrative authority to resolve claims.',
            p_resolved_by_user_id USING ERRCODE = '42501';
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 3. Lock claim FOR UPDATE and assert state
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT claim_id, claim_number, invoice_id, policy_id, claim_status,
           claimed_amount, approved_amount
    INTO v_claim_record
    FROM catms.insurance_claim
    WHERE claim_id = p_claim_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_CLAIM_NOT_FOUND: Claim % does not exist.', p_claim_id USING ERRCODE = '23503';
    END IF;

    IF v_claim_record.claim_status <> 'Pending' THEN
        RAISE EXCEPTION 'ERR_CLAIM_NOT_PENDING: Claim % is already resolved in status % and cannot be re-resolved.',
            v_claim_record.claim_number, v_claim_record.claim_status USING ERRCODE = '23514';
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 4. Validate resolution math and guards
    -- ─────────────────────────────────────────────────────────────────────────
    IF v_resolution_enum = 'Approved' THEN
        IF p_approved_amount <> v_claim_record.claimed_amount THEN
            RAISE EXCEPTION 'ERR_APPROVED_AMOUNT_MISMATCH: Full approval requires approved_amount (%) to equal claimed_amount (%).',
                p_approved_amount, v_claim_record.claimed_amount USING ERRCODE = '23514';
        END IF;

    ELSIF v_resolution_enum = 'PartiallyApproved' THEN
        IF p_approved_amount <= 0.00 OR p_approved_amount >= v_claim_record.claimed_amount THEN
            RAISE EXCEPTION 'ERR_PARTIAL_AMOUNT_INVALID: Partial approval requires 0.00 < approved_amount (%) < claimed_amount (%).',
                p_approved_amount, v_claim_record.claimed_amount USING ERRCODE = '23514';
        END IF;

    ELSIF v_resolution_enum = 'Rejected' THEN
        IF p_approved_amount <> 0.00 THEN
            RAISE EXCEPTION 'ERR_REJECTED_AMOUNT_NONZERO: Rejected claims must have approved_amount equal to 0.00 (got %).',
                p_approved_amount USING ERRCODE = '23514';
        END IF;

        IF p_rejection_reason IS NULL OR length(trim(p_rejection_reason)) = 0 THEN
            RAISE EXCEPTION 'ERR_REJECTION_REASON_REQUIRED: A non-empty rejection reason is mandatory for rejected claims.'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 5. Update claim lines
    -- ─────────────────────────────────────────────────────────────────────────
    IF p_line_approvals IS NOT NULL AND jsonb_typeof(p_line_approvals) = 'array' THEN
        -- Explicit line approvals supplied via JSON
        FOR v_line_elem IN SELECT * FROM jsonb_array_elements(p_line_approvals) LOOP
            v_inv_line_id   := (v_line_elem->>'invoice_line_id')::BIGINT;
            v_line_approved := (v_line_elem->>'approved_amount')::NUMERIC(12,2);

            IF v_inv_line_id IS NULL OR v_line_approved IS NULL THEN
                RAISE EXCEPTION 'ERR_LINE_APPROVAL_FORMAT: Line approval elements must contain invoice_line_id and approved_amount.'
                    USING ERRCODE = '22023';
            END IF;

            UPDATE catms.insurance_claim_line
            SET approved_amount = v_line_approved
            WHERE claim_id = p_claim_id AND invoice_line_id = v_inv_line_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'ERR_CLAIM_LINE_NOT_FOUND: Invoice line % is not part of claim %.',
                    v_inv_line_id, p_claim_id USING ERRCODE = '23503';
            END IF;

            v_sum_line_approved := v_sum_line_approved + v_line_approved;
        END LOOP;

        IF v_sum_line_approved <> p_approved_amount THEN
            RAISE EXCEPTION 'ERR_LINE_APPROVED_SUM_MISMATCH: Sum of line approved amounts (%) must equal total approved amount (%).',
                v_sum_line_approved, p_approved_amount USING ERRCODE = '23514';
        END IF;
    ELSE
        -- Default allocation to lines
        IF v_resolution_enum = 'Approved' THEN
            UPDATE catms.insurance_claim_line
            SET approved_amount = claimed_amount
            WHERE claim_id = p_claim_id;

        ELSIF v_resolution_enum = 'Rejected' THEN
            UPDATE catms.insurance_claim_line
            SET approved_amount = 0.00
            WHERE claim_id = p_claim_id;

        ELSIF v_resolution_enum = 'PartiallyApproved' THEN
            -- Check if single line
            SELECT count(*) INTO v_line_count
            FROM catms.insurance_claim_line
            WHERE claim_id = p_claim_id;

            IF v_line_count = 1 THEN
                UPDATE catms.insurance_claim_line
                SET approved_amount = p_approved_amount
                WHERE claim_id = p_claim_id;
            ELSE
                -- Proportional distribution rounded to nearest cent with rounding adjustment on largest line
                UPDATE catms.insurance_claim_line
                SET approved_amount = round((claimed_amount / v_claim_record.claimed_amount) * p_approved_amount, 2)
                WHERE claim_id = p_claim_id;

                -- Fix cent rounding discrepancies on the highest-claimed line
                SELECT coalesce(sum(approved_amount), 0.00) INTO v_sum_line_approved
                FROM catms.insurance_claim_line
                WHERE claim_id = p_claim_id;

                IF v_sum_line_approved <> p_approved_amount THEN
                    UPDATE catms.insurance_claim_line
                    SET approved_amount = approved_amount + (p_approved_amount - v_sum_line_approved)
                    WHERE claim_line_id = (
                        SELECT claim_line_id FROM catms.insurance_claim_line
                        WHERE claim_id = p_claim_id
                        ORDER BY claimed_amount DESC, line_number ASC
                        LIMIT 1
                    );
                END IF;
            END IF;
        END IF;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 6. Update claim header
    -- ─────────────────────────────────────────────────────────────────────────
    UPDATE catms.insurance_claim
    SET claim_status        = v_resolution_enum,
        approved_amount     = p_approved_amount,
        rejection_reason    = p_rejection_reason,
        resolved_by_user_id = p_resolved_by_user_id,
        resolved_at         = clock_timestamp(),
        updated_at          = clock_timestamp()
    WHERE claim_id = p_claim_id;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 7. Append immutable transition to status history log
    -- ─────────────────────────────────────────────────────────────────────────
    INSERT INTO catms.insurance_claim_status_log (
        claim_id, from_status, to_status, transitioned_by_user_id,
        transitioned_at, transition_reason
    ) VALUES (
        p_claim_id, 'Pending', v_resolution_enum, p_resolved_by_user_id,
        clock_timestamp(),
        coalesce(p_rejection_reason, 'Claim resolved to ' || v_resolution_enum::text)
    );

    -- ─────────────────────────────────────────────────────────────────────────
    -- 8. ATOMIC INVOICE RECALCULATION (Rule 7.2)
    --    Lock invoice FOR UPDATE and recalculate liability inside same transaction
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT invoice_id, subtotal_amount, approved_insurance_amount,
           patient_liability_amount, patient_paid_amount, version_no
    INTO v_invoice_record
    FROM catms.invoice
    WHERE invoice_id = v_claim_record.invoice_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_INVOICE_NOT_FOUND: Invoice % for claim % does not exist.',
            v_claim_record.invoice_id, p_claim_id USING ERRCODE = '23503';
    END IF;

    -- Sum all approved insurance across all non-rejected claims for this invoice
    SELECT coalesce(sum(approved_amount), 0.00)
    INTO v_total_invoice_approved
    FROM catms.insurance_claim
    WHERE invoice_id = v_claim_record.invoice_id
      AND claim_status IN ('Approved', 'PartiallyApproved');

    -- Patient liability = max(0, subtotal - approved_insurance_amount)
    v_new_patient_liability := greatest(0.00, v_invoice_record.subtotal_amount - v_total_invoice_approved);

    -- Evaluate patient payment status based on paid amounts
    IF v_invoice_record.patient_paid_amount >= v_new_patient_liability THEN
        v_new_payment_status := 'Paid';
    ELSIF v_invoice_record.patient_paid_amount > 0.00 THEN
        v_new_payment_status := 'PartiallyPaid';
    ELSE
        v_new_payment_status := 'Unpaid';
    END IF;

    -- Apply update to invoice
    UPDATE catms.invoice
    SET approved_insurance_amount = v_total_invoice_approved,
        patient_liability_amount  = v_new_patient_liability,
        patient_payment_status    = v_new_payment_status,
        version_no                = version_no + 1
    WHERE invoice_id = v_claim_record.invoice_id;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 9. Audit event
    -- ─────────────────────────────────────────────────────────────────────────
    INSERT INTO catms.audit_event (
        actor_user_id, entity_type, entity_id, action_code, payload
    ) VALUES (
        p_resolved_by_user_id, 'insurance_claim', p_claim_id::text, 'CLAIM_RESOLVED',
        jsonb_build_object(
            'claim_number', v_claim_record.claim_number,
            'resolution', v_resolution_enum,
            'claimed_amount', v_claim_record.claimed_amount,
            'approved_amount', p_approved_amount,
            'new_patient_liability', v_new_patient_liability,
            'total_invoice_approved', v_total_invoice_approved
        )
    );

    RETURN v_resolution_enum;
END;
$$;

COMMENT ON FUNCTION catms.resolve_claim(BIGINT, VARCHAR, NUMERIC, BIGINT, TEXT, JSONB) IS
    'Atomically transitions a claim to Approved, PartiallyApproved, or Rejected, logs an immutable status transition, and recalculates invoice patient liability within the same transaction.';

-- Grants
REVOKE ALL ON FUNCTION catms.resolve_claim(BIGINT, VARCHAR, NUMERIC, BIGINT, TEXT, JSONB)
FROM PUBLIC, catms_reception, catms_clinician;

GRANT EXECUTE ON FUNCTION catms.resolve_claim(BIGINT, VARCHAR, NUMERIC, BIGINT, TEXT, JSONB)
TO catms_app, catms_admin;

-- Migration Registry
INSERT INTO catms.schema_migrations (version, description, applied_by, checksum_sha256, execution_ms)
VALUES (112, 'claim resolution and liability recalculation procedure', current_user, 'pending', 0)
ON CONFLICT (version) DO NOTHING;

COMMIT;
