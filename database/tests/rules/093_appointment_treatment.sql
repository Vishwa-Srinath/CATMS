-- CATMS-033: delivered-treatment pricing and integrity tests.
-- Run after applying the appointment_treatment draft/migration.
-- Covers CATMS-005 pricing, historical snapshots, invalid inputs and permissions.
-- This single-session suite does not include the separate concurrency test.
-- All fixture rows are rolled back; identity sequences may still advance.

BEGIN;
SET LOCAL statement_timeout='30s';
DO $test$
DECLARE b bigint; d bigint; s bigint; u bigint; p bigint; a bigint;
c bigint; normal bigint; consult bigint; t1 bigint; t2 bigint; t3 bigint; t4 bigint;
caught boolean; status_value text; role_value text; bad_quantity numeric;
BEGIN
INSERT INTO catms.branch(branch_code,name,address_line_1,city,contact_phone)
VALUES('TEST033','Treatment Test Branch','Test','Colombo','0110000033') RETURNING branch_id INTO b;
INSERT INTO catms.employee(employee_number,nic,full_name,gender_code,date_of_birth,position_code,phone,hire_date)
VALUES('TEST033','199001019933','Test Doctor','Male','1990-01-01','Doctor','0770000033',CURRENT_DATE) RETURNING employee_id INTO d;
INSERT INTO catms.doctor_profile(doctor_id,medical_license_no,practice_start_date,default_consultation_fee)
VALUES(d,'TEST033','2015-01-01',2500);
INSERT INTO catms.specialty(specialty_code,name) VALUES('TEST033','Treatment Test Specialty') RETURNING specialty_id INTO s;
INSERT INTO catms.doctor_specialty(doctor_id,specialty_id,is_primary) VALUES(d,s,true);
INSERT INTO catms.user_account(employee_id,username,password_hash)
VALUES(d,'test033','TEST_ONLY_NOT_A_USABLE_PASSWORD_HASH') RETURNING user_account_id INTO u;
INSERT INTO catms.patient(patient_number,first_name,last_name,date_of_birth,gender,contact_number,registered_branch_id,registered_by)
VALUES('TEST033','Temporary','Patient','1995-01-01','Male','0770000034',b,d) RETURNING patient_id INTO p;
INSERT INTO catms.patient_identity(patient_id,identity_type,identity_number,is_primary) VALUES(p,'Passport','TEST033',true);
INSERT INTO catms.emergency_contact(patient_id,contact_name,relationship,phone_number,is_primary) VALUES(p,'Contact','Sibling','0770000035',true);
INSERT INTO catms.appointment(appointment_number,patient_id,doctor_id,branch_id,specialty_id,start_at,end_at,status,created_by)
VALUES('TEST033',p,d,b,s,'2026-10-01 09:00:00+05:30','2026-10-01 09:15:00+05:30','Completed',u) RETURNING appointment_id INTO a;
INSERT INTO catms.treatment_category(category_code,name) VALUES('TEST033','Treatment Test Category') RETURNING treatment_category_id INTO c;
INSERT INTO catms.treatment_catalogue(treatment_category_id,service_code,name,current_price,default_duration_minutes,is_consultation_service)
VALUES(c,'TEST033-N','Normal service',500,15,false) RETURNING treatment_id INTO normal;
INSERT INTO catms.treatment_catalogue(treatment_category_id,service_code,name,current_price,default_duration_minutes,is_consultation_service)
VALUES(c,'TEST033-C','Consultation',2000,15,true) RETURNING treatment_id INTO consult;
SET CONSTRAINTS ALL IMMEDIATE;

SET LOCAL ROLE catms_clinician;
t1:=catms.record_appointment_treatment(a,normal,2,u);
t2:=catms.record_appointment_treatment(a,consult,1,u);
RESET ROLE;
IF NOT EXISTS(SELECT 1 FROM catms.appointment_treatment WHERE appointment_treatment_id=t1 AND unit_price_at_time=500 AND price_source='Catalogue' AND quantity=2)
THEN RAISE EXCEPTION 'FAIL: normal treatment price'; END IF;
IF NOT EXISTS(SELECT 1 FROM catms.appointment_treatment WHERE appointment_treatment_id=t2 AND unit_price_at_time=2500 AND price_source='DoctorFee')
THEN RAISE EXCEPTION 'FAIL: doctor fee substitution'; END IF;
RAISE NOTICE 'PASS: normal service uses catalogue; consultation substitutes doctor fee';

UPDATE catms.doctor_profile SET default_consultation_fee=NULL WHERE doctor_id=d;
t3:=catms.record_appointment_treatment(a,consult,1,u);
IF NOT EXISTS(SELECT 1 FROM catms.appointment_treatment WHERE appointment_treatment_id=t3 AND unit_price_at_time=2000 AND price_source='Catalogue' AND line_number=3)
THEN RAISE EXCEPTION 'FAIL: null doctor fee fallback or repeat service'; END IF;
RAISE NOTICE 'PASS: null doctor fee falls back to catalogue; repeat service gets separate line';

UPDATE catms.doctor_profile SET default_consultation_fee=0 WHERE doctor_id=d;
t4:=catms.record_appointment_treatment(a,consult,1,u);
IF NOT EXISTS(SELECT 1 FROM catms.appointment_treatment WHERE appointment_treatment_id=t4 AND unit_price_at_time=0 AND price_source='DoctorFee')
THEN RAISE EXCEPTION 'FAIL: zero doctor fee'; END IF;
UPDATE catms.treatment_catalogue SET current_price=900 WHERE treatment_id=normal;
UPDATE catms.treatment_catalogue SET current_price=3000 WHERE treatment_id=consult;
UPDATE catms.doctor_profile SET default_consultation_fee=4000 WHERE doctor_id=d;
IF NOT EXISTS(SELECT 1 FROM catms.appointment_treatment WHERE appointment_treatment_id=t1 AND unit_price_at_time=500)
OR NOT EXISTS(SELECT 1 FROM catms.appointment_treatment WHERE appointment_treatment_id=t2 AND unit_price_at_time=2500)
OR NOT EXISTS(SELECT 1 FROM catms.appointment_treatment WHERE appointment_treatment_id=t3 AND unit_price_at_time=2000)
THEN RAISE EXCEPTION 'FAIL: historical prices changed'; END IF;
RAISE NOTICE 'PASS: zero doctor fee accepted; later catalogue and doctor fee changes preserve snapshots';

FOREACH status_value IN ARRAY ARRAY['Scheduled','Cancelled'] LOOP
 UPDATE catms.appointment SET status=status_value::catms.appointment_status WHERE appointment_id=a;
 caught:=false;
 BEGIN
  PERFORM catms.record_appointment_treatment(a,normal,1,u);
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'treatment_requires_completed:%' THEN RAISE; END IF;
  caught:=true;
 END;
 IF NOT caught THEN RAISE EXCEPTION 'FAIL: status % accepted',status_value; END IF;
 RAISE NOTICE 'PASS: % appointment rejected',status_value;
END LOOP;
UPDATE catms.appointment SET status='Completed' WHERE appointment_id=a;
UPDATE catms.treatment_catalogue SET is_active=false WHERE treatment_id=normal;
caught:=false;
BEGIN
 PERFORM catms.record_appointment_treatment(a,normal,1,u);
EXCEPTION WHEN raise_exception THEN
 IF SQLERRM NOT LIKE 'treatment_inactive:%' THEN RAISE; END IF;
 caught:=true;
END;
IF NOT caught THEN RAISE EXCEPTION 'FAIL: inactive treatment accepted'; END IF;
UPDATE catms.treatment_catalogue SET is_active=true WHERE treatment_id=normal;
caught:=false;
BEGIN
 PERFORM catms.record_appointment_treatment(a,(-1)::bigint,1,u);
EXCEPTION WHEN raise_exception THEN
 IF SQLERRM NOT LIKE 'treatment_not_found:%' THEN RAISE; END IF;
 caught:=true;
END;
IF NOT caught THEN RAISE EXCEPTION 'FAIL: missing treatment accepted'; END IF;
RAISE NOTICE 'PASS: inactive and missing treatments rejected';

FOREACH bad_quantity IN ARRAY ARRAY[NULL::numeric,0,-1,'NaN'::numeric] LOOP
 caught:=false;
 BEGIN
  PERFORM catms.record_appointment_treatment(a,normal,bad_quantity,u);
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'invalid_quantity:%' THEN RAISE; END IF;
  caught:=true;
 END;
 IF NOT caught THEN RAISE EXCEPTION 'FAIL: quantity % accepted',bad_quantity; END IF;
END LOOP;
RAISE NOTICE 'PASS: null, zero, negative and NaN quantities rejected';

caught:=false;
BEGIN
 UPDATE catms.appointment_treatment SET unit_price_at_time=1 WHERE appointment_treatment_id=t1;
EXCEPTION WHEN raise_exception THEN
 IF SQLERRM NOT LIKE 'treatment_price_snapshot_protected:%' THEN RAISE; END IF;
 caught:=true;
END;
IF NOT caught THEN RAISE EXCEPTION 'FAIL: historical price update permitted'; END IF;

caught:=false;
BEGIN
 INSERT INTO catms.appointment_treatment(appointment_id,treatment_id,line_number,quantity,unit_price_at_time,price_source,administered_at,recorded_by_user_id)
 VALUES(a,normal,5,1,1,'Catalogue',now(),u);
EXCEPTION WHEN raise_exception THEN
 IF SQLERRM NOT LIKE 'INVALID_TREATMENT_PRICE:%' THEN RAISE; END IF;
 caught:=true;
END;
IF NOT caught THEN RAISE EXCEPTION 'FAIL: forged direct insert price accepted'; END IF;
RAISE NOTICE 'PASS: price edits and forged insert prices rejected';

FOREACH role_value IN ARRAY ARRAY['catms_reception','catms_manager','catms_qa','catms_readonly'] LOOP
 caught:=false;
 BEGIN
  EXECUTE format('SET LOCAL ROLE %I',role_value);
  PERFORM catms.record_appointment_treatment(a,normal,1,u);
 EXCEPTION WHEN insufficient_privilege THEN caught:=true;
 END;
 RESET ROLE;
 IF NOT caught THEN RAISE EXCEPTION 'FAIL: unauthorized role % accepted',role_value; END IF;
END LOOP;
caught:=false;
BEGIN
 SET LOCAL ROLE catms_clinician;
 DELETE FROM catms.appointment_treatment WHERE appointment_treatment_id=t1;
EXCEPTION WHEN insufficient_privilege THEN caught:=true;
END;
RESET ROLE;
IF NOT caught THEN RAISE EXCEPTION 'FAIL: direct clinician deletion permitted'; END IF;
IF (SELECT count(*) FROM catms.appointment_treatment WHERE appointment_id=a) <> 4
THEN RAISE EXCEPTION 'FAIL: rejected operations left extra rows'; END IF;
RAISE NOTICE 'PASS: unauthorized roles and direct clinician deletion denied; rejected operations leave no extra lines';
END;
$test$;
ROLLBACK;

