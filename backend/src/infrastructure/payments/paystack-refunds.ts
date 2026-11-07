/**
 * Paystack refund webhook / API payload parsing.
 *
 * Provider limitation (documented): the Paystack Create Refund HTTP API does not
 * accept a client idempotency key. Exactly-once submit is enforced locally via:
 * - unique `payment_refunds.provider_refund_id`
 * - conditional claim of REQUESTED/FAILED rows before calling the network
 * - webhook + polling reconciliation for pending provider states
 *
 * Do not treat HTTP 200 with status=pending as SUCCEEDED.
 */

export type ParsedPaystackRefundStatus = 'pending' | 'processed' | 'failed' | 'unknown';

export interface ParsedPaystackRefundEvent {
  eventType: string;
  providerRefundId: string;
  status: ParsedPaystackRefundStatus;
  transactionReference: string | null;
  amountPesewas: number | null;
  currency: string | null;
  rawStatus: string | null;
}

export interface ParsedPaystackRefundLookup {
  providerRefundId: string;
  status: ParsedPaystackRefundStatus;
  transactionReference: string | null;
  amountPesewas: number | null;
  currency: string | null;
  rawStatus: string | null;
}

const REFUND_EVENT_PREFIX = 'refund.';

export function isPaystackRefundEventType(eventType: string): boolean {
  return eventType.startsWith(REFUND_EVENT_PREFIX);
}

export function mapPaystackRefundStatus(raw: string | null | undefined): ParsedPaystackRefundStatus {
  const value = (raw ?? '').toLowerCase();
  if (value === 'processed' || value === 'success' || value === 'successful') return 'processed';
  if (value === 'failed' || value === 'reversed') return 'failed';
  if (
    value === 'pending' ||
    value === 'processing' ||
    value === 'received' ||
    value === 'queued'
  ) {
    return 'pending';
  }
  return 'unknown';
}

/**
 * Isolate refund webhook payload shape from charge.success.
 * Expected Paystack shape (documented contract used by this project):
 * { event: "refund.processed"|"refund.failed"|"refund.pending", data: { id, status, transaction?, amount, currency } }
 */
export function parsePaystackRefundWebhookPayload(payload: {
  event?: string;
  data?: {
    id?: number | string;
    status?: string;
    amount?: number;
    currency?: string;
    transaction?: { reference?: string; id?: number | string } | string;
    transaction_reference?: string;
  };
}): ParsedPaystackRefundEvent | null {
  const eventType = payload.event ?? '';
  if (!isPaystackRefundEventType(eventType)) return null;
  const data = payload.data;
  if (!data || data.id == null) return null;

  let transactionReference: string | null = null;
  if (typeof data.transaction === 'string') {
    transactionReference = data.transaction;
  } else if (data.transaction && typeof data.transaction === 'object') {
    transactionReference = data.transaction.reference ?? null;
  } else if (typeof data.transaction_reference === 'string') {
    transactionReference = data.transaction_reference;
  }

  return {
    eventType,
    providerRefundId: String(data.id),
    status: mapPaystackRefundStatus(data.status ?? eventType.replace(REFUND_EVENT_PREFIX, '')),
    transactionReference,
    amountPesewas: typeof data.amount === 'number' ? data.amount : null,
    currency: data.currency ? data.currency.toUpperCase() : null,
    rawStatus: data.status ?? null,
  };
}

export function parsePaystackRefundLookupBody(body: {
  data?: {
    id?: number | string;
    status?: string;
    amount?: number;
    currency?: string;
    transaction?: { reference?: string } | string;
  };
}): ParsedPaystackRefundLookup | null {
  const data = body.data;
  if (!data || data.id == null) return null;
  let transactionReference: string | null = null;
  if (typeof data.transaction === 'string') {
    transactionReference = data.transaction;
  } else if (data.transaction && typeof data.transaction === 'object') {
    transactionReference = data.transaction.reference ?? null;
  }
  return {
    providerRefundId: String(data.id),
    status: mapPaystackRefundStatus(data.status),
    transactionReference,
    amountPesewas: typeof data.amount === 'number' ? data.amount : null,
    currency: data.currency ? data.currency.toUpperCase() : null,
    rawStatus: data.status ?? null,
  };
}
