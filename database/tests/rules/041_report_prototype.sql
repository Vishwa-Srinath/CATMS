-- CATMS-041: Prototype all five report queries against tiny fixture
-- Owner: Dev5
-- Purpose: Draft SQL for management reports R1-R5.

-- R1: Branch-wise daily appointment summary
SELECT 
    b.name AS branch_name,
    DATE(a.scheduled_start AT TIME ZONE 'Asia/Colombo') AS appointment_date,
    COUNT(*) FILTER (WHERE a.status = 'SCHEDULED') AS scheduled_count,
    COUNT(*) FILTER (WHERE a.status = 'COMPLETED') AS completed_count,
    COUNT(*) FILTER (WHERE a.status = 'CANCELLED') AS cancelled_count
FROM appointment a
JOIN branch b ON a.branch_id = b.id
GROUP BY b.name, appointment_date
ORDER BY appointment_date DESC, b.name;

-- R2: Doctor gross revenue and actual collections
SELECT 
    d.employee_id AS doctor_id,
    e.first_name || ' ' || e.last_name AS doctor_name,
    SUM(i.subtotal) AS gross_revenue,
    SUM(i.patient_paid + i.insurer_paid) AS actual_collections
FROM invoice i
JOIN appointment a ON i.appointment_id = a.id
JOIN employee e ON a.doctor_id = e.id
JOIN doctor_profile d ON e.id = d.employee_id
GROUP BY d.employee_id, e.first_name, e.last_name;

-- R3: Patient outstanding balances
SELECT 
    p.id AS patient_id,
    p.first_name || ' ' || p.last_name AS patient_name,
    i.id AS invoice_id,
    i.subtotal,
    i.patient_liability,
    (i.patient_liability - i.patient_paid) AS outstanding_balance
FROM invoice i
JOIN patient p ON i.patient_id = p.id
WHERE (i.patient_liability - i.patient_paid) > 0;

-- R4: Treatment counts by category/date range
SELECT 
    tc.name AS category_name,
    COUNT(at.treatment_id) AS treatment_count
FROM appointment_treatment at
JOIN treatment_catalogue cat ON at.treatment_id = cat.id
JOIN treatment_category tc ON cat.category_id = tc.id
GROUP BY tc.name;

-- R5: Approved insurance, insurer receipts and patient receipts by month
SELECT 
    DATE_TRUNC('month', i.issued_at AT TIME ZONE 'Asia/Colombo') AS report_month,
    SUM(i.approved_insurance) AS total_approved_insurance,
    SUM(i.insurer_paid) AS total_insurer_receipts,
    SUM(i.patient_paid) AS total_patient_receipts
FROM invoice i
GROUP BY report_month
ORDER BY report_month DESC;
