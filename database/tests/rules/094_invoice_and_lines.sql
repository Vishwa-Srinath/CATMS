-- CATMS-034 regression suite; requires the invoice draft/migration.
-- Fictional fixtures are rolled back. Sequence values can still advance.
BEGIN;
SET LOCAL statement_timeout='30s';
DO $test$
DECLARE b bigint; d bigint; s bigint; u bigint; p bigint; a bigint;
c bigint; normal bigint; consult bigint; t1 bigint; t2 bigint; t3 bigint; t4 bigint;
caught boolean; status_value text; role_value text; bad_quantity numeric;
i bigint; a2 bigint; action_sql text; expected text; cases text[][]; entry text[];
BEGIN
INSERT INTO catms.branch(branch_code,name,address_line_1,city,contact_phone)
VALUES('TEST034','Treatment Test Branch','Test','Colombo','0110000033') RETURNING branch_id INTO b;
INSERT INTO catms.employee(employee_number,nic,full_name,gender_code,date_of_birth,position_code,phone,hire_date)
VALUES('TEST034','199001019933','Test Doctor','Male','1990-01-01','Doctor','0770000033',CURRENT_DATE) RETURNING employee_id INTO d;
INSERT INTO catms.doctor_profile(doctor_id,medical_license_no,practice_start_date,default_consultation_fee)
VALUES(d,'TEST034','2015-01-01',2500);
INSERT INTO catms.specialty(specialty_code,name) VALUES('TEST034','Treatment Test Specialty') RETURNING specialty_id INTO s;
INSERT INTO catms.doctor_specialty(doctor_id,specialty_id,is_primary) VALUES(d,s,true);
INSERT INTO catms.user_account(employee_id,username,password_hash)
VALUES(d,'test033','TEST_ONLY_NOT_A_USABLE_PASSWORD_HASH') RETURNING user_account_id INTO u;
INSERT INTO catms.patient(patient_number,first_name,last_name,date_of_birth,gender,contact_number,registered_branch_id,registered_by)
VALUES('TEST034','Temporary','Patient','1995-01-01','Male','0770000034',b,d) RETURNING patient_id INTO p;
INSERT INTO catms.patient_identity(patient_id,identity_type,identity_number,is_primary) VALUES(p,'Passport','TEST034',true);
INSERT INTO catms.emergency_contact(patient_id,contact_name,relationship,phone_number,is_primary) VALUES(p,'Contact','Sibling','0770000035',true);
INSERT INTO catms.appointment(appointment_number,patient_id,doctor_id,branch_id,specialty_id,start_at,end_at,status,created_by)
VALUES('TEST034',p,d,b,s,'2026-10-01 09:00:00+05:30','2026-10-01 09:15:00+05:30','Completed',u) RETURNING appointment_id INTO a;
INSERT INTO catms.treatment_category(category_code,name) VALUES('TEST034','Treatment Test Category') RETURNING treatment_category_id INTO c;
INSERT INTO catms.treatment_catalogue(treatment_category_id,service_code,name,current_price,default_duration_minutes,is_consultation_service)
VALUES(c,'TEST034-N','Normal service',500,15,false) RETURNING treatment_id INTO normal;
INSERT INTO catms.treatment_catalogue(treatment_category_id,service_code,name,current_price,default_duration_minutes,is_consultation_service)
VALUES(c,'TEST034-C','Consultation',2000,15,true) RETURNING treatment_id INTO consult;
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SET LOCAL ROLE catms_clinician;
t1:=catms.record_appointment_treatment(a,normal,2,u);
t2:=catms.record_appointment_treatment(a,consult,1,u);
i:=catms.issue_invoice(a,u);
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
IF NOT EXISTS(SELECT 1 FROM catms.invoice WHERE invoice_id=i AND subtotal_amount=3500
 AND approved_insurance_amount=0 AND patient_liability_amount=3500
 AND patient_paid_amount=0 AND insurer_paid_amount=0
 AND invoice_state='Issued' AND patient_payment_status='Unpaid')
 OR (SELECT count(*) FROM catms.invoice_line WHERE invoice_id=i)<>2
 OR (SELECT sum(line_total) FROM catms.invoice_line WHERE invoice_id=i)<>3500
THEN RAISE EXCEPTION 'FAIL: initial invoice header/lines/totals'; END IF;
IF NOT EXISTS(SELECT 1 FROM catms.audit_event WHERE entity_type='invoice' AND entity_id=i::text AND actor_user_id=u AND action_code='INVOICE_ISSUED')
THEN RAISE EXCEPTION 'FAIL: audit entry'; END IF;
RAISE NOTICE 'PASS: clinician issues header, two lines, LKR 3500 total, and audit entry';

UPDATE catms.treatment_catalogue SET current_price=9999,name='New catalogue label',service_code='TEST034-CHANGED' WHERE treatment_id=normal;
UPDATE catms.doctor_profile SET default_consultation_fee=8000 WHERE doctor_id=d;
IF NOT EXISTS(SELECT 1 FROM catms.invoice_line WHERE appointment_treatment_id=t1 AND unit_price=500 AND quantity=2 AND line_total=1000 AND description_snapshot='Normal service' AND service_code_snapshot='TEST034-N')
 OR NOT EXISTS(SELECT 1 FROM catms.invoice_line WHERE appointment_treatment_id=t2 AND unit_price=2500)
THEN RAISE EXCEPTION 'FAIL: catalogue edit changed invoice'; END IF;
RAISE NOTICE 'PASS: price, service-code and description snapshots survive catalogue edits';

-- Each case must fail with its specific domain error; unrelated errors propagate.
cases := ARRAY[
 ARRAY[format('SELECT catms.issue_invoice(%s::bigint,%s::bigint)',a,u),'INVOICE_ALREADY_EXISTS:'],
 ARRAY[format('UPDATE catms.invoice_line SET unit_price=1 WHERE invoice_id=%s',i),'INVOICE_HISTORY_IMMUTABLE:'],
 ARRAY[format('DELETE FROM catms.invoice_line WHERE invoice_id=%s',i),'INVOICE_HISTORY_IMMUTABLE:'],
 ARRAY[format('UPDATE catms.invoice SET subtotal_amount=1 WHERE invoice_id=%s',i),'INVOICE_IMMUTABLE:'],
 ARRAY[format('SELECT catms.record_appointment_treatment(%s::bigint,%s::bigint,1,%s::bigint)',a,normal,u),'TREATMENT_ALREADY_INVOICED:'],
 ARRAY[format('UPDATE catms.appointment_treatment SET quantity=99 WHERE appointment_treatment_id=%s',t1),'TREATMENT_ALREADY_INVOICED:']
];
FOREACH entry SLICE 1 IN ARRAY cases LOOP
 caught:=false;
 BEGIN EXECUTE entry[1];
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE entry[2] || '%' THEN RAISE; END IF;
  caught:=true;
 END;
 IF NOT caught THEN RAISE EXCEPTION 'FAIL: expected rejection %',entry[2]; END IF;
 RAISE NOTICE 'PASS: %',entry[2];
END LOOP;

INSERT INTO catms.appointment(appointment_number,patient_id,doctor_id,branch_id,specialty_id,start_at,end_at,status,created_by)
VALUES('TEST034-SECOND',p,d,b,s,'2026-10-01 11:00:00+05:30','2026-10-01 11:15:00+05:30','Scheduled',u)
RETURNING appointment_id INTO a2;
FOREACH status_value IN ARRAY ARRAY['Scheduled','Cancelled'] LOOP
 UPDATE catms.appointment SET status=status_value::catms.appointment_status WHERE appointment_id=a2;
 caught:=false;
 BEGIN PERFORM catms.issue_invoice(a2,u);
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'INVOICE_REQUIRES_COMPLETED:%' THEN RAISE; END IF;
  caught:=true;
 END;
 IF NOT caught THEN RAISE EXCEPTION 'FAIL: % accepted',status_value; END IF;
END LOOP;
UPDATE catms.appointment SET status='Completed' WHERE appointment_id=a2;
caught:=false;
BEGIN PERFORM catms.issue_invoice(a2,u);
EXCEPTION WHEN raise_exception THEN
 IF SQLERRM NOT LIKE 'INVOICE_REQUIRES_TREATMENT:%' THEN RAISE; END IF; caught:=true;
END;
IF NOT caught THEN RAISE EXCEPTION 'FAIL: empty invoice accepted'; END IF;
RAISE NOTICE 'PASS: non-Completed and empty invoice requests rejected';

PERFORM catms.record_appointment_treatment(a2,normal,1,u);
caught:=false;
BEGIN
 INSERT INTO catms.invoice(appointment_id) VALUES(a2);
 SET CONSTRAINTS ALL IMMEDIATE;
EXCEPTION WHEN raise_exception THEN
 IF SQLERRM NOT LIKE 'INVOICE_INCONSISTENT:%' THEN RAISE; END IF; caught:=true;
END;
IF NOT caught THEN RAISE EXCEPTION 'FAIL: incomplete invoice accepted'; END IF;
UPDATE catms.treatment_catalogue SET service_code=repeat('X',31) WHERE treatment_id=normal;
caught:=false;
BEGIN PERFORM catms.issue_invoice(a2,u);
EXCEPTION WHEN raise_exception THEN
 IF SQLERRM NOT LIKE 'INVOICE_SNAPSHOT_TOO_LONG:%' THEN RAISE; END IF; caught:=true;
END;
IF NOT caught OR EXISTS(SELECT 1 FROM catms.invoice WHERE appointment_id=a2)
 OR (SELECT count(*) FROM catms.invoice_line WHERE invoice_id=i)<>2
THEN RAISE EXCEPTION 'FAIL: mid-issuance error did not roll back cleanly'; END IF;
RAISE NOTICE 'PASS: completeness checks and forced-failure rollback';

FOREACH role_value IN ARRAY ARRAY['catms_reception','catms_manager','catms_qa','catms_readonly'] LOOP
 caught:=false;
 BEGIN
  EXECUTE format('SET LOCAL ROLE %I',role_value);
  PERFORM catms.issue_invoice(a2,u);
 EXCEPTION WHEN insufficient_privilege THEN caught:=true;
 END;
 RESET ROLE;
 IF NOT caught THEN RAISE EXCEPTION 'FAIL: unauthorized role %',role_value; END IF;
END LOOP;
caught:=false;
BEGIN SET LOCAL ROLE catms_admin; UPDATE catms.invoice SET patient_paid_amount=1 WHERE invoice_id=i;
EXCEPTION WHEN insufficient_privilege THEN caught:=true;
END;
RESET ROLE;
IF NOT caught THEN RAISE EXCEPTION 'FAIL: direct-total write permitted'; END IF;
RAISE NOTICE 'PASS: unauthorized roles and direct-total writes rejected';
SET CONSTRAINTS ALL IMMEDIATE;
END;
$test$;
ROLLBACK;

