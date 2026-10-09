-- CATMS-052 / Dev4: expose narrowly scoped clinical and invoice read models,
-- and grant the planned application roles the catalogue permissions they need.
BEGIN;

CREATE OR REPLACE VIEW catms.v_clinical_worklist AS
SELECT
    a.appointment_id,
    a.appointment_number,
    p.patient_id,
    p.patient_number,
    concat_ws(' ', p.first_name, p.last_name) AS patient_name,
    a.doctor_id,
    e.full_name AS doctor_name,
    a.branch_id,
    b.name AS branch_name,
    a.start_at,
    cn.current_revision_no AS consultation_revision_no,
    coalesce(treatment_counts.treatment_count, 0)::bigint AS treatment_count
FROM catms.appointment a
JOIN catms.patient p ON p.patient_id = a.patient_id
JOIN catms.doctor_profile dp ON dp.doctor_id = a.doctor_id
JOIN catms.employee e ON e.employee_id = dp.doctor_id
JOIN catms.branch b ON b.branch_id = a.branch_id
LEFT JOIN catms.consultation_note cn ON cn.appointment_id = a.appointment_id
LEFT JOIN LATERAL (
    SELECT count(*) AS treatment_count
    FROM catms.appointment_treatment at
    WHERE at.appointment_id = a.appointment_id
) treatment_counts ON true
WHERE a.status = 'Completed';

CREATE OR REPLACE VIEW catms.v_invoice_detail AS
SELECT
    i.invoice_id,
    i.invoice_number,
    i.appointment_id,
    a.doctor_id,
    i.invoice_state,
    i.currency_code,
    i.subtotal_amount,
    i.approved_insurance_amount,
    i.patient_liability_amount,
    i.patient_paid_amount,
    i.insurer_paid_amount,
    i.patient_payment_status,
    i.issued_at,
    il.invoice_line_id,
    il.line_number,
    il.service_code_snapshot,
    il.description_snapshot,
    il.quantity,
    il.unit_price,
    il.line_total
FROM catms.invoice i
JOIN catms.appointment a ON a.appointment_id = i.appointment_id
LEFT JOIN catms.invoice_line il ON il.invoice_id = i.invoice_id;

COMMENT ON VIEW catms.v_clinical_worklist IS
    'Completed appointments with the minimum patient, clinician, and care-status fields required by the clinical worklist.';
COMMENT ON VIEW catms.v_invoice_detail IS
    'Read-only invoice headers and immutable line snapshots, scoped to the clinician associated with the appointment by the API.';

CREATE FUNCTION catms.lock_clinical_appointment(p_appointment_id BIGINT)
RETURNS TABLE (doctor_id BIGINT, appointment_status catms.appointment_status)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    SELECT a.doctor_id, a.status
    INTO doctor_id, appointment_status
    FROM catms.appointment a
    WHERE a.appointment_id = p_appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND: The appointment does not exist.';
    END IF;
    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION catms.lock_clinical_appointment(BIGINT) IS
    'Locks an appointment while clinical writes verify clinician ownership and invoke the controlled care/invoice procedures.';
REVOKE ALL ON FUNCTION catms.lock_clinical_appointment(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION catms.lock_clinical_appointment(BIGINT) TO catms_clinician, catms_admin;

GRANT SELECT ON catms.v_clinical_worklist TO catms_clinician, catms_admin;
GRANT SELECT ON catms.v_invoice_detail TO catms_clinician, catms_admin;

GRANT SELECT ON catms.treatment_category, catms.treatment_catalogue
TO catms_app, catms_reception, catms_clinician, catms_manager, catms_admin, catms_qa, catms_readonly;
GRANT INSERT, UPDATE ON catms.treatment_catalogue TO catms_admin;

COMMIT;
