import { pool } from '../backend/src/db/pool';
import crypto from 'crypto';

async function seed() {
  console.log('=== Populating End-to-End Clinic Demo Dataset via Official Procedures ===');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Specialties
    console.log('1. Upserting specialties...');
    await client.query(`
      INSERT INTO catms.specialty (specialty_id, specialty_code, name, description, is_active)
      OVERRIDING SYSTEM VALUE VALUES
        (4, 'ENT', 'Otolaryngology (ENT)', 'Ear, nose, and throat disorders', true),
        (5, 'PAED', 'Paediatrics', 'Infant, child, and adolescent medicine', true)
      ON CONFLICT (specialty_id) DO UPDATE
      SET name = EXCLUDED.name, description = EXCLUDED.description;
    `);

    // 2. Treatment catalogue
    console.log('2. Upserting treatment catalogue...');
    await client.query(`
      INSERT INTO catms.treatment_catalogue (
        treatment_id, treatment_category_id, service_code, name, description,
        current_price, default_duration_minutes, is_consultation_service, is_active
      ) OVERRIDING SYSTEM VALUE VALUES
        (4, 2, 'RAD-XRAY', 'Chest X-Ray (Digital)', 'High resolution digital chest radiography', 3500.00, 15, false, true),
        (5, 2, 'CARD-ECG', '12-Lead Electrocardiogram', 'Cardiac electrical activity diagnostic test', 2200.00, 15, false, true),
        (6, 3, 'PROC-INJ', 'Intramuscular Injection & Care', 'Administration of prescribed therapeutic injection', 850.00, 10, false, true)
      ON CONFLICT (treatment_id) DO UPDATE
      SET name = EXCLUDED.name, current_price = EXCLUDED.current_price;
    `);

    // 3. Additional branch managers for Kandy and Galle
    console.log('3. Upserting branch managers for Kandy & Galle...');
    await client.query(`
      INSERT INTO catms.employee (
        employee_id, employee_number, nic, full_name, gender_code, date_of_birth,
        position_code, phone, email, hire_date, employment_status, is_active
      ) OVERRIDING SYSTEM VALUE VALUES
        (12, 'EMP-MGR-02', '811234567V', 'Bandara Herath', 'Male', '1981-11-05', 'Manager', '+94 77 000 0012', 'b.herath@medsync.lk', '2021-01-15', 'Active', true),
        (13, 'EMP-MGR-03', '831234567V', 'Rohan De Silva', 'Male', '1983-06-18', 'Manager', '+94 77 000 0013', 'r.desilva@medsync.lk', '2021-01-20', 'Active', true)
      ON CONFLICT (employee_id) DO NOTHING;

      INSERT INTO catms.employee_branch_assignment (
        employee_branch_assignment_id, employee_id, branch_id, assignment_type, valid_from, is_active
      ) OVERRIDING SYSTEM VALUE VALUES
        (12, 12, 2, 'PRIMARY', '2021-01-15', true),
        (13, 13, 3, 'PRIMARY', '2021-01-20', true)
      ON CONFLICT (employee_branch_assignment_id) DO NOTHING;

      INSERT INTO catms.branch_manager_assignment (
        branch_manager_assignment_id, branch_id, employee_id, valid_from, is_active
      ) OVERRIDING SYSTEM VALUE VALUES
        (2, 2, 12, '2021-01-15', true),
        (3, 3, 13, '2021-01-20', true)
      ON CONFLICT (branch_manager_assignment_id) DO NOTHING;
    `);

    // 4. Configure Doctors: 4 (Colombo), 5 (Colombo & Kandy), 7 (Galle)
    console.log('4. Configuring doctors, specialties & branch assignments...');
    await client.query(`
      INSERT INTO catms.doctor_profile (doctor_id, medical_license_no, practice_start_date, default_consultation_fee, is_accepting_appointments)
      VALUES (7, 'SLMC-77777', '2015-01-01', 2500.00, true)
      ON CONFLICT (doctor_id) DO UPDATE SET default_consultation_fee = 2500.00;

      -- Assign Doctor 5 also to Kandy, Doctor 7 to Galle
      INSERT INTO catms.employee_branch_assignment (
        employee_branch_assignment_id, employee_id, branch_id, assignment_type, valid_from, is_active
      ) OVERRIDING SYSTEM VALUE VALUES
        (20, 5, 2, 'SECONDARY', '2022-01-01', true),
        (21, 7, 3, 'SECONDARY', '2022-01-01', true)
      ON CONFLICT (employee_branch_assignment_id) DO NOTHING;

      -- Specialties
      INSERT INTO catms.doctor_specialty (doctor_specialty_id, doctor_id, specialty_id, is_primary, valid_from)
      OVERRIDING SYSTEM VALUE VALUES
        (20, 4, 2, false, '2020-01-01'), -- Dr. Sunil: Cardiology
        (21, 5, 3, false, '2020-01-01'), -- Dr. Anoma: Dermatology
        (22, 7, 1, true, '2020-01-01'),  -- Dr. Chathura: GP (Primary)
        (23, 7, 4, false, '2020-01-01')  -- Dr. Chathura: ENT (Secondary)
      ON CONFLICT (doctor_specialty_id) DO NOTHING;

      -- Weekly recurring availability
      INSERT INTO catms.doctor_availability (doctor_id, branch_id, day_of_week, start_time, end_time, valid_from)
      SELECT
        d.doc_id, d.b_id, dow.day, '08:00:00'::time, '18:00:00'::time, '2026-01-01'::date
      FROM (VALUES (4, 1), (5, 1), (5, 2), (7, 3), (8, 1)) AS d(doc_id, b_id)
      CROSS JOIN (
        SELECT unnest(ARRAY['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']::catms.day_of_week[]) AS day
      ) dow
      ON CONFLICT DO NOTHING;
    `);

    // 5. Patients & Policies
    console.log('5. Upserting patients & policies...');
    await client.query(`
      INSERT INTO catms.patient (
        patient_id, patient_number, first_name, last_name, date_of_birth, gender,
        blood_group, contact_number, email, address, registered_branch_id, registered_by
      ) OVERRIDING SYSTEM VALUE VALUES
        (3, 'PAT-1003', 'Nihal', 'Dissanayake', '1976-11-12', 'Male', 'B+', '+94 77 345 6789', 'nihal.d@example.com', '78 Fort Cross Street, Galle', 3, 1),
        (4, 'PAT-1004', 'Dilhani', 'Fernando', '1988-03-25', 'Female', 'AB+', '+94 71 234 5678', 'dilhani.f@example.com', '15 Havelock Road, Colombo', 1, 1)
      ON CONFLICT (patient_id) DO NOTHING;

      INSERT INTO catms.patient_identity (identity_id, patient_id, identity_type, identity_number, is_primary)
      OVERRIDING SYSTEM VALUE VALUES
        (10, 3, 'NIC', '197631745678', true),
        (11, 4, 'NIC', '198858545678', true)
      ON CONFLICT (identity_id) DO NOTHING;

      INSERT INTO catms.emergency_contact (contact_id, patient_id, contact_name, relationship, phone_number, is_primary)
      OVERRIDING SYSTEM VALUE VALUES
        (10, 3, 'Sunil Dissanayake', 'Brother', '+94 77 888 9999', true),
        (11, 4, 'Mahesh Fernando', 'Spouse', '+94 71 555 6666', true)
      ON CONFLICT (contact_id) DO NOTHING;

      INSERT INTO catms.insurance_policy (
        policy_id, patient_id, provider_id, policy_number, policy_status, valid_from, valid_to
      ) OVERRIDING SYSTEM VALUE VALUES
        (3, 3, 1, 'SLIC-POL-003', 'ACTIVE', '2026-01-01', '2026-12-31'),
        (4, 4, 2, 'CEN-POL-004', 'ACTIVE', '2026-01-01', '2026-12-31')
      ON CONFLICT (policy_id) DO NOTHING;

      INSERT INTO catms.policy_coverage (coverage_id, policy_id, treatment_id, coverage_percentage, coverage_cap, effective_from, effective_to)
      OVERRIDING SYSTEM VALUE VALUES
        (3, 3, 1, 80.00, 3000.00, '2026-01-01', '2026-12-31'),
        (4, 3, 4, 75.00, 4000.00, '2026-01-01', '2026-12-31'),
        (5, 4, 1, 100.00, 3500.00, '2026-01-01', '2026-12-31'),
        (6, 4, 5, 80.00, 3000.00, '2026-01-01', '2026-12-31')
      ON CONFLICT (coverage_id) DO NOTHING;
    `);

    // 6. Appointments
    console.log('6. Updating & inserting appointments...');
    await client.query(`
      UPDATE catms.appointment SET status = 'Completed' WHERE appointment_id IN (3, 4);
      UPDATE catms.appointment SET status = 'Cancelled' WHERE appointment_id = 5;

      INSERT INTO catms.appointment (
        appointment_id, appointment_number, patient_id, doctor_id, branch_id, specialty_id,
        start_at, end_at, status, booking_type, created_by
      ) OVERRIDING SYSTEM VALUE VALUES
        -- Kandy (Doctor 5 on 2026-08-10)
        (201, 'APT-20260810-0201', 2, 5, 2, 1, '2026-08-10 09:00:00+05:30', '2026-08-10 09:30:00+05:30', 'Completed', 'Booked', 1),
        (202, 'APT-20260810-0202', 3, 5, 2, 1, '2026-08-10 10:00:00+05:30', '2026-08-10 10:30:00+05:30', 'Completed', 'WalkIn', 1),
        (203, 'APT-20260810-0203', 4, 5, 2, 1, '2026-08-10 11:00:00+05:30', '2026-08-10 11:30:00+05:30', 'Scheduled', 'Booked', 1),

        -- Galle (Doctor 7 on 2026-08-09)
        (301, 'APT-20260809-0301', 3, 7, 3, 1, '2026-08-09 09:00:00+05:30', '2026-08-09 09:30:00+05:30', 'Completed', 'Booked', 1),
        (302, 'APT-20260809-0302', 1, 7, 3, 1, '2026-08-09 10:00:00+05:30', '2026-08-09 10:30:00+05:30', 'Completed', 'Booked', 1),
        (303, 'APT-20260809-0303', 2, 7, 3, 1, '2026-08-09 11:00:00+05:30', '2026-08-09 11:30:00+05:30', 'Cancelled', 'Booked', 1),
        (304, 'APT-20260809-0304', 4, 7, 3, 1, '2026-08-09 14:00:00+05:30', '2026-08-09 14:30:00+05:30', 'Scheduled', 'WalkIn', 1)
      ON CONFLICT (appointment_id) DO NOTHING;
    `);

    // 7. Consultation Notes
    console.log('7. Recording consultation notes...');
    for (const aptId of [3, 4, 201, 202, 301, 302]) {
      const existing = await client.query('SELECT 1 FROM catms.consultation_note WHERE appointment_id = $1', [aptId]);
      if (existing.rows.length === 0) {
        const cnRes = await client.query(
          'INSERT INTO catms.consultation_note (appointment_id, current_revision_no) VALUES ($1, 1) RETURNING consultation_note_id',
          [aptId]
        );
        const cnId = cnRes.rows[0].consultation_note_id;
        await client.query(
          'INSERT INTO catms.consultation_note_revision (consultation_note_id, revision_no, notes, recorded_by_user_id) VALUES ($1, 1, $2, 1)',
          [cnId, `Completed clinical examination and notes for appointment ${aptId}. Patient stable.`]
        );
      }
    }

    // 8. Record Treatments using catms.record_appointment_treatment
    console.log('8. Recording treatments using catms.record_appointment_treatment...');
    const treatmentsToRecord = [
      { aptId: 3, tId: 1, qty: 1.0, comment: 'General examination' },
      { aptId: 3, tId: 4, qty: 1.0, comment: 'Chest X-Ray Digital' },

      { aptId: 4, tId: 1, qty: 1.0, comment: 'General consultation' },
      { aptId: 4, tId: 2, qty: 1.0, comment: 'Routine FBC screening' },

      { aptId: 201, tId: 1, qty: 1.0, comment: 'Cardiology consultation' },
      { aptId: 201, tId: 5, qty: 1.0, comment: '12-Lead ECG test' },

      { aptId: 202, tId: 3, qty: 1.0, comment: 'Wound cleaning & dressing' },
      { aptId: 202, tId: 6, qty: 1.0, comment: 'Tetanus toxoid injection' },

      { aptId: 301, tId: 1, qty: 1.0, comment: 'General consultation' },

      { aptId: 302, tId: 1, qty: 1.0, comment: 'General consultation' },
      { aptId: 302, tId: 4, qty: 1.0, comment: 'Digital chest radiography' },
    ];

    for (const t of treatmentsToRecord) {
      const exists = await client.query(
        'SELECT 1 FROM catms.appointment_treatment WHERE appointment_id = $1 AND treatment_id = $2',
        [t.aptId, t.tId]
      );
      if (exists.rows.length === 0) {
        await client.query(
          'SELECT catms.record_appointment_treatment($1, $2, $3, 1, $4)',
          [t.aptId, t.tId, t.qty, t.comment]
        );
      }
    }

    // 9. Issue Invoices using catms.issue_invoice
    console.log('9. Issuing invoices using catms.issue_invoice...');
    const invoiceIds: Record<number, number> = {};
    for (const aptId of [3, 4, 201, 202, 301, 302]) {
      const invCheck = await client.query('SELECT invoice_id FROM catms.invoice WHERE appointment_id = $1', [aptId]);
      if (invCheck.rows.length === 0) {
        const invRes = await client.query('SELECT catms.issue_invoice($1, 1) AS inv_id', [aptId]);
        invoiceIds[aptId] = Number(invRes.rows[0].inv_id);
      } else {
        invoiceIds[aptId] = Number(invCheck.rows[0].invoice_id);
      }
    }
    console.log('Issued invoices:', invoiceIds);

    // 10. Submit and Resolve Insurance Claims
    console.log('10. Submitting and resolving claims...');
    // Apt 3 (Patient 1, Policy 1 - SLIC): Submit claim
    const inv3 = invoiceIds[3];
    const claimCheck3 = await client.query('SELECT claim_id FROM catms.insurance_claim WHERE invoice_id = $1', [inv3]);
    let claimId3: number;
    if (claimCheck3.rows.length === 0) {
      const clmRes3 = await client.query('SELECT catms.submit_claim($1, ARRAY[1]::BIGINT[], 1) AS ids', [inv3]);
      claimId3 = Number(clmRes3.rows[0].ids[0]);
      // Partially approve claim 3 for 1800 LKR (claimed was 2500.00)
      await client.query('SELECT catms.resolve_claim($1, $2, $3, 1)', [claimId3, 'PartiallyApproved', 1800.00]);
    } else {
      claimId3 = Number(claimCheck3.rows[0].claim_id);
    }

    // Apt 201 (Patient 2, Policy 2 - CEN): Submit claim
    const inv201 = invoiceIds[201];
    const claimCheck201 = await client.query('SELECT claim_id FROM catms.insurance_claim WHERE invoice_id = $1', [inv201]);
    let claimId201: number;
    if (claimCheck201.rows.length === 0) {
      const clmRes201 = await client.query('SELECT catms.submit_claim($1, ARRAY[2]::BIGINT[], 1) AS ids', [inv201]);
      claimId201 = Number(clmRes201.rows[0].ids[0]);
      // Approve claim 201 for 2000 LKR
      await client.query('SELECT catms.resolve_claim($1, $2, $3, 1)', [claimId201, 'Approved', 2000.00]);
    } else {
      claimId201 = Number(claimCheck201.rows[0].claim_id);
    }

    // 11. Payments via catms.post_payment_idempotent
    console.log('11. Ingesting payments via catms.post_payment_idempotent...');
    // Invoice 3 (Inv3): Insurer pays 1800, Patient pays partial 1500
    await client.query(
      `SELECT catms.post_payment_idempotent($1, 'Insurer', 1800.00, 'BankTransfer', 1, $2, $3, 'SLIC-SETTLE-001')`,
      [inv3, crypto.randomUUID(), claimId3]
    );
    await client.query(
      `SELECT catms.post_payment_idempotent($1, 'Patient', 1500.00, 'Cash', 1, $2, NULL, 'CASH-REC-001')`,
      [inv3, crypto.randomUUID()]
    );

    // Invoice 4 (Inv4): Subtotal 4000. Patient pays full 4000 (leaves 0 balance)
    const inv4 = invoiceIds[4];
    await client.query(
      `SELECT catms.post_payment_idempotent($1, 'Patient', 4000.00, 'Card', 1, $2, NULL, 'CARD-REC-002')`,
      [inv4, crypto.randomUUID()]
    );

    // Invoice 201 (Inv201): Insurer pays 2000, Patient pays 1700 (leaves 1000 balance)
    await client.query(
      `SELECT catms.post_payment_idempotent($1, 'Insurer', 2000.00, 'BankTransfer', 1, $2, $3, 'CEN-SETTLE-002')`,
      [inv201, crypto.randomUUID(), claimId201]
    );
    await client.query(
      `SELECT catms.post_payment_idempotent($1, 'Patient', 1700.00, 'Cash', 1, $2, NULL, 'CASH-REC-003')`,
      [inv201, crypto.randomUUID()]
    );

    // Invoice 202 (Inv202): Patient pays full 2050 (leaves 0 balance)
    const inv202 = invoiceIds[202];
    await client.query(
      `SELECT catms.post_payment_idempotent($1, 'Patient', 2050.00, 'Cash', 1, $2, NULL, 'CASH-REC-004')`,
      [inv202, crypto.randomUUID()]
    );

    // Invoice 301 (Inv301): Subtotal 2500. Patient pays partial 1000 (leaves 1500 balance)
    const inv301 = invoiceIds[301];
    await client.query(
      `SELECT catms.post_payment_idempotent($1, 'Patient', 1000.00, 'Card', 1, $2, NULL, 'CARD-REC-005')`,
      [inv301, crypto.randomUUID()]
    );

    // Invoice 302 (Inv302): Subtotal 6000. Patient pays full 6000 (leaves 0 balance)
    const inv302 = invoiceIds[302];
    await client.query(
      `SELECT catms.post_payment_idempotent($1, 'Patient', 6000.00, 'Card', 1, $2, NULL, 'CARD-REC-006')`,
      [inv302, crypto.randomUUID()]
    );

    // 12. Sequence synchronization
    console.log('12. Synchronizing database sequences...');
    await client.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN (
          SELECT table_schema, table_name, column_name,
                 pg_get_serial_sequence(table_schema || '.' || table_name, column_name) AS seq
          FROM information_schema.columns
          WHERE table_schema = 'catms'
            AND (column_default LIKE 'nextval%' OR is_identity = 'YES')
        ) LOOP
          IF r.seq IS NOT NULL THEN
            EXECUTE format(
              'SELECT setval(%L, coalesce((SELECT max(%I) FROM %I.%I), 1), true)',
              r.seq, r.column_name, r.table_schema, r.table_name
            );
          END IF;
        END LOOP;
      END $$;
    `);

    await client.query('COMMIT');
    console.log('🎉 Comprehensive presentation dataset successfully loaded via procedures!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to populate dataset:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
