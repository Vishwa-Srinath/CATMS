-- CATMS-072: Finalize report objects, reconcile totals and tune indexes
-- Owner: Dev5
-- Creates R1-R5 views and applies targeted indexes to guarantee 2-second response time.

BEGIN;

-- =============================================================================
-- 1. Report Views
-- =============================================================================

-- R1: Branch-wise daily appointment summary
CREATE OR REPLACE VIEW catms.r1_branch_appointment_summary AS
SELECT 
    b.name AS branch_name,
    DATE(a.start_at AT TIME ZONE 'Asia/Colombo') AS appointment_date,
    COUNT(*) FILTER (WHERE a.status = 'Scheduled') AS scheduled_count,
    COUNT(*) FILTER (WHERE a.status = 'Completed') AS completed_count,
    COUNT(*) FILTER (WHERE a.status = 'Cancelled') AS cancelled_count
FROM catms.appointment a
JOIN catms.branch b ON a.branch_id = b.branch_id
GROUP BY b.name, appointment_date;

COMMENT ON VIEW catms.r1_branch_appointment_summary IS 'Daily aggregation of scheduled, completed, and cancelled appointments per branch.';

-- R2: Doctor gross revenue and actual collections
CREATE OR REPLACE VIEW catms.r2_doctor_revenue AS
SELECT 
    d.doctor_id,
    e.full_name AS doctor_name,
    COALESCE(SUM(i.subtotal_amount), 0.00) AS gross_revenue,
    COALESCE(SUM(i.patient_paid_amount + i.insurer_paid_amount), 0.00) AS actual_collections
FROM catms.invoice i
JOIN catms.appointment a ON i.appointment_id = a.appointment_id
JOIN catms.doctor_profile d ON a.doctor_id = d.doctor_id
JOIN catms.employee e ON d.doctor_id = e.employee_id
GROUP BY d.doctor_id, e.full_name;

COMMENT ON VIEW catms.r2_doctor_revenue IS 'Gross invoiced revenue vs actual collected payments by doctor.';

-- R3: Patient outstanding balances
CREATE OR REPLACE VIEW catms.r3_patient_balances AS
SELECT 
    p.patient_id,
    p.first_name || ' ' || p.last_name AS patient_name,
    i.invoice_id,
    i.subtotal_amount,
    i.patient_liability_amount,
    (i.patient_liability_amount - i.patient_paid_amount) AS outstanding_balance
FROM catms.invoice i
JOIN catms.appointment a ON i.appointment_id = a.appointment_id
JOIN catms.patient p ON a.patient_id = p.patient_id
WHERE (i.patient_liability_amount - i.patient_paid_amount) > 0;

COMMENT ON VIEW catms.r3_patient_balances IS 'Pending liability and outstanding amounts owed by patients across all branches.';

-- R4: Treatment counts by category
CREATE OR REPLACE VIEW catms.r4_treatment_counts AS
SELECT 
    tc.name AS category_name,
    COUNT(at.treatment_id) AS treatment_count
FROM catms.appointment_treatment at
JOIN catms.treatment_catalogue cat ON at.treatment_id = cat.treatment_id
JOIN catms.treatment_category tc ON cat.treatment_category_id = tc.treatment_category_id
GROUP BY tc.name;

COMMENT ON VIEW catms.r4_treatment_counts IS 'Count of delivered treatments aggregated by category.';

-- R5: Approved insurance, insurer receipts and patient receipts by month
CREATE OR REPLACE VIEW catms.r5_insurance_receipts AS
SELECT 
    DATE_TRUNC('month', i.issued_at AT TIME ZONE 'Asia/Colombo') AS report_month,
    COALESCE(SUM(i.approved_insurance_amount), 0.00) AS total_approved_insurance,
    COALESCE(SUM(i.insurer_paid_amount), 0.00) AS total_insurer_receipts,
    COALESCE(SUM(i.patient_paid_amount), 0.00) AS total_patient_receipts
FROM catms.invoice i
GROUP BY report_month;

COMMENT ON VIEW catms.r5_insurance_receipts IS 'Monthly aggregation of insurance coverage and actual payments received from insurers vs patients.';


-- =============================================================================
-- 2. Report Indexes
-- =============================================================================

-- Target R1: Appointments by date and status
CREATE INDEX IF NOT EXISTS idx_appointment_branch_start 
    ON catms.appointment (branch_id, start_at, status);
COMMENT ON INDEX catms.idx_appointment_branch_start IS 'Optimize R1 branch/date grouping.';

-- Target R2/R3/R5: Invoices
CREATE INDEX IF NOT EXISTS idx_invoice_appointment_issued 
    ON catms.invoice (appointment_id, issued_at);
COMMENT ON INDEX catms.idx_invoice_appointment_issued IS 'Optimize R2 and R5 invoice aggregations by date/appointment.';

CREATE INDEX IF NOT EXISTS idx_invoice_outstanding_balance
    ON catms.invoice (patient_id, (patient_liability_amount - patient_paid_amount)) 
    WHERE (patient_liability_amount - patient_paid_amount) > 0;
COMMENT ON INDEX catms.idx_invoice_outstanding_balance IS 'Optimize R3 patient outstanding balances filter.';

-- Target R4: Treatment counts
CREATE INDEX IF NOT EXISTS idx_appointment_treatment_tid
    ON catms.appointment_treatment (treatment_id);
COMMENT ON INDEX catms.idx_appointment_treatment_tid IS 'Optimize R4 treatment aggregation.';

COMMIT;
