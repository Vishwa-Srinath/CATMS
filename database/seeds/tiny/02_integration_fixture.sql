-- CATMS-042: Assemble complete deterministic tiny integration fixture
-- Owner: Dev5
-- Purpose: Provide golden journey rows and every core status for cross-module integration testing.

BEGIN;

-- 1. Appointments
-- Golden Journey: Completed appointment
INSERT INTO appointment (id, patient_id, doctor_id, branch_id, scheduled_start, scheduled_end, status)
VALUES (1, 1, 3, 1, '2026-11-01 09:00:00+00', '2026-11-01 09:15:00+00', 'COMPLETED');

-- Scheduled appointment (future)
INSERT INTO appointment (id, patient_id, doctor_id, branch_id, scheduled_start, scheduled_end, status)
VALUES (2, 2, 3, 1, '2026-12-01 10:00:00+00', '2026-12-01 10:15:00+00', 'SCHEDULED');

-- Cancelled appointment
INSERT INTO appointment (id, patient_id, doctor_id, branch_id, scheduled_start, scheduled_end, status)
VALUES (3, 1, 3, 1, '2026-10-01 11:00:00+00', '2026-10-01 11:15:00+00', 'CANCELLED');

-- 2. Clinical Care (Golden Journey)
INSERT INTO consultation_note (id, appointment_id, clinical_notes)
VALUES (1, 1, 'Patient presented with headache. Routine checkup completed.');

INSERT INTO appointment_treatment (id, appointment_id, treatment_id, administered_at)
VALUES (1, 1, 1, '2026-11-01 09:10:00+00');

-- 3. Invoices
INSERT INTO invoice (id, appointment_id, patient_id, subtotal, approved_insurance, patient_liability, patient_paid, insurer_paid, issued_at)
VALUES (1, 1, 1, 1500.00, 1200.00, 300.00, 300.00, 1200.00, '2026-11-01 09:15:00+00');

-- 4. Insurance Claims
INSERT INTO insurance_claim (id, invoice_id, policy_id, claimed_amount, approved_amount, status, submitted_at)
VALUES (1, 1, 1, 1500.00, 1200.00, 'APPROVED', '2026-11-01 09:20:00+00');

-- 5. Payments
-- Patient Payment
INSERT INTO payment (id, invoice_id, payer_type, amount, payment_method, payment_status, paid_at)
VALUES (1, 1, 'PATIENT', 300.00, 'CASH', 'COMPLETED', '2026-11-01 09:25:00+00');

-- Insurer Payment
INSERT INTO payment (id, invoice_id, payer_type, amount, payment_method, payment_status, paid_at)
VALUES (2, 1, 'INSURER', 1200.00, 'BANK_TRANSFER', 'COMPLETED', '2026-11-05 10:00:00+00');

COMMIT;
