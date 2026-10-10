-- CATMS-070: Golden Overlay
-- Specific, known-value records injected over the bulk data for exact report assertion
BEGIN;

-- Golden Patient
INSERT INTO patient (id, first_name, last_name, date_of_birth, gender, registered_at_branch_id) VALUES
(9999, 'Golden', 'Patient', '1980-01-01', 'M', 1);

-- Golden Appointment (Ensures specific totals on a specific date)
INSERT INTO appointment (id, patient_id, doctor_id, branch_id, scheduled_start, scheduled_end, status) VALUES
(9999, 9999, 3, 1, '2026-10-15 09:00:00+00', '2026-10-15 09:30:00+00', 'COMPLETED');

INSERT INTO consultation_note (id, appointment_id, clinical_notes) VALUES
(9999, 9999, 'Golden journey notes.');

INSERT INTO appointment_treatment (id, appointment_id, treatment_id, administered_at) VALUES
(9999, 9999, 1, '2026-10-15 09:15:00+00');

INSERT INTO invoice (id, appointment_id, patient_id, subtotal, approved_insurance, patient_liability, patient_paid, insurer_paid, issued_at) VALUES
(9999, 9999, 9999, 1500.00, 0.00, 1500.00, 1500.00, 0.00, '2026-10-15 09:30:00+00');

COMMIT;
