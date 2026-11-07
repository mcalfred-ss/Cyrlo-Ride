import { createHmac, randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { env } from '../../config/env.js';
import { MemoryPaystackClient } from '../../infrastructure/payments/paystack-client.js';
import { MemoryAuditService } from '../audit/module.service.js';
import { validateAndNormalizeBoundary } from '../service-zones/zone-geometry.js';
import { BookingsRepository } from '../bookings/module.repository.js';
import { BookingsServiceImpl } from '../bookings/module.service.js';
import { PaymentsRepository } from './module.repository.js';
import { PaymentsServiceImpl } from './module.service.js';

const prisma = new PrismaClient();
const marker = `m11a-${Date.now()}`;
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

describe('Phase 11A refund reliability postgres', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.refundReconciliationAttempt.deleteMany({
      where: { refund: { payment: { userId: { in: createdUserIds } } } },
    });
    await prisma.financialReconciliationCase.deleteMany({
      where: {
        OR: [
          { payment: { userId: { in: createdUserIds } } },
          { tokenPurchaseId: { not: null } },
        ],
      },
    });
    await prisma.paymentRefund.deleteMany({
      where: { payment: { userId: { in: createdUserIds } } },
    });
    await prisma.tokenLedgerEntry.deleteMany({ where: { riderId: { in: createdUserIds } } });
    await prisma.tokenPurchase.deleteMany({ where: { riderId: { in: createdUserIds } } });
    await prisma.paymentWebhookEvent.deleteMany({
      where: {
        OR: [
          { providerReference: { startsWith: 'bf_' } },
          { providerReference: { startsWith: 'tp_' } },
        ],
      },
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
    const created = (await bookings.create(passenger.id, {
      pickup: { latitude: 6.685, longitude: -1.625 },
      destination: { latitude: 6.686, longitude: -1.626 },
      vehicleCategory: 'TRICYCLE',
    })) as { id: string; payment: { reference: string; id?: string } };
    return { passenger, bookings, payments, created, audit };
  }

  it('submits refund via worker claim without double-create on concurrent execute', async () => {
    const now = new Date('2026-11-07T16:00:00.000Z');
    const paystack = new MemoryPaystackClient();
    paystack.refundCreateStatus = 'pending';
    const { payments, bookings, created } = await setupBookingFee(now, paystack);

    await prisma.payment.updateMany({
      where: { bookingId: created.id },
      data: { status: 'SUCCESS' },
    });
    await prisma.booking.update({
      where: { id: created.id },
      data: { status: 'EXPIRED' },
    });
    const refundId = await bookings.requestFeeRefund({
      paymentId: (await prisma.payment.findFirstOrThrow({ where: { bookingId: created.id } })).id,
      bookingId: created.id,
      amountPesewas: 100,
      reason: 'search_expired',
    });

    const financeA = randomUUID();
    const financeB = randomUUID();
    const [a, b] = await Promise.allSettled([
      payments.executeRefund(financeA, refundId),
      payments.executeRefund(financeB, refundId),
    ]);
    const successes = [a, b].filter((r) => r.status === 'fulfilled');
    const failures = [a, b].filter((r) => r.status === 'rejected');
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
    expect(paystack.refunds).toHaveLength(1);

    const refund = await prisma.paymentRefund.findUniqueOrThrow({ where: { id: refundId } });
    expect(refund.status).toBe('PROCESSING');
    expect(refund.providerRefundId).toBeTruthy();
    expect(refund.submittedAt).not.toBeNull();
  });

  it('confirms refund only via processed webhook, not mere submit', async () => {
    const now = new Date('2026-11-07T16:10:00.000Z');
    const paystack = new MemoryPaystackClient();
    paystack.refundCreateStatus = 'pending';
    const { payments, bookings, created } = await setupBookingFee(now, paystack);

    await prisma.payment.updateMany({
      where: { bookingId: created.id },
      data: { status: 'SUCCESS' },
    });
    await prisma.booking.update({ where: { id: created.id }, data: { status: 'EXPIRED' } });
    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: created.id } });
    const refundId = await bookings.requestFeeRefund({
      paymentId: payment.id,
      bookingId: created.id,
      amountPesewas: 100,
      reason: 'search_expired',
    });

    const financeId = randomUUID();
    const submitted = await payments.executeRefund(financeId, refundId);
    expect(submitted.status).toBe('PROCESSING');

    const body = Buffer.from(
      JSON.stringify({
        event: 'refund.processed',
        data: {
          id: Number(String(submitted.providerRefundId).replace(/\D/g, '').slice(0, 9) || '1'),
          status: 'processed',
          amount: 100,
          currency: 'GHS',
          transaction: { reference: created.payment.reference },
        },
      }),
    );
    // Align provider id with stored refund id from execute
    const refundRow = await prisma.paymentRefund.findUniqueOrThrow({ where: { id: refundId } });
    const confirmBody = Buffer.from(
      JSON.stringify({
        event: 'refund.processed',
        data: {
          id: refundRow.providerRefundId,
          status: 'processed',
          amount: 100,
          currency: 'GHS',
          transaction: { reference: created.payment.reference },
        },
      }),
    );
    await payments.handlePaystackWebhook({
      rawBody: confirmBody,
      signature: sign(confirmBody),
    });
    // duplicate delivery
    await payments.handlePaystackWebhook({
      rawBody: confirmBody,
      signature: sign(confirmBody),
    });

    const after = await prisma.paymentRefund.findUniqueOrThrow({ where: { id: refundId } });
    expect(after.status).toBe('SUCCEEDED');
    expect(after.confirmedAt).not.toBeNull();
    void body;
  });

  it('reconciles pending refund via provider lookup', async () => {
    const now = new Date('2026-11-07T16:20:00.000Z');
    const paystack = new MemoryPaystackClient();
    paystack.refundCreateStatus = 'pending';
    const { payments, bookings, created } = await setupBookingFee(now, paystack);

    await prisma.payment.updateMany({
      where: { bookingId: created.id },
      data: { status: 'SUCCESS' },
    });
    await prisma.booking.update({ where: { id: created.id }, data: { status: 'CANCELLED' } });
    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: created.id } });
    const refundId = await bookings.requestFeeRefund({
      paymentId: payment.id,
      bookingId: created.id,
      amountPesewas: 100,
      reason: 'passenger_cancel_before_accept',
    });
    const financeId = randomUUID();
    const submitted = await payments.executeRefund(financeId, refundId);
    expect(submitted.providerRefundId).toBeTruthy();
    paystack.markRefundProcessed(submitted.providerRefundId!);

    const reconciled = await payments.reconcileRefund(financeId, refundId);
    expect(reconciled.status).toBe('SUCCEEDED');
    const attempts = await payments.listRefundReconciliationAttempts(refundId);
    expect(attempts.length).toBeGreaterThan(0);
  });

  it('opens finance case for abandoned token purchase late SUCCESS without crediting', async () => {
    const now = new Date('2026-11-07T16:30:00.000Z');
    const paystack = new MemoryPaystackClient();
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
            wallet: { create: { tokenBalance: 0 } },
          },
        },
      },
    });
    createdUserIds.push(rider.id);

    const pkg = await prisma.tokenPackage.findFirst({ where: { isActive: true } });
    expect(pkg).toBeTruthy();

    const paymentId = randomUUID();
    const purchaseId = randomUUID();
    const reference = `tp_${randomUUID().replace(/-/g, '')}`;
    await prisma.payment.create({
      data: {
        id: paymentId,
        userId: rider.id,
        purpose: 'TOKEN_PURCHASE',
        amountPesewas: pkg!.pricePesewas,
        currency: 'GHS',
        status: 'ABANDONED',
        provider: 'paystack',
        providerReference: reference,
        idempotencyKey: `token-purchase-init:${rider.id}:${randomUUID()}`,
      },
    });
    await prisma.tokenPurchase.create({
      data: {
        id: purchaseId,
        riderId: rider.id,
        packageId: pkg!.id,
        paymentId,
        packageCode: pkg!.code,
        packageName: pkg!.name,
        tokenQuantity: pkg!.tokenQuantity,
        pricePesewas: pkg!.pricePesewas,
        currency: 'GHS',
        status: 'ABANDONED',
      },
    });

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

    const body = Buffer.from(
      JSON.stringify({
        event: 'charge.success',
        data: {
          id: `tp-late-${paymentId}`,
          reference,
          amount: pkg!.pricePesewas,
          currency: 'GHS',
          status: 'success',
          metadata: { paymentId, purpose: 'TOKEN_PURCHASE', riderId: rider.id },
        },
      }),
    );
    await payments.handlePaystackWebhook({ rawBody: body, signature: sign(body) });

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('SUCCESS');
    const purchase = await prisma.tokenPurchase.findUniqueOrThrow({ where: { id: purchaseId } });
    expect(purchase.status).toBe('ABANDONED');
    const wallet = await prisma.riderWallet.findUniqueOrThrow({ where: { riderId: rider.id } });
    expect(wallet.tokenBalance).toBe(0);
    const cases = await prisma.financialReconciliationCase.findMany({
      where: { paymentId, status: 'OPEN' },
    });
    expect(cases.length).toBe(1);
    expect(cases[0]?.caseType).toBe('ABANDONED_TOKEN_PURCHASE_SUCCESS');
  });

  it('worker queues missing booking-fee refund only when decideRefunds authorizes', async () => {
    const now = new Date('2026-11-07T16:40:00.000Z');
    const paystack = new MemoryPaystackClient();
    const { payments, created } = await setupBookingFee(now, paystack);
    await prisma.payment.updateMany({
      where: { bookingId: created.id },
      data: { status: 'SUCCESS' },
    });
    await prisma.booking.update({
      where: { id: created.id },
      data: { status: 'EXPIRED', acceptedAt: null },
    });

    const tick = await payments.processRefundWorkerTick!();
    expect(tick.missingRefundsQueued).toBeGreaterThanOrEqual(1);
    const refund = await prisma.paymentRefund.findFirst({
      where: { bookingId: created.id },
    });
    expect(refund?.status).toBe('REQUESTED');
    expect(refund?.reason).toBe('search_expired');
    expect(refund?.authorizedAt).not.toBeNull();
  });

  it('worker does not queue fee refund for PAYMENT_FAILED (decideRefunds NONE)', async () => {
    const now = new Date('2026-11-07T16:45:00.000Z');
    const paystack = new MemoryPaystackClient();
    const { payments, created } = await setupBookingFee(now, paystack);
    await prisma.payment.updateMany({
      where: { bookingId: created.id },
      data: { status: 'SUCCESS' },
    });
    await prisma.booking.update({
      where: { id: created.id },
      data: { status: 'PAYMENT_FAILED' },
    });

    const tick = await payments.processRefundWorkerTick!();
    const refund = await prisma.paymentRefund.findFirst({
      where: { bookingId: created.id },
    });
    expect(refund).toBeNull();
    expect(tick.missingRefundsQueued).toBe(0);
  });
});
