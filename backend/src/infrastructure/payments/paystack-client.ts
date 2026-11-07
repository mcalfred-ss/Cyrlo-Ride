import { createHash, randomUUID } from 'node:crypto';

import { env } from '../../config/env.js';
import { AppError } from '../../common/errors/app-error.js';
import {
  mapPaystackRefundStatus,
  parsePaystackRefundLookupBody,
  type ParsedPaystackRefundLookup,
  type ParsedPaystackRefundStatus,
} from './paystack-refunds.js';

export interface InitializeTransactionInput {
  email: string;
  amountPesewas: number;
  currency: string;
  reference: string;
  metadata?: Record<string, string>;
  callbackUrl?: string;
}

export interface InitializeTransactionResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export interface CreateRefundInput {
  transactionReference: string;
  amountPesewas: number;
  currency: string;
  merchantNote: string;
}

export interface CreateRefundResult {
  providerRefundId: string;
  status: ParsedPaystackRefundStatus;
}

export interface PaystackTransactionLookup {
  reference: string;
  status: 'success' | 'failed' | 'abandoned' | 'ongoing' | 'unknown';
  amountPesewas: number | null;
  currency: string | null;
}

export interface PaystackClient {
  initializeTransaction(input: InitializeTransactionInput): Promise<InitializeTransactionResult>;
  createRefund(input: CreateRefundInput): Promise<CreateRefundResult>;
  /** Lookup refund by Paystack refund id. Used for reconciliation only. */
  fetchRefund(providerRefundId: string): Promise<ParsedPaystackRefundLookup>;
  /** Lookup transaction by reference for abandoned/late-charge reconciliation. */
  fetchTransaction(reference: string): Promise<PaystackTransactionLookup>;
}

/** In-memory Paystack for tests. Does not call the network. */
export class MemoryPaystackClient implements PaystackClient {
  initializations: InitializeTransactionInput[] = [];
  refunds: CreateRefundInput[] = [];
  refundStore = new Map<string, ParsedPaystackRefundLookup>();
  transactions = new Map<string, PaystackTransactionLookup>();
  /** When true, createRefund returns pending instead of processed. */
  refundCreateStatus: ParsedPaystackRefundStatus = 'processed';
  failNextRefund = false;

  async initializeTransaction(
    input: InitializeTransactionInput,
  ): Promise<InitializeTransactionResult> {
    this.initializations.push(input);
    this.transactions.set(input.reference, {
      reference: input.reference,
      status: 'ongoing',
      amountPesewas: input.amountPesewas,
      currency: input.currency,
    });
    return {
      authorizationUrl: `https://checkout.paystack.com/test/${input.reference}`,
      accessCode: `access_${input.reference}`,
      reference: input.reference,
    };
  }

  async createRefund(input: CreateRefundInput): Promise<CreateRefundResult> {
    this.refunds.push(input);
    if (this.failNextRefund) {
      this.failNextRefund = false;
      throw new AppError({
        status: 502,
        code: 'PAYMENT_VERIFICATION_FAILED',
        message: 'Paystack refund failed (memory)',
      });
    }
    const providerRefundId = `rf_${randomUUID()}`;
    const status = this.refundCreateStatus;
    this.refundStore.set(providerRefundId, {
      providerRefundId,
      status,
      transactionReference: input.transactionReference,
      amountPesewas: input.amountPesewas,
      currency: input.currency,
      rawStatus: status,
    });
    return { providerRefundId, status };
  }

  async fetchRefund(providerRefundId: string): Promise<ParsedPaystackRefundLookup> {
    const row = this.refundStore.get(providerRefundId);
    if (!row) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Paystack refund not found',
      });
    }
    return row;
  }

  async fetchTransaction(reference: string): Promise<PaystackTransactionLookup> {
    const row = this.transactions.get(reference);
    if (!row) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Paystack transaction not found',
      });
    }
    return row;
  }

  markTransactionSuccess(reference: string, amountPesewas: number, currency = 'GHS') {
    this.transactions.set(reference, {
      reference,
      status: 'success',
      amountPesewas,
      currency,
    });
  }

  markRefundProcessed(providerRefundId: string) {
    const row = this.refundStore.get(providerRefundId);
    if (!row) return;
    this.refundStore.set(providerRefundId, { ...row, status: 'processed', rawStatus: 'processed' });
  }
}

export class HttpPaystackClient implements PaystackClient {
  constructor(private readonly secretKey: string) {}

  async initializeTransaction(
    input: InitializeTransactionInput,
  ): Promise<InitializeTransactionResult> {
    if (!this.secretKey) {
      throw new AppError({
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Paystack is not configured',
      });
    }
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: input.email,
        amount: input.amountPesewas,
        currency: input.currency,
        reference: input.reference,
        metadata: input.metadata,
        callback_url: input.callbackUrl,
      }),
    });
    const body = (await response.json()) as {
      status?: boolean;
      message?: string;
      data?: { authorization_url?: string; access_code?: string; reference?: string };
    };
    if (!response.ok || !body.status || !body.data?.authorization_url || !body.data.reference) {
      throw new AppError({
        status: 502,
        code: 'PAYMENT_VERIFICATION_FAILED',
        message: body.message ?? 'Paystack initialize failed',
      });
    }
    return {
      authorizationUrl: body.data.authorization_url,
      accessCode: body.data.access_code ?? '',
      reference: body.data.reference,
    };
  }

  async createRefund(input: CreateRefundInput): Promise<CreateRefundResult> {
    if (!this.secretKey) {
      throw new AppError({
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Paystack is not configured',
      });
    }
    // No provider-side idempotency key is supported by this endpoint.
    const response = await fetch('https://api.paystack.co/refund', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transaction: input.transactionReference,
        amount: input.amountPesewas,
        currency: input.currency,
        merchant_note: input.merchantNote,
      }),
    });
    const body = (await response.json()) as {
      status?: boolean;
      message?: string;
      data?: { id?: number | string; status?: string };
    };
    if (!response.ok || !body.status || body.data?.id == null) {
      throw new AppError({
        status: 502,
        code: 'PAYMENT_VERIFICATION_FAILED',
        message: body.message ?? 'Paystack refund failed',
      });
    }
    return {
      providerRefundId: String(body.data.id),
      status: mapPaystackRefundStatus(body.data.status),
    };
  }

  async fetchRefund(providerRefundId: string): Promise<ParsedPaystackRefundLookup> {
    if (!this.secretKey) {
      throw new AppError({
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Paystack is not configured',
      });
    }
    const response = await fetch(`https://api.paystack.co/refund/${providerRefundId}`, {
      headers: { Authorization: `Bearer ${this.secretKey}` },
    });
    const body = (await response.json()) as {
      status?: boolean;
      message?: string;
      data?: ParsedPaystackRefundLookup extends never ? never : {
        id?: number | string;
        status?: string;
        amount?: number;
        currency?: string;
        transaction?: { reference?: string } | string;
      };
    };
    if (!response.ok || !body.status) {
      throw new AppError({
        status: response.status === 404 ? 404 : 502,
        code: response.status === 404 ? 'NOT_FOUND' : 'PAYMENT_VERIFICATION_FAILED',
        message: body.message ?? 'Paystack refund lookup failed',
      });
    }
    const parsed = parsePaystackRefundLookupBody(body);
    if (!parsed) {
      throw new AppError({
        status: 502,
        code: 'PAYMENT_VERIFICATION_FAILED',
        message: 'Paystack refund lookup returned an unexpected payload',
      });
    }
    return parsed;
  }

  async fetchTransaction(reference: string): Promise<PaystackTransactionLookup> {
    if (!this.secretKey) {
      throw new AppError({
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Paystack is not configured',
      });
    }
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${this.secretKey}` } },
    );
    const body = (await response.json()) as {
      status?: boolean;
      message?: string;
      data?: { reference?: string; status?: string; amount?: number; currency?: string };
    };
    if (!response.ok || !body.status || !body.data?.reference) {
      throw new AppError({
        status: response.status === 404 ? 404 : 502,
        code: response.status === 404 ? 'NOT_FOUND' : 'PAYMENT_VERIFICATION_FAILED',
        message: body.message ?? 'Paystack transaction lookup failed',
      });
    }
    const raw = (body.data.status ?? '').toLowerCase();
    const status: PaystackTransactionLookup['status'] =
      raw === 'success'
        ? 'success'
        : raw === 'failed'
          ? 'failed'
          : raw === 'abandoned'
            ? 'abandoned'
            : raw === 'ongoing' || raw === 'pending'
              ? 'ongoing'
              : 'unknown';
    return {
      reference: body.data.reference,
      status,
      amountPesewas: typeof body.data.amount === 'number' ? body.data.amount : null,
      currency: body.data.currency ? body.data.currency.toUpperCase() : null,
    };
  }
}

export function createPaystackClient(): PaystackClient {
  if (env.NODE_ENV === 'test' || !env.PAYSTACK_SECRET_KEY) {
    return new MemoryPaystackClient();
  }
  return new HttpPaystackClient(env.PAYSTACK_SECRET_KEY);
}

export function hashWebhookPayload(rawBody: Buffer): string {
  return createHash('sha256').update(rawBody).digest('hex');
}

/** Synthetic email for Paystack when only phone identity exists. */
export function passengerPaymentEmail(userId: string): string {
  return `passenger+${userId.replace(/-/g, '')}@payments.cyrlo.local`;
}

export function riderPaymentEmail(userId: string): string {
  return `rider+${userId.replace(/-/g, '')}@payments.cyrlo.local`;
}
