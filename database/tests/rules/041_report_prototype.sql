-- CATMS-041: Prototype all five report queries against tiny fixture
-- Owner: Dev5
-- Purpose: Draft SQL for management reports R1-R5.

-- R1: Branch-wise daily appointment summary
SELECT 
    b.name AS branch_name,
    DATE(a.start_at AT TIME ZONE 'Asia/Colombo') AS appointment_date,
    COUNT(*) FILTER (WHERE a.status = 'Scheduled') AS scheduled_count,
    COUNT(*) FILTER (WHERE a.status = 'Completed') AS completed_count,
    COUNT(*) FILTER (WHERE a.status = 'Cancelled') AS cancelled_count
FROM catms.appointment a
JOIN catms.branch b ON a.branch_id = b.branch_id
GROUP BY b.name, appointment_date
ORDER BY appointment_date DESC, b.name;

-- R2: Doctor gross revenue and actual collections
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

-- R3: Patient outstanding balances
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

-- R4: Treatment counts by category/date range
SELECT 
    tc.name AS category_name,
    COUNT(at.treatment_id) AS treatment_count
FROM catms.appointment_treatment at
JOIN catms.treatment_catalogue cat ON at.treatment_id = cat.treatment_id
JOIN catms.treatment_category tc ON cat.treatment_category_id = tc.treatment_category_id
GROUP BY tc.name;

-- R5: Approved insurance, insurer receipts and patient receipts by month
SELECT 
    DATE_TRUNC('month', i.issued_at AT TIME ZONE 'Asia/Colombo') AS report_month,
    COALESCE(SUM(i.approved_insurance_amount), 0.00) AS total_approved_insurance,
    COALESCE(SUM(i.insurer_paid_amount), 0.00) AS total_insurer_receipts,
    COALESCE(SUM(i.patient_paid_amount), 0.00) AS total_patient_receipts
FROM catms.invoice i
GROUP BY report_month
ORDER BY report_month DESC;
