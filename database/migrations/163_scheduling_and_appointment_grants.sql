-- 163_scheduling_and_appointment_grants.sql
-- Module: C-appointment-scheduling & Clinical Billing
-- Grants role permissions on appointment, scheduling, and staff procedures

BEGIN;

-- 1. appointment core and audit logs
GRANT SELECT, INSERT, UPDATE ON catms.appointment TO catms_reception, catms_clinician, catms_manager, catms_admin;
GRANT SELECT ON catms.appointment_schedule_history TO catms_reception, catms_clinician, catms_manager, catms_admin, catms_qa;
GRANT SELECT ON catms.appointment_status_log TO catms_reception, catms_clinician, catms_manager, catms_admin, catms_qa;

-- 2. doctor availability
GRANT SELECT, INSERT, UPDATE, DELETE ON catms.doctor_availability TO catms_manager, catms_admin, catms_clinician;
GRANT SELECT ON catms.doctor_availability TO catms_reception, catms_qa;

GRANT SELECT, INSERT, DELETE ON catms.doctor_availability_exception TO catms_manager, catms_admin, catms_clinician;
GRANT SELECT ON catms.doctor_availability_exception TO catms_reception, catms_qa;

-- 3. staff & appointment procedures
GRANT EXECUTE ON PROCEDURE catms.register_employee TO catms_admin, catms_app;
GRANT EXECUTE ON PROCEDURE catms.register_doctor_profile TO catms_admin, catms_app;
GRANT EXECUTE ON PROCEDURE catms.transfer_employee_branch TO catms_admin, catms_app;
GRANT EXECUTE ON PROCEDURE catms.assign_employee_branch TO catms_admin, catms_app;
GRANT EXECUTE ON PROCEDURE catms.deactivate_employee TO catms_admin, catms_app;
GRANT EXECUTE ON PROCEDURE catms.assign_branch_manager TO catms_admin, catms_app;

GRANT EXECUTE ON PROCEDURE catms.book_appointment TO catms_admin, catms_reception, catms_clinician, catms_manager, catms_app;
GRANT EXECUTE ON PROCEDURE catms.reschedule_appointment TO catms_admin, catms_reception, catms_clinician, catms_manager, catms_app;
GRANT EXECUTE ON PROCEDURE catms.update_appointment_status TO catms_admin, catms_reception, catms_clinician, catms_manager, catms_app;
GRANT EXECUTE ON PROCEDURE catms.cancel_appointment TO catms_admin, catms_reception, catms_clinician, catms_manager, catms_app;

GRANT INSERT, UPDATE ON catms.appointment_schedule_history TO catms_admin, catms_reception, catms_clinician, catms_manager, catms_app;
GRANT INSERT, UPDATE ON catms.appointment_status_log TO catms_admin, catms_reception, catms_clinician, catms_manager, catms_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA catms TO catms_admin, catms_reception, catms_clinician, catms_manager, catms_app;

DO $$
BEGIN
    EXECUTE format('GRANT catms_app, catms_readonly, catms_reception, catms_clinician, catms_manager, catms_admin, catms_qa TO %I WITH SET TRUE', current_user);
EXCEPTION
    WHEN OTHERS THEN NULL;
END;
$$;

-- 4. enforce ledger immutability on financial tables for catms_admin
REVOKE INSERT, UPDATE, DELETE ON TABLE catms.invoice, catms.invoice_line FROM catms_admin;
REVOKE INSERT, UPDATE, DELETE ON TABLE catms.payment, catms.payment_reversal FROM catms_admin;
GRANT SELECT ON TABLE catms.invoice, catms.invoice_line TO catms_admin;
GRANT SELECT ON TABLE catms.payment, catms.payment_reversal TO catms_admin;

-- record migration
INSERT INTO catms.schema_migrations (version, description, applied_by)
VALUES (163, 'implement scheduling, appointment, and staff procedure grants', current_user)
ON CONFLICT (version) DO UPDATE
SET description = EXCLUDED.description;

COMMIT;
