import type { PoolClient } from 'pg';
import { withTransaction, type DbRole } from '../../db/transaction';
import { AppError, ErrorCode } from '../../shared/errors';
import type {
  ClinicalWorklistItem,
  InvoiceDto,
  InvoiceSummaryDto,
  TreatmentDto,
} from '../../contracts/clinical-billing.contract';
import type {
  AmendConsultationBody,
  CreateTreatmentBody,
  RecordClinicalBody,
  UpdateTreatmentBody,
} from './clinical.schemas';

function databaseRole(role: string): DbRole {
  switch (role.toLowerCase()) {
    case 'admin':
      return 'catms_admin';
    case 'clinician':
    case 'doctor':
      return 'catms_clinician';
    case 'reception':
    case 'receptionist':
      return 'catms_reception';
    case 'manager':
    case 'branchmanager':
      return 'catms_manager';
    case 'qa':
      return 'catms_qa';
    default:
      return 'catms_app';
  }
}

function mapClinicalDatabaseError(error: unknown): never {
  if (!(error instanceof Error)) {
    throw error;
  }

  const message = error.message;
  if (message.startsWith('APPOINTMENT_NOT_FOUND:') || message.startsWith('TREATMENT_NOT_FOUND:')) {
    throw AppError.notFound(message.startsWith('APPOINTMENT_') ? 'Appointment' : 'Treatment');
  }
  if (
    message.startsWith('TREATMENT_REQUIRES_COMPLETED:')
    || message.startsWith('CONSULTATION_REQUIRES_COMPLETED:')
    || message.startsWith('INVOICE_REQUIRES_COMPLETED:')
  ) {
    throw new AppError(
      ErrorCode.APPOINTMENT_NOT_COMPLETED,
      'Clinical and billing actions require a Completed appointment.',
      422,
    );
  }
  if (message.startsWith('INVOICE_ALREADY_EXISTS:')) {
    throw AppError.conflict('An invoice has already been issued for this appointment.');
  }
  if (message.startsWith('INVOICE_REQUIRES_TREATMENT:') || message.startsWith('INVOICE_SNAPSHOT_TOO_LONG:')) {
    throw AppError.validationError('The recorded treatment data cannot be issued as an invoice.');
  }
  if (message.startsWith('CONSULTATION_NOT_FOUND:')) {
    throw AppError.notFound('Consultation note');
  }
  if (message.startsWith('TREATMENT_INACTIVE:')) {
    throw AppError.validationError('Inactive treatments cannot be recorded.');
  }
  if (message.startsWith('TREATMENT_REQUIRES_APPROVAL:') || message.startsWith('INVALID_TREATMENT_PRICE:')) {
    throw AppError.validationError('The treatment price is not eligible for recording.');
  }

  throw error;
}

function mapTreatment(row: Record<string, unknown>): TreatmentDto {
  return {
    treatmentId: String(row['treatment_id']),
    treatmentCategoryId: String(row['treatment_category_id']),
    categoryName: String(row['category_name']),
    serviceCode: String(row['service_code']),
    name: String(row['name']),
    description: row['description'] === null ? null : String(row['description']),
    currentPrice: String(row['current_price']),
    defaultDurationMinutes: Number(row['default_duration_minutes']),
    isConsultationService: Boolean(row['is_consultation_service']),
    isActive: Boolean(row['is_active']),
  };
}

async function auditCatalogueChange(
  client: PoolClient,
  actorUserId: number,
  entityId: string,
  actionCode: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO catms.audit_event
       (actor_user_id, entity_type, entity_id, action_code, payload)
     VALUES ($1, 'TREATMENT', $2, $3, $4::jsonb)`,
    [actorUserId, entityId, actionCode, JSON.stringify(payload)],
  );
}

export class ClinicalService {
  async listWorklist(
    employeeId: number,
    role: string,
    branchId?: string,
  ): Promise<ClinicalWorklistItem[]> {
    const dbRole = databaseRole(role);
    const result = await withTransaction(async (client) => {
      if (dbRole === 'catms_clinician') {
        return client.query(
          `SELECT appointment_id, appointment_number, patient_id, patient_number,
                  patient_name, doctor_id, doctor_name, branch_id, branch_name,
                  start_at, consultation_revision_no, treatment_count
           FROM catms.v_clinical_worklist
           WHERE doctor_id = $1
           ORDER BY start_at, appointment_id`,
          [employeeId],
        );
      }
      return client.query(
        `SELECT appointment_id, appointment_number, patient_id, patient_number,
                patient_name, doctor_id, doctor_name, branch_id, branch_name,
                start_at, consultation_revision_no, treatment_count
         FROM catms.v_clinical_worklist
         WHERE ($1::bigint IS NULL OR branch_id = $1)
         ORDER BY start_at, appointment_id`,
        [branchId ?? null],
      );
    }, dbRole);

    return result.rows.map((row) => ({
      appointmentId: String(row['appointment_id']),
      appointmentNumber: String(row['appointment_number']),
      patientId: String(row['patient_id']),
      patientNumber: String(row['patient_number']),
      patientName: String(row['patient_name']),
      doctorId: String(row['doctor_id']),
      doctorName: String(row['doctor_name']),
      branchId: String(row['branch_id']),
      branchName: String(row['branch_name']),
      startAt: new Date(String(row['start_at'])).toISOString(),
      consultationRevisionNo: row['consultation_revision_no'] === null
        ? null
        : Number(row['consultation_revision_no']),
      treatmentCount: Number(row['treatment_count']),
    }));
  }

  async recordClinical(
    appointmentId: string,
    actorUserId: number,
    employeeId: number,
    role: string,
    input: RecordClinicalBody,
  ): Promise<{ appointmentId: string; consultationNoteId: string; treatmentIds: string[]; invoiceId: string }> {
    try {
      return await withTransaction(async (client) => {
        await this.assertAppointmentAccess(client, appointmentId, employeeId, role);
        const result = await client.query<{ consultation_note_id: string }>(
          `SELECT catms.record_consultation_note(
             $1, $2, $3, $4, $5::jsonb
           ) AS consultation_note_id`,
          [
            appointmentId,
            actorUserId,
            input.notes,
            input.diagnosis_summary ?? null,
            input.vitals === undefined || input.vitals === null
              ? null
              : JSON.stringify(input.vitals),
          ],
        );

        const consultationNoteId = String(result.rows[0]?.consultation_note_id);
        const treatmentIds: string[] = [];
        for (const treatment of input.treatments) {
          const recorded = await client.query<{ appointment_treatment_id: string }>(
            `SELECT catms.record_appointment_treatment(
               $1, $2, $3, $4, $5
             ) AS appointment_treatment_id`,
            [
              appointmentId,
              treatment.treatmentId,
              treatment.quantity,
              actorUserId,
              treatment.clinicalComment ?? null,
            ],
          );
          treatmentIds.push(String(recorded.rows[0]?.appointment_treatment_id));
        }

        const issuedInvoice = await client.query<{ invoice_id: string }>(
          `SELECT catms.issue_invoice($1, $2) AS invoice_id`,
          [appointmentId, actorUserId],
        );
        const invoiceId = issuedInvoice.rows[0]?.invoice_id;
        if (!invoiceId) {
          throw AppError.internal('Invoice procedure did not return an invoice identifier.');
        }
        return { appointmentId, consultationNoteId, treatmentIds, invoiceId: String(invoiceId) };
      }, databaseRole(role));
    } catch (error) {
      mapClinicalDatabaseError(error);
    }
  }

  async amendClinical(
    appointmentId: string,
    actorUserId: number,
    employeeId: number,
    role: string,
    input: AmendConsultationBody,
  ): Promise<{ appointmentId: string; revisionNo: number }> {
    try {
      return await withTransaction(async (client) => {
        await this.assertAppointmentAccess(client, appointmentId, employeeId, role);
        const result = await client.query<{ revision_no: number }>(
          `SELECT catms.amend_consultation_note(
             $1, $2, $3, $4, $5, $6::jsonb
           ) AS revision_no`,
          [
            appointmentId,
            actorUserId,
            input.notes,
            input.amendment_reason,
            input.diagnosis_summary ?? null,
            input.vitals === undefined || input.vitals === null
              ? null
              : JSON.stringify(input.vitals),
          ],
        );
        return { appointmentId, revisionNo: Number(result.rows[0]?.revision_no) };
      }, databaseRole(role));
    } catch (error) {
      mapClinicalDatabaseError(error);
    }
  }

  async listTreatments(
    role: string,
    categoryId?: string,
    includeInactive = false,
  ): Promise<TreatmentDto[]> {
    const result = await withTransaction(async (client) => {
      return client.query(
        `SELECT t.treatment_id, t.treatment_category_id, c.name AS category_name,
                t.service_code, t.name, t.description, t.current_price,
                t.default_duration_minutes, t.is_consultation_service, t.is_active
         FROM catms.treatment_catalogue t
         JOIN catms.treatment_category c USING (treatment_category_id)
         WHERE ($1::bigint IS NULL OR t.treatment_category_id = $1)
           AND ($2::boolean OR t.is_active)
         ORDER BY c.name, t.name, t.treatment_id`,
        [categoryId ?? null, includeInactive],
      );
    }, databaseRole(role));
    return result.rows.map(mapTreatment);
  }

  async listTreatmentCategories(role: string): Promise<Array<{
    treatmentCategoryId: string;
    categoryCode: string;
    name: string;
  }>> {
    const result = await withTransaction(async (client) => {
      return client.query(
        `SELECT treatment_category_id, category_code, name
         FROM catms.treatment_category
         WHERE is_active
         ORDER BY name, treatment_category_id`,
      );
    }, databaseRole(role));
    return result.rows.map((row) => ({
      treatmentCategoryId: String(row['treatment_category_id']),
      categoryCode: String(row['category_code']),
      name: String(row['name']),
    }));
  }

  async createTreatment(
    actorUserId: number,
    input: CreateTreatmentBody,
  ): Promise<TreatmentDto> {
    return withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO catms.treatment_catalogue (
           treatment_category_id, service_code, name, description, current_price,
           default_duration_minutes, is_consultation_service
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING treatment_id, treatment_category_id, service_code, name,
                   description, current_price, default_duration_minutes,
                   is_consultation_service, is_active,
                   (SELECT name FROM catms.treatment_category
                    WHERE treatment_category_id = catms.treatment_catalogue.treatment_category_id)
                     AS category_name`,
        [
          input.treatmentCategoryId,
          input.serviceCode,
          input.name,
          input.description ?? null,
          input.currentPrice,
          input.defaultDurationMinutes,
          input.isConsultationService,
        ],
      );
      const row = result.rows[0];
      if (!row) {
        throw AppError.internal('Treatment insert did not return a catalogue record.');
      }
      const treatment = mapTreatment(row);
      await auditCatalogueChange(client, actorUserId, treatment.treatmentId, 'TREATMENT_CREATED', {
        serviceCode: treatment.serviceCode,
      });
      return treatment;
    }, 'catms_admin');
  }

  async updateTreatment(
    treatmentId: string,
    actorUserId: number,
    input: UpdateTreatmentBody,
  ): Promise<TreatmentDto> {
    return withTransaction(async (client) => {
      const columns: Array<[keyof UpdateTreatmentBody, string]> = [
        ['treatmentCategoryId', 'treatment_category_id'],
        ['name', 'name'],
        ['description', 'description'],
        ['currentPrice', 'current_price'],
        ['defaultDurationMinutes', 'default_duration_minutes'],
        ['isConsultationService', 'is_consultation_service'],
      ];
      const updates: string[] = [];
      const values: unknown[] = [];
      for (const [key, column] of columns) {
        const value = input[key];
        if (value !== undefined) {
          values.push(value);
          updates.push(`${column} = $${values.length}`);
        }
      }
      values.push(treatmentId);
      const result = await client.query(
        `UPDATE catms.treatment_catalogue t
         SET ${updates.join(', ')}
         WHERE t.treatment_id = $${values.length}
         RETURNING t.treatment_id, t.treatment_category_id,
                   (SELECT c.name FROM catms.treatment_category c
                    WHERE c.treatment_category_id = t.treatment_category_id)
                     AS category_name,
                   t.service_code, t.name, t.description, t.current_price,
                   t.default_duration_minutes, t.is_consultation_service, t.is_active`,
        values,
      );
      const row = result.rows[0];
      if (!row) {
        throw AppError.notFound('Treatment');
      }
      const treatment = mapTreatment(row);
      await auditCatalogueChange(client, actorUserId, treatmentId, 'TREATMENT_UPDATED', {
        fields: Object.keys(input),
      });
      return treatment;
    }, 'catms_admin');
  }

  async deactivateTreatment(treatmentId: string, actorUserId: number): Promise<void> {
    await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE catms.treatment_catalogue
         SET is_active = false
         WHERE treatment_id = $1 AND is_active
         RETURNING treatment_id`,
        [treatmentId],
      );
      if (result.rowCount === 0) {
        const exists = await client.query(
          'SELECT 1 FROM catms.treatment_catalogue WHERE treatment_id = $1',
          [treatmentId],
        );
        if (exists.rowCount === 0) {
          throw AppError.notFound('Treatment');
        }
      } else {
        await auditCatalogueChange(client, actorUserId, treatmentId, 'TREATMENT_DEACTIVATED', {});
      }
    }, 'catms_admin');
  }

  async getInvoice(
    invoiceId: string,
    role: string,
    employeeId: number,
  ): Promise<InvoiceDto> {
    return withTransaction(async (client) => {
      const result = await client.query(
        `SELECT invoice_id, invoice_number, appointment_id, invoice_state, currency_code,
                subtotal_amount, approved_insurance_amount, patient_liability_amount,
                patient_paid_amount, insurer_paid_amount, patient_payment_status, issued_at,
                doctor_id,
                coalesce(
                  jsonb_agg(
                    jsonb_build_object(
                      'invoiceLineId', invoice_line_id,
                      'lineNumber', line_number,
                      'serviceCode', service_code_snapshot,
                      'description', description_snapshot,
                      'quantity', quantity::text,
                      'unitPrice', unit_price::text,
                      'lineTotal', line_total::text
                    ) ORDER BY line_number
                  ) FILTER (WHERE invoice_line_id IS NOT NULL),
                  '[]'::jsonb
                ) AS lines
         FROM catms.v_invoice_detail
         WHERE invoice_id = $1
         GROUP BY invoice_id, invoice_number, appointment_id, invoice_state, currency_code,
                  subtotal_amount, approved_insurance_amount, patient_liability_amount,
                  patient_paid_amount, insurer_paid_amount, patient_payment_status, issued_at,
                  doctor_id`,
        [invoiceId],
      );
      const row = result.rows[0];
      if (!row || (role.toLowerCase() === 'clinician' && Number(row['doctor_id']) !== employeeId)) {
        throw AppError.notFound('Invoice');
      }
      const lines = row['lines'] as Array<Record<string, unknown>>;
      return {
        invoiceId: String(row['invoice_id']),
        invoiceNumber: String(row['invoice_number']),
        appointmentId: String(row['appointment_id']),
        invoiceState: String(row['invoice_state']),
        currencyCode: String(row['currency_code']),
        subtotalAmount: String(row['subtotal_amount']),
        approvedInsuranceAmount: String(row['approved_insurance_amount']),
        patientLiabilityAmount: String(row['patient_liability_amount']),
        patientPaidAmount: String(row['patient_paid_amount']),
        insurerPaidAmount: String(row['insurer_paid_amount']),
        patientPaymentStatus: String(row['patient_payment_status']),
        issuedAt: new Date(String(row['issued_at'])).toISOString(),
        lines: lines.map((line) => ({
          invoiceLineId: String(line['invoiceLineId']),
          lineNumber: Number(line['lineNumber']),
          serviceCode: String(line['serviceCode']),
          description: String(line['description']),
          quantity: String(line['quantity']),
          unitPrice: String(line['unitPrice']),
          lineTotal: String(line['lineTotal']),
        })),
      };
    }, databaseRole(role));
  }

  async listInvoices(): Promise<InvoiceSummaryDto[]> {
    return withTransaction(async (client) => {
      const result = await client.query(
        `SELECT i.invoice_id, i.invoice_number, i.appointment_id, a.appointment_number,
                a.patient_id, p.patient_number,
                concat_ws(' ', p.first_name, p.last_name) AS patient_name,
                i.invoice_state, i.currency_code, i.subtotal_amount,
                i.approved_insurance_amount, i.patient_liability_amount,
                i.patient_paid_amount, i.insurer_paid_amount,
                i.patient_payment_status, i.issued_at,
                coalesce(
                  jsonb_agg(
                    jsonb_build_object(
                      'claimId', c.claim_id,
                      'claimNumber', c.claim_number,
                      'claimStatus', c.claim_status,
                      'approvedAmount', c.approved_amount::text,
                      'policyNumber', ip.policy_number::text,
                      'providerName', prov.name
                    ) ORDER BY c.claim_id
                  ) FILTER (WHERE c.claim_id IS NOT NULL),
                  '[]'::jsonb
                ) AS approved_claims
         FROM catms.invoice i
         JOIN catms.appointment a ON a.appointment_id = i.appointment_id
         JOIN catms.patient p ON p.patient_id = a.patient_id
         LEFT JOIN catms.insurance_claim c
           ON c.invoice_id = i.invoice_id
          AND c.claim_status IN ('Approved', 'PartiallyApproved')
         LEFT JOIN catms.insurance_policy ip ON ip.policy_id = c.policy_id
         LEFT JOIN catms.insurance_provider prov ON prov.provider_id = ip.provider_id
         GROUP BY i.invoice_id, i.invoice_number, i.appointment_id, a.appointment_number,
                  a.patient_id, p.patient_number, p.first_name, p.last_name,
                  i.invoice_state, i.currency_code, i.subtotal_amount,
                  i.approved_insurance_amount, i.patient_liability_amount,
                  i.patient_paid_amount, i.insurer_paid_amount,
                  i.patient_payment_status, i.issued_at
         ORDER BY i.issued_at DESC, i.invoice_id DESC`,
      );
      return result.rows.map((row) => ({
        invoiceId: String(row['invoice_id']),
        invoiceNumber: String(row['invoice_number']),
        appointmentId: String(row['appointment_id']),
        appointmentNumber: String(row['appointment_number']),
        patientId: String(row['patient_id']),
        patientNumber: String(row['patient_number']),
        patientName: String(row['patient_name']),
        invoiceState: String(row['invoice_state']),
        currencyCode: String(row['currency_code']),
        subtotalAmount: String(row['subtotal_amount']),
        approvedInsuranceAmount: String(row['approved_insurance_amount']),
        patientLiabilityAmount: String(row['patient_liability_amount']),
        patientPaidAmount: String(row['patient_paid_amount']),
        insurerPaidAmount: String(row['insurer_paid_amount']),
        patientPaymentStatus: String(row['patient_payment_status']),
        issuedAt: new Date(String(row['issued_at'])).toISOString(),
        approvedClaims: (row['approved_claims'] as Array<Record<string, unknown>>).map((claim) => ({
          claimId: String(claim['claimId']),
          claimNumber: String(claim['claimNumber']),
          claimStatus: String(claim['claimStatus']),
          approvedAmount: String(claim['approvedAmount']),
          policyNumber: String(claim['policyNumber']),
          providerName: String(claim['providerName']),
        })),
      }));
    }, 'catms_admin');
  }

  private async assertAppointmentAccess(
    client: PoolClient,
    appointmentId: string,
    employeeId: number,
    role: string,
  ): Promise<void> {
    const result = await client.query<{ doctor_id: string }>(
      `SELECT doctor_id
       FROM catms.lock_clinical_appointment($1)`,
      [appointmentId],
    );
    const appointment = result.rows[0];
    if (!appointment || (
      role.toLowerCase() === 'clinician'
      && String(appointment.doctor_id) !== String(employeeId)
    )) {
      throw AppError.notFound('Appointment');
    }
  }
}

export const clinicalService = new ClinicalService();
