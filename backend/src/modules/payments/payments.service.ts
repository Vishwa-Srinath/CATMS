import type { DbRole } from '../../db/transaction';
import { withTransaction } from '../../db/transaction';
import type { PaymentDto } from '../../contracts/clinical-billing.contract';
import { AppError, ErrorCode } from '../../shared/errors';
import type { CreatePaymentBody } from '../clinical-billing/clinical.schemas';

function databaseRole(role: string): DbRole {
  return role.toLowerCase() === 'admin' ? 'catms_admin' : 'catms_app';
}

function mapPaymentDatabaseError(error: unknown): never {
  if (!(error instanceof Error)) {
    throw error;
  }

  const message = error.message;
  if (message.startsWith('PAYMENT_NOT_FOUND:') || message.startsWith('PAYMENT_APPROVED_CLAIM_REQUIRED: The claim does not exist.')) {
    throw AppError.notFound(message.startsWith('PAYMENT_NOT_FOUND:') ? 'Payment' : 'Insurance claim');
  }
  if (message.startsWith('PAYMENT_OVER_CAP:')) {
    throw new AppError(ErrorCode.PAYMENT_OVERAGE, 'Payment amount exceeds the outstanding balance.', 422);
  }
  if (message.startsWith('PAYMENT_KEY_CONFLICT:')) {
    throw new AppError(ErrorCode.PAYMENT_DUPLICATE, 'This idempotency key was used with different payment details.', 409);
  }
  if (
    message.startsWith('PAYMENT_AMOUNT_INVALID:')
    || message.startsWith('PAYMENT_TYPE_INVALID:')
    || message.startsWith('PAYMENT_KEY_REQUIRED:')
    || message.startsWith('PAYMENT_REFERENCE_TOO_LONG:')
    || message.startsWith('PAYMENT_CLAIM_MISMATCH:')
    || message.startsWith('PAYMENT_APPROVED_CLAIM_REQUIRED:')
  ) {
    throw AppError.validationError('Payment details are invalid or the required approved claim is unavailable.');
  }
  if (message.startsWith('PAYMENT_REQUIRES_ISSUED:') || message.startsWith('PAYMENT_STATE_UNSUPPORTED:')) {
    throw AppError.conflict('Payments can only be posted to an issued invoice.');
  }
  if (
    message.startsWith('REVERSAL_OVER_CAP:')
    || message.startsWith('REVERSAL_NOT_AVAILABLE:')
    || message.startsWith('REVERSAL_IMMUTABLE:')
    || message.startsWith('PAYMENT_IMMUTABLE:')
  ) {
    throw new AppError(ErrorCode.REVERSAL_NOT_ALLOWED, 'The payment cannot be reversed by that amount.', 409);
  }
  if (
    message.startsWith('REVERSAL_AMOUNT_INVALID:')
    || message.startsWith('REVERSAL_REASON_REQUIRED:')
  ) {
    throw AppError.validationError('Reversal details are invalid.');
  }

  throw error;
}

interface PaymentRow {
  payment_id: string;
  invoice_id: string;
  receipt_number: string;
  payer_type: 'Patient' | 'Insurer';
  insurance_claim_id: string | null;
  amount: string;
  payment_method: string;
  payment_status: string;
  paid_at: string;
  reference_number: string | null;
  reversed_amount: string;
  net_amount: string;
  reversals: Array<{
    paymentReversalId: string;
    amount: string;
    reason: string;
    reversedAt: string;
  }>;
}

function toPaymentDto(row: PaymentRow): PaymentDto {
  return {
    paymentId: String(row.payment_id),
    invoiceId: String(row.invoice_id),
    receiptNumber: row.receipt_number,
    payerType: row.payer_type,
    insuranceClaimId: row.insurance_claim_id === null ? null : String(row.insurance_claim_id),
    amount: String(row.amount),
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    paidAt: new Date(row.paid_at).toISOString(),
    referenceNumber: row.reference_number,
    reversedAmount: String(row.reversed_amount),
    netAmount: String(row.net_amount),
    reversals: row.reversals.map((reversal) => ({
      paymentReversalId: String(reversal.paymentReversalId),
      amount: String(reversal.amount),
      reason: reversal.reason,
      reversedAt: new Date(reversal.reversedAt).toISOString(),
    })),
  };
}

const PAYMENT_PROJECTION = `
  SELECT p.payment_id, p.invoice_id, p.receipt_number, p.payer_type,
         p.insurance_claim_id, p.amount, p.payment_method, p.payment_status,
         p.paid_at, p.reference_number,
         coalesce(sum(r.amount), 0)::numeric(12,2)::text AS reversed_amount,
         (p.amount - coalesce(sum(r.amount), 0))::numeric(12,2)::text AS net_amount,
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'paymentReversalId', r.payment_reversal_id,
               'amount', r.amount::text,
               'reason', r.reason,
               'reversedAt', r.reversed_at
             ) ORDER BY r.reversed_at, r.payment_reversal_id
           ) FILTER (WHERE r.payment_reversal_id IS NOT NULL),
           '[]'::jsonb
         ) AS reversals
  FROM catms.payment p
  LEFT JOIN catms.payment_reversal r USING (payment_id)`;

export class PaymentsService {
  async preview(
    invoiceId: string,
    payerType: 'Patient' | 'Insurer',
    claimId?: string,
  ): Promise<Record<string, string>> {
    return withTransaction(async (client) => {
      const invoice = await client.query(
        `SELECT invoice_id, invoice_state, patient_liability_amount, patient_paid_amount,
                approved_insurance_amount, insurer_paid_amount
         FROM catms.invoice WHERE invoice_id = $1`,
        [invoiceId],
      );
      const row = invoice.rows[0];
      if (!row) {
        throw AppError.notFound('Invoice');
      }
      if (row['invoice_state'] !== 'Issued') {
        throw AppError.conflict('Payments can only be previewed for an issued invoice.');
      }
      if (payerType === 'Patient') {
        const balance = await client.query<{ outstanding_amount: string }>(
          `SELECT greatest(patient_liability_amount - patient_paid_amount, 0)::numeric(12,2)::text
                    AS outstanding_amount
           FROM catms.invoice WHERE invoice_id = $1`,
          [invoiceId],
        );
        const balanceRow = balance.rows[0];
        if (!balanceRow) {
          throw AppError.notFound('Invoice');
        }
        return { invoiceId, payerType, outstandingAmount: balanceRow.outstanding_amount };
      }

      const claim = await client.query(
        `SELECT c.claim_id, c.claim_status, c.approved_amount::text AS approved_amount,
                coalesce((
                  SELECT sum(p.amount - coalesce(r.reversed_amount, 0))
                  FROM catms.payment p
                  LEFT JOIN (
                    SELECT payment_id, sum(amount) AS reversed_amount
                    FROM catms.payment_reversal GROUP BY payment_id
                  ) r USING (payment_id)
                  WHERE p.insurance_claim_id = c.claim_id
                    AND p.payment_status IN ('Settled','PartiallyReversed','Reversed')
                ), 0)::numeric(12,2)::text AS paid_amount,
                greatest(
                  least(
                    c.approved_amount - coalesce((
                      SELECT sum(p.amount - coalesce(r.reversed_amount, 0))
                      FROM catms.payment p
                      LEFT JOIN (
                        SELECT payment_id, sum(amount) AS reversed_amount
                        FROM catms.payment_reversal GROUP BY payment_id
                      ) r USING (payment_id)
                      WHERE p.insurance_claim_id = c.claim_id
                        AND p.payment_status IN ('Settled','PartiallyReversed','Reversed')
                    ), 0),
                    i.approved_insurance_amount - i.insurer_paid_amount
                  ),
                  0
                )::numeric(12,2)::text AS outstanding_amount,
                (c.approved_amount IS NOT NULL
                 AND c.approved_amount > 0
                 AND c.approved_amount <> 'NaN'::numeric) AS approved_amount_valid
         FROM catms.insurance_claim c
         JOIN catms.invoice i ON i.invoice_id = c.invoice_id
         WHERE c.claim_id = $1 AND c.invoice_id = $2`,
        [claimId, invoiceId],
      );
      const claimRow = claim.rows[0];
      if (!claimRow) {
        throw AppError.notFound('Insurance claim');
      }
      if (!['Approved', 'PartiallyApproved'].includes(String(claimRow['claim_status']))) {
        throw AppError.validationError('An approved insurance claim is required for an insurer payment.');
      }
      if (!claimRow['approved_amount_valid']) {
        throw AppError.validationError('The approved insurance claim has no payable amount.');
      }
      return {
        invoiceId,
        payerType,
        insuranceClaimId: String(claimRow['claim_id']),
        approvedClaimAmount: String(claimRow['approved_amount']),
        paidAgainstClaim: String(claimRow['paid_amount']),
        outstandingAmount: String(claimRow['outstanding_amount']),
      };
    }, databaseRole('Admin'));
  }

  async list(invoiceId: string): Promise<PaymentDto[]> {
    const result = await withTransaction(async (client) => {
      const invoice = await client.query(
        'SELECT 1 FROM catms.invoice WHERE invoice_id = $1',
        [invoiceId],
      );
      if (invoice.rowCount === 0) {
        throw AppError.notFound('Invoice');
      }
      return client.query<PaymentRow>(
        `${PAYMENT_PROJECTION}
         WHERE p.invoice_id = $1
         GROUP BY p.payment_id
         ORDER BY p.paid_at DESC, p.payment_id DESC`,
        [invoiceId],
      );
    }, 'catms_admin');
    return result.rows.map(toPaymentDto);
  }

  async post(
    actorUserId: number,
    input: CreatePaymentBody,
  ): Promise<PaymentDto> {
    try {
      return await withTransaction(async (client) => {
        const created = await client.query<{ payment_id: string }>(
          `SELECT catms.post_payment_idempotent(
             $1, $2, $3, $4, $5, $6::uuid, $7, $8
           ) AS payment_id`,
          [
            input.invoiceId,
            input.payerType,
            input.amount,
            input.paymentMethod,
            actorUserId,
            input.idempotencyKey,
            input.insuranceClaimId ?? null,
            input.referenceNumber ?? null,
          ],
        );
        const paymentId = created.rows[0]?.payment_id;
        if (!paymentId) {
          throw AppError.internal('Payment procedure did not return a receipt.');
        }
        const result = await client.query<PaymentRow>(
          `${PAYMENT_PROJECTION}
           WHERE p.payment_id = $1
           GROUP BY p.payment_id`,
          [paymentId],
        );
        if (!result.rows[0]) {
          throw AppError.internal('Payment procedure returned a receipt that could not be read.');
        }
        return toPaymentDto(result.rows[0]);
      }, 'catms_admin');
    } catch (error) {
      mapPaymentDatabaseError(error);
    }
  }

  async reverse(
    paymentId: string,
    actorUserId: number,
    amount: string,
    reason: string,
  ): Promise<{ paymentReversalId: string; payment: PaymentDto }> {
    try {
      return await withTransaction(async (client) => {
        const reversal = await client.query<{ payment_reversal_id: string }>(
          `SELECT catms.reverse_payment($1, $2, $3, $4) AS payment_reversal_id`,
          [paymentId, amount, reason, actorUserId],
        );
        const reversalId = reversal.rows[0]?.payment_reversal_id;
        if (!reversalId) {
          throw AppError.internal('Reversal procedure did not return a reversal identifier.');
        }
        const paymentResult = await client.query<PaymentRow>(
          `${PAYMENT_PROJECTION}
           WHERE p.payment_id = $1
           GROUP BY p.payment_id`,
          [paymentId],
        );
        const payment = paymentResult.rows[0];
        if (!payment) {
          throw AppError.notFound('Payment');
        }
        return { paymentReversalId: String(reversalId), payment: toPaymentDto(payment) };
      }, 'catms_admin');
    } catch (error) {
      mapPaymentDatabaseError(error);
    }
  }
}

export const paymentsService = new PaymentsService();
