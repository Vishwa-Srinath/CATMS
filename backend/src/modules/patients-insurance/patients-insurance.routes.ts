/**
 * src/modules/patients-insurance/patients-insurance.routes.ts
 * Owner: Dev3 | Issue: CATMS-048
 *
 * Express routers for Patient Identity, Emergency Contacts,
 * Insurance Providers, Policies, and Coverage Terms.
 *
 * Routes:
 *   /api/v1/patients:
 *     - GET    /search                        (Clinic-wide patient search)
 *     - GET    /                              (Clinic-wide patient list)
 *     - POST   /                              (Atomic patient registration)
 *     - GET    /:id                           (Patient detail & full profile)
 *     - PUT    /:id                           (Update patient demographic details)
 *     - GET    /:id/contacts                  (List emergency contacts)
 *     - POST   /:id/contacts                  (Add emergency contact)
 *     - PUT    /:id/contacts/:contactId       (Update emergency contact)
 *     - DELETE /:id/contacts/:contactId       (Delete emergency contact)
 *     - GET    /:id/identities                (List patient identities)
 *     - POST   /:id/identities                (Add patient identity document)
 *     - GET    /:id/policies                  (List insurance policies for patient)
 *     - POST   /:id/policies                  (Create insurance policy for patient)
 *
 *   /api/v1/insurance:
 *     - GET    /providers                     (List insurance providers)
 *     - GET    /providers/:id                 (Get provider detail)
 *     - POST   /providers                     (Create provider — Admin only)
 *     - GET    /policies                      (List policies with filters)
 *     - GET    /policies/:id                  (Get policy detail with coverages)
 *     - POST   /policies                      (Create insurance policy)
 *     - PATCH  /policies/:id/status           (Update policy lifecycle status)
 *     - GET    /policies/:id/coverages        (List coverage terms)
 *     - POST   /policies/:id/coverages        (Add coverage term)
 *     - PUT    /policies/:id/coverages        (Update coverage term — lifecycle)
 *     - POST   /policies/:id/coverages/update (Update coverage term — lifecycle)
 *     - GET    /policies/:id/effective-coverage (Eligibility & terms lookup)
 *
 * Rules (CODEBASE_GUIDE.md §1 & §6, CATMS-003, CATMS-006):
 *   - Thin transport routes only — Zod validation and stored procedure invocation.
 *   - Reception and Admin can register/update patients and policies.
 *   - Admin only for creating insurance providers.
 *   - Reception, Clinician, Manager, Admin, and QA can search/read patient and insurance data.
 *   - Search ignores registration branch for clinic-wide accessibility.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth, requireRole } from '../../app/middleware/auth';
import { patientsInsuranceService } from './patients-insurance.service';
import {
  registerPatientSchema,
  updatePatientSchema,
  patientSearchQuerySchema,
  createEmergencyContactSchema,
  updateEmergencyContactSchema,
  createPatientIdentitySchema,
  createInsuranceProviderSchema,
  createInsurancePolicySchema,
  updatePolicyStatusSchema,
  policyListQuerySchema,
  addPolicyCoverageSchema,
  updatePolicyCoverageSchema,
  effectiveCoverageQuerySchema,
} from './patients-insurance.schema';
import { successEnvelope } from '../../shared/errors';
import type { InsuranceProviderStatus } from '../../contracts/patients-insurance.contract';

// =============================================================================
// 1. PATIENT ROUTER (/api/v1/patients)
// =============================================================================

export const patientRouter = Router();

// GET /api/v1/patients/search — Clinic-wide patient search
patientRouter.get(
  '/search',
  requireAuth,
  requireRole('Reception', 'Clinician', 'Manager', 'Admin', 'QA'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const filters = patientSearchQuerySchema.parse(req.query);
      const patients = await patientsInsuranceService.searchPatients(filters);
      res.status(200).json(successEnvelope(patients, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/patients — List patients (clinic-wide)
patientRouter.get(
  '/',
  requireAuth,
  requireRole('Reception', 'Clinician', 'Manager', 'Admin', 'QA'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const filters = patientSearchQuerySchema.parse(req.query);
      const patients = await patientsInsuranceService.searchPatients(filters);
      res.status(200).json(successEnvelope(patients, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/patients — Atomic patient registration
patientRouter.post(
  '/',
  requireAuth,
  requireRole('Reception', 'Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const input = registerPatientSchema.parse(req.body);
      const patient = await patientsInsuranceService.registerPatient(input, req.user!);
      res.status(201).json(successEnvelope(patient, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/patients/:id — Retrieve single patient with identities, contacts, policies
patientRouter.get(
  '/:id',
  requireAuth,
  requireRole('Reception', 'Clinician', 'Manager', 'Admin', 'QA'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const patientId = Number(req.params.id);
      const patient = await patientsInsuranceService.getPatientById(patientId);
      res.status(200).json(successEnvelope(patient, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// PUT /api/v1/patients/:id — Update demographic fields
patientRouter.put(
  '/:id',
  requireAuth,
  requireRole('Reception', 'Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const patientId = Number(req.params.id);
      const input = updatePatientSchema.parse(req.body);
      const updated = await patientsInsuranceService.updatePatient(patientId, input, req.user!);
      res.status(200).json(successEnvelope(updated, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// ── Emergency Contacts Sub-routes ────────────────────────────────────────────

// GET /api/v1/patients/:id/contacts — List emergency contacts
patientRouter.get(
  '/:id/contacts',
  requireAuth,
  requireRole('Reception', 'Clinician', 'Manager', 'Admin', 'QA'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const patientId = Number(req.params.id);
      const contacts = await patientsInsuranceService.listEmergencyContacts(patientId);
      res.status(200).json(successEnvelope(contacts, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/patients/:id/contacts — Add emergency contact
patientRouter.post(
  '/:id/contacts',
  requireAuth,
  requireRole('Reception', 'Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const patientId = Number(req.params.id);
      const input = createEmergencyContactSchema.parse(req.body);
      const contact = await patientsInsuranceService.addEmergencyContact(patientId, input, req.user!);
      res.status(201).json(successEnvelope(contact, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// PUT /api/v1/patients/:id/contacts/:contactId — Update emergency contact
patientRouter.put(
  '/:id/contacts/:contactId',
  requireAuth,
  requireRole('Reception', 'Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const patientId = Number(req.params.id);
      const contactId = Number(req.params.contactId);
      const input = updateEmergencyContactSchema.parse(req.body);
      const updated = await patientsInsuranceService.updateEmergencyContact(
        patientId,
        contactId,
        input,
        req.user!,
      );
      res.status(200).json(successEnvelope(updated, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/patients/:id/contacts/:contactId — Delete emergency contact
patientRouter.delete(
  '/:id/contacts/:contactId',
  requireAuth,
  requireRole('Reception', 'Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const patientId = Number(req.params.id);
      const contactId = Number(req.params.contactId);
      const result = await patientsInsuranceService.deleteEmergencyContact(
        patientId,
        contactId,
        req.user!,
      );
      res.status(200).json(successEnvelope(result, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// ── Patient Identity Sub-routes ──────────────────────────────────────────────

// GET /api/v1/patients/:id/identities — List patient identities
patientRouter.get(
  '/:id/identities',
  requireAuth,
  requireRole('Reception', 'Clinician', 'Manager', 'Admin', 'QA'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const patientId = Number(req.params.id);
      const identities = await patientsInsuranceService.listPatientIdentities(patientId);
      res.status(200).json(successEnvelope(identities, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/patients/:id/identities — Add patient identity document
patientRouter.post(
  '/:id/identities',
  requireAuth,
  requireRole('Reception', 'Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const patientId = Number(req.params.id);
      const input = createPatientIdentitySchema.parse(req.body);
      const identity = await patientsInsuranceService.addPatientIdentity(patientId, input, req.user!);
      res.status(201).json(successEnvelope(identity, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// ── Patient Policies Sub-routes ──────────────────────────────────────────────

// GET /api/v1/patients/:id/policies — List policies for patient
patientRouter.get(
  '/:id/policies',
  requireAuth,
  requireRole('Reception', 'Clinician', 'Manager', 'Admin', 'QA'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const patientId = Number(req.params.id);
      const policies = await patientsInsuranceService.listInsurancePolicies({ patientId });
      res.status(200).json(successEnvelope(policies, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/patients/:id/policies — Create policy for patient
patientRouter.post(
  '/:id/policies',
  requireAuth,
  requireRole('Reception', 'Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const patientId = Number(req.params.id);
      const input = createInsurancePolicySchema.parse({
        ...req.body,
        patientId,
      });
      const policy = await patientsInsuranceService.createInsurancePolicy(input, req.user!);
      res.status(201).json(successEnvelope(policy, correlationId));
    } catch (err) {
      next(err);
    }
  },
);


// =============================================================================
// 2. INSURANCE ROUTER (/api/v1/insurance)
// =============================================================================

export const insuranceRouter = Router();

// ── Providers ────────────────────────────────────────────────────────────────

// GET /api/v1/insurance/providers — List providers
insuranceRouter.get(
  '/providers',
  requireAuth,
  requireRole('Reception', 'Clinician', 'Manager', 'Admin', 'QA'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const status = req.query['status'] as InsuranceProviderStatus | undefined;
      const providers = await patientsInsuranceService.listInsuranceProviders(status);
      res.status(200).json(successEnvelope(providers, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/insurance/providers/:id — Single provider detail
insuranceRouter.get(
  '/providers/:id',
  requireAuth,
  requireRole('Reception', 'Clinician', 'Manager', 'Admin', 'QA'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const providerId = Number(req.params.id);
      const provider = await patientsInsuranceService.getInsuranceProviderById(providerId);
      res.status(200).json(successEnvelope(provider, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/insurance/providers — Create provider (Admin only)
insuranceRouter.post(
  '/providers',
  requireAuth,
  requireRole('Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const input = createInsuranceProviderSchema.parse(req.body);
      const provider = await patientsInsuranceService.createInsuranceProvider(input, req.user!);
      res.status(201).json(successEnvelope(provider, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// ── Policies ─────────────────────────────────────────────────────────────────

// GET /api/v1/insurance/policies — List policies with filters
insuranceRouter.get(
  '/policies',
  requireAuth,
  requireRole('Reception', 'Clinician', 'Manager', 'Admin', 'QA'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const filters = policyListQuerySchema.parse(req.query);
      const policies = await patientsInsuranceService.listInsurancePolicies(filters);
      res.status(200).json(successEnvelope(policies, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/insurance/policies/:id — Policy detail with coverages
insuranceRouter.get(
  '/policies/:id',
  requireAuth,
  requireRole('Reception', 'Clinician', 'Manager', 'Admin', 'QA'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const policyId = Number(req.params.id);
      const policy = await patientsInsuranceService.getInsurancePolicyById(policyId);
      res.status(200).json(successEnvelope(policy, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/insurance/policies — Create policy
insuranceRouter.post(
  '/policies',
  requireAuth,
  requireRole('Reception', 'Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const input = createInsurancePolicySchema.parse(req.body);
      const policy = await patientsInsuranceService.createInsurancePolicy(input, req.user!);
      res.status(201).json(successEnvelope(policy, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/v1/insurance/policies/:id/status — Update policy lifecycle status
insuranceRouter.patch(
  '/policies/:id/status',
  requireAuth,
  requireRole('Reception', 'Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const policyId = Number(req.params.id);
      const input = updatePolicyStatusSchema.parse(req.body);
      const policy = await patientsInsuranceService.updatePolicyStatus(policyId, input, req.user!);
      res.status(200).json(successEnvelope(policy, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// ── Policy Coverages ─────────────────────────────────────────────────────────

// GET /api/v1/insurance/policies/:id/coverages — List coverages for policy
insuranceRouter.get(
  '/policies/:id/coverages',
  requireAuth,
  requireRole('Reception', 'Clinician', 'Manager', 'Admin', 'QA'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const policyId = Number(req.params.id);
      const coverages = await patientsInsuranceService.listPolicyCoverages(policyId);
      res.status(200).json(successEnvelope(coverages, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/insurance/policies/:id/coverages — Add initial coverage term
insuranceRouter.post(
  '/policies/:id/coverages',
  requireAuth,
  requireRole('Reception', 'Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const policyId = Number(req.params.id);
      const input = addPolicyCoverageSchema.parse(req.body);
      const coverage = await patientsInsuranceService.addPolicyCoverage(policyId, input, req.user!);
      res.status(201).json(successEnvelope(coverage, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// PUT /api/v1/insurance/policies/:id/coverages — Update coverage term (immutable lifecycle)
insuranceRouter.put(
  '/policies/:id/coverages',
  requireAuth,
  requireRole('Reception', 'Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const policyId = Number(req.params.id);
      const input = updatePolicyCoverageSchema.parse(req.body);
      const coverage = await patientsInsuranceService.updatePolicyCoverage(policyId, input, req.user!);
      res.status(200).json(successEnvelope(coverage, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/insurance/policies/:id/coverages/update — Update coverage term (immutable lifecycle)
insuranceRouter.post(
  '/policies/:id/coverages/update',
  requireAuth,
  requireRole('Reception', 'Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const policyId = Number(req.params.id);
      const input = updatePolicyCoverageSchema.parse(req.body);
      const coverage = await patientsInsuranceService.updatePolicyCoverage(policyId, input, req.user!);
      res.status(200).json(successEnvelope(coverage, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/insurance/policies/:id/effective-coverage — Effective-date eligibility lookup
insuranceRouter.get(
  '/policies/:id/effective-coverage',
  requireAuth,
  requireRole('Reception', 'Clinician', 'Manager', 'Admin', 'QA'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const policyId = Number(req.params.id);
      const query = effectiveCoverageQuerySchema.parse(req.query);
      const effective = await patientsInsuranceService.getEffectiveCoverage(
        policyId,
        query.treatmentId,
        query.serviceDate,
      );
      res.status(200).json(successEnvelope(effective, correlationId));
    } catch (err) {
      next(err);
    }
  },
);
