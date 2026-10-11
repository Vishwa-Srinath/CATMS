-- CATMS-072 / Dev 5: Update report views for authoritative branch, date filters and payment-date aggregation
-- Owner: Dev5
-- Upgrades R2, R3, R4 to support branch_id and date filtering; upgrades R5 to group receipts by payment date.

BEGIN;

-- =============================================================================
-- 1. Upgrade R2: Doctor Revenue with branch and date dimensions
-- =============================================================================
CREATE OR REPLACE VIEW catms.r2_doctor_revenue AS
SELECT 
    d.doctor_id,
    e.full_name AS doctor_name,
    a.branch_id,
    DATE(i.issued_at AT TIME ZONE 'Asia/Colombo') AS revenue_date,
    COALESCE(SUM(i.subtotal_amount), 0.00) AS gross_revenue,
    COALESCE(SUM(i.patient_paid_amount + i.insurer_paid_amount), 0.00) AS actual_collections
FROM catms.invoice i
JOIN catms.appointment a ON i.appointment_id = a.appointment_id
JOIN catms.doctor_profile d ON a.doctor_id = d.doctor_id
JOIN catms.employee e ON d.doctor_id = e.employee_id
GROUP BY d.doctor_id, e.full_name, a.branch_id, DATE(i.issued_at AT TIME ZONE 'Asia/Colombo');

COMMENT ON VIEW catms.r2_doctor_revenue IS 'Doctor revenue aggregated by doctor, branch, and revenue date.';

-- =============================================================================
-- 2. Upgrade R3: Patient Balances with branch dimension
-- =============================================================================
CREATE OR REPLACE VIEW catms.r3_patient_balances AS
SELECT 
    p.patient_id,
    p.first_name || ' ' || p.last_name AS patient_name,
    i.invoice_id,
    a.branch_id,
    i.subtotal_amount,
    i.patient_liability_amount,
    (i.patient_liability_amount - i.patient_paid_amount) AS outstanding_balance
FROM catms.invoice i
JOIN catms.appointment a ON i.appointment_id = a.appointment_id
JOIN catms.patient p ON a.patient_id = p.patient_id
WHERE (i.patient_liability_amount - i.patient_paid_amount) > 0;

COMMENT ON VIEW catms.r3_patient_balances IS 'Pending liability and outstanding patient balances scoped by branch.';

-- =============================================================================
-- 3. Upgrade R4: Treatment Counts with branch and treatment date dimensions
-- =============================================================================
CREATE OR REPLACE VIEW catms.r4_treatment_counts AS
SELECT 
    tc.name AS category_name,
    a.branch_id,
    DATE(at.administered_at AT TIME ZONE 'Asia/Colombo') AS treatment_date,
    COUNT(at.treatment_id) AS treatment_count
FROM catms.appointment_treatment at
JOIN catms.appointment a ON at.appointment_id = a.appointment_id
JOIN catms.treatment_catalogue cat ON at.treatment_id = cat.treatment_id
JOIN catms.treatment_category tc ON cat.treatment_category_id = tc.treatment_category_id
GROUP BY tc.name, a.branch_id, DATE(at.administered_at AT TIME ZONE 'Asia/Colombo');

COMMENT ON VIEW catms.r4_treatment_counts IS 'Count of delivered treatments aggregated by category, branch, and date.';

-- =============================================================================
-- 4. Upgrade R5: Insurance Receipts grouped by payment transaction date
-- =============================================================================
CREATE OR REPLACE VIEW catms.r5_insurance_receipts AS
WITH payment_monthly AS (
    SELECT 
        TO_CHAR(DATE_TRUNC('month', p.paid_at AT TIME ZONE 'Asia/Colombo'), 'YYYY-MM') AS report_month,
        COALESCE(SUM(p.amount) FILTER (WHERE p.payer_type = 'Insurer'), 0.00) AS total_insurer_receipts,
        COALESCE(SUM(p.amount) FILTER (WHERE p.payer_type = 'Patient'), 0.00) AS total_patient_receipts
    FROM catms.payment p
    WHERE p.payment_status IN ('Settled', 'PartiallyReversed')
    GROUP BY report_month
),
invoice_monthly AS (
    SELECT 
        TO_CHAR(DATE_TRUNC('month', i.issued_at AT TIME ZONE 'Asia/Colombo'), 'YYYY-MM') AS report_month,
        COALESCE(SUM(i.approved_insurance_amount), 0.00) AS total_approved_insurance
    FROM catms.invoice i
    GROUP BY report_month
)
SELECT 
    COALESCE(pm.report_month, im.report_month) AS report_month,
    COALESCE(im.total_approved_insurance, 0.00) AS total_approved_insurance,
    COALESCE(pm.total_insurer_receipts, 0.00) AS total_insurer_receipts,
    COALESCE(pm.total_patient_receipts, 0.00) AS total_patient_receipts
FROM payment_monthly pm
FULL OUTER JOIN invoice_monthly im ON pm.report_month = im.report_month;

COMMENT ON VIEW catms.r5_insurance_receipts IS 'Monthly aggregation of insurance coverage and actual payments received from insurers vs patients grouped by payment transaction date.';

-- =============================================================================
-- 5. Grants for Application & Reporting Roles
-- =============================================================================
GRANT SELECT ON catms.r2_doctor_revenue TO catms_app, catms_readonly;
GRANT SELECT ON catms.r3_patient_balances TO catms_app, catms_readonly;
GRANT SELECT ON catms.r4_treatment_counts TO catms_app, catms_readonly;
GRANT SELECT ON catms.r5_insurance_receipts TO catms_app, catms_readonly;

COMMIT;
