import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DISPUTE_WINDOW_MS } from '../../config/constants.js';
import { MemoryAuditService } from '../audit/module.service.js';
import { BookingsRepository } from '../bookings/module.repository.js';
import { BookingsServiceImpl } from '../bookings/module.service.js';
import { MemoryPaystackClient } from '../../infrastructure/payments/paystack-client.js';
import { DisputesRepository } from './module.repository.js';
import { DisputesServiceImpl } from './module.service.js';

const prisma = new PrismaClient();
const marker = `m8d-${Date.now()}`;
const userIds: string[] = [];

async function seedCompletedBooking(completedAt = new Date()) {
  const passenger = await prisma.user.create({
    data: {
      phoneNumber: `+23350${randomUUID().replace(/-/g, '').slice(0, 9)}`,
      role: 'PASSENGER',
      status: 'ACTIVE',
    },
  });
  userIds.push(passenger.id);
  const rider = await prisma.user.create({
    data: {
      phoneNumber: `+23351${randomUUID().replace(/-/g, '').slice(0, 9)}`,
      role: 'RIDER',
      status: 'ACTIVE',
      riderProfile: {
        create: {
          fullName: `${marker} Rider`,
          verificationStatus: 'APPROVED',
          availability: 'AVAILABLE',
          wallet: { create: { tokenBalance: 2 } },
        },
      },
    },
  });
  userIds.push(rider.id);
  const booking = await prisma.booking.create({
    data: {
      passengerId: passenger.id,
      riderId: rider.id,
      status: 'COMPLETED',
      vehicleCategory: 'CAR',
      pickupLatitude: 6.68,
      pickupLongitude: -1.62,
      destinationLatitude: 6.69,
      destinationLongitude: -1.61,
      bookingFeePesewas: 100,
      paymentExpiresAt: new Date(Date.now() - 120_000),
      acceptedAt: new Date(completedAt.getTime() - 60_000),
      startedAt: new Date(completedAt.getTime() - 30_000),
      completedAt,
      payments: {
        create: {
          userId: passenger.id,
          purpose: 'BOOKING_FEE',
          amountPesewas: 100,
          currency: 'GHS',
          status: 'SUCCESS',
          providerReference: `bf_m8d_${randomUUID().replace(/-/g, '')}`,
          idempotencyKey: `booking-fee:${randomUUID()}`,
        },
      },
    },
  });
  return { passenger, rider, booking };
}

describe('disputes postgres', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    const bookings = await prisma.booking.findMany({
      where: { passengerId: { in: userIds } },
      select: { id: true },
    });
    const bookingIds = bookings.map((b) => b.id);
    await prisma.disputeEvent.deleteMany({
      where: { dispute: { bookingId: { in: bookingIds } } },
    });
    await prisma.dispute.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.paymentRefund.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.payment.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.bookingStatusHistory.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.riderWallet.deleteMany({ where: { riderId: { in: userIds } } });
    await prisma.riderProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  function services(now = () => new Date()) {
    const audit = new MemoryAuditService();
    const bookings = new BookingsServiceImpl(new BookingsRepository(prisma), {
      audit,
      prisma,
      paystack: new MemoryPaystackClient(),
      now,
    });
    const disputes = new DisputesServiceImpl(new DisputesRepository(prisma), {
      audit,
      prisma,
      bookings,
      now,
    });
    return { bookings, disputes };
  }

  it('accepts disputes within 24h, rejects late and wrong ownership; support recommends without executing', async () => {
    const { passenger, rider, booking } = await seedCompletedBooking();
    const stranger = await prisma.user.create({
      data: {
        phoneNumber: `+23352${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'PASSENGER',
        status: 'ACTIVE',
      },
    });
    userIds.push(stranger.id);
    const { disputes } = services();

    await expect(
      disputes.submit(stranger.id, 'PASSENGER', booking.id, {
        category: 'fare',
        description: 'not my booking',
      }),
    ).rejects.toMatchObject({ status: 403 });

    const opened = (await disputes.submit(passenger.id, 'PASSENGER', booking.id, {
      category: 'service',
      description: 'rider was rude',
    })) as { disputeId: string };
    expect(opened.disputeId).toBeTruthy();

    const support = await prisma.user.create({
      data: {
        phoneNumber: `+23353${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });
    userIds.push(support.id);

    const recommended = (await disputes.recommendOnDispute(support.id, opened.disputeId, {
      recommendation: 'REFUND_FEE',
      notes: 'goodwill exception — criteria unresolved',
    })) as { refundId: string; refundExecuted: boolean; status: string };
    expect(recommended.refundExecuted).toBe(false);
    expect(recommended.refundId).toBeTruthy();
    const refund = await prisma.paymentRefund.findUniqueOrThrow({
      where: { id: recommended.refundId },
    });
    expect(refund.status).toBe('REQUESTED');

    await disputes.submit(rider.id, 'RIDER', booking.id, {
      category: 'safety',
      description: 'passenger issue',
    });

    const late = await seedCompletedBooking(
      new Date(Date.now() - DISPUTE_WINDOW_MS - 60_000),
    );
    await expect(
      disputes.submit(late.passenger.id, 'PASSENGER', late.booking.id, {
        category: 'late',
        description: 'too late',
      }),
    ).rejects.toMatchObject({ message: /24 hours/ });
  });
});
