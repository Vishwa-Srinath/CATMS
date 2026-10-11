-- CATMS-070: Golden Overlay
-- Specific, known-value records injected over the bulk data for exact report assertion
BEGIN;

-- 1. Golden Patient
INSERT INTO catms.patient (
    patient_id, patient_number, first_name, last_name, date_of_birth, gender, contact_number, registered_branch_id, registered_by
) OVERRIDING SYSTEM VALUE VALUES (
    9999, 'PAT-9999', 'Golden', 'Patient', '1980-01-01', 'Male', '0779998888', 1, 1
) ON CONFLICT (patient_id) DO NOTHING;

-- 2. Golden Appointment (Ensures specific totals on a specific date)
INSERT INTO catms.appointment (
    appointment_id, appointment_number, patient_id, doctor_id, branch_id, specialty_id,
    start_at, end_at, status, booking_type, created_by
) OVERRIDING SYSTEM VALUE VALUES (
    9999, 'APT-9999', 9999, 3, 1, 1,
    '2026-10-15 09:00:00+05:30', '2026-10-15 09:30:00+05:30', 'Completed', 'Booked', 1
) ON CONFLICT (appointment_id) DO NOTHING;

-- 3. Golden Clinical Notes
INSERT INTO catms.consultation_note (
    consultation_note_id, appointment_id, current_revision_no
) OVERRIDING SYSTEM VALUE VALUES (
    9999, 9999, 1
) ON CONFLICT (consultation_note_id) DO NOTHING;

INSERT INTO catms.consultation_note_revision (
    consultation_note_id, revision_no, clinical_notes, recorded_by_user_id
) VALUES (
    9999, 1, 'Golden journey notes.', 1
) ON CONFLICT (consultation_note_id, revision_no) DO NOTHING;

-- 4. Golden Treatment Delivery
INSERT INTO catms.appointment_treatment (
    appointment_treatment_id, appointment_id, treatment_id, line_number,
    quantity, unit_price_at_time, price_source, administered_at, recorded_by_user_id
) OVERRIDING SYSTEM VALUE VALUES (
    9999, 9999, 1, 1,
    1.00, 1500.00, 'Catalogue', '2026-10-15 09:15:00+05:30', 1
) ON CONFLICT (appointment_treatment_id) DO NOTHING;

-- 5. Golden Invoice
INSERT INTO catms.invoice (
    invoice_id, invoice_number, appointment_id, subtotal_amount,
    approved_insurance_amount, patient_liability_amount, patient_paid_amount, insurer_paid_amount,
    invoice_state, patient_payment_status, issued_at
) OVERRIDING SYSTEM VALUE VALUES (
    9999, 'INV-9999', 9999, 1500.00,
    0.00, 1500.00, 1500.00, 0.00,
    'Issued', 'Paid', '2026-10-15 09:30:00+05:30'
) ON CONFLICT (invoice_id) DO NOTHING;

COMMIT;
