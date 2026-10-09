import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { ErrorCode } from '../src/shared/errors';

const { mockConnect, mockClientQuery, mockRelease } = vi.hoisted(() => ({
  mockConnect: vi.fn(),
  mockClientQuery: vi.fn(),
  mockRelease: vi.fn(),
}));

vi.mock('../src/shared/env', () => ({
  env: {
    NODE_ENV: 'test',
    API_PORT: 3001,
    POSTGRES_HOST: 'localhost',
    POSTGRES_PORT: 5432,
    POSTGRES_DB: 'catms_test',
    POSTGRES_USER: 'catms_app',
    POSTGRES_PASSWORD: 'catms_test_password',
    JWT_SECRET: 'a'.repeat(64),
    CSRF_SECRET: 'b'.repeat(32),
    COOKIE_SECURE: false,
    COOKIE_SAME_SITE: 'lax',
    COOKIE_MAX_AGE_SECONDS: 3600,
    ALLOWED_ORIGINS: 'http://localhost:5173',
    RATE_LIMIT_WINDOW_MS: 60_000,
    RATE_LIMIT_MAX: 200,
    LOG_LEVEL: 'silent',
  },
}));

vi.mock('../src/db/pool', () => ({
  pool: {
    connect: () => mockConnect(),
    query: vi.fn(),
  },
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { ClinicalService } from '../src/modules/clinical-billing/clinical.service';
import { PaymentsService } from '../src/modules/payments/payments.service';

function dbResult(rows: unknown[] = []) {
  return { rows, rowCount: rows.length };
}

describe('clinical and payment database workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClientQuery.mockResolvedValue(dbResult());
    mockConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockRelease,
    } as unknown as PoolClient);
  });

  it('rolls back the complete care record if a treatment fails its Completed gate', async () => {
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('lock_clinical_appointment')) {
        return dbResult([{ doctor_id: '42' }]);
      }
      if (sql.includes('record_consultation_note')) {
        return dbResult([{ consultation_note_id: '201' }]);
      }
      if (sql.includes('record_appointment_treatment')) {
        throw Object.assign(
          new Error('TREATMENT_REQUIRES_COMPLETED: Appointment must be Completed.'),
          { code: 'P0001' },
        );
      }
      return dbResult();
    });

    const service = new ClinicalService();
    await expect(service.recordClinical(
      '101',
      9,
      42,
      'Clinician',
      {
        notes: 'Care recorded.',
        treatments: [{ treatmentId: '7', quantity: '1.00' }],
      },
    )).rejects.toMatchObject({
      code: ErrorCode.APPOINTMENT_NOT_COMPLETED,
      statusCode: 422,
    });

    const statements = mockClientQuery.mock.calls.map(([sql]) => String(sql));
    expect(statements).toContain('BEGIN');
    expect(statements).toContain('SET LOCAL ROLE catms_clinician');
    expect(statements.some((sql) => sql.includes('record_consultation_note'))).toBe(true);
    expect(statements.some((sql) => sql.includes('record_appointment_treatment'))).toBe(true);
    expect(statements).toContain('ROLLBACK');
    expect(statements).not.toContain('COMMIT');
    expect(mockRelease).toHaveBeenCalledOnce();
  });

  it('records note, treatments and database-issued invoice in one transaction', async () => {
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('lock_clinical_appointment')) {
        return dbResult([{ doctor_id: '42' }]);
      }
      if (sql.includes('record_consultation_note')) {
        return dbResult([{ consultation_note_id: '201' }]);
      }
      if (sql.includes('record_appointment_treatment')) {
        return dbResult([{ appointment_treatment_id: '301' }]);
      }
      if (sql.includes('issue_invoice')) {
        return dbResult([{ invoice_id: '401' }]);
      }
      return dbResult();
    });

    const result = await new ClinicalService().recordClinical(
      '101',
      9,
      42,
      'Clinician',
      {
        notes: 'Care recorded.',
        treatments: [{ treatmentId: '7', quantity: '1.00' }],
      },
    );

    expect(result).toEqual({
      appointmentId: '101',
      consultationNoteId: '201',
      treatmentIds: ['301'],
      invoiceId: '401',
    });
    const statements = mockClientQuery.mock.calls.map(([sql]) => String(sql));
    expect(statements.indexOf('BEGIN')).toBeLessThan(statements.findIndex((sql) => sql.includes('record_consultation_note')));
    expect(statements.findIndex((sql) => sql.includes('record_consultation_note')))
      .toBeLessThan(statements.findIndex((sql) => sql.includes('record_appointment_treatment')));
    expect(statements.findIndex((sql) => sql.includes('record_appointment_treatment')))
      .toBeLessThan(statements.findIndex((sql) => sql.includes('issue_invoice')));
    expect(statements.indexOf('COMMIT')).toBeGreaterThan(statements.findIndex((sql) => sql.includes('issue_invoice')));
  });

  it("hides another clinician's appointment before attempting a clinical write", async () => {
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('lock_clinical_appointment')) {
        return dbResult([{ doctor_id: '99' }]);
      }
      return dbResult();
    });

    const service = new ClinicalService();
    await expect(service.recordClinical(
      '101',
      9,
      42,
      'Clinician',
      { notes: 'Unauthorized care.', treatments: [] },
    )).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });

    expect(mockClientQuery.mock.calls.some(([sql]) => String(sql).includes('record_consultation_note'))).toBe(false);
    expect(mockClientQuery.mock.calls.map(([sql]) => String(sql))).toContain('ROLLBACK');
  });

  it('maps a database overpayment rejection to the stable payment domain error', async () => {
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('post_payment_idempotent')) {
        throw Object.assign(
          new Error('PAYMENT_OVER_CAP: Patient receipt exceeds outstanding liability.'),
          { code: 'P0001' },
        );
      }
      return dbResult();
    });

    const service = new PaymentsService();
    await expect(service.post(9, {
      invoiceId: '100',
      payerType: 'Patient',
      amount: '500.00',
      paymentMethod: 'Cash',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    })).rejects.toMatchObject({
      code: ErrorCode.PAYMENT_OVERAGE,
      statusCode: 422,
    });

    expect(mockClientQuery.mock.calls.map(([sql]) => String(sql))).toContain('ROLLBACK');
  });

  it('delegates idempotency to the database procedure and returns its same receipt', async () => {
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('post_payment_idempotent')) {
        return dbResult([{ payment_id: '501' }]);
      }
      if (sql.includes('FROM catms.payment p')) {
        return dbResult([{
          payment_id: '501',
          invoice_id: '100',
          receipt_number: 'RCT-501',
          payer_type: 'Patient',
          insurance_claim_id: null,
          amount: '75.00',
          payment_method: 'Cash',
          payment_status: 'Settled',
          paid_at: '2026-10-01T10:00:00.000Z',
          reference_number: null,
          reversed_amount: '0.00',
          net_amount: '75.00',
          reversals: [],
        }]);
      }
      return dbResult();
    });

    const service = new PaymentsService();
    const input = {
      invoiceId: '100',
      payerType: 'Patient' as const,
      amount: '75.00',
      paymentMethod: 'Cash' as const,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    };
    const first = await service.post(9, input);
    const second = await service.post(9, input);

    expect(first.paymentId).toBe('501');
    expect(second.paymentId).toBe('501');
    const procedureCalls = mockClientQuery.mock.calls.filter(([sql]) =>
      String(sql).includes('post_payment_idempotent'),
    );
    expect(procedureCalls).toHaveLength(2);
    expect(procedureCalls[0]?.[1]).toContain(input.idempotencyKey);
    expect(procedureCalls[1]?.[1]).toContain(input.idempotencyKey);
    expect(mockClientQuery.mock.calls.some(([sql]) =>
      /^\s*INSERT\s+INTO\s+catms\.payment/i.test(String(sql)),
    )).toBe(false);
  });

  it('calculates the patient payment preview using PostgreSQL numeric values', async () => {
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('greatest(patient_liability_amount - patient_paid_amount')) {
        return dbResult([{ outstanding_amount: '125.10' }]);
      }
      if (sql.includes('FROM catms.invoice WHERE invoice_id')) {
        return dbResult([{ invoice_id: '100', invoice_state: 'Issued' }]);
      }
      return dbResult();
    });

    const result = await new PaymentsService().preview('100', 'Patient');
    expect(result).toEqual({
      invoiceId: '100',
      payerType: 'Patient',
      outstandingAmount: '125.10',
    });
    expect(mockClientQuery.mock.calls.some(([sql]) =>
      String(sql).includes('greatest(patient_liability_amount - patient_paid_amount'),
    )).toBe(true);
  });
});
