import { createHash } from 'node:crypto';

import { BOOKING_FEE_PESEWAS } from '../../config/constants.js';
import { decideFeeSuccessFinalize } from '../bookings/connection-fee-lifecycle.js';
import { env } from '../../config/env.js';
import { AppError } from '../../common/errors/app-error.js';
import { enqueueInAppNotification } from '../../infrastructure/notifications/notify.js';
import {
  createPaystackClient,
  hashWebhookPayload,
  passengerPaymentEmail,
  type PaystackClient,
} from '../../infrastructure/payments/paystack-client.js';
import { isPaystackRefundEventType } from '../../infrastructure/payments/paystack-refunds.js';
import { verifyPaystackSignature } from '../../infrastructure/payments/paystack.js';
import type { AuditService } from '../audit/module.service.js';
import type { BookingsService } from '../bookings/module.service.js';
import type { MatchingService } from '../matching/module.service.js';
import type { WalletService } from '../wallet/module.service.js';
import type {
  InitiateBookingFeeInput,
  PaystackWebhookInput,
} from './module.schema.js';
import type { PaymentsRepository } from './module.repository.js';
import { RECON_CASE_TYPES } from './refund-lifecycle.js';
import { RefundProcessor } from './refund-processor.js';
import type { PaymentRefundStatus, PrismaClient } from '@prisma/client';

export interface PaymentsServiceDeps {
  audit: AuditService;
  prisma: PrismaClient;
  bookings: BookingsService;
  matching?: MatchingService;
  wallet?: WalletService;
  paystack?: PaystackClient;
  now?: () => Date;
}

export interface PaymentsService {
  initiateBookingFee(
    userId: string,
    input: InitiateBookingFeeInput,
    ip?: string,
  ): Promise<unknown>;
  handlePaystackWebhook(input: PaystackWebhookInput): Promise<{ accepted: boolean }>;
  listRefundsForFinance(status?: PaymentRefundStatus): Promise<unknown>;
  executeRefund(actorId: string, refundId: string, ip?: string): Promise<unknown>;
  reconcileRefund(actorId: string, refundId: string, ip?: string): Promise<unknown>;
  listReconciliationCases(status?: 'OPEN' | 'IN_REVIEW' | 'RESOLVED'): Promise<unknown>;
  resolveReconciliationCase(
    actorId: string,
    caseId: string,
    notes?: string,
  ): Promise<unknown>;
  listRefundReconciliationAttempts(refundId: string): Promise<unknown>;
  processRefundWorkerTick?(): Promise<{
    submitted: number;
    reconciled: number;
    missingRefundsQueued: number;
  }>;
}

export class PaymentsServiceImpl implements PaymentsService {
  private readonly now: () => Date;
  private readonly paystack: PaystackClient;
  private readonly refunds: RefundProcessor;

  constructor(
    private readonly repository: PaymentsRepository,
    private readonly deps: PaymentsServiceDeps,
  ) {
    this.now = deps.now ?? (() => new Date());
    this.paystack = deps.paystack ?? createPaystackClient();
    this.refunds = new RefundProcessor({
      prisma: deps.prisma,
      audit: deps.audit,
      paystack: this.paystack,
      now: this.now,
    });
  }

  async initiateBookingFee(userId: string, input: InitiateBookingFeeInput, _ip?: string) {
    const payment = await this.repository.findBookingFeePayment(input.bookingId, userId);
    if (!payment || !payment.booking) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Booking payment not found' });
    }
    if (payment.booking.passengerId !== userId) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Booking payment not found' });
    }
    const status = payment.booking.status;
    // Legacy: AWAITING_PAYMENT. Destination-free: ACCEPTED / IN_PROGRESS after rider accept.
    if (
      status !== 'AWAITING_PAYMENT' &&
      status !== 'ACCEPTED' &&
      status !== 'IN_PROGRESS'
    ) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Booking is not awaiting a connection fee payment',
      });
    }
    if (payment.status !== 'PENDING') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Connection fee payment is not pending',
      });
    }
    if (payment.amountPesewas !== BOOKING_FEE_PESEWAS) {
      throw new AppError({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'Stored connection fee amount is invalid',
      });
    }
    const reference = payment.providerReference ?? `bf_${payment.id.replace(/-/g, '')}`;
    if (!payment.providerReference) {
      await this.deps.prisma.payment.update({
        where: { id: payment.id },
        data: { providerReference: reference },
      });
    }
    const init = await this.paystack.initializeTransaction({
      email: passengerPaymentEmail(userId),
      amountPesewas: BOOKING_FEE_PESEWAS,
      currency: 'GHS',
      reference,
      metadata: {
        bookingId: input.bookingId,
        paymentId: payment.id,
        purpose: 'BOOKING_FEE',
        feeType: 'connection_fee',
      },
    });
    const expiresAt =
      payment.booking.paymentExpiresAt?.toISOString() ??
      new Date(Date.now() + 10 * 60 * 1000).toISOString();
    return {
      paymentId: payment.id,
      bookingId: input.bookingId,
      amountPesewas: BOOKING_FEE_PESEWAS,
      currency: 'GHS',
      reference: init.reference,
      authorizationUrl: init.authorizationUrl,
      accessCode: init.accessCode,
      paymentExpiresAt: expiresAt,
    };
  }

  async handlePaystackWebhook(input: PaystackWebhookInput): Promise<{ accepted: boolean }> {
    if (!verifyPaystackSignature(input.rawBody, input.signature, env.PAYSTACK_SECRET_KEY)) {
      // In test with Memory client, allow a special secret or empty: still reject when signature invalid.
      if (env.NODE_ENV === 'test' && env.PAYSTACK_SECRET_KEY === '') {
        // Tests supply a valid signature against a test secret via env; if empty, require signature present.
      }
      throw new AppError({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Invalid Paystack signature',
      });
    }

    let payload: {
      event?: string;
      data?: {
        id?: number | string;
        reference?: string;
        amount?: number;
        currency?: string;
        status?: string;
        metadata?: { bookingId?: string; paymentId?: string };
      };
    };
    try {
      payload = JSON.parse(input.rawBody.toString('utf8')) as typeof payload;
    } catch {
      throw new AppError({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid webhook JSON',
      });
    }

    const eventType = payload.event ?? 'unknown';
    const providerEventId =
      payload.data?.id != null
        ? `paystack:${eventType}:${payload.data.id}`
        : `paystack:${eventType}:${createHash('sha256').update(input.rawBody).digest('hex')}`;
    const reference =
      typeof payload.data?.reference === 'string'
        ? payload.data.reference
        : typeof (payload.data as { transaction?: { reference?: string } } | undefined)?.transaction
              ?.reference === 'string'
          ? (payload.data as { transaction: { reference: string } }).transaction.reference
          : undefined;
    const payloadHash = hashWebhookPayload(input.rawBody);

    // Insert-or-load webhook event. Duplicate delivery must re-apply if prior run crashed
    // before processedAt was set (financial architecture crash-recovery rule).
    let eventRow = await this.deps.prisma.paymentWebhookEvent.findUnique({
      where: { providerEventId },
    });
    if (!eventRow) {
      try {
        eventRow = await this.deps.prisma.paymentWebhookEvent.create({
          data: {
            providerEventId,
            eventType,
            providerReference: reference ?? null,
            payloadHash,
          },
        });
      } catch (error) {
        if (
          typeof error === 'object' &&
          error &&
          'code' in error &&
          (error as { code?: string }).code === 'P2002'
        ) {
          eventRow = await this.deps.prisma.paymentWebhookEvent.findUniqueOrThrow({
            where: { providerEventId },
          });
        } else {
          throw error;
        }
      }
    }
    if (eventRow.processedAt) {
      return { accepted: true };
    }

    try {
      if (isPaystackRefundEventType(eventType)) {
        await this.refunds.applyRefundWebhook(payload);
      } else if (eventType === 'charge.success') {
        await this.applyChargeSuccess(payload.data);
      } else if (eventType === 'charge.failed') {
        await this.applyChargeFailed(payload.data);
      }
      await this.deps.prisma.paymentWebhookEvent.update({
        where: { providerEventId },
        data: { processedAt: this.now(), processingError: null },
      });
    } catch (error) {
      await this.deps.prisma.paymentWebhookEvent.update({
        where: { providerEventId },
        data: {
          processingError: error instanceof Error ? error.message : 'processing_failed',
        },
      });
      throw error;
    }

    return { accepted: true };
  }

  async listRefundsForFinance(status?: PaymentRefundStatus) {
    const rows = await this.repository.listRefunds(status);
    return rows.map((row) => ({
      id: row.id,
      paymentId: row.paymentId,
      bookingId: row.bookingId,
      amountPesewas: row.amountPesewas,
      currency: row.currency,
      status: row.status,
      reason: row.reason,
      attemptNumber: row.attemptNumber,
      maxAttempts: row.maxAttempts,
      providerRefundId: row.providerRefundId,
      providerStatus: row.providerStatus,
      authorizedAt: row.authorizedAt?.toISOString() ?? null,
      authorizedById: row.authorizedById,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
      nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
      failureReason: row.failureReason,
      reconciliationNote: row.reconciliationNote,
      createdAt: row.createdAt.toISOString(),
      payment: row.payment,
    }));
  }

  async executeRefund(actorId: string, refundId: string, ip?: string) {
    await this.refunds.authorizeRefundExecution({ refundId, actorId, ip });
    return this.refunds.submitRefund({ refundId, actorId, ip });
  }

  async reconcileRefund(actorId: string, refundId: string, _ip?: string) {
    return this.refunds.reconcileRefundWithProvider({ refundId, actorId });
  }

  async listReconciliationCases(status?: 'OPEN' | 'IN_REVIEW' | 'RESOLVED') {
    const rows = await this.deps.prisma.financialReconciliationCase.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      caseType: row.caseType,
      status: row.status,
      paymentId: row.paymentId,
      refundId: row.refundId,
      tokenPurchaseId: row.tokenPurchaseId,
      providerReference: row.providerReference,
      reason: row.reason,
      notes: row.notes,
      resolvedById: row.resolvedById,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async resolveReconciliationCase(actorId: string, caseId: string, notes?: string) {
    const row = await this.refunds.resolveReconciliationCase({
      caseId,
      actorId,
      notes,
    });
    return {
      id: row.id,
      status: row.status,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      notes: row.notes,
    };
  }

  async listRefundReconciliationAttempts(refundId: string) {
    const refund = await this.deps.prisma.paymentRefund.findUnique({
      where: { id: refundId },
      select: { id: true },
    });
    if (!refund) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Refund not found' });
    }
    const rows = await this.deps.prisma.refundReconciliationAttempt.findMany({
      where: { refundId },
      orderBy: { attemptedAt: 'desc' },
      take: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      outcome: row.outcome,
      localStatus: row.localStatus,
      providerStatus: row.providerStatus,
      notes: row.notes,
      actorId: row.actorId,
      attemptedAt: row.attemptedAt.toISOString(),
    }));
  }

  async processRefundWorkerTick() {
    return this.refunds.processDueWork();
  }

  private async applyChargeSuccess(data: {
    reference?: string;
    amount?: number;
    currency?: string;
    status?: string;
    metadata?: { bookingId?: string; paymentId?: string; purpose?: string; riderId?: string };
  } = {}) {
    if (!data.reference) {
      throw new AppError({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Webhook missing payment reference',
      });
    }
    const payment = await this.repository.findPaymentByReference(data.reference);
    if (!payment) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Payment not found for reference',
      });
    }
    if (data.amount !== payment.amountPesewas || (data.currency ?? 'GHS').toUpperCase() !== payment.currency) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Webhook amount or currency does not match stored payment',
      });
    }
    if (
      payment.purpose === 'BOOKING_FEE' &&
      data.metadata?.bookingId &&
      payment.bookingId &&
      data.metadata.bookingId !== payment.bookingId
    ) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Webhook booking metadata does not match payment',
      });
    }
    if (
      payment.purpose === 'TOKEN_PURCHASE' &&
      data.metadata?.paymentId &&
      data.metadata.paymentId !== payment.id
    ) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Webhook payment metadata does not match payment',
      });
    }
    if (
      payment.purpose === 'TOKEN_PURCHASE' &&
      data.metadata?.riderId &&
      data.metadata.riderId !== payment.userId
    ) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Webhook rider metadata does not match payment owner',
      });
    }

    const now = this.now();
    const priorStatus = payment.status;

    if (payment.status === 'SUCCESS') {
      if (payment.purpose === 'TOKEN_PURCHASE') {
        await this.finalizeTokenPurchaseAfterSuccess(payment, false);
        return;
      }
      // Replay after crash between SUCCESS and booking effect: re-apply SEARCHING or refund.
      if (payment.purpose === 'BOOKING_FEE' && payment.booking) {
        await this.finalizeBookingFeeAfterSuccess(payment, payment.booking, now);
      }
      return;
    }
    if (payment.status !== 'PENDING' && payment.status !== 'ABANDONED') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: `Payment cannot move from ${payment.status} to SUCCESS`,
      });
    }

    // Late capture from ABANDONED records the charge (immutable SUCCESS) without inventing
    // a new payment row. Lock booking then payment so unpaid-cancel cannot race past SUCCESS.
    await this.deps.prisma.$transaction(async (tx) => {
      if (payment.bookingId) {
        await tx.$executeRaw`SELECT id FROM bookings WHERE id = ${payment.bookingId}::uuid FOR UPDATE`;
      }
      await tx.$executeRaw`SELECT id FROM payments WHERE id = ${payment.id}::uuid FOR UPDATE`;
      const locked = await tx.payment.findUnique({ where: { id: payment.id } });
      if (!locked || locked.status === 'SUCCESS') return;
      if (locked.status !== 'PENDING' && locked.status !== 'ABANDONED') {
        throw new AppError({
          status: 409,
          code: 'CONFLICT',
          message: `Payment cannot move from ${locked.status} to SUCCESS`,
        });
      }
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'SUCCESS' },
      });
    });

    if (payment.purpose === 'TOKEN_PURCHASE') {
      await this.finalizeTokenPurchaseAfterSuccess(payment, priorStatus === 'ABANDONED');
      return;
    }

    if (payment.purpose !== 'BOOKING_FEE' || !payment.booking) {
      return;
    }

    await this.finalizeBookingFeeAfterSuccess(payment, payment.booking, now);
  }

  /**
   * Token purchase SUCCESS: credit only when purchase is still PENDING (or already PAID idempotent).
   * Abandoned/failed purchases that later capture money go to Finance review — no auto credit/refund.
   */
  private async finalizeTokenPurchaseAfterSuccess(
    payment: { id: string; userId: string; providerReference: string | null },
    lateAbandonedCapture: boolean,
  ) {
    const purchase = await this.deps.prisma.tokenPurchase.findUnique({
      where: { paymentId: payment.id },
    });
    if (!purchase) {
      await this.refunds.openReconciliationCase({
        caseType: RECON_CASE_TYPES.ABANDONED_TOKEN_PURCHASE_SUCCESS,
        paymentId: payment.id,
        refundId: null,
        tokenPurchaseId: null,
        providerReference: payment.providerReference,
        reason: 'TOKEN_PURCHASE payment SUCCESS without purchase row',
      });
      return;
    }

    if (purchase.status === 'PAID') {
      await this.deps.wallet?.fulfillPaidPurchase(payment.id);
      return;
    }

    if (
      lateAbandonedCapture ||
      purchase.status === 'ABANDONED' ||
      purchase.status === 'FAILED'
    ) {
      if (purchase.status === 'PENDING') {
        await this.deps.prisma.tokenPurchase.updateMany({
          where: { id: purchase.id, status: 'PENDING' },
          data: { status: 'ABANDONED' },
        });
      }
      await this.refunds.openReconciliationCase({
        caseType: RECON_CASE_TYPES.ABANDONED_TOKEN_PURCHASE_SUCCESS,
        paymentId: payment.id,
        refundId: null,
        tokenPurchaseId: purchase.id,
        providerReference: payment.providerReference,
        reason:
          'Late SUCCESS on abandoned/failed token purchase — charge recorded; no automatic token credit or refund',
      });
      await this.deps.audit.record({
        action: 'payment.abandoned_token_purchase.reconciled',
        entityType: 'token_purchase',
        entityId: purchase.id,
        metadata: {
          paymentId: payment.id,
          purchaseStatus: purchase.status,
          lateAbandonedCapture,
        },
      });
      enqueueInAppNotification(this.deps.prisma, {
        userId: purchase.riderId,
        title: 'Token purchase under review',
        body: 'A late payment was received for a closed purchase. Finance will review before any credit.',
        data: { purchaseId: purchase.id, paymentId: payment.id, status: 'FINANCE_REVIEW' },
      });
      return;
    }

    await this.deps.wallet?.fulfillPaidPurchase(payment.id);
  }

  /**
   * After connection-fee SUCCESS:
   * - Destination-free (ACCEPTED/IN_PROGRESS): confirm paid; trip already assigned.
   * - Legacy (AWAITING_PAYMENT): move to SEARCHING when on-time, else refund.
   * Safe to call on webhook replay.
   */
  private async finalizeBookingFeeAfterSuccess(
    payment: { id: string; amountPesewas: number },
    bookingSnapshot: {
      id: string;
      status: string;
      passengerId: string;
      paymentExpiresAt: Date | null;
    },
    now: Date,
  ) {
    const booking = await this.deps.prisma.booking.findUnique({
      where: { id: bookingSnapshot.id },
    });
    if (!booking) return;

    const decision = decideFeeSuccessFinalize({
      bookingStatus: booking.status as
        | 'ACCEPTED'
        | 'IN_PROGRESS'
        | 'AWAITING_PAYMENT'
        | 'SEARCHING'
        | 'CANCELLED'
        | 'EXPIRED'
        | 'PAYMENT_FAILED'
        | 'COMPLETED',
      paymentExpiresAt: booking.paymentExpiresAt,
      now,
    });

    if (decision.action === 'confirm_paid') {
      enqueueInAppNotification(this.deps.prisma, {
        userId: booking.passengerId,
        title: 'Connection fee paid',
        body: 'GH₵1 Cyrlo connection fee received. Agree destination and transport fare with your rider directly.',
        data: { bookingId: booking.id, status: booking.status, connectionFee: 'SUCCESS' },
        dedupeKey: `connection_fee_paid:${booking.id}`,
      });
      return;
    }

    if (decision.action === 'noop') {
      return;
    }

    if (decision.action === 'legacy_searching') {
      const searching = await this.deps.bookings.markSearchingAfterFeeSuccess(booking.id, now);
      if (searching) {
        enqueueInAppNotification(this.deps.prisma, {
          userId: booking.passengerId,
          title: 'Payment successful',
          body: 'Your connection fee was received. Searching for a rider.',
          data: { bookingId: booking.id, status: 'SEARCHING' },
        });
        void this.deps.matching?.dispatchForBooking(booking.id).catch(() => undefined);
        return;
      }
      // Race with unpaid expiry on legacy path.
      if (booking.status === 'AWAITING_PAYMENT') {
        await this.deps.bookings.expireUnpaidBookings(now);
      }
    }

    // refund_late — never revive CANCELLED / EXPIRED / PAYMENT_FAILED.
    await this.deps.bookings.requestFeeRefund({
      paymentId: payment.id,
      bookingId: booking.id,
      amountPesewas: payment.amountPesewas,
      requestedById: null,
      reason: 'late_payment_after_deadline',
      authorizeForExecution: true,
    });
    enqueueInAppNotification(this.deps.prisma, {
      userId: booking.passengerId,
      title: 'Late payment received',
      body:
        booking.status === 'CANCELLED' || booking.status === 'PAYMENT_FAILED'
          ? 'A payment arrived after the connection was closed. A refund was queued; the booking stays cancelled.'
          : 'A payment arrived after the deadline. A refund was queued for finance.',
      data: { bookingId: booking.id, status: booking.status },
      dedupeKey: `connection_fee_late_refund:${booking.id}:${payment.id}`,
    });
    await this.deps.audit.record({
      action: 'payment.late_success.refund_queued',
      entityType: 'payment',
      entityId: payment.id,
      metadata: {
        bookingId: booking.id,
        bookingStatus: booking.status,
        reason: decision.action === 'refund_late' ? decision.reason : 'legacy_race',
      },
    });
  }

  private async applyChargeFailed(data: { reference?: string } = {}) {
    if (!data.reference) return;
    const payment = await this.repository.findPaymentByReference(data.reference);
    if (!payment || payment.status !== 'PENDING') return;
    await this.deps.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED' },
    });
    if (payment.purpose === 'TOKEN_PURCHASE') {
      await this.deps.wallet?.markPurchaseFailed(payment.id);
      return;
    }
    if (!payment.booking) return;
    if (payment.booking.status === 'AWAITING_PAYMENT') {
      await this.deps.bookings.markPaymentFailed(payment.booking.id, 'provider_charge_failed');
      enqueueInAppNotification(this.deps.prisma, {
        userId: payment.booking.passengerId,
        title: 'Booking payment failed',
        body: 'The connection-fee charge failed.',
        data: { bookingId: payment.booking.id, status: 'PAYMENT_FAILED' },
      });
      return;
    }
    if (payment.booking.status === 'ACCEPTED' || payment.booking.status === 'IN_PROGRESS') {
      // Keep assignment; passenger can retry initiateBookingFee within paymentExpiresAt.
      enqueueInAppNotification(this.deps.prisma, {
        userId: payment.booking.passengerId,
        title: 'Connection fee payment failed',
        body: 'Pay the GH₵1 Cyrlo connection fee to keep this ride connection. Transport fare is separate and agreed with your rider.',
        data: { bookingId: payment.booking.id, status: payment.booking.status },
        dedupeKey: `connection_fee_failed:${payment.booking.id}`,
      });
    }
  }
}
