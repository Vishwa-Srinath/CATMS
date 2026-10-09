import { describe, expect, it } from 'vitest';

import {
  databaseIdSchema,
  appointmentParamsSchema,
  recordConsultationBodySchema,
  amendConsultationBodySchema,
  recordClinicalBodySchema,
  createTreatmentBodySchema,
  createPaymentBodySchema,
  paymentPreviewBodySchema,
  reversePaymentBodySchema,
} from '../src/modules/clinical-billing/clinical.schemas';

describe('clinical request validation', () => {
  it('accepts a minimal consultation note', () => {
    expect(
      recordConsultationBodySchema.parse({
        notes: 'Patient reports headache.',
      }),
    ).toEqual({
      notes: 'Patient reports headache.',
    });
  });

  it('preserves the original clinical text', () => {
    const notes = '  First observation.\nSecond observation.  ';

    expect(
      recordConsultationBodySchema.parse({ notes }).notes,
    ).toBe(notes);
  });

  it.each(['', '   ', '\n\t'])(
    'rejects blank notes: %j',
    (notes) => {
      expect(
        recordConsultationBodySchema.safeParse({ notes }).success,
      ).toBe(false);
    },
  );

  it('rejects missing notes', () => {
    expect(
      recordConsultationBodySchema.safeParse({}).success,
    ).toBe(false);
  });

  it('accepts optional diagnosis and JSON vitals', () => {
    expect(
      recordConsultationBodySchema.safeParse({
        notes: 'Patient examined.',
        diagnosis_summary: 'Headache',
        vitals: {
          temperature_c: 37.2,
          pulse_bpm: 80,
        },
      }).success,
    ).toBe(true);
  });

  it('accepts null optional fields', () => {
    expect(
      recordConsultationBodySchema.safeParse({
        notes: 'Patient examined.',
        diagnosis_summary: null,
        vitals: null,
      }).success,
    ).toBe(true);
  });

  it('enforces the diagnosis length boundary', () => {
    expect(
      recordConsultationBodySchema.safeParse({
        notes: 'Patient examined.',
        diagnosis_summary: 'a'.repeat(300),
      }).success,
    ).toBe(true);

    expect(
      recordConsultationBodySchema.safeParse({
        notes: 'Patient examined.',
        diagnosis_summary: 'a'.repeat(301),
      }).success,
    ).toBe(false);
  });

  it('rejects a non-object vitals value', () => {
    expect(
      recordConsultationBodySchema.safeParse({
        notes: 'Patient examined.',
        vitals: 'normal',
      }).success,
    ).toBe(false);
  });

  it.each([
    'recorded_by_user_id',
    'appointment_id',
    'current_revision_no',
    'created_at',
    'price',
    'subtotal_amount',
  ])('rejects unexpected body field %s', (field) => {
    expect(
      recordClinicalBodySchema.safeParse({
        notes: 'Patient examined.',
        treatments: [{ treatmentId: '1', quantity: '1' }],
        [field]: '123',
      }).success,
    ).toBe(false);
  });

  it('requires an amendment reason', () => {
    expect(
      amendConsultationBodySchema.safeParse({
        notes: 'Updated findings.',
      }).success,
    ).toBe(false);
  });

  it.each(['', '   ', '\n'])(
    'rejects blank amendment reason: %j',
    (amendment_reason) => {
      expect(
        amendConsultationBodySchema.safeParse({
          notes: 'Updated findings.',
          amendment_reason,
        }).success,
      ).toBe(false);
    },
  );

  it('accepts a valid amendment', () => {
    expect(
      amendConsultationBodySchema.safeParse({
        notes: 'Updated findings.',
        amendment_reason: 'Additional examination findings.',
      }).success,
    ).toBe(true);
  });

  it('enforces the amendment reason length boundary', () => {
    for (const [length, expected] of [
      [250, true],
      [251, false],
    ] as const) {
      expect(
        amendConsultationBodySchema.safeParse({
          notes: 'Updated findings.',
          amendment_reason: 'a'.repeat(length),
        }).success,
      ).toBe(expected);
    }
  });

  it('preserves a BIGINT ID larger than a safe JavaScript integer', () => {
    expect(databaseIdSchema.parse('9007199254740993')).toBe(
      '9007199254740993',
    );
  });

  it('accepts the maximum positive PostgreSQL BIGINT', () => {
    expect(
      databaseIdSchema.safeParse('9223372036854775807').success,
    ).toBe(true);
  });

  it.each([
    '0',
    '-1',
    '1.5',
    '1e3',
    '01',
    'abc',
    '9223372036854775808',
    123,
    null,
  ])('rejects invalid ID %j', (value) => {
    expect(databaseIdSchema.safeParse(value).success).toBe(false);
  });

  it('accepts the proposed appointment parameter', () => {
    expect(
      appointmentParamsSchema.parse({
        appointment_id: '123',
      }),
    ).toEqual({
      appointment_id: '123',
    });
  });

  it('accepts clinical recording with treatments but no client prices', () => {
    expect(recordClinicalBodySchema.safeParse({
      notes: 'Care recorded.',
      treatments: [{
        treatmentId: '5',
        quantity: '2.00',
        clinicalComment: 'Dressing changed.',
      }],
    }).success).toBe(true);
  });

  it.each(['price', 'unitPrice', 'subtotal_amount', 'recorded_by_user_id'])(
    'rejects maintained clinical field %s',
    (field) => {
      expect(recordClinicalBodySchema.safeParse({
        notes: 'Care recorded.',
        [field]: '100.00',
      }).success).toBe(false);
    },
  );

  it('rejects a client-supplied treatment unit price', () => {
    expect(recordClinicalBodySchema.safeParse({
      notes: 'Care recorded.',
      treatments: [{
        treatmentId: '5',
        quantity: '1',
        unitPrice: '10.00',
      }],
    }).success).toBe(false);
  });

  it('requires at least one delivered treatment before invoice issuance', () => {
    expect(recordClinicalBodySchema.safeParse({
      notes: 'Care recorded.',
      treatments: [],
    }).success).toBe(false);
  });

  it('accepts a catalogue price as a decimal string, including zero', () => {
    expect(createTreatmentBodySchema.safeParse({
      treatmentCategoryId: '1',
      serviceCode: 'CONSULT',
      name: 'Consultation',
      currentPrice: '0.00',
      defaultDurationMinutes: 30,
    }).success).toBe(true);
  });

  it.each([123.45, '1.234', '-1.00', '10000000000.00', '01.00'])(
    'rejects unsafe monetary amount %j',
    (currentPrice) => {
      expect(createTreatmentBodySchema.safeParse({
        treatmentCategoryId: '1',
        serviceCode: 'CONSULT',
        name: 'Consultation',
        currentPrice,
        defaultDurationMinutes: 30,
      }).success).toBe(false);
    },
  );

  it('rejects server-maintained catalogue fields', () => {
    expect(createTreatmentBodySchema.safeParse({
      treatmentCategoryId: '1',
      serviceCode: 'CONSULT',
      name: 'Consultation',
      currentPrice: '100.00',
      defaultDurationMinutes: 30,
      isActive: false,
    }).success).toBe(false);
  });

  it('requires an approved claim reference for insurer previews', () => {
    expect(paymentPreviewBodySchema.safeParse({
      invoiceId: '1',
      payerType: 'Insurer',
    }).success).toBe(false);
  });

  it('rejects claim references on patient payment requests', () => {
    expect(paymentPreviewBodySchema.safeParse({
      invoiceId: '1',
      payerType: 'Patient',
      insuranceClaimId: '2',
    }).success).toBe(false);
  });

  it('requires idempotency key and string amount for a payment', () => {
    expect(createPaymentBodySchema.safeParse({
      invoiceId: '1',
      payerType: 'Patient',
      amount: '12.30',
      paymentMethod: 'Cash',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    }).success).toBe(true);
    expect(createPaymentBodySchema.safeParse({
      invoiceId: '1',
      payerType: 'Patient',
      amount: 12.3,
      paymentMethod: 'Cash',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    }).success).toBe(false);
  });

  it('rejects client-supplied financial snapshots in payment requests', () => {
    expect(createPaymentBodySchema.safeParse({
      invoiceId: '1',
      payerType: 'Patient',
      amount: '12.30',
      paymentMethod: 'Cash',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      patientLiabilityAmount: '0.00',
    }).success).toBe(false);
  });

  it('validates reversal reason and amount', () => {
    expect(reversePaymentBodySchema.safeParse({
      amount: '10.00',
      reason: 'Duplicate receipt',
    }).success).toBe(true);
    expect(reversePaymentBodySchema.safeParse({
      amount: '10.001',
      reason: 'Duplicate receipt',
    }).success).toBe(false);
  });
});