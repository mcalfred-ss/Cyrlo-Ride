import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { env } from '../../config/env.js';
import { MemoryPaystackClient } from '../../infrastructure/payments/paystack-client.js';
import { MemoryAuditService } from '../audit/module.service.js';
import { BookingsRepository } from '../bookings/module.repository.js';
import { BookingsServiceImpl } from '../bookings/module.service.js';
import { validateAndNormalizeBoundary } from '../service-zones/zone-geometry.js';
import { Permission, staffRoleHasPermission } from '../../common/authz/permissions.js';
import { REFUND_STALE_PROCESSING_MS } from './refund-lifecycle.js';
import { PaymentsRepository } from './module.repository.js';
import { PaymentsServiceImpl } from './module.service.js';
import { RefundProcessor } from './refund-processor.js';

const prisma = new PrismaClient();
const marker = `m13a-${Date.now()}`;
const createdUserIds: string[] = [];
const createdZoneIds: string[] = [];

const polygon = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [-1.63, 6.68],
      [-1.62, 6.68],
      [-1.62, 6.69],
      [-1.63, 6.69],
      [-1.63, 6.68],
    ],
  ],
};

function sign(body: Buffer) {
  return createHmac('sha512', env.PAYSTACK_SECRET_KEY).update(body).digest('hex');
}

describe('Phase 13A refund authorization + sweeper postgres', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.refundReconciliationAttempt.deleteMany({
      where: { refund: { payment: { userId: { in: createdUserIds } } } },
    });
    await prisma.financialReconciliationCase.deleteMany({
      where: { payment: { userId: { in: createdUserIds } } },
    });
    await prisma.paymentRefund.deleteMany({
      where: { payment: { userId: { in: createdUserIds } } },
    });
    await prisma.tokenLedgerEntry.deleteMany({ where: { riderId: { in: createdUserIds } } });
    await prisma.paymentWebhookEvent.deleteMany({
      where: { providerReference: { startsWith: 'bf_' } },
    });
    await prisma.payment.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.bookingStatusHistory.deleteMany({
      where: { booking: { passengerId: { in: createdUserIds } } },
    });
    await prisma.booking.deleteMany({ where: { passengerId: { in: createdUserIds } } });
    await prisma.riderWallet.deleteMany({ where: { riderId: { in: createdUserIds } } });
    await prisma.riderProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.serviceZone.deleteMany({ where: { id: { in: createdZoneIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  async function setupBookingFee(now: Date, paystack: MemoryPaystackClient) {
    const passenger = await prisma.user.create({
      data: {
        phoneNumber: `+23320${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'PASSENGER',
        status: 'ACTIVE',
        passengerProfile: { create: { fullName: `${marker} Pax` } },
      },
    });
    createdUserIds.push(passenger.id);
    const { boundary, boundingBox } = validateAndNormalizeBoundary(polygon);
    const zone = await prisma.serviceZone.create({
      data: {
        name: `${marker}-z-${randomUUID().slice(0, 8)}`,
        isActive: true,
        boundary,
        minLatitude: boundingBox.minLatitude,
        maxLatitude: boundingBox.maxLatitude,
        minLongitude: boundingBox.minLongitude,
        maxLongitude: boundingBox.maxLongitude,
      },
    });
    createdZoneIds.push(zone.id);
    const audit = new MemoryAuditService();
    const bookings = new BookingsServiceImpl(new BookingsRepository(prisma), {
      audit,
      prisma,
      paystack,
      now: () => now,
    });
    const payments = new PaymentsServiceImpl(new PaymentsRepository(prisma), {
      audit,
      prisma,
      bookings,
      paystack,
      now: () => now,
    });
    const processor = new RefundProcessor({
      prisma,
      audit,
      paystack,
      now: () => now,
    });
    const created = (await bookings.create(passenger.id, {
      pickup: { latitude: 6.685, longitude: -1.625 },
      destination: { latitude: 6.686, longitude: -1.626 },
      vehicleCategory: 'PRAGYA',
    })) as { id: string; payment: { reference: string } };
    await prisma.payment.updateMany({
      where: { bookingId: created.id },
      data: { status: 'SUCCESS' },
    });
    return { passenger, bookings, payments, processor, created, audit, now };
  }

  it('Support-created REQUESTED refund is not submitted to Paystack by the worker', async () => {
    const now = new Date('2026-11-07T18:00:00.000Z');
    const paystack = new MemoryPaystackClient();
    paystack.refundCreateStatus = 'pending';
    const { bookings, payments, processor, created } = await setupBookingFee(now, paystack);
    await prisma.booking.update({
      where: { id: created.id },
      data: { status: 'CANCELLED', acceptedAt: new Date(), cancellationActorType: 'ADMIN' },
    });
    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: created.id } });
    const refundId = await bookings.requestFeeRefund({
      paymentId: payment.id,
      bookingId: created.id,
      amountPesewas: 100,
      reason: `dispute_recommendation:${randomUUID()}`,
      // Support path — no authorizeForExecution
    });
    const row = await prisma.paymentRefund.findUniqueOrThrow({ where: { id: refundId } });
    expect(row.authorizedAt).toBeNull();

    await expect(
      processor.submitRefund({ refundId, actorId: null, workerId: 'refund-worker-support' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    // Full worker tick must also leave this row unsubmitted (may submit unrelated authorized rows).
    await payments.processRefundWorkerTick!();
    const after = await prisma.paymentRefund.findUniqueOrThrow({ where: { id: refundId } });
    expect(after.status).toBe('REQUESTED');
    expect(after.providerRefundId).toBeNull();
    expect(after.authorizedAt).toBeNull();
  });

  it('unauthorised refund cannot be claimed by the worker or submitRefund', async () => {
    const now = new Date('2026-11-07T18:05:00.000Z');
    const paystack = new MemoryPaystackClient();
    const { bookings, processor, created } = await setupBookingFee(now, paystack);
    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: created.id } });
    const refundId = await bookings.requestFeeRefund({
      paymentId: payment.id,
      bookingId: created.id,
      amountPesewas: 100,
      reason: `passenger_cancel_review:${randomUUID()}`,
    });

    await expect(
      processor.submitRefund({ refundId, actorId: null, workerId: 'refund-worker-test' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(paystack.refunds).toHaveLength(0);
  });

  it('Finance-authorized refund can be claimed and processed by the worker', async () => {
    const now = new Date('2026-11-07T18:10:00.000Z');
    const paystack = new MemoryPaystackClient();
    paystack.refundCreateStatus = 'pending';
    const { bookings, payments, created } = await setupBookingFee(now, paystack);
    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: created.id } });
    const refundId = await bookings.requestFeeRefund({
      paymentId: payment.id,
      bookingId: created.id,
      amountPesewas: 100,
      reason: `dispute_recommendation:${randomUUID()}`,
    });
    const financeId = randomUUID();
    await payments.executeRefund(financeId, refundId);
    expect(paystack.refunds).toHaveLength(1);
    const row = await prisma.paymentRefund.findUniqueOrThrow({ where: { id: refundId } });
    expect(row.authorizedAt).not.toBeNull();
    expect(row.authorizedById).toBe(financeId);
    expect(row.status).toBe('PROCESSING');
    expect(row.providerRefundId).toBeTruthy();
  });

  it('matrix-authorized refund is processed by worker without Finance actor', async () => {
    const now = new Date('2026-11-07T18:12:00.000Z');
    const paystack = new MemoryPaystackClient();
    paystack.refundCreateStatus = 'pending';
    const { bookings, payments, created } = await setupBookingFee(now, paystack);
    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: created.id } });
    const refundId = await bookings.requestFeeRefund({
      paymentId: payment.id,
      bookingId: created.id,
      amountPesewas: 100,
      reason: 'search_expired',
      authorizeForExecution: true,
    });
    const before = await prisma.paymentRefund.findUniqueOrThrow({ where: { id: refundId } });
    expect(before.authorizedAt).not.toBeNull();
    expect(before.authorizedById).toBeNull();

    const tick = await payments.processRefundWorkerTick!();
    expect(tick.submitted).toBeGreaterThanOrEqual(1);
    expect(paystack.refunds).toHaveLength(1);
  });

  it('Finance authorization still requires ExecuteRefunds permission and recent MFA on the route', () => {
    expect(staffRoleHasPermission('FINANCE_ADMIN', Permission.ExecuteRefunds)).toBe(true);
    expect(staffRoleHasPermission('SUPPORT_ADMIN', Permission.ExecuteRefunds)).toBe(false);
    const routesPath = join(dirname(fileURLToPath(import.meta.url)), 'module.routes.ts');
    const src = readFileSync(routesPath, 'utf8');
    expect(src).toContain('Permission.ExecuteRefunds');
    expect(src).toContain('requireRecentMfa()');
    expect(src).toMatch(/ExecuteRefunds[\s\S]*requireRecentMfa\(\)[\s\S]*executeRefund/);
  });

  it('concurrent authorization and worker claim cannot bypass authorization', async () => {
    const now = new Date('2026-11-07T18:15:00.000Z');
    const paystack = new MemoryPaystackClient();
    paystack.refundCreateStatus = 'pending';
    const { bookings, processor, created } = await setupBookingFee(now, paystack);
    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: created.id } });
    const refundId = await bookings.requestFeeRefund({
      paymentId: payment.id,
      bookingId: created.id,
      amountPesewas: 100,
      reason: `dispute_recommendation:${randomUUID()}`,
    });
    const financeId = randomUUID();

    const [authResult, claimResult] = await Promise.allSettled([
      processor.authorizeRefundExecution({ refundId, actorId: financeId }),
      processor.submitRefund({ refundId, actorId: null, workerId: 'race-worker' }),
    ]);

    const authOk = authResult.status === 'fulfilled';
    const claimOk = claimResult.status === 'fulfilled';
    expect(authOk).toBe(true);
    // Claim may win before auth (reject) or after (accept) — never without authorized_at.
    if (claimOk) {
      const row = await prisma.paymentRefund.findUniqueOrThrow({ where: { id: refundId } });
      expect(row.authorizedAt).not.toBeNull();
      expect(paystack.refunds).toHaveLength(1);
    } else {
      expect(paystack.refunds.length).toBeLessThanOrEqual(1);
      // Finish via authorize + submit path
      await processor.submitRefund({ refundId, actorId: financeId });
      expect(paystack.refunds).toHaveLength(1);
    }
  });

  it('duplicate worker execution does not create duplicate Paystack submissions', async () => {
    const now = new Date('2026-11-07T18:20:00.000Z');
    const paystack = new MemoryPaystackClient();
    paystack.refundCreateStatus = 'pending';
    const { bookings, processor, created } = await setupBookingFee(now, paystack);
    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: created.id } });
    const refundId = await bookings.requestFeeRefund({
      paymentId: payment.id,
      bookingId: created.id,
      amountPesewas: 100,
      reason: 'passenger_cancel_before_accept',
      authorizeForExecution: true,
    });

    const [a, b] = await Promise.allSettled([
      processor.submitRefund({ refundId, actorId: null, workerId: 'w1' }),
      processor.submitRefund({ refundId, actorId: null, workerId: 'w2' }),
    ]);
    expect([a, b].filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect([a, b].filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(paystack.refunds).toHaveLength(1);
  });

  it('stale-lock recovery cannot authorize an unapproved refund', async () => {
    const base = new Date('2026-11-07T18:25:00.000Z');
    const paystack = new MemoryPaystackClient();
    const { bookings, processor, created } = await setupBookingFee(base, paystack);
    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: created.id } });
    const refundId = await bookings.requestFeeRefund({
      paymentId: payment.id,
      bookingId: created.id,
      amountPesewas: 100,
      reason: `dispute_recommendation:${randomUUID()}`,
    });
    // Simulate a stuck PROCESSING row that somehow lacked authorization (defense in depth).
    await prisma.paymentRefund.update({
      where: { id: refundId },
      data: {
        status: 'PROCESSING',
        lockedBy: 'stale-worker',
        lockedAt: new Date(base.getTime() - REFUND_STALE_PROCESSING_MS - 1_000),
        authorizedAt: null,
        providerRefundId: null,
      },
    });

    const later = new Date(base.getTime() + 1_000);
    const lateProcessor = new RefundProcessor({
      prisma,
      audit: new MemoryAuditService(),
      paystack,
      now: () => later,
    });
    await lateProcessor.processDueWork();

    const row = await prisma.paymentRefund.findUniqueOrThrow({ where: { id: refundId } });
    expect(row.status).toBe('FAILED');
    expect(row.authorizedAt).toBeNull();
    expect(paystack.refunds).toHaveLength(0);

    // Retry still blocked without Finance authorization.
    await expect(
      lateProcessor.submitRefund({ refundId, actorId: null, workerId: 'after-reclaim' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('webhook replay cannot authorize an unauthorized refund', async () => {
    const now = new Date('2026-11-07T18:30:00.000Z');
    const paystack = new MemoryPaystackClient();
    const { bookings, payments, created } = await setupBookingFee(now, paystack);
    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: created.id } });
    const refundId = await bookings.requestFeeRefund({
      paymentId: payment.id,
      bookingId: created.id,
      amountPesewas: 100,
      reason: `dispute_recommendation:${randomUUID()}`,
    });
    const fakeProviderId = `rf_unauth_${randomUUID().slice(0, 8)}`;
    await prisma.paymentRefund.update({
      where: { id: refundId },
      data: { providerRefundId: fakeProviderId },
    });

    const body = Buffer.from(
      JSON.stringify({
        event: 'refund.processed',
        data: {
          id: fakeProviderId,
          status: 'processed',
          amount: 100,
          currency: 'GHS',
          transaction: { reference: created.payment.reference },
        },
      }),
    );
    await payments.handlePaystackWebhook({ rawBody: body, signature: sign(body) });
    await payments.handlePaystackWebhook({ rawBody: body, signature: sign(body) });

    const row = await prisma.paymentRefund.findUniqueOrThrow({ where: { id: refundId } });
    expect(row.authorizedAt).toBeNull();
    // Status may move via webhook confirmation, but authorization flag must stay null.
    expect(row.authorizedAt).toBeNull();
  });

  it('reconciliation cannot bypass Finance authorization', async () => {
    const now = new Date('2026-11-07T18:35:00.000Z');
    const paystack = new MemoryPaystackClient();
    const { bookings, payments, created } = await setupBookingFee(now, paystack);
    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: created.id } });
    const refundId = await bookings.requestFeeRefund({
      paymentId: payment.id,
      bookingId: created.id,
      amountPesewas: 100,
      reason: `dispute_recommendation:${randomUUID()}`,
    });

    await expect(payments.reconcileRefund(randomUUID(), refundId)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    const row = await prisma.paymentRefund.findUniqueOrThrow({ where: { id: refundId } });
    expect(row.authorizedAt).toBeNull();
    expect(row.status).toBe('REQUESTED');
    expect(paystack.refunds).toHaveLength(0);
  });

  it('sweeper: eligible passenger cancel during search produces authorized fee refund', async () => {
    const now = new Date('2026-11-07T18:40:00.000Z');
    const paystack = new MemoryPaystackClient();
    const { payments, created } = await setupBookingFee(now, paystack);
    await prisma.booking.update({
      where: { id: created.id },
      data: {
        status: 'CANCELLED',
        acceptedAt: null,
        cancellationActorType: 'PASSENGER',
      },
    });
    const tick = await payments.processRefundWorkerTick!();
    expect(tick.missingRefundsQueued).toBeGreaterThanOrEqual(1);
    const refund = await prisma.paymentRefund.findFirstOrThrow({
      where: { bookingId: created.id },
    });
    expect(refund.reason).toBe('passenger_cancel_before_accept');
    expect(refund.authorizedAt).not.toBeNull();
  });

  it('sweeper: search expiry produces authorized fee refund; repeat is idempotent', async () => {
    const now = new Date('2026-11-07T18:45:00.000Z');
    const paystack = new MemoryPaystackClient();
    const { payments, processor, created } = await setupBookingFee(now, paystack);
    await prisma.booking.update({
      where: { id: created.id },
      data: { status: 'EXPIRED', acceptedAt: null },
    });
    const first = await processor.queueMissingBookingFeeRefunds(20);
    const second = await processor.queueMissingBookingFeeRefunds(20);
    expect(first).toBe(1);
    expect(second).toBe(0);
    const count = await prisma.paymentRefund.count({ where: { bookingId: created.id } });
    expect(count).toBe(1);
    void payments;
  });

  it('sweeper: rider cancel / unable-to-complete decisions match decideRefunds fee path', async () => {
    const now = new Date('2026-11-07T18:50:00.000Z');
    const paystack = new MemoryPaystackClient();
    const { processor, created } = await setupBookingFee(now, paystack);
    const rider = await prisma.user.create({
      data: {
        phoneNumber: `+23324${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'RIDER',
        status: 'ACTIVE',
        riderProfile: {
          create: {
            fullName: `${marker} Rider`,
            verificationStatus: 'APPROVED',
            availability: 'OFFLINE',
            wallet: { create: { tokenBalance: 5 } },
          },
        },
      },
    });
    createdUserIds.push(rider.id);
    await prisma.booking.update({
      where: { id: created.id },
      data: {
        status: 'CANCELLED',
        acceptedAt: now,
        riderId: rider.id,
        cancellationActorType: 'RIDER',
      },
    });
    await prisma.bookingStatusHistory.create({
      data: {
        bookingId: created.id,
        fromStatus: 'ACCEPTED',
        toStatus: 'CANCELLED',
        actorType: 'RIDER',
        actorId: rider.id,
        reason: 'rider_cancel_after_accept',
      },
    });
    await prisma.tokenLedgerEntry.create({
      data: {
        riderId: rider.id,
        bookingId: created.id,
        type: 'DEDUCTION',
        tokenDelta: -1,
        balanceAfter: 4,
        idempotencyKey: `accept-debit:${created.id}`,
        reason: 'acceptance',
      },
    });

    const queued = await processor.queueMissingBookingFeeRefunds(20);
    expect(queued).toBe(1);
    const refund = await prisma.paymentRefund.findFirstOrThrow({
      where: { bookingId: created.id },
    });
    expect(refund.reason).toBe('rider_cancel_after_accept');
    expect(refund.authorizedAt).not.toBeNull();
  });

  it('sweeper: rider unable-to-complete produces fee refund decision path', async () => {
    const now = new Date('2026-11-07T18:52:00.000Z');
    const paystack = new MemoryPaystackClient();
    const { processor, created } = await setupBookingFee(now, paystack);
    const rider = await prisma.user.create({
      data: {
        phoneNumber: `+23324${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'RIDER',
        status: 'ACTIVE',
        riderProfile: {
          create: {
            fullName: `${marker} Rider2`,
            verificationStatus: 'APPROVED',
            availability: 'OFFLINE',
            wallet: { create: { tokenBalance: 3 } },
          },
        },
      },
    });
    createdUserIds.push(rider.id);
    await prisma.booking.update({
      where: { id: created.id },
      data: {
        status: 'CANCELLED',
        acceptedAt: now,
        riderId: rider.id,
        cancellationActorType: 'RIDER',
      },
    });
    await prisma.bookingStatusHistory.create({
      data: {
        bookingId: created.id,
        fromStatus: 'IN_PROGRESS',
        toStatus: 'CANCELLED',
        actorType: 'RIDER',
        actorId: rider.id,
        reason: 'rider_unable_to_complete',
      },
    });

    const queued = await processor.queueMissingBookingFeeRefunds(20);
    expect(queued).toBe(1);
    const refund = await prisma.paymentRefund.findFirstOrThrow({
      where: { bookingId: created.id },
    });
    expect(refund.reason).toBe('rider_unable_to_complete');
  });

  it('sweeper: passenger cancel after acceptance does not create automatic refund', async () => {
    const now = new Date('2026-11-07T18:55:00.000Z');
    const paystack = new MemoryPaystackClient();
    const { processor, created } = await setupBookingFee(now, paystack);
    await prisma.booking.update({
      where: { id: created.id },
      data: {
        status: 'CANCELLED',
        acceptedAt: now,
        cancellationActorType: 'PASSENGER',
      },
    });
    const queued = await processor.queueMissingBookingFeeRefunds(20);
    expect(queued).toBe(0);
    expect(await prisma.paymentRefund.count({ where: { bookingId: created.id } })).toBe(0);
  });

  it('sweeper: completed trip does not create automatic refund', async () => {
    const now = new Date('2026-11-07T18:56:00.000Z');
    const paystack = new MemoryPaystackClient();
    const { processor, created } = await setupBookingFee(now, paystack);
    await prisma.booking.update({
      where: { id: created.id },
      data: { status: 'COMPLETED', completedAt: now, acceptedAt: now },
    });
    const queued = await processor.queueMissingBookingFeeRefunds(20);
    expect(queued).toBe(0);
    expect(await prisma.paymentRefund.count({ where: { bookingId: created.id } })).toBe(0);
  });

  it('manually queued Support refund remains recoverable only after Finance authorization', async () => {
    const now = new Date('2026-11-07T19:00:00.000Z');
    const paystack = new MemoryPaystackClient();
    paystack.refundCreateStatus = 'pending';
    const { bookings, payments, processor, created } = await setupBookingFee(now, paystack);
    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: created.id } });
    const refundId = await bookings.requestFeeRefund({
      paymentId: payment.id,
      bookingId: created.id,
      amountPesewas: 100,
      reason: `passenger_cancel_review:${randomUUID()}`,
    });

    // Sweeper must not duplicate or auto-authorize the Support row.
    await prisma.booking.update({
      where: { id: created.id },
      data: {
        status: 'CANCELLED',
        acceptedAt: now,
        cancellationActorType: 'PASSENGER',
      },
    });
    expect(await processor.queueMissingBookingFeeRefunds(20)).toBe(0);

    await expect(
      processor.submitRefund({ refundId, actorId: null, workerId: 'support-skip' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const beforeFinance = await prisma.paymentRefund.findUniqueOrThrow({
      where: { id: refundId },
    });
    expect(beforeFinance.authorizedAt).toBeNull();
    expect(beforeFinance.status).toBe('REQUESTED');
    expect(beforeFinance.providerRefundId).toBeNull();
    expect(paystack.refunds).toHaveLength(0);

    await payments.executeRefund(randomUUID(), refundId);
    expect(paystack.refunds).toHaveLength(1);
    const after = await prisma.paymentRefund.findUniqueOrThrow({ where: { id: refundId } });
    expect(after.authorizedAt).not.toBeNull();
    expect(after.providerRefundId).toBeTruthy();
  });
});
