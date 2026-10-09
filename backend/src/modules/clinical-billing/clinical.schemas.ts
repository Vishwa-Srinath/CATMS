import { z } from 'zod';

// PostgreSQL BIGINT can exceed JavaScript's safe integer range.
// Keep IDs as decimal strings instead of converting them to Number.
const MAX_BIGINT = '9223372036854775807';

export const databaseIdSchema = z
  .string()
  .regex(/^[1-9][0-9]*$/, 'ID must be a positive integer string')
  .max(19, 'ID exceeds the PostgreSQL BIGINT range')
  .refine(
    (value) =>
      value.length < MAX_BIGINT.length ||
      (value.length === MAX_BIGINT.length && value <= MAX_BIGINT),
    'ID exceeds the PostgreSQL BIGINT range',
  );

// Check for meaningful content without modifying the original notes.
const nonBlankTextSchema = z
  .string()
  .refine((value) => value.trim().length > 0, 'Must not be blank');

// Count Unicode characters rather than JavaScript UTF-16 code units.
const diagnosisSchema = z
  .string()
  .refine(
    (value) => Array.from(value).length <= 300,
    'Diagnosis summary must not exceed 300 characters',
  );

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

// Validate JSON values without inventing medical measurement rules.
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);

// Proposed API contract: vitals is a JSON object when supplied.
// Specific measurement names and units can be agreed separately.
const vitalsSchema = z.record(jsonValueSchema);

export const appointmentParamsSchema = z
  .object({
    appointment_id: databaseIdSchema,
  })
  .strict();

export const recordConsultationBodySchema = z
  .object({
    notes: nonBlankTextSchema,
    diagnosis_summary: diagnosisSchema.nullable().optional(),
    vitals: vitalsSchema.nullable().optional(),
  })
  .strict();

export const amendConsultationBodySchema =
  recordConsultationBodySchema
    .extend({
      amendment_reason: nonBlankTextSchema.refine(
        (value) => Array.from(value).length <= 250,
        'Amendment reason must not exceed 250 characters',
      ),
    })
    .strict();

const positiveDecimalSchema = z
  .string()
  .regex(/^(?:0|[1-9][0-9]{0,5})(?:\.[0-9]{1,2})?$/, 'Use a positive decimal with at most two decimal places')
  .refine((value) => Number(value) > 0, 'Value must be greater than zero');

const nonNegativeMoneySchema = z
  .string()
  .regex(/^(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,2})?$/, 'Use a monetary amount with at most two decimal places');

export const clinicalTreatmentInputSchema = z.object({
  treatmentId: databaseIdSchema,
  quantity: positiveDecimalSchema,
  clinicalComment: z.string().max(300).nullable().optional(),
}).strict();

export const recordClinicalBodySchema = recordConsultationBodySchema
  .extend({
    treatments: z.array(clinicalTreatmentInputSchema).min(1),
  })
  .strict();

export const createTreatmentBodySchema = z.object({
  treatmentCategoryId: databaseIdSchema,
  serviceCode: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(300).nullable().optional(),
  currentPrice: nonNegativeMoneySchema,
  defaultDurationMinutes: z.number().int().positive().max(32767),
  isConsultationService: z.boolean().optional().default(false),
}).strict();

export const updateTreatmentBodySchema = z.object({
  treatmentCategoryId: databaseIdSchema.optional(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(300).nullable().optional(),
  currentPrice: nonNegativeMoneySchema.optional(),
  defaultDurationMinutes: z.number().int().positive().max(32767).optional(),
  isConsultationService: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one catalogue field must be supplied.',
});

export const treatmentListQuerySchema = z.object({
  categoryId: databaseIdSchema.optional(),
  includeInactive: z.enum(['true', 'false']).optional().default('false'),
}).strict();

export const clinicalWorklistQuerySchema = z.object({
  branchId: databaseIdSchema.optional(),
}).strict();

export const invoiceParamsSchema = z.object({
  invoice_id: databaseIdSchema,
}).strict();

const paymentPayerSchema = z.object({
  invoiceId: databaseIdSchema,
  payerType: z.enum(['Patient', 'Insurer']),
  insuranceClaimId: databaseIdSchema.optional(),
});

function validatePaymentPayer(
  value: z.infer<typeof paymentPayerSchema>,
  context: z.RefinementCtx,
): void {
  if (value.payerType === 'Insurer' && !value.insuranceClaimId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['insuranceClaimId'],
      message: 'An approved insurance claim is required for an insurer payment.',
    });
  }
  if (value.payerType === 'Patient' && value.insuranceClaimId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['insuranceClaimId'],
      message: 'Patient payments cannot reference an insurance claim.',
    });
  }
}

export const paymentPreviewBodySchema = paymentPayerSchema
  .strict()
  .superRefine(validatePaymentPayer);

export const createPaymentBodySchema = z.object({
  invoiceId: databaseIdSchema,
  payerType: z.enum(['Patient', 'Insurer']),
  insuranceClaimId: databaseIdSchema.optional(),
  amount: nonNegativeMoneySchema.refine((value) => Number(value) > 0, 'Amount must be greater than zero'),
  paymentMethod: z.enum(['Cash', 'Card', 'BankTransfer', 'Online']),
  idempotencyKey: z.string().uuid(),
  referenceNumber: z.string().max(100).nullable().optional(),
}).strict().superRefine(validatePaymentPayer);

export const listPaymentsQuerySchema = z.object({
  invoiceId: databaseIdSchema,
}).strict();

export const reversePaymentParamsSchema = z.object({
  payment_id: databaseIdSchema,
}).strict();

export const reversePaymentBodySchema = z.object({
  amount: nonNegativeMoneySchema.refine((value) => Number(value) > 0, 'Amount must be greater than zero'),
  reason: nonBlankTextSchema.refine(
    (value) => Array.from(value).length <= 250,
    'Reason must not exceed 250 characters',
  ),
}).strict();

export type AppointmentParams = z.infer<
  typeof appointmentParamsSchema
>;

export type RecordConsultationBody = z.infer<
  typeof recordConsultationBodySchema
>;

export type AmendConsultationBody = z.infer<
  typeof amendConsultationBodySchema
>;

export type RecordClinicalBody = z.infer<typeof recordClinicalBodySchema>;
export type CreateTreatmentBody = z.infer<typeof createTreatmentBodySchema>;
export type UpdateTreatmentBody = z.infer<typeof updateTreatmentBodySchema>;
export type CreatePaymentBody = z.infer<typeof createPaymentBodySchema>;