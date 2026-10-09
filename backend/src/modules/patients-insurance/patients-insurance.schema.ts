/**
 * src/modules/patients-insurance/patients-insurance.schema.ts
 * Owner: Dev3 | Issue: CATMS-048
 *
 * Zod validation schemas for Patient Identity, Emergency Contacts,
 * Insurance Providers, Policies, and Coverage Terms.
 *
 * Rules (CODEBASE_GUIDE.md §6, CATMS-003, CATMS-006, Dev3_Plan.md Step 11):
 *   - Client-supplied IDs, status, and audit timestamps MUST be rejected or stripped.
 *   - registered_by and registered_at cannot be supplied by client.
 *   - All input data validated before any database or stored procedure call.
 */

import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

// ── Patient Master & Registration Schemas ───────────────────────────────────

export const registerPatientSchema = z
  .object({
    firstName: z
      .string({ required_error: 'First name is required.' })
      .trim()
      .min(1, 'First name cannot be empty.')
      .max(100, 'First name must not exceed 100 characters.'),
    lastName: z
      .string({ required_error: 'Last name is required.' })
      .trim()
      .min(1, 'Last name cannot be empty.')
      .max(100, 'Last name must not exceed 100 characters.'),
    dateOfBirth: z
      .string({ required_error: 'Date of birth is required.' })
      .regex(dateRegex, 'Date format must be YYYY-MM-DD.')
      .refine(
        (val) => {
          const d = new Date(val);
          const today = new Date();
          return d <= today;
        },
        { message: 'Date of birth cannot be in the future.' },
      ),
    gender: z.enum(['Male', 'Female', 'Other'], {
      required_error: 'Gender is required.',
      invalid_type_error: 'Gender must be Male, Female, or Other.',
    }),
    contactNumber: z
      .string({ required_error: 'Contact number is required.' })
      .trim()
      .min(1, 'Contact number cannot be empty.')
      .max(30, 'Contact number must not exceed 30 characters.'),

    // Primary Identity
    identityType: z.enum(['NIC', 'Passport'], {
      required_error: 'Identity type is required.',
      invalid_type_error: 'Identity type must be NIC or Passport.',
    }),
    identityNumber: z
      .string({ required_error: 'Identity number is required.' })
      .trim()
      .min(1, 'Identity number cannot be empty.')
      .max(50, 'Identity number must not exceed 50 characters.'),

    // Primary Emergency Contact
    contactName: z
      .string({ required_error: 'Emergency contact name is required.' })
      .trim()
      .min(1, 'Emergency contact name cannot be empty.')
      .max(150, 'Emergency contact name must not exceed 150 characters.'),
    relationship: z
      .string({ required_error: 'Emergency contact relationship is required.' })
      .trim()
      .min(1, 'Emergency contact relationship cannot be empty.')
      .max(50, 'Emergency contact relationship must not exceed 50 characters.'),
    emergencyPhone: z
      .string({ required_error: 'Emergency contact phone is required.' })
      .trim()
      .min(1, 'Emergency contact phone cannot be empty.')
      .max(30, 'Emergency contact phone must not exceed 30 characters.'),

    // Optional demographic fields
    patientNumber: z.string().trim().max(32).optional(),
    bloodGroup: z
      .enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], {
        invalid_type_error: 'Invalid blood group.',
      })
      .nullable()
      .optional(),
    email: z
      .string()
      .trim()
      .email('Invalid email address format.')
      .max(255)
      .nullable()
      .optional(),
    address: z.string().trim().max(1000).nullable().optional(),
    registeredBranchId: z.coerce.number().int().positive().optional(),
  })
  .strict({ message: 'Maintained or unexpected fields (such as registered_by, registered_at) are not permitted.' });

export const updatePatientSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    dateOfBirth: z
      .string()
      .regex(dateRegex, 'Date format must be YYYY-MM-DD.')
      .refine(
        (val) => {
          const d = new Date(val);
          const today = new Date();
          return d <= today;
        },
        { message: 'Date of birth cannot be in the future.' },
      )
      .optional(),
    gender: z.enum(['Male', 'Female', 'Other']).optional(),
    bloodGroup: z
      .enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
      .nullable()
      .optional(),
    contactNumber: z.string().trim().min(1).max(30).optional(),
    email: z.string().trim().email('Invalid email address format.').max(255).nullable().optional(),
    address: z.string().trim().max(1000).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict({ message: 'Maintained or unexpected fields are not permitted.' });

export const patientSearchQuerySchema = z.object({
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  isActive: z.enum(['true', 'false', 'all']).optional().default('true'),
});

// ── Emergency Contact Schemas ────────────────────────────────────────────────

export const createEmergencyContactSchema = z
  .object({
    contactName: z
      .string({ required_error: 'Contact name is required.' })
      .trim()
      .min(1, 'Contact name cannot be empty.')
      .max(150),
    relationship: z
      .string({ required_error: 'Relationship is required.' })
      .trim()
      .min(1, 'Relationship cannot be empty.')
      .max(50),
    phoneNumber: z
      .string({ required_error: 'Phone number is required.' })
      .trim()
      .min(1, 'Phone number cannot be empty.')
      .max(30),
    isPrimary: z.boolean().optional().default(false),
  })
  .strict({ message: 'Maintained or unexpected fields are not permitted.' });

export const updateEmergencyContactSchema = z
  .object({
    contactName: z.string().trim().min(1).max(150).optional(),
    relationship: z.string().trim().min(1).max(50).optional(),
    phoneNumber: z.string().trim().min(1).max(30).optional(),
    isPrimary: z.boolean().optional(),
  })
  .strict({ message: 'Maintained or unexpected fields are not permitted.' });

// ── Patient Identity Schemas ─────────────────────────────────────────────────

export const createPatientIdentitySchema = z
  .object({
    identityType: z.enum(['NIC', 'Passport'], {
      required_error: 'Identity type is required.',
      invalid_type_error: 'Identity type must be NIC or Passport.',
    }),
    identityNumber: z
      .string({ required_error: 'Identity number is required.' })
      .trim()
      .min(1, 'Identity number cannot be empty.')
      .max(50),
    isPrimary: z.boolean().optional().default(false),
  })
  .strict({ message: 'Maintained or unexpected fields are not permitted.' });

// ── Insurance Provider Schemas ───────────────────────────────────────────────

export const createInsuranceProviderSchema = z
  .object({
    providerCode: z
      .string({ required_error: 'Provider code is required.' })
      .trim()
      .min(1, 'Provider code cannot be empty.')
      .max(50)
      .toUpperCase(),
    name: z
      .string({ required_error: 'Provider name is required.' })
      .trim()
      .min(1, 'Provider name cannot be empty.')
      .max(200),
    contactName: z.string().trim().max(150).nullable().optional(),
    contactPhone: z.string().trim().max(30).nullable().optional(),
    contactEmail: z.string().trim().email('Invalid email address.').max(255).nullable().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional().default('ACTIVE'),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .strict({ message: 'Maintained or unexpected fields are not permitted.' });

// ── Insurance Policy Schemas ─────────────────────────────────────────────────

export const createInsurancePolicySchema = z
  .object({
    patientId: z.coerce.number().int().positive({ message: 'Valid patientId is required.' }),
    providerId: z.coerce.number().int().positive({ message: 'Valid providerId is required.' }),
    policyNumber: z
      .string({ required_error: 'Policy number is required.' })
      .trim()
      .min(1, 'Policy number cannot be empty.')
      .max(100),
    validFrom: z
      .string({ required_error: 'validFrom date is required.' })
      .regex(dateRegex, 'Date format must be YYYY-MM-DD.'),
    validTo: z
      .string()
      .regex(dateRegex, 'Date format must be YYYY-MM-DD.')
      .nullable()
      .optional(),
    policyStatus: z.enum(['ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED']).optional().default('ACTIVE'),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .strict({ message: 'Maintained or unexpected fields are not permitted.' })
  .refine(
    (data) => {
      if (data.validTo && data.validTo < data.validFrom) {
        return false;
      }
      return true;
    },
    {
      message: 'Policy validTo date cannot precede validFrom date.',
      path: ['validTo'],
    },
  );

export const updatePolicyStatusSchema = z
  .object({
    policyStatus: z.enum(['ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED'], {
      required_error: 'Policy status is required.',
      invalid_type_error: 'Policy status must be ACTIVE, EXPIRED, SUSPENDED, or CANCELLED.',
    }),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict({ message: 'Maintained or unexpected fields are not permitted.' });

export const policyListQuerySchema = z.object({
  patientId: z.coerce.number().int().positive().optional(),
  providerId: z.coerce.number().int().positive().optional(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED']).optional(),
});

// ── Policy Coverage Schemas ──────────────────────────────────────────────────

export const addPolicyCoverageSchema = z
  .object({
    treatmentId: z.coerce.number().int().positive({ message: 'Valid treatmentId is required.' }),
    coveragePercentage: z.coerce
      .number({ required_error: 'Coverage percentage is required.' })
      .min(0, 'Coverage percentage must be between 0.00 and 100.00.')
      .max(100, 'Coverage percentage must be between 0.00 and 100.00.'),
    coverageCap: z.coerce
      .number()
      .min(0, 'Coverage cap cannot be negative.')
      .nullable()
      .optional(),
    effectiveFrom: z
      .string({ required_error: 'effectiveFrom date is required.' })
      .regex(dateRegex, 'Date format must be YYYY-MM-DD.'),
    effectiveTo: z
      .string()
      .regex(dateRegex, 'Date format must be YYYY-MM-DD.')
      .nullable()
      .optional(),
  })
  .strict({ message: 'Maintained or unexpected fields are not permitted.' })
  .refine(
    (data) => {
      if (data.effectiveTo && data.effectiveTo < data.effectiveFrom) {
        return false;
      }
      return true;
    },
    {
      message: 'Coverage effectiveTo cannot precede effectiveFrom.',
      path: ['effectiveTo'],
    },
  );

export const updatePolicyCoverageSchema = z
  .object({
    treatmentId: z.coerce.number().int().positive({ message: 'Valid treatmentId is required.' }),
    coveragePercentage: z.coerce
      .number({ required_error: 'Coverage percentage is required.' })
      .min(0, 'Coverage percentage must be between 0.00 and 100.00.')
      .max(100, 'Coverage percentage must be between 0.00 and 100.00.'),
    coverageCap: z.coerce
      .number()
      .min(0, 'Coverage cap cannot be negative.')
      .nullable()
      .optional(),
    effectiveFrom: z
      .string({ required_error: 'effectiveFrom date is required.' })
      .regex(dateRegex, 'Date format must be YYYY-MM-DD.'),
    effectiveTo: z
      .string()
      .regex(dateRegex, 'Date format must be YYYY-MM-DD.')
      .nullable()
      .optional(),
  })
  .strict({ message: 'Maintained or unexpected fields are not permitted.' })
  .refine(
    (data) => {
      if (data.effectiveTo && data.effectiveTo < data.effectiveFrom) {
        return false;
      }
      return true;
    },
    {
      message: 'Coverage effectiveTo cannot precede effectiveFrom.',
      path: ['effectiveTo'],
    },
  );

export const effectiveCoverageQuerySchema = z.object({
  treatmentId: z.coerce.number().int().positive({ message: 'Valid treatmentId is required.' }),
  serviceDate: z
    .string({ required_error: 'serviceDate is required.' })
    .regex(dateRegex, 'Date format must be YYYY-MM-DD.'),
});
