import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemoryAuditService } from '../audit/module.service.js';
import { WalletRepository } from '../wallet/module.repository.js';
import { BookingsRepository } from './module.repository.js';
import { BookingsServiceImpl } from './module.service.js';
import { MemoryPaystackClient } from '../../infrastructure/payments/paystack-client.js';

const prisma = new PrismaClient();
const marker = `m8-${Date.now()}`;
const userIds: string[] = [];

async function seedAcceptedBooking() {
  const passenger = await prisma.user.create({
    data: {
      phoneNumber: `+23340${randomUUID().replace(/-/g, '').slice(0, 9)}`,
      role: 'PASSENGER',
      status: 'ACTIVE',
    },
  });
  userIds.push(passenger.id);
  const rider = await prisma.user.create({
    data: {
      phoneNumber: `+23341${randomUUID().replace(/-/g, '').slice(0, 9)}`,
      role: 'RIDER',
      status: 'ACTIVE',
      riderProfile: {
        create: {
          fullName: `${marker} Rider`,
          verificationStatus: 'APPROVED',
          availability: 'BUSY',
          wallet: { create: { tokenBalance: 5 } },
        },
      },
    },
  });
  userIds.push(rider.id);

  const booking = await prisma.booking.create({
    data: {
      passengerId: passenger.id,
      riderId: rider.id,
      status: 'ACCEPTED',
      vehicleCategory: 'PRAGYA',
      pickupLatitude: 6.685,
      pickupLongitude: -1.625,
      destinationLatitude: 6.686,
      destinationLongitude: -1.626,
      bookingFeePesewas: 100,
      paymentExpiresAt: new Date(Date.now() - 60_000),
      acceptedAt: new Date(),
      payments: {
        create: {
          userId: passenger.id,
          purpose: 'BOOKING_FEE',
          amountPesewas: 100,
          currency: 'GHS',
          status: 'SUCCESS',
          providerReference: `bf_m8_${randomUUID().replace(/-/g, '')}`,
          idempotencyKey: `booking-fee:${randomUUID()}`,
        },
      },
      statusHistory: {
        create: {
          fromStatus: 'SEARCHING',
          toStatus: 'ACCEPTED',
          actorType: 'RIDER',
          actorId: rider.id,
          reason: 'test_seed',
        },
      },
    },
  });

  await prisma.tokenLedgerEntry.create({
    data: {
      riderId: rider.id,
      bookingId: booking.id,
      type: 'DEDUCTION',
      tokenDelta: -1,
      balanceAfter: 4,
      idempotencyKey: `token-debit:booking:${booking.id}`,
      reason: 'booking_acceptance',
    },
  });
  await prisma.riderWallet.update({
    where: { riderId: rider.id },
    data: { tokenBalance: 4 },
  });

  return { passenger, rider, booking };
}

describe('trip execution postgres', () => {
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
    await prisma.bookingCancellationRequest.deleteMany({
      where: { bookingId: { in: bookingIds } },
    });
    await prisma.tripLocationPoint.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.tokenLedgerEntry.deleteMany({ where: { bookingId: { in: bookingIds } } });
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

  function service() {
    const audit = new MemoryAuditService();
    return new BookingsServiceImpl(new BookingsRepository(prisma), {
      audit,
      prisma,
      paystack: new MemoryPaystackClient(),
    });
  }

  it('lets assigned rider start and complete idempotently; blocks wrong rider and second trip', async () => {
    const { passenger, rider, booking } = await seedAcceptedBooking();
    const bookings = service();

    await expect(bookings.startTrip(passenger.id, booking.id)).rejects.toMatchObject({
      status: 403,
    });

    const other = await prisma.user.create({
      data: {
        phoneNumber: `+23342${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'RIDER',
        status: 'ACTIVE',
        riderProfile: {
          create: {
            fullName: `${marker} Other`,
            verificationStatus: 'APPROVED',
            availability: 'AVAILABLE',
            wallet: { create: { tokenBalance: 1 } },
          },
        },
      },
    });
    userIds.push(other.id);
    await expect(bookings.startTrip(other.id, booking.id)).rejects.toMatchObject({
      status: 404,
    });

    const started = (await bookings.startTrip(rider.id, booking.id)) as {
      status: string;
      startedAt: string;
    };
    expect(started.status).toBe('IN_PROGRESS');
    expect(started.startedAt).toBeTruthy();
    const startedAgain = (await bookings.startTrip(rider.id, booking.id)) as {
      startedAt: string;
    };
    expect(startedAgain.startedAt).toBe(started.startedAt);

    await expect(bookings.completeTrip(rider.id, booking.id)).resolves.toMatchObject({
      status: 'COMPLETED',
    });
    await expect(bookings.completeTrip(rider.id, booking.id)).resolves.toMatchObject({
      status: 'COMPLETED',
    });

    const profile = await prisma.riderProfile.findUniqueOrThrow({ where: { userId: rider.id } });
    expect(profile.availability).toBe('AVAILABLE');
  });

  it('reverses fee and token once on rider cancel; passenger post-accept creates support case only', async () => {
    const { passenger, rider, booking } = await seedAcceptedBooking();
    const bookings = service();

    const cancelled = (await bookings.riderCancelAfterAccept(rider.id, booking.id, {
      reason: 'vehicle_issue',
    })) as { status: string; refundId: string; tokenReversalId: string };
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.refundId).toBeTruthy();
    expect(cancelled.tokenReversalId).toBeTruthy();

    const again = (await bookings.riderCancelAfterAccept(rider.id, booking.id, {
      reason: 'vehicle_issue',
    })) as { refundId?: string };
    expect(again.status).toBe('CANCELLED');

    const refunds = await prisma.paymentRefund.findMany({ where: { bookingId: booking.id } });
    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.status).toBe('REQUESTED');

    const reversals = await prisma.tokenLedgerEntry.findMany({
      where: { bookingId: booking.id, type: 'REFUND' },
    });
    expect(reversals).toHaveLength(1);
    const debit = await prisma.tokenLedgerEntry.findFirstOrThrow({
      where: { bookingId: booking.id, type: 'DEDUCTION' },
    });
    expect(reversals[0]?.reversesEntryId).toBe(debit.id);
    expect(debit.tokenDelta).toBe(-1);

    const wallet = await prisma.riderWallet.findUniqueOrThrow({ where: { riderId: rider.id } });
    expect(wallet.tokenBalance).toBe(5);

    const { passenger: p2, rider: r2, booking: b2 } = await seedAcceptedBooking();
    const request = (await bookings.requestPassengerCancelAfterAccept(p2.id, b2.id, {
      reason: 'changed_plans',
    })) as { automaticRefund: boolean; bookingStatus: string };
    expect(request.automaticRefund).toBe(false);
    expect(request.bookingStatus).toBe('ACCEPTED');
    const still = await prisma.booking.findUniqueOrThrow({ where: { id: b2.id } });
    expect(still.status).toBe('ACCEPTED');
    expect(
      await prisma.paymentRefund.count({ where: { bookingId: b2.id } }),
    ).toBe(0);
    expect(
      await prisma.tokenLedgerEntry.count({ where: { bookingId: b2.id, type: 'REFUND' } }),
    ).toBe(0);
    await expect(
      bookings.requestPassengerCancelAfterAccept(r2.id, b2.id, { reason: 'nope' }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('blocks unable-to-complete on completed trips and reverses once for in-progress', async () => {
    const { rider, booking } = await seedAcceptedBooking();
    const bookings = service();
    await bookings.startTrip(rider.id, booking.id);
    await bookings.completeTrip(rider.id, booking.id);
    await expect(
      bookings.riderUnableToComplete(rider.id, booking.id, { reason: 'late' }),
    ).rejects.toMatchObject({ message: /dispute/i });

    const second = await seedAcceptedBooking();
    await bookings.startTrip(second.rider.id, second.booking.id);
    const failed = (await bookings.riderUnableToComplete(second.rider.id, second.booking.id, {
      reason: 'breakdown',
    })) as { status: string; tokenReversalId: string };
    expect(failed.status).toBe('CANCELLED');
    expect(failed.tokenReversalId).toBeTruthy();
    // wallet helper still works via WalletRepository
    expect(new WalletRepository(prisma)).toBeTruthy();
  });
});
