-- 161_patient_insurance_grants.sql
-- Module: B-patient-insurance
-- Fixes missing database permissions for role-based users

BEGIN;

-- patient, patient_identity, emergency_contact
GRANT SELECT, INSERT, UPDATE, DELETE ON catms.patient TO catms_reception, catms_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON catms.patient_identity TO catms_reception, catms_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON catms.emergency_contact TO catms_reception, catms_admin;

GRANT SELECT ON catms.patient TO catms_clinician, catms_manager, catms_qa;
GRANT SELECT ON catms.patient_identity TO catms_clinician, catms_manager, catms_qa;
GRANT SELECT ON catms.emergency_contact TO catms_clinician, catms_manager, catms_qa;

GRANT EXECUTE ON PROCEDURE catms.register_patient TO catms_reception, catms_admin;

-- insurance_provider, insurance_policy, policy_coverage
GRANT SELECT, INSERT, UPDATE ON catms.insurance_provider TO catms_admin;
GRANT SELECT ON catms.insurance_provider TO catms_reception, catms_clinician, catms_manager, catms_qa;

GRANT SELECT, INSERT, UPDATE ON catms.insurance_policy TO catms_reception, catms_admin;
GRANT SELECT ON catms.insurance_policy TO catms_clinician, catms_manager, catms_qa;

GRANT SELECT, INSERT, UPDATE ON catms.policy_coverage TO catms_reception, catms_admin;
GRANT SELECT ON catms.policy_coverage TO catms_clinician, catms_manager, catms_qa;

-- insurance procedures
GRANT EXECUTE ON PROCEDURE catms.create_insurance_provider TO catms_admin;
GRANT EXECUTE ON PROCEDURE catms.create_insurance_policy TO catms_reception, catms_admin;
GRANT EXECUTE ON PROCEDURE catms.update_policy_status TO catms_reception, catms_admin;
GRANT EXECUTE ON PROCEDURE catms.add_policy_coverage TO catms_reception, catms_admin;
GRANT EXECUTE ON PROCEDURE catms.update_policy_coverage TO catms_reception, catms_admin;

GRANT EXECUTE ON FUNCTION catms.get_effective_coverage(BIGINT, BIGINT, DATE) TO catms_reception, catms_clinician, catms_manager, catms_admin, catms_qa;

-- record migration
INSERT INTO catms.schema_migrations (version, description, applied_by)
VALUES (161, 'implement missing patient and insurance grants for specific roles', current_user)
ON CONFLICT (version) DO NOTHING;

COMMIT;
