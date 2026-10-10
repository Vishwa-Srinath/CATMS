/**
 * src/modules/auth-staff/staff.schema.ts
 * Owner: Dev2 | Issue: CATMS-046
 *
 * Zod validation schemas for branches, employees, doctor profiles, and administration.
 *
 * Rules (CODEBASE_GUIDE.md §6):
 *   - Client-supplied IDs, status, and audit timestamps MUST be rejected or stripped.
 *   - All input data validated before any database or stored procedure call.
 */

import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

// ── Branch Schemas ──────────────────────────────────────────────────────────
export const createBranchSchema = z.object({
  branchCode: z
    .string({ required_error: 'Branch code is required.' })
    .trim()
    .min(2, 'Branch code must be at least 2 characters.')
    .max(10, 'Branch code must not exceed 10 characters.')
    .toUpperCase(),
  name: z
    .string({ required_error: 'Branch name is required.' })
    .trim()
    .min(2, 'Branch name must be at least 2 characters.')
    .max(120, 'Branch name must not exceed 120 characters.'),
  addressLine1: z
    .string({ required_error: 'Address line 1 is required.' })
    .trim()
    .min(1, 'Address line 1 cannot be empty.')
    .max(180),
  addressLine2: z.string().trim().max(180).optional(),
  city: z
    .string({ required_error: 'City is required.' })
    .trim()
    .min(1, 'City cannot be empty.')
    .max(80),
  district: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().max(20).optional(),
  contactPhone: z
    .string({ required_error: 'Contact phone is required.' })
    .trim()
    .min(7, 'Contact phone must be at least 7 digits.')
    .max(25),
  timeZone: z.string().trim().default('Asia/Colombo'),
}).strict({ message: 'Maintained or unexpected fields are not permitted.' });

export const updateBranchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  addressLine1: z.string().trim().min(1).max(180).optional(),
  addressLine2: z.string().trim().max(180).optional().nullable(),
  city: z.string().trim().min(1).max(80).optional(),
  district: z.string().trim().max(80).optional().nullable(),
  postalCode: z.string().trim().max(20).optional().nullable(),
  contactPhone: z.string().trim().min(7).max(25).optional(),
  isActive: z.boolean().optional(),
}).strict({ message: 'Maintained or unexpected fields are not permitted.' });

export const assignBranchManagerSchema = z.object({
  employeeId: z.coerce.number().int().positive({ message: 'Valid employeeId is required.' }),
  reason: z.string().trim().max(200).optional().default('Branch manager appointment'),
  effectiveDate: z.string().regex(dateRegex, 'Date format must be YYYY-MM-DD').optional(),
}).strict({ message: 'Maintained or unexpected fields are not permitted.' });

// ── Employee Schemas ────────────────────────────────────────────────────────
export const registerEmployeeSchema = z.object({
  employeeNumber: z
    .string({ required_error: 'Employee number is required.' })
    .trim()
    .min(3, 'Employee number must be at least 3 characters.')
    .max(30),
  nic: z
    .string({ required_error: 'NIC number is required.' })
    .trim()
    .min(9, 'NIC must be at least 9 characters.')
    .max(20),
  fullName: z
    .string({ required_error: 'Full name is required.' })
    .trim()
    .min(2, 'Full name must be at least 2 characters.')
    .max(150),
  genderCode: z
    .string({ required_error: 'Gender is required.' })
    .trim()
    .refine((g) => ['Male', 'Female', 'Other'].includes(g), {
      message: 'Gender must be Male, Female, or Other.',
    }),
  dateOfBirth: z
    .string({ required_error: 'Date of birth is required.' })
    .regex(dateRegex, 'Date format must be YYYY-MM-DD'),
  positionCode: z
    .string({ required_error: 'Position code is required.' })
    .trim()
    .min(2)
    .max(30),
  phone: z
    .string({ required_error: 'Phone number is required.' })
    .trim()
    .min(7)
    .max(25),
  branchId: z.coerce.number().int().positive({ message: 'Valid branchId is required.' }),
  email: z.string().trim().email('Valid email is required.').optional().nullable(),
  hireDate: z.string().regex(dateRegex, 'Date format must be YYYY-MM-DD').optional(),
  assignmentType: z.enum(['PRIMARY', 'SECONDARY']).default('PRIMARY'),
  username: z.string().trim().min(3).max(50).optional().nullable(),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(128).optional().nullable(),
  roleCode: z.string().trim().max(30).optional().nullable(),
}).strict({ message: 'Maintained or audit fields (status, IDs, timestamps) are rejected from input.' });

export const assignEmployeeBranchSchema = z.object({
  branchId: z.coerce.number().int().positive({ message: 'Valid branchId is required.' }),
  assignmentType: z.enum(['PRIMARY', 'SECONDARY']).default('PRIMARY'),
  effectiveDate: z.string().regex(dateRegex, 'Date format must be YYYY-MM-DD').optional(),
}).strict({ message: 'Maintained or unexpected fields are not permitted.' });

export const deactivateEmployeeSchema = z.object({
  reason: z.string().trim().max(255).optional().default('Staff deactivation'),
  effectiveDate: z.string().regex(dateRegex, 'Date format must be YYYY-MM-DD').optional(),
}).strict({ message: 'Maintained or unexpected fields are not permitted.' });

// ── Doctor Profile Schemas ──────────────────────────────────────────────────
export const registerDoctorSchema = z.object({
  employeeId: z.coerce.number().int().positive({ message: 'Valid employeeId is required.' }),
  medicalLicenseNo: z
    .string({ required_error: 'Medical license number is required.' })
    .trim()
    .min(2)
    .max(50),
  practiceStartDate: z.string().regex(dateRegex, 'Date format must be YYYY-MM-DD').optional(),
  defaultConsultationFee: z.coerce.number().min(0, 'Consultation fee cannot be negative.').optional().nullable(),
  specialtyIds: z.array(z.coerce.number().int().positive()).optional().default([]),
  primarySpecialtyId: z.coerce.number().int().positive().optional().nullable(),
}).strict({ message: 'Maintained or unexpected fields are not permitted.' });

// ── Admin User Schemas ──────────────────────────────────────────────────────
export const createAdminUserSchema = z.object({
  employeeId: z.coerce.number().int().positive({ message: 'Valid employeeId is required.' }),
  username: z
    .string({ required_error: 'Username is required.' })
    .trim()
    .min(3, 'Username must be at least 3 characters.')
    .max(50),
  password: z
    .string({ required_error: 'Password is required.' })
    .min(8, 'Password must be at least 8 characters.')
    .max(128),
  roleCode: z
    .string({ required_error: 'Role code is required.' })
    .trim()
    .min(2)
    .max(30),
  branchScopeId: z.coerce.number().int().positive().optional().nullable(),
}).strict({ message: 'Maintained or unexpected fields are not permitted.' });

export const updateUserRoleSchema = z.object({
  roleCode: z
    .string({ required_error: 'Role code is required.' })
    .trim()
    .min(2, 'Role code must be at least 2 characters.')
    .max(30),
  branchScopeId: z.coerce.number().int().positive().optional().nullable(),
}).strict({ message: 'Maintained or unexpected fields are not permitted.' });
