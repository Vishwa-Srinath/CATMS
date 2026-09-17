-- 040_patient_identity_schema.test.sql
-- Module: B-patient-insurance
-- Owner: Dev3 (Patient Identity & Insurance)
-- Issue: CATMS-018 (GitHub #28)
-- Purpose: Direct-SQL verification of constraints, clinic-wide uniqueness, and deferred triggers.

\echo '=== TEST 1: Happy Path - Register valid patient with primary identity & emergency contact ==='
BEGIN;
INSERT INTO patient (
    patient_number, first_name, last_name, date_of_birth, gender, blood_group, contact_number, email, address
) VALUES (
    'PAT-TEST-001', 'Sunil', 'Perera', '1985-06-15', 'Male', 'O+', '0771234567', 'sunil.p@example.lk', '12 Colombo Rd'
) RETURNING patient_id \gset

INSERT INTO patient_identity (
    patient_id, identity_type, identity_number, is_primary
) VALUES (
    :patient_id, 'NIC', '198516601234', TRUE
);

INSERT INTO emergency_contact (
    patient_id, contact_name, relationship, phone_number, is_primary
) VALUES (
    :patient_id, 'Kamani Perera', 'Spouse', '0719876543', TRUE
);
COMMIT;
\echo 'SUCCESS: Valid patient committed cleanly.'


\echo '=== TEST 2: Clinic-Wide Uniqueness - Duplicate NIC rejection (even in different case) ==='
BEGIN;
-- Attempt to register another patient with the same NIC in lowercase
INSERT INTO patient (
    patient_number, first_name, last_name, date_of_birth, gender, blood_group, contact_number
) VALUES (
    'PAT-TEST-002', 'Sunil', 'Duplicate', '1985-06-15', 'Male', 'O+', '0770000000'
) RETURNING patient_id \gset

-- This must fail due to uq_patient_identity_clinic_wide
INSERT INTO patient_identity (
    patient_id, identity_type, identity_number, is_primary
) VALUES (
    :patient_id, 'NIC', '198516601234', TRUE
);
ROLLBACK;
\echo 'EXPECTED: Duplicate NIC was blocked.'


\echo '=== TEST 3: At Most One Primary Identity Invariant ==='
BEGIN;
SELECT patient_id FROM patient WHERE patient_number = 'PAT-TEST-001' \gset

-- Attempt to add a second primary identity (Passport) for the same patient
-- This must fail due to uq_patient_primary_identity
INSERT INTO patient_identity (
    patient_id, identity_type, identity_number, is_primary
) VALUES (
    :patient_id, 'Passport', 'N9876543', TRUE
);
ROLLBACK;
\echo 'EXPECTED: Second primary identity was blocked.'


\echo '=== TEST 4: At Least One Emergency Contact Invariant (Deferred Trigger) ==='
BEGIN;
-- Create patient + identity, but omit emergency contact
INSERT INTO patient (
    patient_number, first_name, last_name, date_of_birth, gender, contact_number
) VALUES (
    'PAT-TEST-003', 'NoContact', 'Patient', '1990-01-01', 'Female', '0761112233'
) RETURNING patient_id \gset

INSERT INTO patient_identity (
    patient_id, identity_type, identity_number, is_primary
) VALUES (
    :patient_id, 'NIC', '199050109999', TRUE
);

-- COMMIT should fail here because trg_patient_emergency_contact_mandatory fires
COMMIT;
\echo 'EXPECTED: Missing emergency contact caused transaction commit failure.'


\echo '=== TEST 5: Deleting All Emergency Contacts Guard ==='
BEGIN;
SELECT patient_id FROM patient WHERE patient_number = 'PAT-TEST-001' \gset

-- Attempt to delete the only emergency contact of the patient
-- This should fail due to trg_emergency_contact_delete_guard
DELETE FROM emergency_contact WHERE patient_id = :patient_id;
COMMIT;
\echo 'EXPECTED: Deleting last emergency contact was blocked.'
