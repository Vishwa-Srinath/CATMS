/**
 * backend/tests/patients-insurance.test.ts
 * Owner: Dev3 | Issue: CATMS-048
 *
 * Supertest integration test suite for Patient and Insurance Terms APIs:
 *   - GET  /api/v1/patients/search               (Clinic-wide search ignoring branch)
 *   - GET  /api/v1/patients                      (Clinic-wide listing)
 *   - POST /api/v1/patients                      (Atomic registration via catms.register_patient)
 *   - GET  /api/v1/patients/:id                  (Patient profile, identities, contacts, policies)
 *   - PUT  /api/v1/patients/:id                  (Update demographic details)
 *   - GET, POST, PUT, DELETE /api/v1/patients/:id/contacts (Emergency contacts CRUD)
 *   - GET, POST /api/v1/patients/:id/identities  (Patient identities)
 *   - GET, POST /api/v1/insurance/providers      (Insurance providers — Admin only for creation)
 *   - GET, POST /api/v1/insurance/policies       (Insurance policies & patient attachment)
 *   - PATCH /api/v1/insurance/policies/:id/status(Policy lifecycle transitions)
 *   - GET, POST, PUT /api/v1/insurance/policies/:id/coverages (Coverage lifecycle terms)
 *   - GET  /api/v1/insurance/policies/:id/effective-coverage  (Eligibility check)
 *
 * Asserts:
 *   1. Full HTTP contracts, Zod schemas, and data types.
 *   2. Identity data validated and clinic-wide uniqueness guarded (409 CONFLICT).
 *   3. Rejection of client-supplied maintained/audit fields (registered_by, registered_at).
 *   4. Clinic-wide search ignores registration branch for accessibility.
 *   5. Atomic registration invokes procedure and creates patient + identity + contact.
 *   6. Multi-layer role security (Admin, Reception, Clinician, Manager, QA).
 *   7. Coverage lifecycle updates close prior terms without raw mutation.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { PoolClient } from 'pg';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'a'.repeat(64);

// ── Mock shared/env ──────────────────────────────────────────────────────────
vi.mock('../src/shared/env', () => ({
  env: {
    NODE_ENV:               'test',
    API_PORT:               3001,
    POSTGRES_HOST:          'localhost',
    POSTGRES_PORT:          5432,
    POSTGRES_DB:            'catms_test',
    POSTGRES_USER:          'catms_app',
    POSTGRES_PASSWORD:      'catms_test_password',
    JWT_SECRET:             'a'.repeat(64),
    CSRF_SECRET:            'b'.repeat(32),
    COOKIE_SECURE:          false,
    COOKIE_SAME_SITE:       'lax',
    COOKIE_MAX_AGE_SECONDS: 3600,
    ALLOWED_ORIGINS:        'http://localhost:5173',
    RATE_LIMIT_WINDOW_MS:   60_000,
    RATE_LIMIT_MAX:         200,
    LOG_LEVEL:              'silent',
  },
}));

// ── In-Memory Fixtures ───────────────────────────────────────────────────────

interface PatientRow {
  patient_id: number;
  patient_number: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: 'Male' | 'Female' | 'Other';
  blood_group: string | null;
  contact_number: string;
  email: string | null;
  address: string | null;
  registered_branch_id: number | null;
  registered_branch_name?: string | null;
  registered_by: number | null;
  registered_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface IdentityRow {
  identity_id: number;
  patient_id: number;
  identity_type: 'NIC' | 'Passport';
  identity_number: string;
  is_primary: boolean;
  created_at: string;
}

interface EmergencyContactRow {
  contact_id: number;
  patient_id: number;
  contact_name: string;
  relationship: string;
  phone_number: string;
  is_primary: boolean;
  created_at: string;
}

interface ProviderRow {
  provider_id: number;
  provider_code: string;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface PolicyRow {
  policy_id: number;
  patient_id: number;
  provider_id: number;
  policy_number: string;
  policy_status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED';
  valid_from: string;
  valid_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface CoverageRow {
  coverage_id: number;
  policy_id: number;
  treatment_id: number;
  treatment_name?: string | null;
  service_code?: string | null;
  coverage_percentage: number;
  coverage_cap: number | null;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
}

let patients: PatientRow[] = [];
let identities: IdentityRow[] = [];
let emergencyContacts: EmergencyContactRow[] = [];
let providers: ProviderRow[] = [];
let policies: PolicyRow[] = [];
let coverages: CoverageRow[] = [];
const executedProcedures: Array<{ name: string; params: unknown[] }> = [];

const treatments = [
  { treatment_id: 1, service_code: 'SRV-001', name: 'General Consultation' },
  { treatment_id: 2, service_code: 'SRV-002', name: 'Dental Cleaning' },
  { treatment_id: 3, service_code: 'SRV-003', name: 'Complete Blood Count' },
];

function resetFixtures() {
  executedProcedures.length = 0;

  patients = [
    {
      patient_id: 1,
      patient_number: 'PAT-20261001-0001',
      first_name: 'Nimal',
      last_name: 'Perera',
      date_of_birth: '1985-04-12',
      gender: 'Male',
      blood_group: 'O+',
      contact_number: '+94 77 111 2222',
      email: 'nimal.perera@example.lk',
      address: '10 Galle Road, Colombo',
      registered_branch_id: 1,
      registered_branch_name: 'MedSync Colombo Main',
      registered_by: 1,
      registered_at: '2026-10-01T08:00:00.000Z',
      is_active: true,
      created_at: '2026-10-01T08:00:00.000Z',
      updated_at: '2026-10-01T08:00:00.000Z',
    },
    {
      patient_id: 2,
      patient_number: 'PAT-20261002-0002',
      first_name: 'Sunethra',
      last_name: 'Silva',
      date_of_birth: '1992-08-25',
      gender: 'Female',
      blood_group: 'B+',
      contact_number: '+94 71 333 4444',
      email: 'sunethra.s@example.lk',
      address: '45 Lake Road, Kandy',
      registered_branch_id: 2,
      registered_branch_name: 'MedSync Kandy Central',
      registered_by: 2,
      registered_at: '2026-10-02T09:30:00.000Z',
      is_active: true,
      created_at: '2026-10-02T09:30:00.000Z',
      updated_at: '2026-10-02T09:30:00.000Z',
    },
  ];

  identities = [
    {
      identity_id: 1,
      patient_id: 1,
      identity_type: 'NIC',
      identity_number: '198510203040',
      is_primary: true,
      created_at: '2026-10-01T08:00:00.000Z',
    },
    {
      identity_id: 2,
      patient_id: 2,
      identity_type: 'NIC',
      identity_number: '199260708090',
      is_primary: true,
      created_at: '2026-10-02T09:30:00.000Z',
    },
  ];

  emergencyContacts = [
    {
      contact_id: 1,
      patient_id: 1,
      contact_name: 'Kumari Perera',
      relationship: 'Spouse',
      phone_number: '+94 77 999 8888',
      is_primary: true,
      created_at: '2026-10-01T08:00:00.000Z',
    },
    {
      contact_id: 2,
      patient_id: 2,
      contact_name: 'Anura Silva',
      relationship: 'Father',
      phone_number: '+94 71 888 7777',
      is_primary: true,
      created_at: '2026-10-02T09:30:00.000Z',
    },
  ];

  providers = [
    {
      provider_id: 1,
      provider_code: 'SLIC',
      name: 'Sri Lanka Insurance Corporation',
      contact_name: 'Claims Department',
      contact_phone: '+94 11 235 7000',
      contact_email: 'claims@slic.lk',
      status: 'ACTIVE',
      notes: 'Premier state insurance provider',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      provider_id: 2,
      provider_code: 'AIA',
      name: 'AIA Insurance Lanka',
      contact_name: 'Health Desk',
      contact_phone: '+94 11 244 5566',
      contact_email: 'health@aia.com',
      status: 'ACTIVE',
      notes: 'Private health insurance partner',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      provider_id: 3,
      provider_code: 'OLD-INS',
      name: 'Defunct Insurance Co',
      contact_name: null,
      contact_phone: null,
      contact_email: null,
      status: 'INACTIVE',
      notes: 'No longer accepting new claims',
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-01-01T00:00:00.000Z',
    },
  ];

  policies = [
    {
      policy_id: 1,
      patient_id: 1,
      provider_id: 1,
      policy_number: 'SLIC-POL-99001',
      policy_status: 'ACTIVE',
      valid_from: '2026-01-01',
      valid_to: '2026-12-31',
      notes: 'Comprehensive annual medical cover',
      created_at: '2026-10-01T08:00:00.000Z',
      updated_at: '2026-10-01T08:00:00.000Z',
    },
  ];

  coverages = [
    {
      coverage_id: 1,
      policy_id: 1,
      treatment_id: 1,
      treatment_name: 'General Consultation',
      service_code: 'SRV-001',
      coverage_percentage: 80.0,
      coverage_cap: 3000.0,
      effective_from: '2026-01-01',
      effective_to: null,
      created_at: '2026-10-01T08:00:00.000Z',
    },
  ];
}

// ── Mock Pool & Transactions ─────────────────────────────────────────────────

vi.mock('../src/db/pool', () => ({
  pool: {
    query: vi.fn(async (text: string, params: unknown[] = []) => {
      // 1. SELECT patients list & search
      if (text.includes('FROM catms.patient p') && text.includes('LIMIT')) {
        let filtered = [...patients];

        if (text.includes('p.is_active = TRUE')) {
          filtered = filtered.filter((p) => p.is_active);
        } else if (text.includes('p.is_active = FALSE')) {
          filtered = filtered.filter((p) => !p.is_active);
        }

        // q search parameter
        const qParam = params.find((p) => typeof p === 'string' && p.startsWith('%') && p.endsWith('%')) as
          | string
          | undefined;

        if (qParam) {
          const rawQ = qParam.slice(1, -1).toLowerCase();
          filtered = filtered.filter((p) => {
            const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
            const primId = identities.find((id) => id.patient_id === p.patient_id && id.is_primary);
            return (
              p.patient_number.toLowerCase().includes(rawQ) ||
              p.first_name.toLowerCase().includes(rawQ) ||
              p.last_name.toLowerCase().includes(rawQ) ||
              fullName.includes(rawQ) ||
              p.contact_number.toLowerCase().includes(rawQ) ||
              (p.email && p.email.toLowerCase().includes(rawQ)) ||
              (primId && primId.identity_number.toLowerCase().includes(rawQ))
            );
          });
        }

        const rows = filtered.map((p) => {
          const primId = identities.find((id) => id.patient_id === p.patient_id && id.is_primary);
          const primContact = emergencyContacts.find((ec) => ec.patient_id === p.patient_id && ec.is_primary);
          return {
            ...p,
            identity_id: primId?.identity_id ?? null,
            identity_type: primId?.identity_type ?? null,
            identity_number: primId?.identity_number ?? null,
            identity_is_primary: primId?.is_primary ?? null,
            identity_created_at: primId?.created_at ?? null,
            contact_id: primContact?.contact_id ?? null,
            contact_name: primContact?.contact_name ?? null,
            relationship: primContact?.relationship ?? null,
            emergency_phone_number: primContact?.phone_number ?? null,
            contact_is_primary: primContact?.is_primary ?? null,
            contact_created_at: primContact?.created_at ?? null,
          };
        });

        return { rows };
      }

      // 2. SELECT single patient
      if (text.includes('FROM catms.patient p') && text.includes('WHERE p.patient_id = $1')) {
        const id = Number(params[0]);
        const p = patients.find((pt) => pt.patient_id === id);
        return { rows: p ? [p] : [] };
      }

      // 3. SELECT identities by patient_id
      if (text.includes('FROM catms.patient_identity') && text.includes('WHERE patient_id = $1')) {
        const pId = Number(params[0]);
        const matched = identities.filter((id) => id.patient_id === pId);
        return { rows: matched };
      }

      // 4. SELECT emergency contacts by patient_id
      if (text.includes('FROM catms.emergency_contact') && text.includes('WHERE patient_id = $1')) {
        const pId = Number(params[0]);
        const matched = emergencyContacts.filter((ec) => ec.patient_id === pId);
        return { rows: matched };
      }

      // 5. SELECT policies by patient_id
      if (text.includes('FROM catms.insurance_policy pol') && text.includes('WHERE pol.patient_id = $1')) {
        const pId = Number(params[0]);
        const matched = policies
          .filter((pol) => pol.patient_id === pId)
          .map((pol) => {
            const prov = providers.find((pr) => pr.provider_id === pol.provider_id);
            return {
              ...pol,
              provider_code: prov?.provider_code,
              provider_name: prov?.name,
            };
          });
        return { rows: matched };
      }

      // 6. SELECT providers list
      if (text.includes('FROM catms.insurance_provider')) {
        if (text.includes('WHERE provider_id = $1')) {
          const provId = Number(params[0]);
          const found = providers.find((pr) => pr.provider_id === provId);
          return { rows: found ? [found] : [] };
        }
        if (text.includes('WHERE status = $1')) {
          const st = String(params[0]);
          return { rows: providers.filter((pr) => pr.status === st) };
        }
        return { rows: providers };
      }

      // 7. SELECT policies list with filters
      if (text.includes('FROM catms.insurance_policy pol')) {
        if (text.includes('WHERE pol.policy_id = $1')) {
          const polId = Number(params[0]);
          const found = policies.find((p) => p.policy_id === polId);
          if (!found) return { rows: [] };
          const prov = providers.find((pr) => pr.provider_id === found.provider_id);
          return {
            rows: [
              {
                ...found,
                provider_code: prov?.provider_code,
                provider_name: prov?.name,
              },
            ],
          };
        }

        let filtered = [...policies];
        if (text.includes('pol.patient_id = $')) {
          const pId = Number(params[0]);
          filtered = filtered.filter((p) => p.patient_id === pId);
        }
        if (text.includes('pol.provider_id = $')) {
          const prId = Number(params[1] ?? params[0]);
          filtered = filtered.filter((p) => p.provider_id === prId);
        }
        if (text.includes('pol.policy_status = $')) {
          const st = String(params[params.length - 1]);
          filtered = filtered.filter((p) => p.policy_status === st);
        }

        const rows = filtered.map((pol) => {
          const prov = providers.find((pr) => pr.provider_id === pol.provider_id);
          return {
            ...pol,
            provider_code: prov?.provider_code,
            provider_name: prov?.name,
          };
        });
        return { rows };
      }

      // 8. SELECT policy coverages
      if (text.includes('FROM catms.policy_coverage c')) {
        const polId = Number(params[0]);
        const matched = coverages
          .filter((c) => c.policy_id === polId)
          .map((c) => {
            const tr = treatments.find((t) => t.treatment_id === c.treatment_id);
            return {
              ...c,
              treatment_name: tr?.name,
              service_code: tr?.service_code,
            };
          });
        return { rows: matched };
      }

      // 9. Check policy exists
      if (text.includes('SELECT policy_id FROM catms.insurance_policy WHERE policy_id = $1')) {
        const polId = Number(params[0]);
        const found = policies.find((p) => p.policy_id === polId);
        return { rows: found ? [{ policy_id: found.policy_id }] : [] };
      }

      // 10. SELECT catms.get_effective_coverage
      if (text.includes('catms.get_effective_coverage')) {
        const [polId, treatId, sDate] = params as [number, number, string];
        const pol = policies.find((p) => p.policy_id === Number(polId));
        if (!pol) {
          return {
            rows: [
              {
                coverage_id: null,
                policy_id: polId,
                treatment_id: treatId,
                coverage_percentage: 0,
                coverage_cap: null,
                effective_from: null,
                effective_to: null,
                is_eligible: false,
                ineligibility_reason: 'Policy does not exist',
              },
            ],
          };
        }

        const prov = providers.find((pr) => pr.provider_id === pol.provider_id);
        if (!prov || prov.status !== 'ACTIVE') {
          return {
            rows: [
              {
                coverage_id: null,
                policy_id: polId,
                treatment_id: treatId,
                coverage_percentage: 0,
                coverage_cap: null,
                effective_from: null,
                effective_to: null,
                is_eligible: false,
                ineligibility_reason: 'Insurance provider is inactive',
              },
            ],
          };
        }

        if (pol.policy_status !== 'ACTIVE') {
          return {
            rows: [
              {
                coverage_id: null,
                policy_id: polId,
                treatment_id: treatId,
                coverage_percentage: 0,
                coverage_cap: null,
                effective_from: null,
                effective_to: null,
                is_eligible: false,
                ineligibility_reason: `Policy status is ${pol.policy_status} (must be ACTIVE)`,
              },
            ],
          };
        }

        if (sDate < pol.valid_from || (pol.valid_to && sDate > pol.valid_to)) {
          return {
            rows: [
              {
                coverage_id: null,
                policy_id: polId,
                treatment_id: treatId,
                coverage_percentage: 0,
                coverage_cap: null,
                effective_from: null,
                effective_to: null,
                is_eligible: false,
                ineligibility_reason: `Service date ${sDate} is outside policy validity window`,
              },
            ],
          };
        }

        const cov = coverages
          .filter(
            (c) =>
              c.policy_id === Number(polId) &&
              c.treatment_id === Number(treatId) &&
              c.effective_from <= sDate &&
              (!c.effective_to || c.effective_to >= sDate),
          )
          .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];

        if (!cov) {
          return {
            rows: [
              {
                coverage_id: null,
                policy_id: polId,
                treatment_id: treatId,
                coverage_percentage: 0,
                coverage_cap: null,
                effective_from: null,
                effective_to: null,
                is_eligible: false,
                ineligibility_reason: 'Treatment is not covered under this policy on the service date',
              },
            ],
          };
        }

        return {
          rows: [
            {
              coverage_id: cov.coverage_id,
              policy_id: cov.policy_id,
              treatment_id: cov.treatment_id,
              coverage_percentage: cov.coverage_percentage,
              coverage_cap: cov.coverage_cap,
              effective_from: cov.effective_from,
              effective_to: cov.effective_to,
              is_eligible: true,
              ineligibility_reason: null,
            },
          ],
        };
      }

      return { rows: [] };
    }),
    connect: vi.fn(),
  },
  checkDatabaseConnectivity: vi.fn().mockResolvedValue({ ok: true, latencyMs: 1 }),
  checkDatabaseMigrations: vi.fn().mockResolvedValue({ ok: true, maxMigration: 43 }),
  closePool: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/db/transaction', () => ({
  withTransaction: vi.fn(async (fn: (client: PoolClient) => Promise<unknown>) => {
    const mockClient = {
      query: vi.fn(async (text: string, params: unknown[] = []) => {
        // 1. CALL catms.register_patient
        if (text.includes('CALL catms.register_patient')) {
          executedProcedures.push({ name: 'register_patient', params });
          const [
            firstName,
            lastName,
            dob,
            gender,
            contactNo,
            idType,
            idNo,
            contactName,
            relationship,
            emergPhone,
            patientNumber,
            bloodGroup,
            email,
            address,
            branchId,
            registeredBy,
          ] = params as [
            string,
            string,
            string,
            'Male' | 'Female' | 'Other',
            string,
            'NIC' | 'Passport',
            string,
            string,
            string,
            string,
            string | null,
            string | null,
            string | null,
            string | null,
            number | null,
            number | null,
          ];

          // Check duplicate identity clinic-wide (23505 unique_violation)
          const dup = identities.find(
            (id) => id.identity_type === idType && id.identity_number.toLowerCase() === idNo.trim().toLowerCase(),
          );
          if (dup) {
            const err = new Error(`Identity ${idType} with number ${idNo} is already registered clinic-wide`);
            (err as unknown as { code: string }).code = '23505';
            throw err;
          }

          const newPatientId = patients.length > 0 ? Math.max(...patients.map((p) => p.patient_id)) + 1 : 1;
          const assignedPatNo = patientNumber ?? `PAT-20261009-${String(newPatientId).padStart(4, '0')}`;

          const newPatient: PatientRow = {
            patient_id: newPatientId,
            patient_number: assignedPatNo,
            first_name: firstName,
            last_name: lastName,
            date_of_birth: dob,
            gender,
            blood_group: bloodGroup,
            contact_number: contactNo,
            email,
            address,
            registered_branch_id: branchId,
            registered_branch_name: branchId === 1 ? 'MedSync Colombo Main' : 'MedSync Kandy Central',
            registered_by: registeredBy,
            registered_at: new Date().toISOString(),
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          patients.push(newPatient);

          const newIdentityId = identities.length > 0 ? Math.max(...identities.map((i) => i.identity_id)) + 1 : 1;
          identities.push({
            identity_id: newIdentityId,
            patient_id: newPatientId,
            identity_type: idType,
            identity_number: idNo.trim(),
            is_primary: true,
            created_at: new Date().toISOString(),
          });

          const newContactId = emergencyContacts.length > 0 ? Math.max(...emergencyContacts.map((c) => c.contact_id)) + 1 : 1;
          emergencyContacts.push({
            contact_id: newContactId,
            patient_id: newPatientId,
            contact_name: contactName.trim(),
            relationship: relationship.trim(),
            phone_number: emergPhone.trim(),
            is_primary: true,
            created_at: new Date().toISOString(),
          });

          return { rows: [{ p_patient_id: newPatientId }] };
        }

        // 2. Patient lookup inside transaction
        if (text.includes('FROM catms.patient p') && text.includes('WHERE p.patient_id = $1')) {
          const id = Number(params[0]);
          const p = patients.find((pt) => pt.patient_id === id);
          return { rows: p ? [p] : [] };
        }

        if (text.includes('SELECT patient_id FROM catms.patient WHERE patient_id = $1')) {
          const id = Number(params[0]);
          const p = patients.find((pt) => pt.patient_id === id);
          return { rows: p ? [{ patient_id: p.patient_id }] : [] };
        }

        // 3. Dynamic UPDATE on patient
        if (text.includes('UPDATE catms.patient SET')) {
          const id = Number(params[params.length - 1]);
          const p = patients.find((pt) => pt.patient_id === id);
          if (p) {
            if (text.includes('first_name = $')) p.first_name = String(params[0]);
            if (text.includes('contact_number = $')) p.contact_number = String(params[0]);
            p.updated_at = new Date().toISOString();
          }
          return { rows: [] };
        }

        // 4. Emergency contacts inside transaction
        if (text.includes('INSERT INTO catms.emergency_contact')) {
          const [pId, name, rel, phone, isPrim] = params as [number, string, string, string, boolean];
          const newId = emergencyContacts.length > 0 ? Math.max(...emergencyContacts.map((c) => c.contact_id)) + 1 : 1;
          const rec: EmergencyContactRow = {
            contact_id: newId,
            patient_id: pId,
            contact_name: name,
            relationship: rel,
            phone_number: phone,
            is_primary: isPrim,
            created_at: new Date().toISOString(),
          };
          emergencyContacts.push(rec);
          return { rows: [rec] };
        }

        if (text.includes('UPDATE catms.emergency_contact SET is_primary = FALSE')) {
          const pId = Number(params[0]);
          emergencyContacts.forEach((ec) => {
            if (ec.patient_id === pId) ec.is_primary = false;
          });
          return { rows: [] };
        }

        if (text.includes('UPDATE catms.emergency_contact') && text.includes('RETURNING contact_id')) {
          const pId = Number(params[params.length - 2]);
          const cId = Number(params[params.length - 1]);
          const ec = emergencyContacts.find((c) => c.patient_id === pId && c.contact_id === cId);
          if (ec) {
            ec.contact_name = 'Updated Contact Name';
            return { rows: [ec] };
          }
          return { rows: [] };
        }

        if (text.includes('SELECT contact_id, is_primary FROM catms.emergency_contact')) {
          const [pId, cId] = params as [number, number];
          const found = emergencyContacts.find((c) => c.patient_id === pId && c.contact_id === cId);
          return { rows: found ? [found] : [] };
        }

        if (text.includes('SELECT COUNT(*)::int AS count FROM catms.emergency_contact')) {
          const pId = Number(params[0]);
          const cnt = emergencyContacts.filter((c) => c.patient_id === pId).length;
          return { rows: [{ count: cnt }] };
        }

        if (text.includes('DELETE FROM catms.emergency_contact')) {
          const [pId, cId] = params as [number, number];
          const idx = emergencyContacts.findIndex((c) => c.patient_id === pId && c.contact_id === cId);
          if (idx !== -1) {
            const removed = emergencyContacts.splice(idx, 1);
            return { rows: [{ contact_id: removed[0].contact_id }] };
          }
          return { rows: [] };
        }

        // 5. Identities inside transaction
        if (text.includes('INSERT INTO catms.patient_identity')) {
          const [pId, type, num, isPrim] = params as [number, 'NIC' | 'Passport', string, boolean];
          const dup = identities.find(
            (id) => id.identity_type === type && id.identity_number.toLowerCase() === num.toLowerCase(),
          );
          if (dup) {
            const err = new Error('Identity already exists clinic-wide');
            (err as unknown as { code: string }).code = '23505';
            throw err;
          }
          const newId = identities.length > 0 ? Math.max(...identities.map((i) => i.identity_id)) + 1 : 1;
          const rec: IdentityRow = {
            identity_id: newId,
            patient_id: pId,
            identity_type: type,
            identity_number: num,
            is_primary: isPrim,
            created_at: new Date().toISOString(),
          };
          identities.push(rec);
          return { rows: [rec] };
        }

        // 6. CALL catms.create_insurance_provider
        if (text.includes('CALL catms.create_insurance_provider')) {
          executedProcedures.push({ name: 'create_insurance_provider', params });
          const [code, name, cName, cPhone, cEmail, status, notes] = params as [
            string,
            string,
            string | null,
            string | null,
            string | null,
            'ACTIVE' | 'INACTIVE',
            string | null,
          ];

          if (providers.some((pr) => pr.provider_code.toLowerCase() === code.toLowerCase())) {
            const err = new Error(`Provider code ${code} already exists`);
            (err as unknown as { code: string }).code = '23505';
            throw err;
          }

          const newProvId = providers.length > 0 ? Math.max(...providers.map((pr) => pr.provider_id)) + 1 : 1;
          const newProv: ProviderRow = {
            provider_id: newProvId,
            provider_code: code,
            name,
            contact_name: cName,
            contact_phone: cPhone,
            contact_email: cEmail,
            status,
            notes,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          providers.push(newProv);
          return { rows: [{ p_provider_id: newProvId }] };
        }

        // 7. CALL catms.create_insurance_policy
        if (text.includes('CALL catms.create_insurance_policy')) {
          executedProcedures.push({ name: 'create_insurance_policy', params });
          const [patientId, providerId, policyNumber, validFrom, validTo, status, notes] = params as [
            number,
            number,
            string,
            string,
            string | null,
            'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED',
            string | null,
          ];

          const prov = providers.find((pr) => pr.provider_id === Number(providerId));
          if (!prov || prov.status !== 'ACTIVE') {
            const err = new Error('Cannot create policy for inactive insurance provider');
            (err as unknown as { code: string }).code = '23514';
            throw err;
          }

          if (
            policies.some(
              (pol) => pol.provider_id === Number(providerId) && pol.policy_number.toLowerCase() === policyNumber.toLowerCase(),
            )
          ) {
            const err = new Error(`Policy ${policyNumber} already exists for provider ${providerId}`);
            (err as unknown as { code: string }).code = '23505';
            throw err;
          }

          const newPolId = policies.length > 0 ? Math.max(...policies.map((p) => p.policy_id)) + 1 : 1;
          const newPol: PolicyRow = {
            policy_id: newPolId,
            patient_id: Number(patientId),
            provider_id: Number(providerId),
            policy_number: policyNumber,
            policy_status: status,
            valid_from: validFrom,
            valid_to: validTo,
            notes,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          policies.push(newPol);
          return { rows: [{ p_policy_id: newPolId }] };
        }

        // 8. CALL catms.update_policy_status
        if (text.includes('CALL catms.update_policy_status')) {
          executedProcedures.push({ name: 'update_policy_status', params });
          const [policyId, newStatus, notes] = params as [number, PolicyRow['policy_status'], string | null];
          const pol = policies.find((p) => p.policy_id === Number(policyId));
          if (pol) {
            pol.policy_status = newStatus;
            if (notes) pol.notes = notes;
            pol.updated_at = new Date().toISOString();
          }
          return { rows: [] };
        }

        // 9. CALL catms.add_policy_coverage
        if (text.includes('CALL catms.add_policy_coverage')) {
          executedProcedures.push({ name: 'add_policy_coverage', params });
          const [polId, treatId, percentage, cap, effFrom, effTo] = params as [
            number,
            number,
            number,
            number | null,
            string,
            string | null,
          ];

          // Check overlap
          const overlap = coverages.find(
            (c) =>
              c.policy_id === Number(polId) &&
              c.treatment_id === Number(treatId) &&
              c.effective_from <= (effTo || '9999-12-31') &&
              (c.effective_to || '9999-12-31') >= effFrom,
          );
          if (overlap) {
            const err = new Error('Coverage term overlaps with existing effective period');
            (err as unknown as { code: string }).code = '23P01';
            throw err;
          }

          const newCovId = coverages.length > 0 ? Math.max(...coverages.map((c) => c.coverage_id)) + 1 : 1;
          const tr = treatments.find((t) => t.treatment_id === Number(treatId));
          const newCov: CoverageRow = {
            coverage_id: newCovId,
            policy_id: Number(polId),
            treatment_id: Number(treatId),
            treatment_name: tr?.name,
            service_code: tr?.service_code,
            coverage_percentage: Number(percentage),
            coverage_cap: cap !== null && cap !== undefined ? Number(cap) : null,
            effective_from: effFrom,
            effective_to: effTo,
            created_at: new Date().toISOString(),
          };
          coverages.push(newCov);
          return { rows: [{ p_coverage_id: newCovId }] };
        }

        // 10. CALL catms.update_policy_coverage (Lifecycle update)
        if (text.includes('CALL catms.update_policy_coverage')) {
          executedProcedures.push({ name: 'update_policy_coverage', params });
          const [polId, treatId, percentage, cap, effFrom, effTo] = params as [
            number,
            number,
            number,
            number | null,
            string,
            string | null,
          ];

          // Close old term
          const old = coverages
            .filter((c) => c.policy_id === Number(polId) && c.treatment_id === Number(treatId) && (!c.effective_to || c.effective_to >= effFrom))
            .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];

          if (old) {
            const d = new Date(effFrom);
            d.setDate(d.getDate() - 1);
            old.effective_to = d.toISOString().slice(0, 10);
          }

          const newCovId = coverages.length > 0 ? Math.max(...coverages.map((c) => c.coverage_id)) + 1 : 1;
          const tr = treatments.find((t) => t.treatment_id === Number(treatId));
          const newCov: CoverageRow = {
            coverage_id: newCovId,
            policy_id: Number(polId),
            treatment_id: Number(treatId),
            treatment_name: tr?.name,
            service_code: tr?.service_code,
            coverage_percentage: Number(percentage),
            coverage_cap: cap !== null && cap !== undefined ? Number(cap) : null,
            effective_from: effFrom,
            effective_to: effTo,
            created_at: new Date().toISOString(),
          };
          coverages.push(newCov);
          return { rows: [{ p_new_coverage_id: newCovId }] };
        }

        // Standard identity / contact / policy queries inside transaction
        if (text.includes('FROM catms.patient_identity') && text.includes('WHERE patient_id = $1')) {
          const pId = Number(params[0]);
          return { rows: identities.filter((id) => id.patient_id === pId) };
        }
        if (text.includes('FROM catms.emergency_contact') && text.includes('WHERE patient_id = $1')) {
          const pId = Number(params[0]);
          return { rows: emergencyContacts.filter((ec) => ec.patient_id === pId) };
        }
        if (text.includes('FROM catms.insurance_policy pol') && text.includes('WHERE pol.patient_id = $1')) {
          const pId = Number(params[0]);
          return { rows: policies.filter((pol) => pol.patient_id === pId) };
        }
        if (text.includes('FROM catms.insurance_provider') && text.includes('WHERE provider_id = $1')) {
          const provId = Number(params[0]);
          const found = providers.find((pr) => pr.provider_id === provId);
          return { rows: found ? [found] : [] };
        }
        if (text.includes('FROM catms.insurance_policy pol') && text.includes('WHERE pol.policy_id = $1')) {
          const polId = Number(params[0]);
          const found = policies.find((p) => p.policy_id === polId);
          if (!found) return { rows: [] };
          const prov = providers.find((pr) => pr.provider_id === found.provider_id);
          return {
            rows: [
              {
                ...found,
                provider_code: prov?.provider_code,
                provider_name: prov?.name,
              },
            ],
          };
        }
        if (text.includes('FROM catms.policy_coverage c') && text.includes('WHERE c.coverage_id = $1')) {
          const covId = Number(params[0]);
          const found = coverages.find((c) => c.coverage_id === covId);
          if (!found) return { rows: [] };
          const tr = treatments.find((t) => t.treatment_id === found.treatment_id);
          return {
            rows: [
              {
                ...found,
                treatment_name: tr?.name,
                service_code: tr?.service_code,
              },
            ],
          };
        }
        if (text.includes('FROM catms.policy_coverage c') && text.includes('WHERE c.policy_id = $1')) {
          const polId = Number(params[0]);
          return { rows: coverages.filter((c) => c.policy_id === polId) };
        }

        return { rows: [] };
      }),
    };

    return fn(mockClient as unknown as PoolClient);
  }),
}));

// ── Test Setup & Helpers ─────────────────────────────────────────────────────

let app: Express;

function makeToken(user: {
  userId: number;
  employeeId: number;
  username: string;
  role: string;
  branchId: number | 'all';
  fullName: string;
}): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });
}

const receptionToken = makeToken({
  userId: 10,
  employeeId: 101,
  username: 'reception.colombo',
  role: 'Reception',
  branchId: 1,
  fullName: 'Reception Staff Colombo',
});

const clinicianToken = makeToken({
  userId: 20,
  employeeId: 201,
  username: 'dr.silva',
  role: 'Clinician',
  branchId: 1,
  fullName: 'Dr. Sunil Silva',
});

const managerToken = makeToken({
  userId: 30,
  employeeId: 301,
  username: 'manager.kandy',
  role: 'Manager',
  branchId: 2,
  fullName: 'Manager Kandy',
});

const adminToken = makeToken({
  userId: 1,
  employeeId: 1,
  username: 'admin.super',
  role: 'Admin',
  branchId: 'all',
  fullName: 'System Administrator',
});

const qaToken = makeToken({
  userId: 99,
  employeeId: 999,
  username: 'qa.auditor',
  role: 'QA',
  branchId: 'all',
  fullName: 'QA Auditor',
});

beforeAll(async () => {
  const { createApp } = await import('../src/app/server');
  app = createApp();
});

beforeEach(() => {
  resetFixtures();
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: Clinic-wide Patient Search & Listing
// ─────────────────────────────────────────────────────────────────────────────

describe('Suite 1: Clinic-wide Patient Search & Listing (CATMS-048)', () => {
  it('GET /api/v1/patients/search ignores registration branch and returns clinic-wide results', async () => {
    // Receptionist assigned to branch 1 searches for "Sunethra" (registered at branch 2)
    const res = await request(app)
      .get('/api/v1/patients/search?q=Sunethra')
      .set('Authorization', `Bearer ${receptionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].patientId).toBe(2);
    expect(res.body.data[0].firstName).toBe('Sunethra');
    expect(res.body.data[0].registeredBranchId).toBe(2); // From branch 2!
    expect(res.body.meta.correlationId).toBeDefined();
  });

  it('GET /api/v1/patients/search finds patient by primary NIC clinic-wide', async () => {
    const res = await request(app)
      .get('/api/v1/patients/search?q=198510203040')
      .set('Authorization', `Bearer ${clinicianToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].patientNumber).toBe('PAT-20261001-0001');
    expect(res.body.data[0].primaryIdentity.identityNumber).toBe('198510203040');
  });

  it('GET /api/v1/patients lists all active patients clinic-wide', async () => {
    const res = await request(app)
      .get('/api/v1/patients')
      .set('Authorization', `Bearer ${qaToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });

  it('rejects unauthenticated search with 401 UNAUTHENTICATED', async () => {
    const res = await request(app).get('/api/v1/patients/search?q=test');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: Atomic Patient Registration
// ─────────────────────────────────────────────────────────────────────────────

describe('Suite 2: Atomic Patient Registration (CATMS-048 / CATMS-025)', () => {
  const validRegistrationPayload = {
    firstName: 'Kasun',
    lastName: 'Bandara',
    dateOfBirth: '1995-06-15',
    gender: 'Male',
    contactNumber: '+94 77 555 6666',
    identityType: 'NIC',
    identityNumber: '199516600011',
    contactName: 'Nalini Bandara',
    relationship: 'Mother',
    emergencyPhone: '+94 77 444 3333',
    bloodGroup: 'AB+',
    email: 'kasun.b@example.lk',
    address: '77 Kandy Road, Peradeniya',
  };

  it('POST /api/v1/patients allows Reception to register patient atomically', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${receptionToken}`)
      .send(validRegistrationPayload);

    expect(res.status).toBe(201);
    expect(res.body.data.patientId).toBeDefined();
    expect(res.body.data.firstName).toBe('Kasun');
    expect(res.body.data.lastName).toBe('Bandara');
    expect(res.body.data.fullName).toBe('Kasun Bandara');
    expect(res.body.data.identities.length).toBe(1);
    expect(res.body.data.identities[0].identityNumber).toBe('199516600011');
    expect(res.body.data.emergencyContacts.length).toBe(1);
    expect(res.body.data.emergencyContacts[0].contactName).toBe('Nalini Bandara');

    // Procedure verification
    expect(executedProcedures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'register_patient' }),
      ]),
    );

    // Verify registered_by was extracted from JWT token (receptionToken employeeId is 101)
    const procCall = executedProcedures.find((p) => p.name === 'register_patient');
    expect(procCall?.params[15]).toBe(101); // p_registered_by param index 15
  });

  it('POST /api/v1/patients allows Admin to register patient', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        ...validRegistrationPayload,
        identityNumber: '199516600022',
      });

    expect(res.status).toBe(201);
  });

  it('POST /api/v1/patients rejects Clinician and Manager with 403 FORBIDDEN', async () => {
    const clinicianRes = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${clinicianToken}`)
      .send(validRegistrationPayload);

    expect(clinicianRes.status).toBe(403);
    expect(clinicianRes.body.error.code).toBe('FORBIDDEN');

    const managerRes = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${managerToken}`)
      .send(validRegistrationPayload);

    expect(managerRes.status).toBe(403);
    expect(managerRes.body.error.code).toBe('FORBIDDEN');
  });

  it('POST /api/v1/patients rejects client-supplied maintained fields (registered_by, registered_at) with 422', async () => {
    const badPayload = {
      ...validRegistrationPayload,
      identityNumber: '199516600033',
      registered_by: 999, // Injected client field!
    };

    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${receptionToken}`)
      .send(badPayload);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/v1/patients rejects future date of birth with 422 VALIDATION_ERROR', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${receptionToken}`)
      .send({
        ...validRegistrationPayload,
        dateOfBirth: tomorrowStr,
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fieldErrors.some((fe: { field: string }) => fe.field === 'dateOfBirth')).toBe(true);
  });

  it('POST /api/v1/patients rejects duplicate identity clinic-wide with 409 CONFLICT', async () => {
    // Attempting to register patient with existing NIC of patient 1 ('198510203040')
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${receptionToken}`)
      .send({
        ...validRegistrationPayload,
        identityNumber: '198510203040',
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: Patient Profile Detail & Updates
// ─────────────────────────────────────────────────────────────────────────────

describe('Suite 3: Patient Profile Detail & Demographic Updates', () => {
  it('GET /api/v1/patients/:id returns complete patient profile', async () => {
    const res = await request(app)
      .get('/api/v1/patients/1')
      .set('Authorization', `Bearer ${clinicianToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.patientId).toBe(1);
    expect(res.body.data.identities.length).toBeGreaterThan(0);
    expect(res.body.data.emergencyContacts.length).toBeGreaterThan(0);
    expect(res.body.data.policies.length).toBeGreaterThan(0);
  });

  it('GET /api/v1/patients/:id returns 404 NOT_FOUND for non-existent patient', async () => {
    const res = await request(app)
      .get('/api/v1/patients/9999')
      .set('Authorization', `Bearer ${receptionToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('PUT /api/v1/patients/:id allows Reception to update phone and address', async () => {
    const updatePayload = {
      contactNumber: '+94 77 999 1111',
      address: 'New Residence, Galle Road',
    };

    const res = await request(app)
      .put('/api/v1/patients/1')
      .set('Authorization', `Bearer ${receptionToken}`)
      .send(updatePayload);

    expect(res.status).toBe(200);
    expect(res.body.data.patientId).toBe(1);
  });

  it('PUT /api/v1/patients/:id rejects Clinician with 403 FORBIDDEN', async () => {
    const res = await request(app)
      .put('/api/v1/patients/1')
      .set('Authorization', `Bearer ${clinicianToken}`)
      .send({ contactNumber: '+94 77 000 0000' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: Emergency Contacts CRUD
// ─────────────────────────────────────────────────────────────────────────────

describe('Suite 4: Emergency Contacts CRUD', () => {
  it('GET /api/v1/patients/:id/contacts returns list of contacts', async () => {
    const res = await request(app)
      .get('/api/v1/patients/1/contacts')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].contactName).toBe('Kumari Perera');
  });

  it('POST /api/v1/patients/:id/contacts adds a new emergency contact', async () => {
    const payload = {
      contactName: 'Rohan Perera',
      relationship: 'Brother',
      phoneNumber: '+94 77 222 3333',
      isPrimary: false,
    };

    const res = await request(app)
      .post('/api/v1/patients/1/contacts')
      .set('Authorization', `Bearer ${receptionToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.data.contactName).toBe('Rohan Perera');
    expect(res.body.data.relationship).toBe('Brother');
  });

  it('DELETE /api/v1/patients/:id/contacts/:contactId blocks deleting the only contact', async () => {
    // Patient 2 only has 1 contact
    const res = await request(app)
      .delete('/api/v1/patients/2/contacts/2')
      .set('Authorization', `Bearer ${receptionToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5: Patient Identities
// ─────────────────────────────────────────────────────────────────────────────

describe('Suite 5: Patient Identities', () => {
  it('GET /api/v1/patients/:id/identities returns patient identities', async () => {
    const res = await request(app)
      .get('/api/v1/patients/1/identities')
      .set('Authorization', `Bearer ${receptionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].identityType).toBe('NIC');
  });

  it('POST /api/v1/patients/:id/identities adds a Passport identity', async () => {
    const payload = {
      identityType: 'Passport',
      identityNumber: 'N1234567',
      isPrimary: false,
    };

    const res = await request(app)
      .post('/api/v1/patients/1/identities')
      .set('Authorization', `Bearer ${receptionToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.data.identityType).toBe('Passport');
    expect(res.body.data.identityNumber).toBe('N1234567');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6: Insurance Providers
// ─────────────────────────────────────────────────────────────────────────────

describe('Suite 6: Insurance Providers (CATMS-048 / CATMS-026)', () => {
  it('GET /api/v1/insurance/providers lists all providers', async () => {
    const res = await request(app)
      .get('/api/v1/insurance/providers')
      .set('Authorization', `Bearer ${receptionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);
  });

  it('GET /api/v1/insurance/providers?status=ACTIVE filters active providers', async () => {
    const res = await request(app)
      .get('/api/v1/insurance/providers?status=ACTIVE')
      .set('Authorization', `Bearer ${clinicianToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data.every((p: { status: string }) => p.status === 'ACTIVE')).toBe(true);
  });

  it('POST /api/v1/insurance/providers creates provider when called by Admin', async () => {
    const payload = {
      providerCode: 'Ceylinco',
      name: 'Ceylinco General Insurance',
      contactName: 'Health Department',
      contactPhone: '+94 11 470 2702',
      contactEmail: 'health@ceylincoinsurance.com',
      status: 'ACTIVE',
      notes: 'Leading insurance partner',
    };

    const res = await request(app)
      .post('/api/v1/insurance/providers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.data.providerCode).toBe('CEYLINCO');
    expect(res.body.data.name).toBe('Ceylinco General Insurance');
    expect(executedProcedures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'create_insurance_provider' }),
      ]),
    );
  });

  it('POST /api/v1/insurance/providers rejects Reception and Clinician with 403 FORBIDDEN', async () => {
    const payload = {
      providerCode: 'JANASHAKTHI',
      name: 'Janashakthi Insurance PLC',
    };

    const recRes = await request(app)
      .post('/api/v1/insurance/providers')
      .set('Authorization', `Bearer ${receptionToken}`)
      .send(payload);

    expect(recRes.status).toBe(403);
    expect(recRes.body.error.code).toBe('FORBIDDEN');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 7: Insurance Policies
// ─────────────────────────────────────────────────────────────────────────────

describe('Suite 7: Insurance Policies (CATMS-048 / CATMS-026)', () => {
  it('GET /api/v1/insurance/policies lists policies with patient & provider details', async () => {
    const res = await request(app)
      .get('/api/v1/insurance/policies?patientId=1')
      .set('Authorization', `Bearer ${receptionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].policyNumber).toBe('SLIC-POL-99001');
    expect(res.body.data[0].providerCode).toBe('SLIC');
  });

  it('POST /api/v1/insurance/policies creates a new policy for a patient', async () => {
    const payload = {
      patientId: 2,
      providerId: 2, // AIA
      policyNumber: 'AIA-HLTH-88220',
      validFrom: '2026-03-01',
      validTo: '2027-02-28',
      policyStatus: 'ACTIVE',
      notes: 'Corporate group policy',
    };

    const res = await request(app)
      .post('/api/v1/insurance/policies')
      .set('Authorization', `Bearer ${receptionToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.data.policyNumber).toBe('AIA-HLTH-88220');
    expect(executedProcedures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'create_insurance_policy' }),
      ]),
    );
  });

  it('POST /api/v1/insurance/policies rejects policy creation for inactive provider with 422', async () => {
    const payload = {
      patientId: 1,
      providerId: 3, // Defunct INACTIVE provider
      policyNumber: 'OLD-999',
      validFrom: '2026-01-01',
    };

    const res = await request(app)
      .post('/api/v1/insurance/policies')
      .set('Authorization', `Bearer ${receptionToken}`)
      .send(payload);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/v1/insurance/policies rejects validTo date preceding validFrom with 422', async () => {
    const payload = {
      patientId: 1,
      providerId: 1,
      policyNumber: 'INV-DATE-001',
      validFrom: '2026-06-01',
      validTo: '2026-05-01', // Precedes validFrom!
    };

    const res = await request(app)
      .post('/api/v1/insurance/policies')
      .set('Authorization', `Bearer ${receptionToken}`)
      .send(payload);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('PATCH /api/v1/insurance/policies/:id/status updates status via catms.update_policy_status', async () => {
    const res = await request(app)
      .patch('/api/v1/insurance/policies/1/status')
      .set('Authorization', `Bearer ${receptionToken}`)
      .send({
        policyStatus: 'SUSPENDED',
        notes: 'Pending premium verification',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.policyStatus).toBe('SUSPENDED');
    expect(executedProcedures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'update_policy_status' }),
      ]),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 8: Policy Coverage Terms & Effective Coverage Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe('Suite 8: Policy Coverage Terms & Effective Coverage Lifecycle', () => {
  it('GET /api/v1/insurance/policies/:id/coverages lists coverage terms', async () => {
    const res = await request(app)
      .get('/api/v1/insurance/policies/1/coverages')
      .set('Authorization', `Bearer ${receptionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].treatmentId).toBe(1);
    expect(res.body.data[0].coveragePercentage).toBe(80.0);
    expect(res.body.data[0].treatmentName).toBe('General Consultation');
  });

  it('POST /api/v1/insurance/policies/:id/coverages adds initial coverage term', async () => {
    const payload = {
      treatmentId: 2, // Dental Cleaning
      coveragePercentage: 70.0,
      coverageCap: 5000.0,
      effectiveFrom: '2026-01-01',
    };

    const res = await request(app)
      .post('/api/v1/insurance/policies/1/coverages')
      .set('Authorization', `Bearer ${receptionToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.data.treatmentId).toBe(2);
    expect(res.body.data.coveragePercentage).toBe(70.0);
    expect(res.body.data.coverageCap).toBe(5000.0);
    expect(executedProcedures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'add_policy_coverage' }),
      ]),
    );
  });

  it('PUT /api/v1/insurance/policies/:id/coverages performs immutable lifecycle update', async () => {
    // Update term for treatment 1 from 80% to 90% starting 2026-07-01
    const payload = {
      treatmentId: 1,
      coveragePercentage: 90.0,
      coverageCap: 4000.0,
      effectiveFrom: '2026-07-01',
    };

    const res = await request(app)
      .put('/api/v1/insurance/policies/1/coverages')
      .set('Authorization', `Bearer ${receptionToken}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.data.coveragePercentage).toBe(90.0);
    expect(res.body.data.effectiveFrom).toBe('2026-07-01');
    expect(executedProcedures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'update_policy_coverage' }),
      ]),
    );

    // Verify prior term was closed at 2026-06-30 without mutating original 80% rate
    const oldTerm = coverages.find((c) => c.coverage_id === 1);
    expect(oldTerm?.effective_to).toBe('2026-06-30');
    expect(oldTerm?.coverage_percentage).toBe(80.0);
  });

  it('GET /api/v1/insurance/policies/:id/effective-coverage returns eligible terms for active policy', async () => {
    // Policy 1, Treatment 1 on service date 2026-05-10 (within 80% term)
    const res = await request(app)
      .get('/api/v1/insurance/policies/1/effective-coverage?treatmentId=1&serviceDate=2026-05-10')
      .set('Authorization', `Bearer ${clinicianToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isEligible).toBe(true);
    expect(res.body.data.coveragePercentage).toBe(80.0);
    expect(res.body.data.coverageCap).toBe(3000.0);
    expect(res.body.data.ineligibilityReason).toBeNull();
  });

  it('GET /api/v1/insurance/policies/:id/effective-coverage marks ineligible when policy is outside date window', async () => {
    // Policy 1 validity is 2026-01-01 to 2026-12-31. Service date 2025-12-15 is outside window.
    const res = await request(app)
      .get('/api/v1/insurance/policies/1/effective-coverage?treatmentId=1&serviceDate=2025-12-15')
      .set('Authorization', `Bearer ${clinicianToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isEligible).toBe(false);
    expect(res.body.data.ineligibilityReason).toContain('outside policy validity window');
  });
});
