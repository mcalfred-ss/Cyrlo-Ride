import { randomUUID } from 'node:crypto';

import type { PaymentRefundStatus, PrismaClient } from '@prisma/client';

import { AppError } from '../../common/errors/app-error.js';
import { IdempotencyKey } from '../../common/utils/idempotency.js';
import { logger } from '../../config/logger.js';
import { enqueueInAppNotification } from '../../infrastructure/notifications/notify.js';
import type { PaystackClient } from '../../infrastructure/payments/paystack-client.js';
import {
  parsePaystackRefundWebhookPayload,
  type ParsedPaystackRefundStatus,
} from '../../infrastructure/payments/paystack-refunds.js';
import type { AuditService } from '../audit/module.service.js';
import {
  decideRefunds,
  feeRefundReasonForSituation,
  situationForMissingFeeRefund,
} from '../bookings/booking-rules.js';
import {
  computeRefundBackoffMs,
  isRefundAuthorizedForExecution,
  isRefundEligibleForSubmit,
  localStatusFromProvider,
  RECON_CASE_TYPES,
  REFUND_STALE_PROCESSING_MS,
} from './refund-lifecycle.js';

export interface RefundProcessorDeps {
  prisma: PrismaClient;
  audit: AuditService;
  paystack: PaystackClient;
  now?: () => Date;
}

/**
 * Durable refund submit + reconcile. Network calls happen outside DB transactions.
 *
 * Paystack Create Refund has no client idempotency key — local claim + unique
 * provider_refund_id + webhook/reconcile prevent duplicate money movement.
 */
export class RefundProcessor {
  private readonly now: () => Date;

  constructor(private readonly deps: RefundProcessorDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Finance authorization for Paystack execution. Concurrency-safe: only the first
   * writer sets authorized_at. Does not submit to Paystack.
   */
  async authorizeRefundExecution(input: {
    refundId: string;
    actorId: string;
    ip?: string;
  }): Promise<{ id: string; authorizedAt: Date }> {
    const existing = await this.deps.prisma.paymentRefund.findUnique({
      where: { id: input.refundId },
    });
    if (!existing) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Refund not found' });
    }
    if (existing.authorizedAt) {
      return { id: existing.id, authorizedAt: existing.authorizedAt };
    }
    if (!isRefundEligibleForSubmit(existing.status)) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Refund cannot be authorized in its current status',
      });
    }

    const now = this.now();
    const updated = await this.deps.prisma.paymentRefund.updateMany({
      where: {
        id: input.refundId,
        authorizedAt: null,
        status: { in: ['REQUESTED', 'FAILED'] },
      },
      data: {
        authorizedAt: now,
        authorizedById: input.actorId,
      },
    });
    if (updated.count !== 1) {
      const raced = await this.deps.prisma.paymentRefund.findUnique({
        where: { id: input.refundId },
      });
      if (raced?.authorizedAt) {
        return { id: raced.id, authorizedAt: raced.authorizedAt };
      }
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Refund could not be authorized',
      });
    }

    await this.deps.audit.record({
      actorId: input.actorId,
      action: 'payment.refund.authorized',
      entityType: 'payment_refund',
      entityId: input.refundId,
      metadata: { paymentId: existing.paymentId, previousStatus: existing.status },
      ipAddress: input.ip,
    });

    return { id: input.refundId, authorizedAt: now };
  }

  /** Finance-triggered or worker-triggered submit. Requires authorizedAt at claim. */
  async submitRefund(input: {
    refundId: string;
    actorId: string | null;
    workerId?: string;
    ip?: string;
  }): Promise<{ id: string; status: PaymentRefundStatus; providerRefundId: string | null }> {
    const now = this.now();
    const workerId = input.workerId ?? `finance-${input.actorId ?? 'system'}`;

    const refund = await this.deps.prisma.paymentRefund.findUnique({
      where: { id: input.refundId },
      include: { payment: true },
    });
    if (!refund) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Refund not found' });
    }
    if (!isRefundEligibleForSubmit(refund.status)) {
      // Already submitted — reconcile instead of double-create.
      if (refund.status === 'PROCESSING' && refund.providerRefundId) {
        return this.reconcileRefundWithProvider({
          refundId: refund.id,
          actorId: input.actorId,
        });
      }
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Refund is not executable in its current status',
      });
    }
    if (!isRefundAuthorizedForExecution(refund)) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Refund is not authorized for Paystack execution',
      });
    }
    if (refund.payment.status !== 'SUCCESS' || !refund.payment.providerReference) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Original payment is not refundable',
      });
    }
    if (refund.providerRefundId) {
      // Prior attempt already received a provider id — never create another refund.
      await this.deps.prisma.paymentRefund.update({
        where: { id: refund.id },
        data: {
          status: 'MANUAL_RECONCILIATION',
          reconciliationNote: 'provider_refund_id_present_on_failed_row',
          lockedBy: null,
          lockedAt: null,
        },
      });
      await this.openReconciliationCase({
        caseType: RECON_CASE_TYPES.REFUND_MANUAL_REVIEW,
        paymentId: refund.paymentId,
        refundId: refund.id,
        providerReference: refund.payment.providerReference,
        reason: 'FAILED refund row already has providerRefundId; refusing duplicate createRefund',
      });
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Refund requires manual reconciliation (provider id already issued)',
      });
    }

    const reviewedById =
      input.actorId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.actorId)
        ? input.actorId
        : undefined;
    // Authorization enforced at the claim boundary (authorized_at IS NOT NULL).
    const claimed = await this.deps.prisma.paymentRefund.updateMany({
      where: {
        id: refund.id,
        status: { in: ['REQUESTED', 'FAILED'] },
        providerRefundId: null,
        authorizedAt: { not: null },
      },
      data: {
        status: 'PROCESSING',
        lockedBy: workerId,
        lockedAt: now,
        ...(reviewedById ? { reviewedById } : {}),
        failureReason: null,
      },
    });
    if (claimed.count !== 1) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Refund is already being processed or is not executable',
      });
    }

    await this.deps.audit.record({
      actorId: input.actorId ?? undefined,
      action: 'payment.refund.submission_attempted',
      entityType: 'payment_refund',
      entityId: refund.id,
      metadata: { paymentId: refund.paymentId, attemptNumber: refund.attemptNumber },
      ipAddress: input.ip,
    });

    let providerResult: { providerRefundId: string; status: ParsedPaystackRefundStatus };
    try {
      providerResult = await this.deps.paystack.createRefund({
        transactionReference: refund.payment.providerReference,
        amountPesewas: refund.amountPesewas,
        currency: refund.currency,
        merchantNote: refund.reason,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'refund_failed';
      const nextAttempt = refund.attemptNumber + 1;
      const exhausted = nextAttempt > refund.maxAttempts;
      await this.deps.prisma.paymentRefund.update({
        where: { id: refund.id },
        data: exhausted
          ? {
              status: 'MANUAL_RECONCILIATION',
              failureReason: message,
              lockedBy: null,
              lockedAt: null,
              attemptNumber: nextAttempt,
              reconciliationNote: 'max_submit_attempts_exhausted',
            }
          : {
              status: 'FAILED',
              failureReason: message,
              lockedBy: null,
              lockedAt: null,
              attemptNumber: nextAttempt,
              nextAttemptAt: new Date(now.getTime() + computeRefundBackoffMs(nextAttempt)),
            },
      });
      await this.deps.audit.record({
        actorId: input.actorId ?? undefined,
        action: exhausted ? 'payment.refund.manual_review_required' : 'payment.refund.failed',
        entityType: 'payment_refund',
        entityId: refund.id,
        metadata: { paymentId: refund.paymentId, failureReason: message, exhausted },
        ipAddress: input.ip,
      });
      if (exhausted) {
        await this.openReconciliationCase({
          caseType: RECON_CASE_TYPES.REFUND_MANUAL_REVIEW,
          paymentId: refund.paymentId,
          refundId: refund.id,
          providerReference: refund.payment.providerReference,
          reason: `Submit exhausted after ${nextAttempt} attempts: ${message}`,
        });
      }
      this.notifyPassenger(refund.bookingId, refund.id, exhausted ? 'MANUAL_RECONCILIATION' : 'FAILED');
      throw error;
    }

    const nextStatus = localStatusFromProvider(providerResult.status) ?? 'PROCESSING';
    const updated = await this.deps.prisma.paymentRefund.update({
      where: { id: refund.id },
      data: {
        status: nextStatus,
        providerRefundId: providerResult.providerRefundId,
        providerStatus: providerResult.status,
        submittedAt: now,
        confirmedAt: nextStatus === 'SUCCEEDED' ? now : null,
        failureReason: nextStatus === 'FAILED' ? 'provider_failed' : null,
        lockedBy: null,
        lockedAt: null,
        nextAttemptAt: nextStatus === 'PROCESSING' ? new Date(now.getTime() + REFUND_STALE_PROCESSING_MS) : null,
      },
    });

    await this.deps.audit.record({
      actorId: input.actorId ?? undefined,
      action:
        nextStatus === 'SUCCEEDED'
          ? 'payment.refund.confirmed_successful'
          : nextStatus === 'FAILED'
            ? 'payment.refund.failed'
            : 'payment.refund.submitted',
      entityType: 'payment_refund',
      entityId: refund.id,
      metadata: {
        paymentId: refund.paymentId,
        providerRefundId: providerResult.providerRefundId,
        providerStatus: providerResult.status,
        status: nextStatus,
      },
      ipAddress: input.ip,
    });

    this.notifyPassenger(refund.bookingId, refund.id, nextStatus);
    return {
      id: updated.id,
      status: updated.status,
      providerRefundId: updated.providerRefundId,
    };
  }

  async applyRefundWebhook(rawPayload: unknown): Promise<void> {
    const parsed = parsePaystackRefundWebhookPayload(
      rawPayload as Parameters<typeof parsePaystackRefundWebhookPayload>[0],
    );
    if (!parsed) {
      throw new AppError({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Unsupported or invalid refund webhook payload',
      });
    }

    const refund = await this.deps.prisma.paymentRefund.findFirst({
      where: { providerRefundId: parsed.providerRefundId },
      include: { payment: true },
    });
    if (!refund) {
      // Out-of-order: provider refund id not yet stored — open case, do not invent a refund.
      await this.openReconciliationCase({
        caseType: RECON_CASE_TYPES.REFUND_PROVIDER_DISCREPANCY,
        paymentId: null,
        refundId: null,
        providerReference: parsed.transactionReference,
        reason: `Refund webhook ${parsed.eventType} for unknown providerRefundId ${parsed.providerRefundId}`,
      });
      await this.deps.audit.record({
        action: 'payment.refund.discrepancy_detected',
        entityType: 'payment_refund',
        entityId: parsed.providerRefundId,
        metadata: {
          eventType: parsed.eventType,
          transactionReference: parsed.transactionReference,
        },
      });
      return;
    }

    if (
      parsed.transactionReference &&
      refund.payment.providerReference &&
      parsed.transactionReference !== refund.payment.providerReference
    ) {
      await this.openReconciliationCase({
        caseType: RECON_CASE_TYPES.REFUND_PROVIDER_DISCREPANCY,
        paymentId: refund.paymentId,
        refundId: refund.id,
        providerReference: parsed.transactionReference,
        reason: 'Refund webhook transaction reference does not match local payment',
      });
      await this.deps.audit.record({
        action: 'payment.refund.discrepancy_detected',
        entityType: 'payment_refund',
        entityId: refund.id,
        metadata: {
          expectedReference: refund.payment.providerReference,
          webhookReference: parsed.transactionReference,
        },
      });
      return;
    }

    if (
      parsed.amountPesewas != null &&
      parsed.amountPesewas !== refund.amountPesewas
    ) {
      await this.openReconciliationCase({
        caseType: RECON_CASE_TYPES.REFUND_PROVIDER_DISCREPANCY,
        paymentId: refund.paymentId,
        refundId: refund.id,
        providerReference: refund.payment.providerReference,
        reason: `Refund webhook amount ${parsed.amountPesewas} != local ${refund.amountPesewas}`,
      });
      return;
    }

    const mapped = localStatusFromProvider(parsed.status);
    if (!mapped) {
      await this.recordReconcileAttempt({
        refundId: refund.id,
        outcome: 'unknown_provider_status',
        localStatus: refund.status,
        providerStatus: parsed.rawStatus,
        notes: parsed.eventType,
      });
      return;
    }

    // Out-of-order: ignore regressions from SUCCEEDED.
    if (refund.status === 'SUCCEEDED' && mapped !== 'SUCCEEDED') {
      await this.openReconciliationCase({
        caseType: RECON_CASE_TYPES.REFUND_PROVIDER_DISCREPANCY,
        paymentId: refund.paymentId,
        refundId: refund.id,
        providerReference: refund.payment.providerReference,
        reason: `Out-of-order webhook tried to move SUCCEEDED → ${mapped}`,
      });
      return;
    }

    const now = this.now();
    await this.deps.prisma.paymentRefund.update({
      where: { id: refund.id },
      data: {
        status: mapped,
        providerStatus: parsed.status,
        confirmedAt: mapped === 'SUCCEEDED' ? now : refund.confirmedAt,
        failureReason: mapped === 'FAILED' ? 'provider_webhook_failed' : null,
        lockedBy: null,
        lockedAt: null,
      },
    });

    await this.deps.audit.record({
      action:
        mapped === 'SUCCEEDED'
          ? 'payment.refund.confirmed_successful'
          : mapped === 'FAILED'
            ? 'payment.refund.failed'
            : 'payment.refund.processing',
      entityType: 'payment_refund',
      entityId: refund.id,
      metadata: {
        eventType: parsed.eventType,
        providerRefundId: parsed.providerRefundId,
        providerStatus: parsed.status,
      },
    });
    this.notifyPassenger(refund.bookingId, refund.id, mapped);
  }

  async reconcileRefundWithProvider(input: {
    refundId: string;
    actorId: string | null;
  }): Promise<{ id: string; status: PaymentRefundStatus; providerRefundId: string | null }> {
    const refund = await this.deps.prisma.paymentRefund.findUnique({
      where: { id: input.refundId },
      include: { payment: true },
    });
    if (!refund) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Refund not found' });
    }
    if (!refund.providerRefundId) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Refund has no provider refund id to reconcile',
      });
    }

    await this.deps.audit.record({
      actorId: input.actorId ?? undefined,
      action: 'payment.refund.reconciliation_attempted',
      entityType: 'payment_refund',
      entityId: refund.id,
      metadata: { providerRefundId: refund.providerRefundId, localStatus: refund.status },
    });

    const lookup = await this.deps.paystack.fetchRefund(refund.providerRefundId);
    const mapped = localStatusFromProvider(lookup.status);

    await this.recordReconcileAttempt({
      refundId: refund.id,
      actorId: input.actorId,
      outcome: mapped ?? 'unknown_provider_status',
      localStatus: refund.status,
      providerStatus: lookup.rawStatus,
    });

    if (!mapped) {
      await this.openReconciliationCase({
        caseType: RECON_CASE_TYPES.REFUND_PROVIDER_DISCREPANCY,
        paymentId: refund.paymentId,
        refundId: refund.id,
        providerReference: refund.payment.providerReference,
        reason: `Unmapped provider refund status: ${lookup.rawStatus}`,
      });
      return {
        id: refund.id,
        status: refund.status,
        providerRefundId: refund.providerRefundId,
      };
    }

    if (
      lookup.transactionReference &&
      refund.payment.providerReference &&
      lookup.transactionReference !== refund.payment.providerReference
    ) {
      await this.openReconciliationCase({
        caseType: RECON_CASE_TYPES.REFUND_PROVIDER_DISCREPANCY,
        paymentId: refund.paymentId,
        refundId: refund.id,
        providerReference: lookup.transactionReference,
        reason: 'Provider refund transaction reference mismatch',
      });
      await this.deps.audit.record({
        actorId: input.actorId ?? undefined,
        action: 'payment.refund.discrepancy_detected',
        entityType: 'payment_refund',
        entityId: refund.id,
        metadata: {
          localReference: refund.payment.providerReference,
          providerReference: lookup.transactionReference,
        },
      });
      return {
        id: refund.id,
        status: refund.status,
        providerRefundId: refund.providerRefundId,
      };
    }

    if (refund.status === 'SUCCEEDED' && mapped !== 'SUCCEEDED') {
      await this.openReconciliationCase({
        caseType: RECON_CASE_TYPES.REFUND_PROVIDER_DISCREPANCY,
        paymentId: refund.paymentId,
        refundId: refund.id,
        providerReference: refund.payment.providerReference,
        reason: `Local SUCCEEDED but provider reports ${lookup.status}`,
      });
      return {
        id: refund.id,
        status: refund.status,
        providerRefundId: refund.providerRefundId,
      };
    }

    const now = this.now();
    const updated = await this.deps.prisma.paymentRefund.update({
      where: { id: refund.id },
      data: {
        status: mapped,
        providerStatus: lookup.status,
        confirmedAt: mapped === 'SUCCEEDED' ? now : refund.confirmedAt,
        failureReason: mapped === 'FAILED' ? 'provider_reconcile_failed' : null,
        lockedBy: null,
        lockedAt: null,
      },
    });

    await this.deps.audit.record({
      actorId: input.actorId ?? undefined,
      action:
        mapped === 'SUCCEEDED'
          ? 'payment.refund.confirmed_successful'
          : mapped === 'FAILED'
            ? 'payment.refund.failed'
            : 'payment.refund.processing',
      entityType: 'payment_refund',
      entityId: refund.id,
      metadata: { providerStatus: lookup.status, previousStatus: refund.status },
    });

    return {
      id: updated.id,
      status: updated.status,
      providerRefundId: updated.providerRefundId,
    };
  }

  /**
   * Worker tick: submit due REQUESTED/FAILED rows; reconcile stale PROCESSING;
   * queue missing booking-fee refunds for SUCCESS payments on terminal bookings.
   */
  async processDueWork(batchSize = 20): Promise<{
    submitted: number;
    reconciled: number;
    missingRefundsQueued: number;
  }> {
    const now = this.now();
    const workerId = `refund-worker-${randomUUID().slice(0, 8)}`;
    let submitted = 0;
    let reconciled = 0;

    // Reclaim stale PROCESSING locks without provider id → FAILED for retry.
    await this.deps.prisma.paymentRefund.updateMany({
      where: {
        status: 'PROCESSING',
        providerRefundId: null,
        lockedAt: { lte: new Date(now.getTime() - REFUND_STALE_PROCESSING_MS) },
      },
      data: {
        status: 'FAILED',
        failureReason: 'stale_processing_without_provider_id',
        lockedBy: null,
        lockedAt: null,
        nextAttemptAt: now,
      },
    });

    const due = await this.deps.prisma.paymentRefund.findMany({
      where: {
        authorizedAt: { not: null },
        OR: [
          {
            status: 'REQUESTED',
            AND: [
              { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
            ],
          },
          {
            status: 'FAILED',
            providerRefundId: null,
            AND: [
              { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
      select: { id: true },
    });

    for (const row of due) {
      try {
        await this.submitRefund({ refundId: row.id, actorId: null, workerId });
        submitted += 1;
      } catch (error) {
        logger.warn({ err: error, refundId: row.id }, 'refund worker submit failed');
      }
    }

    const staleProcessing = await this.deps.prisma.paymentRefund.findMany({
      where: {
        status: 'PROCESSING',
        providerRefundId: { not: null },
        OR: [
          { nextAttemptAt: null },
          { nextAttemptAt: { lte: now } },
          { lockedAt: { lte: new Date(now.getTime() - REFUND_STALE_PROCESSING_MS) } },
        ],
      },
      orderBy: { updatedAt: 'asc' },
      take: batchSize,
      select: { id: true },
    });

    for (const row of staleProcessing) {
      try {
        await this.reconcileRefundWithProvider({ refundId: row.id, actorId: null });
        reconciled += 1;
      } catch (error) {
        logger.warn({ err: error, refundId: row.id }, 'refund worker reconcile failed');
      }
    }

    const missingRefundsQueued = await this.queueMissingBookingFeeRefunds(batchSize);
    return { submitted, reconciled, missingRefundsQueued };
  }

  /**
   * Recovery only: queue fee refunds missing after a matrix-eligible terminal booking.
   * Eligibility is derived solely from `decideRefunds` — no independent policy.
   */
  async queueMissingBookingFeeRefunds(limit = 20): Promise<number> {
    const payments = await this.deps.prisma.payment.findMany({
      where: {
        purpose: 'BOOKING_FEE',
        status: 'SUCCESS',
        bookingId: { not: null },
        refunds: { none: {} },
        booking: {
          status: { in: ['PAYMENT_FAILED', 'EXPIRED', 'CANCELLED', 'COMPLETED'] },
        },
      },
      take: limit,
      include: {
        booking: {
          select: {
            id: true,
            status: true,
            acceptedAt: true,
            cancellationActorType: true,
            statusHistory: {
              where: { toStatus: 'CANCELLED' },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { toStatus: true, reason: true },
            },
          },
        },
      },
    });

    let queued = 0;
    const now = this.now();
    for (const payment of payments) {
      if (!payment.bookingId || !payment.booking) continue;
      const booking = payment.booking;
      const situation = situationForMissingFeeRefund({
        status: booking.status,
        acceptedAt: booking.acceptedAt,
        cancellationActorType: booking.cancellationActorType,
        statusHistoryReasons: booking.statusHistory,
      });
      if (!situation) continue;

      const tokenDebited = Boolean(
        await this.deps.prisma.tokenLedgerEntry.findFirst({
          where: {
            bookingId: payment.bookingId,
            type: 'DEDUCTION',
          },
          select: { id: true },
        }),
      );
      const decisions = decideRefunds({
        feeCaptured: true,
        tokenDebited,
        situation,
      });
      if (decisions.fee !== 'REQUEST_REFUND') {
        continue;
      }

      try {
        const created = await this.deps.prisma.paymentRefund.create({
          data: {
            paymentId: payment.id,
            bookingId: payment.bookingId,
            amountPesewas: payment.amountPesewas,
            currency: payment.currency,
            status: 'REQUESTED',
            reason: feeRefundReasonForSituation(situation),
            idempotencyKey: IdempotencyKey.bookingFeeRefund(payment.id),
            // Matrix-derived recovery is authorized for worker execution.
            authorizedAt: now,
            authorizedById: null,
          },
        });
        queued += 1;
        await this.deps.audit.record({
          action: 'payment.refund.queued',
          entityType: 'payment_refund',
          entityId: created.id,
          metadata: {
            paymentId: payment.id,
            bookingId: payment.bookingId,
            bookingStatus: booking.status,
            situation,
            feeDecision: decisions.fee,
            tokenDecision: decisions.token,
            source: 'missing_refund_sweeper',
            authorizeForExecution: true,
          },
        });
      } catch (error) {
        if (
          typeof error === 'object' &&
          error &&
          'code' in error &&
          (error as { code?: string }).code === 'P2002'
        ) {
          continue;
        }
        logger.warn({ err: error, paymentId: payment.id }, 'missing refund queue failed');
      }
    }
    return queued;
  }

  async openReconciliationCase(input: {
    caseType: string;
    paymentId: string | null;
    refundId: string | null;
    providerReference: string | null;
    reason: string;
    tokenPurchaseId?: string | null;
  }): Promise<string> {
    if (input.paymentId) {
      const existing = await this.deps.prisma.financialReconciliationCase.findFirst({
        where: {
          paymentId: input.paymentId,
          caseType: input.caseType,
          status: 'OPEN',
        },
      });
      if (existing) return existing.id;
    }
    const created = await this.deps.prisma.financialReconciliationCase.create({
      data: {
        caseType: input.caseType,
        status: 'OPEN',
        paymentId: input.paymentId,
        refundId: input.refundId,
        tokenPurchaseId: input.tokenPurchaseId ?? null,
        providerReference: input.providerReference,
        reason: input.reason,
      },
    });
    await this.deps.audit.record({
      action: 'payment.reconciliation.case_opened',
      entityType: 'financial_reconciliation_case',
      entityId: created.id,
      metadata: {
        caseType: input.caseType,
        paymentId: input.paymentId,
        refundId: input.refundId,
      },
    });
    return created.id;
  }

  async resolveReconciliationCase(input: {
    caseId: string;
    actorId: string;
    notes?: string;
  }) {
    const updated = await this.deps.prisma.financialReconciliationCase.updateMany({
      where: { id: input.caseId, status: { in: ['OPEN', 'IN_REVIEW'] } },
      data: {
        status: 'RESOLVED',
        resolvedById: input.actorId,
        resolvedAt: this.now(),
        notes: input.notes,
      },
    });
    if (updated.count !== 1) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Reconciliation case is not open',
      });
    }
    await this.deps.audit.record({
      actorId: input.actorId,
      action: 'payment.reconciliation.finance_review_completed',
      entityType: 'financial_reconciliation_case',
      entityId: input.caseId,
      metadata: { notes: input.notes ?? null },
    });
    return this.deps.prisma.financialReconciliationCase.findUniqueOrThrow({
      where: { id: input.caseId },
    });
  }

  private async recordReconcileAttempt(input: {
    refundId: string;
    actorId?: string | null;
    outcome: string;
    localStatus: string;
    providerStatus: string | null;
    notes?: string;
  }) {
    const actorId =
      input.actorId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        input.actorId,
      )
        ? input.actorId
        : null;
    await this.deps.prisma.refundReconciliationAttempt.create({
      data: {
        refundId: input.refundId,
        actorId,
        outcome: input.outcome,
        localStatus: input.localStatus,
        providerStatus: input.providerStatus,
        notes: input.notes ?? null,
      },
    });
  }

  private notifyPassenger(
    bookingId: string | null,
    refundId: string,
    status: string,
  ): void {
    if (!bookingId) return;
    void this.deps.prisma.booking
      .findUnique({ where: { id: bookingId }, select: { passengerId: true } })
      .then((booking) => {
        if (!booking) return;
        const title =
          status === 'SUCCEEDED'
            ? 'Refund completed'
            : status === 'FAILED' || status === 'MANUAL_RECONCILIATION'
              ? 'Refund needs attention'
              : 'Refund submitted';
        const body =
          status === 'SUCCEEDED'
            ? 'Your booking-fee refund was confirmed by the payment provider.'
            : status === 'FAILED' || status === 'MANUAL_RECONCILIATION'
              ? 'Your booking-fee refund could not be completed automatically. Finance will review.'
              : 'Your booking-fee refund was submitted and is awaiting provider confirmation.';
        enqueueInAppNotification(this.deps.prisma, {
          userId: booking.passengerId,
          title,
          body,
          data: { bookingId, refundId, status },
        });
      })
      .catch(() => undefined);
  }
}
