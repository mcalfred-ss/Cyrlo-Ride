import { createHmac, randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BOOKING_FEE_PESEWAS } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { MemoryPaystackClient } from '../../infrastructure/payments/paystack-client.js';
import { MemoryAuditService } from '../audit/module.service.js';
import { validateAndNormalizeBoundary } from '../service-zones/zone-geometry.js';
import { BookingsRepository } from './module.repository.js';
import { BookingsServiceImpl } from './module.service.js';
import { PaymentsRepository } from '../payments/module.repository.js';
import { PaymentsServiceImpl } from '../payments/module.service.js';
import { ACTIVE_TRIP_BOOKING_STATUSES } from '../riders/operational-eligibility.js';

const prisma = new PrismaClient();
const marker = `m6-${Date.now()}`;
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

describe('booking payment postgres flows', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.paymentRefund.deleteMany({
      where: { bookingId: { in: await bookingIds() } },
    });
    await prisma.paymentWebhookEvent.deleteMany({
      where: { providerReference: { startsWith: 'bf_m6' } },
    });
    await prisma.payment.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.bookingStatusHistory.deleteMany({
      where: { bookingId: { in: await bookingIds() } },
    });
    await prisma.booking.deleteMany({ where: { passengerId: { in: createdUserIds } } });
    await prisma.serviceZone.deleteMany({ where: { id: { in: createdZoneIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  async function bookingIds() {
    const rows = await prisma.booking.findMany({
      where: { passengerId: { in: createdUserIds } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  it('creates booking in active zone, pays on time to SEARCHING, and handles late payment refund', async () => {
    const passenger = await prisma.user.create({
      data: {
        phoneNumber: `+23320${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'PASSENGER',
        status: 'ACTIVE',
        passengerProfile: { create: { fullName: `${marker} Passenger` } },
      },
    });
    createdUserIds.push(passenger.id);

    const { boundary, boundingBox } = validateAndNormalizeBoundary(polygon);
    const zone = await prisma.serviceZone.create({
      data: {
        name: `${marker}-zone`,
        isActive: true,
        boundary,
        minLatitude: boundingBox.minLatitude,
        maxLatitude: boundingBox.maxLatitude,
        minLongitude: boundingBox.minLongitude,
        maxLongitude: boundingBox.maxLongitude,
      },
    });
    createdZoneIds.push(zone.id);

    const inactive = await prisma.serviceZone.create({
      data: {
        name: `${marker}-inactive`,
        isActive: false,
        boundary,
        minLatitude: boundingBox.minLatitude,
        maxLatitude: boundingBox.maxLatitude,
        minLongitude: boundingBox.minLongitude,
        maxLongitude: boundingBox.maxLongitude,
      },
    });
    createdZoneIds.push(inactive.id);

    let now = new Date('2026-11-07T12:00:00.000Z');
    const audit = new MemoryAuditService();
    const paystack = new MemoryPaystackClient();
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

    await expect(
      bookings.create(passenger.id, {
        pickup: { latitude: 6.7, longitude: -1.625 },
        vehicleCategory: 'PRAGYA',
      }),
    ).rejects.toMatchObject({ message: /outside the active service area/ });
    // Zone rejection must happen before any Paystack checkout.
    expect(paystack.initializations).toHaveLength(0);

    const created = (await bookings.create(passenger.id, {
      pickup: { latitude: 6.685, longitude: -1.625 },
      vehicleCategory: 'OKADA',
      pickupLabel: 'In zone',
    })) as {
      id: string;
      status: string;
      bookingFeePesewas: number;
      destination: unknown;
      payment: unknown;
    };

    expect(created.status).toBe('SEARCHING');
    expect(created.bookingFeePesewas).toBe(BOOKING_FEE_PESEWAS);
    expect(created.destination).toBeNull();
    expect(created.payment).toBeNull();
    expect(paystack.initializations).toHaveLength(0);

    const other = await prisma.user.create({
      data: {
        phoneNumber: `+23321${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'PASSENGER',
        status: 'ACTIVE',
      },
    });
    createdUserIds.push(other.id);
    await expect(bookings.getOwn(other.id, created.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    const afterCreate = await prisma.booking.findUnique({ where: { id: created.id } });
    expect(afterCreate?.status).toBe('SEARCHING');
    expect(afterCreate?.searchExpiresAt).not.toBeNull();

    // Legacy AWAITING_PAYMENT unpaid expiry still works (fee-before-search rows).
    const repo = new BookingsRepository(prisma);
    const { booking: lateBookingRow, payment: latePayment } =
      await repo.createBookingWithFeePayment({
        passengerId: passenger.id,
        serviceZoneId: zone.id,
        vehicleCategory: 'PRAGYA',
        pickupLatitude: 6.685,
        pickupLongitude: -1.625,
        destinationLatitude: 6.686,
        destinationLongitude: -1.626,
        bookingFeePesewas: BOOKING_FEE_PESEWAS,
        paymentExpiresAt: new Date('2026-11-07T12:00:00.000Z'),
        providerReference: `bf_late_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        searchExpiresAt: new Date('2026-11-07T12:05:00.000Z'),
      });
    const lateBooking = {
      id: lateBookingRow.id,
      payment: { reference: latePayment.providerReference! },
    };

    now = new Date('2026-11-07T12:20:00.000Z');
    await bookings.expireUnpaidBookings(now);
    const expired = await prisma.booking.findUnique({ where: { id: lateBooking.id } });
    expect(expired?.status).toBe('PAYMENT_FAILED');

    const lateBody = Buffer.from(
      JSON.stringify({
        event: 'charge.success',
        data: {
          id: Date.now() + 1,
          reference: lateBooking.payment.reference,
          amount: 100,
          currency: 'GHS',
          status: 'success',
        },
      }),
    );
    await payments.handlePaystackWebhook({
      rawBody: lateBody,
      signature: sign(lateBody),
    });
    const stillFailed = await prisma.booking.findUnique({ where: { id: lateBooking.id } });
    expect(stillFailed?.status).toBe('PAYMENT_FAILED');
    const refund = await prisma.paymentRefund.findFirst({
      where: { bookingId: lateBooking.id },
    });
    expect(refund?.reason).toBe('late_payment_after_deadline');
    // May advance if a parallel refund worker tick claims the row in shared DB.
    expect(['REQUESTED', 'PROCESSING', 'SUCCEEDED', 'FAILED']).toContain(refund?.status);

    const badSig = Buffer.from('{"event":"charge.success","data":{"reference":"x"}}');
    await expect(
      payments.handlePaystackWebhook({ rawBody: badSig, signature: 'deadbeef' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('reprocesses Paystack webhook after crash before processedAt', async () => {
    const passenger = await prisma.user.create({
      data: {
        phoneNumber: `+23320${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'PASSENGER',
        status: 'ACTIVE',
        passengerProfile: { create: { fullName: `${marker} Crash Passenger` } },
      },
    });
    createdUserIds.push(passenger.id);

    const { boundary, boundingBox } = validateAndNormalizeBoundary(polygon);
    const zone = await prisma.serviceZone.create({
      data: {
        name: `${marker}-crash-zone`,
        isActive: true,
        boundary,
        minLatitude: boundingBox.minLatitude,
        maxLatitude: boundingBox.maxLatitude,
        minLongitude: boundingBox.minLongitude,
        maxLongitude: boundingBox.maxLongitude,
      },
    });
    createdZoneIds.push(zone.id);

    const now = new Date('2026-11-07T13:00:00.000Z');
    const audit = new MemoryAuditService();
    const paystack = new MemoryPaystackClient();
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

    const repo = new BookingsRepository(prisma);
    const { booking: createdRow, payment: createdPayment } =
      await repo.createBookingWithFeePayment({
        passengerId: passenger.id,
        serviceZoneId: zone.id,
        vehicleCategory: 'PRAGYA',
        pickupLatitude: 6.685,
        pickupLongitude: -1.625,
        destinationLatitude: 6.686,
        destinationLongitude: -1.626,
        bookingFeePesewas: BOOKING_FEE_PESEWAS,
        paymentExpiresAt: new Date(now.getTime() + 10 * 60 * 1000),
        providerReference: `bf_crash_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        searchExpiresAt: new Date(now.getTime() + 5 * 60 * 1000),
      });
    const created = {
      id: createdRow.id,
      payment: { reference: createdPayment.providerReference! },
    };

    const eventDataId = `crash-recovery-${created.id}`;
    const expectedEventId = `paystack:charge.success:${eventDataId}`;
    await prisma.paymentWebhookEvent.create({
      data: {
        providerEventId: expectedEventId,
        eventType: 'charge.success',
        providerReference: created.payment.reference,
        payloadHash: 'deadbeef',
        processedAt: null,
        processingError: 'simulated_crash',
      },
    });

    const crashBody = Buffer.from(
      JSON.stringify({
        event: 'charge.success',
        data: {
          id: eventDataId,
          reference: created.payment.reference,
          amount: 100,
          currency: 'GHS',
          status: 'success',
          metadata: { bookingId: created.id },
        },
      }),
    );

    await payments.handlePaystackWebhook({
      rawBody: crashBody,
      signature: sign(crashBody),
    });

    const after = await prisma.booking.findUnique({ where: { id: created.id } });
    expect(after?.status).toBe('SEARCHING');
    const event = await prisma.paymentWebhookEvent.findUnique({
      where: { providerEventId: expectedEventId },
    });
    expect(event?.processedAt).not.toBeNull();
    expect(event?.processingError).toBeNull();
  });

  it('replays booking-fee effect when payment already SUCCESS but booking still awaiting', async () => {
    const passenger = await prisma.user.create({
      data: {
        phoneNumber: `+23320${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'PASSENGER',
        status: 'ACTIVE',
        passengerProfile: { create: { fullName: `${marker} Strand Passenger` } },
      },
    });
    createdUserIds.push(passenger.id);

    const { boundary, boundingBox } = validateAndNormalizeBoundary(polygon);
    const zone = await prisma.serviceZone.create({
      data: {
        name: `${marker}-strand-zone`,
        isActive: true,
        boundary,
        minLatitude: boundingBox.minLatitude,
        maxLatitude: boundingBox.maxLatitude,
        minLongitude: boundingBox.minLongitude,
        maxLongitude: boundingBox.maxLongitude,
      },
    });
    createdZoneIds.push(zone.id);

    const now = new Date('2026-11-07T15:00:00.000Z');
    const audit = new MemoryAuditService();
    const paystack = new MemoryPaystackClient();
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

    const repo = new BookingsRepository(prisma);
    const { booking: createdRow, payment: createdPayment } =
      await repo.createBookingWithFeePayment({
        passengerId: passenger.id,
        serviceZoneId: zone.id,
        vehicleCategory: 'PRAGYA',
        pickupLatitude: 6.685,
        pickupLongitude: -1.625,
        destinationLatitude: 6.686,
        destinationLongitude: -1.626,
        bookingFeePesewas: BOOKING_FEE_PESEWAS,
        paymentExpiresAt: new Date(now.getTime() + 10 * 60 * 1000),
        providerReference: `bf_strand_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        searchExpiresAt: new Date(now.getTime() + 5 * 60 * 1000),
      });
    const created = {
      id: createdRow.id,
      payment: { reference: createdPayment.providerReference! },
    };

    // Simulate crash after payment SUCCESS, before SEARCHING.
    await prisma.payment.updateMany({
      where: { bookingId: created.id, purpose: 'BOOKING_FEE' },
      data: { status: 'SUCCESS' },
    });
    expect((await prisma.booking.findUnique({ where: { id: created.id } }))?.status).toBe(
      'AWAITING_PAYMENT',
    );

    const eventDataId = `strand-${created.id}`;
    const body = Buffer.from(
      JSON.stringify({
        event: 'charge.success',
        data: {
          id: eventDataId,
          reference: created.payment.reference,
          amount: 100,
          currency: 'GHS',
          status: 'success',
          metadata: { bookingId: created.id },
        },
      }),
    );

    await payments.handlePaystackWebhook({ rawBody: body, signature: sign(body) });

    const after = await prisma.booking.findUnique({ where: { id: created.id } });
    expect(after?.status).toBe('SEARCHING');
  });

  it('queues fee refund when SEARCHING loses to unpaid expiry race', async () => {
    const passenger = await prisma.user.create({
      data: {
        phoneNumber: `+23320${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'PASSENGER',
        status: 'ACTIVE',
        passengerProfile: { create: { fullName: `${marker} Race Passenger` } },
      },
    });
    createdUserIds.push(passenger.id);

    const { boundary, boundingBox } = validateAndNormalizeBoundary(polygon);
    const zone = await prisma.serviceZone.create({
      data: {
        name: `${marker}-race-zone`,
        isActive: true,
        boundary,
        minLatitude: boundingBox.minLatitude,
        maxLatitude: boundingBox.maxLatitude,
        minLongitude: boundingBox.minLongitude,
        maxLongitude: boundingBox.maxLongitude,
      },
    });
    createdZoneIds.push(zone.id);

    const now = new Date('2026-11-07T14:00:00.000Z');
    const audit = new MemoryAuditService();
    const paystack = new MemoryPaystackClient();
    const bookings = new BookingsServiceImpl(new BookingsRepository(prisma), {
      audit,
      prisma,
      paystack,
      now: () => now,
    });
    const payments = new PaymentsServiceImpl(new PaymentsRepository(prisma), {
      audit,
      prisma,
      bookings: {
        markSearchingAfterFeeSuccess: async (bookingId: string) => {
          await prisma.booking.update({
            where: { id: bookingId },
            data: { status: 'PAYMENT_FAILED' },
          });
          await prisma.payment.updateMany({
            where: { bookingId, purpose: 'BOOKING_FEE', status: 'PENDING' },
            data: { status: 'ABANDONED' },
          });
          return null;
        },
        expireUnpaidBookings: (at?: Date) => bookings.expireUnpaidBookings(at),
        requestFeeRefund: (input) => bookings.requestFeeRefund(input),
        markPaymentFailed: (bookingId: string, reason: string) =>
          bookings.markPaymentFailed(bookingId, reason),
      },
      paystack,
      now: () => now,
    });

    const repo = new BookingsRepository(prisma);
    const { booking: createdRow, payment: createdPayment } =
      await repo.createBookingWithFeePayment({
        passengerId: passenger.id,
        serviceZoneId: zone.id,
        vehicleCategory: 'PRAGYA',
        pickupLatitude: 6.685,
        pickupLongitude: -1.625,
        destinationLatitude: 6.686,
        destinationLongitude: -1.626,
        bookingFeePesewas: BOOKING_FEE_PESEWAS,
        paymentExpiresAt: new Date(now.getTime() + 10 * 60 * 1000),
        providerReference: `bf_race_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        searchExpiresAt: new Date(now.getTime() + 5 * 60 * 1000),
      });
    const created = {
      id: createdRow.id,
      payment: { reference: createdPayment.providerReference! },
    };

    const body = Buffer.from(
      JSON.stringify({
        event: 'charge.success',
        data: {
          id: `race-${created.id}`,
          reference: created.payment.reference,
          amount: 100,
          currency: 'GHS',
          status: 'success',
          metadata: { bookingId: created.id },
        },
      }),
    );

    await payments.handlePaystackWebhook({ rawBody: body, signature: sign(body) });

    const after = await prisma.booking.findUnique({ where: { id: created.id } });
    expect(after?.status).toBe('PAYMENT_FAILED');
    const payment = await prisma.payment.findFirst({
      where: { bookingId: created.id, purpose: 'BOOKING_FEE' },
    });
    expect(payment?.status).toBe('SUCCESS');
    const refund = await prisma.paymentRefund.findFirst({
      where: { bookingId: created.id },
    });
    expect(refund?.status).toBe('REQUESTED');
    expect(refund?.reason).toBe('late_payment_after_deadline');
  });

  it('includes ACCEPTED and IN_PROGRESS in active-trip statuses', () => {
    expect(ACTIVE_TRIP_BOOKING_STATUSES).toEqual(['ACCEPTED', 'IN_PROGRESS']);
  });
});
