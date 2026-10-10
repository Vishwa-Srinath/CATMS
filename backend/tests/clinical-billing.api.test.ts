import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { AppError, ErrorCode } from '../src/shared/errors';

const { clinicalService, paymentsService } = vi.hoisted(() => ({
  clinicalService: {
    listWorklist: vi.fn(),
    recordClinical: vi.fn(),
    amendClinical: vi.fn(),
    listTreatments: vi.fn(),
    listTreatmentCategories: vi.fn(),
    createTreatment: vi.fn(),
    updateTreatment: vi.fn(),
    deactivateTreatment: vi.fn(),
    listInvoices: vi.fn(),
    getInvoice: vi.fn(),
  },
  paymentsService: {
    preview: vi.fn(),
    list: vi.fn(),
    post: vi.fn(),
    reverse: vi.fn(),
  },
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

vi.mock('../src/modules/clinical-billing/clinical.service', () => ({ clinicalService }));
vi.mock('../src/modules/payments/payments.service', () => ({ paymentsService }));

import { correlationId } from '../src/app/middleware/correlationId';
import { errorHandler } from '../src/app/middleware/errorHandler';
import { clinicalRouter, invoiceRouter, treatmentRouter } from '../src/modules/clinical-billing/clinical.routes';
import { paymentRouter } from '../src/modules/payments/payments.routes';

const SECRET = 'a'.repeat(64);

function token(role: string, employeeId = 42): string {
  return jwt.sign({
    userId: 9,
    employeeId,
    username: 'test.user',
    role,
    branchId: 1,
    fullName: 'Test User',
  }, SECRET);
}

function createTestApp() {
  const app = express();
  app.use(correlationId);
  app.use(express.json());
  app.use('/api/v1/clinical', clinicalRouter);
  app.use('/api/v1/treatments', treatmentRouter);
  app.use('/api/v1/invoices', invoiceRouter);
  app.use('/api/v1/payments', paymentRouter);
  app.use(errorHandler);
  return app;
}

describe('clinical, invoice, catalogue and payment APIs (CATMS-052 through CATMS-054)', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records completed care as the authenticated clinician without accepting prices', async () => {
    clinicalService.recordClinical.mockResolvedValue({
      appointmentId: '101',
      consultationNoteId: '201',
      treatmentIds: ['301'],
      invoiceId: '401',
    });

    const response = await request(app)
      .post('/api/v1/clinical/101/record')
      .set('Authorization', `Bearer ${token('Clinician', 42)}`)
      .send({
        notes: 'Care delivered.',
        treatments: [{ treatmentId: '7', quantity: '1.00' }],
      });

    expect(response.status).toBe(201);
    expect(clinicalService.recordClinical).toHaveBeenCalledWith(
      '101',
      9,
      42,
      'Clinician',
      { notes: 'Care delivered.', treatments: [{ treatmentId: '7', quantity: '1.00' }] },
    );
  });

  it('scopes a clinician worklist by the authenticated doctor identity', async () => {
    clinicalService.listWorklist.mockResolvedValue([]);
    const response = await request(app)
      .get('/api/v1/clinical/worklist')
      .set('Authorization', `Bearer ${token('Clinician', 42)}`);

    expect(response.status).toBe(200);
    expect(clinicalService.listWorklist).toHaveBeenCalledWith(42, 'Clinician', undefined);
  });

  it('allows Admin worklist filtering by a validated branch ID', async () => {
    clinicalService.listWorklist.mockResolvedValue([]);
    const response = await request(app)
      .get('/api/v1/clinical/worklist?branchId=8')
      .set('Authorization', `Bearer ${token('Admin')}`);

    expect(response.status).toBe(200);
    expect(clinicalService.listWorklist).toHaveBeenCalledWith(42, 'Admin', '8');
  });

  it('rejects forged totals and does not call the clinical service', async () => {
    const response = await request(app)
      .post('/api/v1/clinical/101/record')
      .set('Authorization', `Bearer ${token('Clinician')}`)
      .send({ notes: 'Care delivered.', subtotal_amount: '0.00' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(clinicalService.recordClinical).not.toHaveBeenCalled();
  });

  it('appends an amendment only when an explanation is supplied', async () => {
    const response = await request(app)
      .post('/api/v1/clinical/101/revisions')
      .set('Authorization', `Bearer ${token('Clinician')}`)
      .send({ notes: 'Corrected findings.' });

    expect(response.status).toBe(422);
    expect(clinicalService.amendClinical).not.toHaveBeenCalled();
  });

  it('denies Reception clinical and invoice access', async () => {
    const clinical = await request(app)
      .get('/api/v1/clinical/worklist')
      .set('Authorization', `Bearer ${token('Reception')}`);
    const invoice = await request(app)
      .get('/api/v1/invoices/100')
      .set('Authorization', `Bearer ${token('Reception')}`);

    expect(clinical.status).toBe(403);
    expect(invoice.status).toBe(403);
    expect(clinicalService.listWorklist).not.toHaveBeenCalled();
    expect(clinicalService.getInvoice).not.toHaveBeenCalled();
  });

  it('allows only Admin to read inactive treatment catalogue rows', async () => {
    const response = await request(app)
      .get('/api/v1/treatments?includeInactive=true')
      .set('Authorization', `Bearer ${token('Reception')}`);

    expect(response.status).toBe(403);
    expect(clinicalService.listTreatments).not.toHaveBeenCalled();
  });

  it('denies Reception catalogue writes', async () => {
    const response = await request(app)
      .post('/api/v1/treatments')
      .set('Authorization', `Bearer ${token('Reception')}`)
      .send({
        treatmentCategoryId: '1',
        serviceCode: 'CONSULT',
        name: 'Consultation',
        currentPrice: '100.00',
        defaultDurationMinutes: 30,
      });

    expect(response.status).toBe(403);
    expect(clinicalService.createTreatment).not.toHaveBeenCalled();
  });

  it('returns persisted invoice snapshot values from the service unchanged', async () => {
    const invoice = {
      invoiceId: '100',
      invoiceNumber: 'INV-100',
      appointmentId: '101',
      invoiceState: 'Issued',
      currencyCode: 'LKR',
      subtotalAmount: '3500.00',
      approvedInsuranceAmount: '500.00',
      patientLiabilityAmount: '3000.00',
      patientPaidAmount: '1000.00',
      insurerPaidAmount: '500.00',
      patientPaymentStatus: 'PartiallyPaid',
      issuedAt: '2026-10-01T10:00:00.000Z',
      lines: [{
        invoiceLineId: '1',
        lineNumber: 1,
        serviceCode: 'CONSULT',
        description: 'Consultation',
        quantity: '1.00',
        unitPrice: '3500.00',
        lineTotal: '3500.00',
      }],
    };
    clinicalService.getInvoice.mockResolvedValue(invoice);

    const response = await request(app)
      .get('/api/v1/invoices/100')
      .set('Authorization', `Bearer ${token('Clinician', 42)}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(invoice);
  });

  it('lists invoice summaries only for Admin finance sessions', async () => {
    clinicalService.listInvoices.mockResolvedValue([{
      invoiceId: '100',
      invoiceNumber: 'INV-100',
      appointmentId: '101',
      appointmentNumber: 'APT-101',
      patientId: '22',
      patientNumber: 'PAT-22',
      patientName: 'Test Patient',
      invoiceState: 'Issued',
      currencyCode: 'LKR',
      subtotalAmount: '3500.00',
      approvedInsuranceAmount: '500.00',
      patientLiabilityAmount: '3000.00',
      patientPaidAmount: '1000.00',
      insurerPaidAmount: '0.00',
      patientPaymentStatus: 'PartiallyPaid',
      issuedAt: '2026-10-01T10:00:00.000Z',
      approvedClaims: [],
    }]);

    const response = await request(app)
      .get('/api/v1/invoices/')
      .set('Cookie', `catms_session=${token('Admin')}`)
      .set('Authorization', 'Bearer ' + token('Admin'));

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.data[0].patientLiabilityAmount).toBe('3000.00');
    expect(clinicalService.listInvoices).toHaveBeenCalledOnce();

    const denied = await request(app)
      .get('/api/v1/invoices/')
      .set('Cookie', `catms_session=${token('Clinician')}`)
      .set('Authorization', 'Bearer ' + token('Clinician'));
    expect(denied.status).toBe(403);
    expect(clinicalService.listInvoices).toHaveBeenCalledOnce();
  });

  it('denies Reception payment preview/post/reversal operations', async () => {
    const headers = { Authorization: `Bearer ${token('Reception')}` };
    const preview = await request(app)
      .post('/api/v1/payments/preview')
      .set(headers)
      .send({ invoiceId: '100', payerType: 'Patient' });
    const post = await request(app)
      .post('/api/v1/payments')
      .set(headers)
      .send({});
    const reverse = await request(app)
      .post('/api/v1/payments/5/reverse')
      .set(headers)
      .send({ amount: '1.00', reason: 'Correction' });

    expect([preview.status, post.status, reverse.status]).toEqual([403, 403, 403]);
    expect(paymentsService.preview).not.toHaveBeenCalled();
    expect(paymentsService.post).not.toHaveBeenCalled();
    expect(paymentsService.reverse).not.toHaveBeenCalled();
  });

  it('posts a payment with the idempotency key and authenticated actor', async () => {
    const payment = {
      paymentId: '55',
      invoiceId: '100',
      receiptNumber: 'RCT-55',
      payerType: 'Patient',
      insuranceClaimId: null,
      amount: '100.00',
      paymentMethod: 'Cash',
      paymentStatus: 'Settled',
      paidAt: '2026-10-01T10:00:00.000Z',
      referenceNumber: null,
      reversedAmount: '0.00',
      netAmount: '100.00',
      reversals: [],
    };
    paymentsService.post.mockResolvedValue(payment);

    const response = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${token('Admin')}`)
      .send({
        invoiceId: '100',
        payerType: 'Patient',
        amount: '100.00',
        paymentMethod: 'Cash',
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(payment);
    expect(paymentsService.post).toHaveBeenCalledWith(9, {
      invoiceId: '100',
      payerType: 'Patient',
      amount: '100.00',
      paymentMethod: 'Cash',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('previews an insurer payment only with a claim reference', async () => {
    const response = await request(app)
      .post('/api/v1/payments/preview')
      .set('Authorization', `Bearer ${token('Admin')}`)
      .send({ invoiceId: '100', payerType: 'Insurer' });

    expect(response.status).toBe(422);
    expect(paymentsService.preview).not.toHaveBeenCalled();
  });

  it('records a reversal using the authenticated administrator as actor', async () => {
    paymentsService.reverse.mockResolvedValue({
      paymentReversalId: '802',
      payment: {
        paymentId: '55',
        invoiceId: '100',
        receiptNumber: 'RCT-55',
        payerType: 'Patient',
        insuranceClaimId: null,
        amount: '75.00',
        paymentMethod: 'Cash',
        paymentStatus: 'PartiallyReversed',
        paidAt: '2026-10-01T10:00:00.000Z',
        referenceNumber: null,
        reversedAmount: '10.00',
        netAmount: '65.00',
        reversals: [],
      },
    });
    const response = await request(app)
      .post('/api/v1/payments/55/reverse')
      .set('Authorization', `Bearer ${token('Admin')}`)
      .send({ amount: '10.00', reason: 'Duplicate receipt' });

    expect(response.status).toBe(201);
    expect(paymentsService.reverse).toHaveBeenCalledWith(
      '55',
      9,
      '10.00',
      'Duplicate receipt',
    );
  });

  it('returns a sanitized domain error when the database rejects overpayment', async () => {
    paymentsService.post.mockRejectedValue(
      new AppError(ErrorCode.PAYMENT_OVERAGE, 'Payment amount exceeds the outstanding balance.', 422),
    );
    const response = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${token('Admin')}`)
      .send({
        invoiceId: '100',
        payerType: 'Patient',
        amount: '999999.00',
        paymentMethod: 'Cash',
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe(ErrorCode.PAYMENT_OVERAGE);
    expect(JSON.stringify(response.body)).not.toContain('SQL');
  });

  it('rejects a request without an idempotency key before service execution', async () => {
    const response = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${token('Admin')}`)
      .send({
        invoiceId: '100',
        payerType: 'Patient',
        amount: '20.00',
        paymentMethod: 'Cash',
      });

    expect(response.status).toBe(422);
    expect(paymentsService.post).not.toHaveBeenCalled();
  });
});
