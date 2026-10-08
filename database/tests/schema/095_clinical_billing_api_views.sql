-- CATMS-052: verify the clinical and invoice read models and catalogue grants.
BEGIN;

DO $$
BEGIN
    IF to_regclass('catms.v_clinical_worklist') IS NULL
       OR to_regclass('catms.v_invoice_detail') IS NULL THEN
        RAISE EXCEPTION 'CATMS-052 API read views are missing.';
    END IF;

    IF NOT has_table_privilege('catms_clinician', 'catms.v_clinical_worklist', 'SELECT')
       OR NOT has_table_privilege('catms_admin', 'catms.v_clinical_worklist', 'SELECT') THEN
        RAISE EXCEPTION 'Clinical worklist view must be readable by clinicians and admins.';
    END IF;

    IF NOT has_table_privilege('catms_clinician', 'catms.v_invoice_detail', 'SELECT')
       OR NOT has_table_privilege('catms_admin', 'catms.v_invoice_detail', 'SELECT') THEN
        RAISE EXCEPTION 'Invoice detail view must be readable by clinicians and admins.';
    END IF;

    IF NOT has_function_privilege(
           'catms_clinician',
           'catms.lock_clinical_appointment(bigint)',
           'EXECUTE'
       )
       OR has_function_privilege(
           'catms_reception',
           'catms.lock_clinical_appointment(bigint)',
           'EXECUTE'
       ) THEN
        RAISE EXCEPTION 'Appointment write-lock helper must be limited to clinical roles.';
    END IF;

    IF has_table_privilege('catms_clinician', 'catms.invoice', 'SELECT') THEN
        RAISE EXCEPTION 'Clinicians must read invoices through the read-only detail view.';
    END IF;

    IF NOT has_table_privilege('catms_admin', 'catms.treatment_catalogue', 'INSERT')
       OR NOT has_table_privilege('catms_admin', 'catms.treatment_catalogue', 'UPDATE')
       OR has_table_privilege('catms_reception', 'catms.treatment_catalogue', 'UPDATE') THEN
        RAISE EXCEPTION 'Treatment catalogue write privileges do not match API role policy.';
    END IF;
END;
$$;

ROLLBACK;
