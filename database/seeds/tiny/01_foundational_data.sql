-- CATMS-021: Tiny Fixture - Foundational Data
-- Owner: Dev5 | Issue: CATMS-021
-- Purpose: Deterministic foundational rows for integration testing and QA.

BEGIN;

-- 1. Branches
-- ---------------------------------------------------------
INSERT INTO branch (id, code, name, address, contact_number, is_active) VALUES
(1, 'CMB', 'MedSync Colombo Main', '100 Galle Road, Colombo', '0112111111', true),
(2, 'KND', 'MedSync Kandy Central', '50 Dalada Veediya, Kandy', '0812222222', true),
(3, 'GAL', 'MedSync Galle South', '25 Matara Road, Galle', '0912333333', true);

-- 2. App Roles
-- ---------------------------------------------------------
INSERT INTO app_role (id, role_name, description) VALUES
(1, 'Reception', 'Front desk and appointment booking'),
(2, 'Clinician', 'Doctor and clinical staff'),
(3, 'Branch Manager', 'Branch operations and daily reporting'),
(4, 'Admin/Finance', 'Clinic-wide admin, pricing, and claims'),
(5, 'QA', 'Quality assurance and testing');

-- 3. Employees & Users
-- ---------------------------------------------------------
INSERT INTO employee (id, employee_number, first_name, last_name, nic, is_active) VALUES
(1, 'EMP001', 'Kamal', 'Perera', '198012345678', true),   -- Manager
(2, 'EMP002', 'Nimal', 'Fernando', '199012345678', true),  -- Reception
(3, 'EMP003', 'Sunil', 'Silva', '197512345678', true);     -- Doctor

INSERT INTO employee_branch_assignment (employee_id, branch_id, assigned_from, is_primary) VALUES
(1, 1, '2026-01-01', true),
(2, 1, '2026-01-01', true),
(3, 1, '2026-01-01', true);

INSERT INTO branch_manager_assignment (branch_id, employee_id, assigned_from, is_active) VALUES
(1, 1, '2026-01-01', true);

INSERT INTO user_account (id, employee_id, username, password_hash, is_active) VALUES
(1, 1, 'k.perera', '$2b$10$demo_hash_value_here', true),
(2, 2, 'n.fernando', '$2b$10$demo_hash_value_here', true),
(3, 3, 's.silva', '$2b$10$demo_hash_value_here', true);

INSERT INTO user_account_role (user_account_id, app_role_id) VALUES
(1, 3), -- Manager
(2, 1), -- Reception
(3, 2); -- Clinician

-- 4. Doctors & Specialties
-- ---------------------------------------------------------
INSERT INTO specialty (id, code, name, description, is_active) VALUES
(1, 'GP', 'General Practice', 'Primary care and general medicine', true),
(2, 'CARD', 'Cardiology', 'Heart and cardiovascular system', true),
(3, 'DERM', 'Dermatology', 'Skin, hair, and nails', true);

INSERT INTO doctor_profile (employee_id, licence_number, consultation_fee) VALUES
(3, 'SLMC12345', 2000.00);

INSERT INTO doctor_specialty (doctor_id, specialty_id, is_primary) VALUES
(3, 1, true);

-- 5. Patients & Emergency Contacts
-- ---------------------------------------------------------
INSERT INTO patient (id, first_name, last_name, date_of_birth, gender, registered_at_branch_id) VALUES
(1, 'Ruwan', 'Kumara', '1985-05-15', 'M', 1),
(2, 'Samanthi', 'Jayasinghe', '1992-08-20', 'F', 1);

INSERT INTO patient_identity (patient_id, identity_type, identity_value, is_primary) VALUES
(1, 'NIC', '198513645678', true),
(2, 'NIC', '199268345678', true);

INSERT INTO emergency_contact (patient_id, contact_name, relationship, contact_number) VALUES
(1, 'Ajith Kumara', 'Brother', '0771112222'),
(2, 'Kasun Jayasinghe', 'Husband', '0713334444');

-- 6. Insurance
-- ---------------------------------------------------------
INSERT INTO insurance_provider (id, code, name, is_active) VALUES
(1, 'SLIC', 'Sri Lanka Insurance', true),
(2, 'CEN', 'Ceylinco General', true);

INSERT INTO insurance_policy (id, provider_id, patient_id, policy_number, status) VALUES
(1, 1, 1, 'POL-SLIC-1001', 'ACTIVE'),
(2, 2, 2, 'POL-CEN-2002', 'ACTIVE');

-- 7. Treatment Catalogue
-- ---------------------------------------------------------
INSERT INTO treatment_category (id, name, description, is_active) VALUES
(1, 'Consultation', 'Standard doctor consultations', true),
(2, 'Diagnostic', 'Lab tests and imaging', true),
(3, 'Procedure', 'Minor clinical procedures', true);

INSERT INTO treatment_catalogue (id, category_id, code, name, default_price, duration_minutes, is_active) VALUES
(1, 1, 'CONS-01', 'Standard GP Consultation', 1500.00, 15, true),
(2, 2, 'DIAG-01', 'Full Blood Count', 800.00, 10, true),
(3, 3, 'PROC-01', 'Wound Dressing', 1200.00, 20, true);

-- 8. Policy Coverage
-- ---------------------------------------------------------
INSERT INTO policy_coverage (policy_id, treatment_id, coverage_percentage, cap_amount, effective_from, effective_to) VALUES
(1, 1, 80.00, 1500.00, '2026-01-01', '2026-12-31'),
(1, 2, 100.00, 5000.00, '2026-01-01', '2026-12-31'),
(2, 1, 50.00, 1000.00, '2026-01-01', '2026-12-31');

COMMIT;
