-- CATMS: Deterministic Foundational Seed Data
-- Provides core branches, staff, roles, credentials, treatment catalog, and insurance providers

BEGIN;

SET search_path TO catms, public;

-- 1. Branches
-- -----------------------------------------------------------------------------
INSERT INTO catms.branch (
    branch_id, branch_code, code, name, address_line_1, city, contact_phone, time_zone, is_active
) OVERRIDING SYSTEM VALUE VALUES
(1, 'CMB', 'CMB', 'MedSync Colombo Main', '100 Galle Road', 'Colombo', '+94 11 211 1111', 'Asia/Colombo', true),
(2, 'KND', 'KND', 'MedSync Kandy Central', '50 Dalada Veediya', 'Kandy', '+94 81 222 2222', 'Asia/Colombo', true),
(3, 'GAL', 'GAL', 'MedSync Galle South', '25 Matara Road', 'Galle', '+94 91 233 3333', 'Asia/Colombo', true)
ON CONFLICT (branch_id) DO NOTHING;

-- 2. Specialties
-- -----------------------------------------------------------------------------
INSERT INTO catms.specialty (
    specialty_id, specialty_code, name, description, is_active
) OVERRIDING SYSTEM VALUE VALUES
(1, 'GP', 'General Practice', 'Primary care and general medicine', true),
(2, 'CARD', 'Cardiology', 'Heart and cardiovascular system', true),
(3, 'DERM', 'Dermatology', 'Skin, hair, and nails', true)
ON CONFLICT (specialty_id) DO NOTHING;

-- 3. Employees
-- -----------------------------------------------------------------------------
INSERT INTO catms.employee (
    employee_id, employee_number, nic, full_name, gender_code, date_of_birth,
    position_code, phone, email, hire_date, employment_status, is_active
) OVERRIDING SYSTEM VALUE VALUES
(1, 'EMP-ADM-01', '701234567V', 'Dr. Admin Leader', 'Male', '1970-01-01', 'Admin', '+94 77 000 0001', 'admin@medsync.lk', '2020-01-01', 'Active', true),
(2, 'EMP-MGR-01', '801234567V', 'Kamal Perera', 'Male', '1980-01-01', 'Manager', '+94 77 000 0002', 'k.perera@medsync.lk', '2020-01-01', 'Active', true),
(3, 'EMP-REC-01', '901234567V', 'Nimali Perera', 'Female', '1990-01-01', 'Receptionist', '+94 77 000 0003', 'nimali.p@medsync.lk', '2020-01-01', 'Active', true),
(4, 'EMP-DOC-01', '751234567V', 'Dr. Sunil Silva', 'Male', '1975-01-01', 'Doctor', '+94 77 000 0004', 's.silva@medsync.lk', '2020-01-01', 'Active', true)
ON CONFLICT (employee_id) DO NOTHING;

-- 4. Branch Assignments
-- -----------------------------------------------------------------------------
INSERT INTO catms.employee_branch_assignment (
    employee_branch_assignment_id, employee_id, branch_id, assignment_type, valid_from, is_active
) OVERRIDING SYSTEM VALUE VALUES
(1, 1, 1, 'PRIMARY', CURRENT_DATE, true),
(2, 2, 1, 'PRIMARY', CURRENT_DATE, true),
(3, 3, 1, 'PRIMARY', CURRENT_DATE, true),
(4, 4, 1, 'PRIMARY', CURRENT_DATE, true)
ON CONFLICT (employee_branch_assignment_id) DO NOTHING;

-- 5. Branch Manager Assignment
-- -----------------------------------------------------------------------------
INSERT INTO catms.branch_manager_assignment (
    branch_manager_assignment_id, branch_id, employee_id, valid_from, is_active
) OVERRIDING SYSTEM VALUE VALUES
(1, 1, 2, CURRENT_DATE, true)
ON CONFLICT (branch_manager_assignment_id) DO NOTHING;

-- 6. Doctor Profile & Specialty
-- -----------------------------------------------------------------------------
INSERT INTO catms.doctor_profile (
    doctor_id, medical_license_no, practice_start_date, default_consultation_fee, is_accepting_appointments
) VALUES
(4, 'SLMC-12345', '2010-01-01', 2500.00, true)
ON CONFLICT (doctor_id) DO NOTHING;

INSERT INTO catms.doctor_specialty (
    doctor_specialty_id, doctor_id, specialty_id, is_primary, valid_from
) OVERRIDING SYSTEM VALUE VALUES
(1, 4, 1, true, CURRENT_DATE)
ON CONFLICT (doctor_specialty_id) DO NOTHING;

-- 7. User Accounts (Password for all accounts is 'CorrectPassword123!')
-- Hash generated via bcrypt: $2b$10$orQSXITV0eqYlkuKsLmnV.A4ICGRQ9uhIMojDKnsaB5uYq83EIRFW
-- -----------------------------------------------------------------------------
INSERT INTO catms.user_account (
    user_account_id, employee_id, username, password_hash, account_status
) OVERRIDING SYSTEM VALUE VALUES
(1, 1, 'admin.user', '$2b$10$orQSXITV0eqYlkuKsLmnV.A4ICGRQ9uhIMojDKnsaB5uYq83EIRFW', 'Active'),
(2, 2, 'k.perera', '$2b$10$orQSXITV0eqYlkuKsLmnV.A4ICGRQ9uhIMojDKnsaB5uYq83EIRFW', 'Active'),
(3, 3, 'reception.user', '$2b$10$orQSXITV0eqYlkuKsLmnV.A4ICGRQ9uhIMojDKnsaB5uYq83EIRFW', 'Active'),
(4, 4, 's.silva', '$2b$10$orQSXITV0eqYlkuKsLmnV.A4ICGRQ9uhIMojDKnsaB5uYq83EIRFW', 'Active')
ON CONFLICT (user_account_id) DO NOTHING;

-- 8. User Account Roles
-- Roles: 1 = Reception, 2 = Clinician, 3 = Manager, 4 = Admin, 5 = QA
-- -----------------------------------------------------------------------------
INSERT INTO catms.user_account_role (
    user_account_role_id, user_account_id, app_role_id, branch_scope_id, valid_from
) OVERRIDING SYSTEM VALUE VALUES
(1, 1, 4, NULL, now()), -- admin.user -> Admin (all branches)
(2, 2, 3, 1, now()),    -- k.perera -> Manager (Branch 1)
(3, 3, 1, 1, now()),    -- reception.user -> Reception (Branch 1)
(4, 4, 2, 1, now())     -- s.silva -> Clinician (Branch 1)
ON CONFLICT (user_account_role_id) DO NOTHING;

-- 9. Treatment Categories & Catalogue
-- -----------------------------------------------------------------------------
INSERT INTO catms.treatment_category (
    treatment_category_id, category_code, name, description, is_active
) OVERRIDING SYSTEM VALUE VALUES
(1, 'CONS', 'Consultation', 'Standard doctor consultations', true),
(2, 'DIAG', 'Diagnostic', 'Laboratory tests and diagnostic imaging', true),
(3, 'PROC', 'Procedures', 'Minor clinical procedures and care', true)
ON CONFLICT (treatment_category_id) DO NOTHING;

INSERT INTO catms.treatment_catalogue (
    treatment_id, treatment_category_id, service_code, name, description,
    current_price, default_duration_minutes, is_consultation_service, is_active
) OVERRIDING SYSTEM VALUE VALUES
(1, 1, 'CONS-GEN', 'General consultation', 'Standard GP examination', 2500.00, 20, true, true),
(2, 2, 'LAB-FBC', 'Full blood count', 'Hematology blood test', 1500.00, 15, false, true),
(3, 3, 'DRESS-01', 'Wound dressing', 'Clinical wound cleaning and dressing', 1200.00, 15, false, true)
ON CONFLICT (treatment_id) DO NOTHING;

-- 10. Insurance Providers
-- -----------------------------------------------------------------------------
INSERT INTO catms.insurance_provider (
    provider_id, provider_code, name, contact_name, contact_phone, status
) OVERRIDING SYSTEM VALUE VALUES
(1, 'SLIC', 'Sri Lanka Insurance Corporation', 'Claims Desk', '+94 11 235 7000', 'ACTIVE'),
(2, 'CEN', 'Ceylinco General Insurance', 'Medical Claims', '+94 11 248 5000', 'ACTIVE')
ON CONFLICT (provider_id) DO NOTHING;

-- 11. Initial Patients & Required Identities / Emergency Contacts
-- -----------------------------------------------------------------------------
INSERT INTO catms.patient (
    patient_id, patient_number, first_name, last_name, date_of_birth, gender,
    blood_group, contact_number, email, address, registered_branch_id, registered_by
) OVERRIDING SYSTEM VALUE VALUES
(1, 'PAT-1001', 'Ruwan', 'Kumara', '1985-05-15', 'Male', 'O+', '+94 77 123 4567', 'ruwan.k@example.com', '12 Lake Road, Colombo', 1, 3),
(2, 'PAT-1002', 'Samanthi', 'Jayasinghe', '1992-08-20', 'Female', 'A+', '+94 71 987 6543', 'samanthi.j@example.com', '45 Peradeniya Road, Kandy', 1, 3)
ON CONFLICT (patient_id) DO NOTHING;

INSERT INTO catms.patient_identity (
    identity_id, patient_id, identity_type, identity_number, is_primary
) OVERRIDING SYSTEM VALUE VALUES
(1, 1, 'NIC', '198513645678', true),
(2, 2, 'NIC', '199268345678', true)
ON CONFLICT (identity_id) DO NOTHING;

INSERT INTO catms.emergency_contact (
    contact_id, patient_id, contact_name, relationship, phone_number, is_primary
) OVERRIDING SYSTEM VALUE VALUES
(1, 1, 'Ajith Kumara', 'Brother', '+94 77 111 2222', true),
(2, 2, 'Kasun Jayasinghe', 'Husband', '+94 71 333 4444', true)
ON CONFLICT (contact_id) DO NOTHING;

-- 12. Insurance Policies & Coverage
-- -----------------------------------------------------------------------------
INSERT INTO catms.insurance_policy (
    policy_id, provider_id, patient_id, policy_number, policy_status, valid_from, valid_to
) OVERRIDING SYSTEM VALUE VALUES
(1, 1, 1, 'POL-SLIC-1001', 'ACTIVE', '2026-01-01', '2026-12-31'),
(2, 2, 2, 'POL-CEN-2002', 'ACTIVE', '2026-01-01', '2026-12-31')
ON CONFLICT (policy_id) DO NOTHING;

INSERT INTO catms.policy_coverage (
    coverage_id, policy_id, treatment_id, coverage_percentage, coverage_cap, effective_from, effective_to
) OVERRIDING SYSTEM VALUE VALUES
(1, 1, 1, 80.00, 2500.00, '2026-01-01', '2026-12-31'),
(2, 2, 1, 70.00, 2000.00, '2026-01-01', '2026-12-31')
ON CONFLICT (coverage_id) DO NOTHING;

-- 13. Default Doctor Availability (Weekly recurring schedules)
-- -----------------------------------------------------------------------------
INSERT INTO catms.doctor_availability (
    doctor_id, branch_id, day_of_week, start_time, end_time, valid_from
)
SELECT 
    dp.doctor_id,
    coalesce(eba.branch_id, 1),
    dow.day,
    '08:00:00'::time,
    '18:00:00'::time,
    '2026-01-01'::date
FROM catms.doctor_profile dp
LEFT JOIN catms.employee_branch_assignment eba ON eba.employee_id = dp.doctor_id AND eba.is_active = TRUE
CROSS JOIN (
    SELECT unnest(ARRAY['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']::catms.day_of_week[]) AS day
) dow
ON CONFLICT DO NOTHING;

COMMIT;
