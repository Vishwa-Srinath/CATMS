import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const enabled = process.env.CATMS_LIVE_DB_TESTS === 'true';

describe.skipIf(!enabled)('payment and reversal idempotency against PostgreSQL', () => {
  let pool: typeof import('../src/db/pool').pool;
  let closePool: typeof import('../src/db/pool').closePool;
  let app: express.Express;
  let invoiceId: string;
  let actorId: number;
  let actorEmployeeId: number;

  beforeAll(async () => {
    process.env.NODE_ENV ??= 'test';
    process.env.POSTGRES_HOST ??= 'localhost';
    process.env.POSTGRES_PORT ??= '5433';
    process.env.POSTGRES_DB ??= 'catms_test';
    process.env.POSTGRES_USER ??= 'catms_super_test';
    process.env.POSTGRES_PASSWORD ??= 'catms_test_password';
    process.env.JWT_SECRET ??= 'a'.repeat(64);
    process.env.CSRF_SECRET ??= 'b'.repeat(32);

    const db = await import('../src/db/pool');
    pool = db.pool;
    closePool = db.closePool;
    const current = await pool.query<{ database_name: string }>(
      'SELECT current_database() AS database_name',
    );
    if (current.rows[0]?.database_name !== 'catms_test') {
      throw new Error('Live payment tests may only run against the disposable catms_test database.');
    }

    const suffix = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
    const phone = `077${String(Number.parseInt(suffix.slice(0, 6), 16)).padStart(7, '0').slice(-7)}`;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const branch = await client.query<{ branch_id: string }>(
        `INSERT INTO catms.branch (branch_code, name, address_line_1, city, contact_phone)
         VALUES ($1, $2, 'Test Address', 'Colombo', $3)
         RETURNING branch_id`,
        [`L${suffix}`, `Idempotency Test Branch ${suffix}`, phone],
      );
      const employee = await client.query<{ employee_id: string }>(
        `INSERT INTO catms.employee (
           employee_number, nic, full_name, gender_code, date_of_birth,
           position_code, phone, hire_date
         ) VALUES ($1, $2, 'Idempotency Test Doctor', 'Male', '1990-01-01', 'Doctor', $3, CURRENT_DATE)
         RETURNING employee_id`,
        [`L${suffix}`, `1990${suffix}`, phone],
      );
      actorEmployeeId = Number(employee.rows[0]!.employee_id);
      await client.query(
        `INSERT INTO catms.doctor_profile (doctor_id, medical_license_no, practice_start_date)
         VALUES ($1, $2, '2015-01-01')`,
        [actorEmployeeId, `L${suffix}`],
      );
      const specialty = await client.query<{ specialty_id: string }>(
        `INSERT INTO catms.specialty (specialty_code, name)
         VALUES ($1, $2) RETURNING specialty_id`,
        [`L${suffix}`, `Idempotency Test Specialty ${suffix}`],
      );
      await client.query(
        'INSERT INTO catms.doctor_specialty (doctor_id, specialty_id, is_primary) VALUES ($1, $2, TRUE)',
        [actorEmployeeId, specialty.rows[0]!.specialty_id],
      );
      const user = await client.query<{ user_account_id: string }>(
        `INSERT INTO catms.user_account (employee_id, username, password_hash)
         VALUES ($1, $2, 'TEST_ONLY_NOT_A_USABLE_PASSWORD_HASH') RETURNING user_account_id`,
        [actorEmployeeId, `live_${suffix.toLowerCase()}`],
      );
      actorId = Number(user.rows[0]!.user_account_id);
      await client.query(
        `INSERT INTO catms.user_account_role (user_account_id, app_role_id)
         SELECT $1, app_role_id FROM catms.app_role WHERE upper(role_code) = 'ADMIN'`,
        [actorId],
      );
      const patient = await client.query<{ patient_id: string }>(
        `INSERT INTO catms.patient (
           patient_number, first_name, last_name, date_of_birth, gender,
           contact_number, registered_branch_id, registered_by
         ) VALUES ($1, 'Test', 'Patient', '1995-01-01', 'Male', $2, $3, $4)
         RETURNING patient_id`,
        [`L${suffix}`, phone, branch.rows[0]!.branch_id, actorEmployeeId],
      );
      await client.query(
        `INSERT INTO catms.patient_identity (patient_id, identity_type, identity_number, is_primary)
         VALUES ($1, 'Passport', $2, TRUE)`,
        [patient.rows[0]!.patient_id, `L-${suffix}-PASS`],
      );
      await client.query(
        `INSERT INTO catms.emergency_contact (patient_id, contact_name, relationship, phone_number, is_primary)
         VALUES ($1, 'Test Contact', 'Sibling', $2, TRUE)`,
        [patient.rows[0]!.patient_id, phone],
      );
      const category = await client.query<{ treatment_category_id: string }>(
        `INSERT INTO catms.treatment_category (category_code, name)
         VALUES ($1, $2) RETURNING treatment_category_id`,
        [`L${suffix}`, `Idempotency Test Category ${suffix}`],
      );
      const treatment = await client.query<{ treatment_id: string }>(
        `INSERT INTO catms.treatment_catalogue (
           treatment_category_id, service_code, name, current_price,
           default_duration_minutes, is_consultation_service
         ) VALUES ($1, $2, 'Idempotency Test Service', 100.00, 15, FALSE)
         RETURNING treatment_id`,
        [category.rows[0]!.treatment_category_id, `L-${suffix}`],
      );
      const appointment = await client.query<{ appointment_id: string }>(
        `INSERT INTO catms.appointment (
           appointment_number, patient_id, doctor_id, branch_id, specialty_id,
           start_at, end_at, status, created_by
         ) VALUES ($1, $2, $3, $4, $5, date_trunc('hour', now()) - interval '2 days',
                   date_trunc('hour', now()) - interval '2 days' + interval '15 minutes', 'Completed', $6)
         RETURNING appointment_id`,
        [
          `L${suffix}`, patient.rows[0]!.patient_id, actorEmployeeId,
          branch.rows[0]!.branch_id, specialty.rows[0]!.specialty_id, actorId,
        ],
      );
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
      await client.query('SET CONSTRAINTS ALL DEFERRED');
      await client.query(
        'SELECT catms.record_appointment_treatment($1, $2, 1, $3)',
        [appointment.rows[0]!.appointment_id, treatment.rows[0]!.treatment_id, actorId],
      );
      const invoice = await client.query<{ issue_invoice: string }>(
        'SELECT catms.issue_invoice($1, $2) AS issue_invoice',
        [appointment.rows[0]!.appointment_id, actorId],
      );
      invoiceId = invoice.rows[0]!.issue_invoice;
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const [{ correlationId }, { errorHandler }, { paymentRouter }] = await Promise.all([
      import('../src/app/middleware/correlationId'),
      import('../src/app/middleware/errorHandler'),
      import('../src/modules/payments/payments.routes'),
    ]);
    app = express();
    app.use(correlationId);
    app.use(express.json());
    app.use('/api/v1/payments', paymentRouter);
    app.use(errorHandler);
  }, 30_000);

  afterAll(async () => {
    if (closePool) await closePool();
  });

  it('posts a payment once and returns the original reversal for a retry', async () => {
    const auth = jwt.sign({
      userId: actorId,
      employeeId: actorEmployeeId,
      username: 'live-test',
      role: 'Admin',
      branchId: 'all',
      fullName: 'Idempotency Test Doctor',
    }, process.env.JWT_SECRET ?? 'a'.repeat(64));
    const paymentKey = randomUUID();
    const reversalKey = randomUUID();
    const headers = { Authorization: `Bearer ${auth}` };
    const paymentBody = {
      invoiceId,
      payerType: 'Patient',
      amount: '100.00',
      paymentMethod: 'Cash',
      idempotencyKey: paymentKey,
    };

    const firstPayment = await request(app).post('/api/v1/payments').set(headers).send(paymentBody);
    const retryPayment = await request(app).post('/api/v1/payments').set(headers).send(paymentBody);
    expect(firstPayment.status, JSON.stringify(firstPayment.body)).toBe(200);
    expect(retryPayment.status, JSON.stringify(retryPayment.body)).toBe(200);
    expect(retryPayment.body.data.paymentId).toBe(firstPayment.body.data.paymentId);

    const reversalBody = {
      amount: '10.00',
      reason: 'Idempotency integration test',
      idempotencyKey: reversalKey,
    };
    const paymentId = firstPayment.body.data.paymentId as string;
    const firstReversal = await request(app)
      .post(`/api/v1/payments/${paymentId}/reverse`).set(headers).send(reversalBody);
    const retryReversal = await request(app)
      .post(`/api/v1/payments/${paymentId}/reverse`).set(headers).send(reversalBody);
    const conflictingRetry = await request(app)
      .post(`/api/v1/payments/${paymentId}/reverse`)
      .set(headers)
      .send({ ...reversalBody, amount: '11.00' });

    expect(firstReversal.status, JSON.stringify(firstReversal.body)).toBe(201);
    expect(retryReversal.status, JSON.stringify(retryReversal.body)).toBe(201);
    expect(conflictingRetry.status, JSON.stringify(conflictingRetry.body)).toBe(409);
    expect(retryReversal.body.data.paymentReversalId)
      .toBe(firstReversal.body.data.paymentReversalId);
    expect(retryReversal.body.data.payment.reversedAmount).toBe('10.00');

    const persisted = await pool.query<{ count: string; reversal_count: string }>(
      `SELECT count(*)::text AS count,
              (SELECT count(*)::text FROM catms.payment_reversal WHERE idempotency_key = $2::uuid) AS reversal_count
       FROM catms.payment WHERE idempotency_key = $1::uuid`,
      [paymentKey, reversalKey],
    );
    expect(persisted.rows[0]).toEqual({ count: '1', reversal_count: '1' });
  });
});
