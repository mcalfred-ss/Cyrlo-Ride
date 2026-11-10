import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemoryAuditService } from '../audit/module.service.js';
import { BookingsRepository } from '../bookings/module.repository.js';
import { BookingsServiceImpl } from '../bookings/module.service.js';
import { MemoryPaystackClient } from '../../infrastructure/payments/paystack-client.js';
import { validateAndNormalizeBoundary } from '../service-zones/zone-geometry.js';
import { IdentityOrderingStrategy } from './candidate-ordering.js';
import { MatchingRepository } from './module.repository.js';
import { MatchingServiceImpl } from './module.service.js';

const prisma = new PrismaClient();
const marker = `m7-${Date.now()}`;
const userIds: string[] = [];
const zoneIds: string[] = [];

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

describe('matching postgres concurrency', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.tokenLedgerEntry.deleteMany({ where: { riderId: { in: userIds } } });
    await prisma.bookingOffer.deleteMany({
      where: { booking: { passengerId: { in: userIds } } },
    });
    await prisma.paymentRefund.deleteMany({
      where: { bookingId: { in: await bookingIds() } },
    });
    await prisma.payment.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.bookingStatusHistory.deleteMany({
      where: { bookingId: { in: await bookingIds() } },
    });
    await prisma.booking.deleteMany({ where: { passengerId: { in: userIds } } });
    await prisma.riderLocation.deleteMany({ where: { riderId: { in: userIds } } });
    await prisma.riderWallet.deleteMany({ where: { riderId: { in: userIds } } });
    await prisma.riderZoneApproval.deleteMany({ where: { riderId: { in: userIds } } });
    await prisma.riderVehicle.deleteMany({ where: { riderId: { in: userIds } } });
    await prisma.riderProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.serviceZone.deleteMany({ where: { id: { in: zoneIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  async function bookingIds() {
    return (
      await prisma.booking.findMany({
        where: { passengerId: { in: userIds } },
        select: { id: true },
      })
    ).map((row) => row.id);
  }

  it('dispatches at most three offers and allows only one concurrent acceptance with one token debit', async () => {
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
    zoneIds.push(zone.id);

    const passenger = await prisma.user.create({
      data: {
        phoneNumber: `+23330${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'PASSENGER',
        status: 'ACTIVE',
      },
    });
    userIds.push(passenger.id);

    const riderIds: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const rider = await prisma.user.create({
        data: {
          phoneNumber: `+23331${randomUUID().replace(/-/g, '').slice(0, 9)}`,
          role: 'RIDER',
          status: 'ACTIVE',
          riderProfile: {
            create: {
              fullName: `${marker} Rider ${i}`,
              verificationStatus: 'APPROVED',
              availability: 'AVAILABLE',
              vehicles: {
                create: {
                  category: 'PRAGYA',
                  registrationNumber: `REG-${i}-${Date.now()}`,
                  make: 'Test',
                  model: 'Trike',
                  colour: 'Yellow',
                  capacity: 3,
                  verificationStatus: 'APPROVED',
                },
              },
              wallet: { create: { tokenBalance: 2 } },
              location: {
                create: {
                  latitude: 6.685,
                  longitude: -1.625,
                  sharingEnabled: true,
                  recordedAt: new Date(),
                  receivedAt: new Date(),
                },
              },
              zoneApprovals: {
                create: {
                  zoneId: zone.id,
                  status: 'APPROVED',
                  decidedAt: new Date(),
                },
              },
            },
          },
        },
      });
      userIds.push(rider.id);
      riderIds.push(rider.id);
    }

    const now = new Date();
    const audit = new MemoryAuditService();
    const bookings = new BookingsServiceImpl(new BookingsRepository(prisma), {
      audit,
      prisma,
      paystack: new MemoryPaystackClient(),
      now: () => now,
    });
    const matching = new MatchingServiceImpl(new MatchingRepository(prisma), {
      audit,
      prisma,
      bookings,
      ordering: new IdentityOrderingStrategy(),
      offerTimeoutSeconds: 30,
      now: () => now,
    });

    const booking = await prisma.booking.create({
      data: {
        passengerId: passenger.id,
        serviceZoneId: zone.id,
        status: 'SEARCHING',
        vehicleCategory: 'PRAGYA',
        pickupLatitude: 6.685,
        pickupLongitude: -1.625,
        destinationLatitude: 6.686,
        destinationLongitude: -1.626,
        bookingFeePesewas: 100,
        paymentExpiresAt: new Date(now.getTime() - 60_000),
        searchExpiresAt: new Date(now.getTime() + 5 * 60_000),
        payments: {
          create: {
            userId: passenger.id,
            purpose: 'BOOKING_FEE',
            amountPesewas: 100,
            currency: 'GHS',
            status: 'SUCCESS',
            providerReference: `bf_m7_${randomUUID().replace(/-/g, '')}`,
            idempotencyKey: `booking-fee:${randomUUID()}`,
          },
        },
        statusHistory: {
          create: {
            fromStatus: 'AWAITING_PAYMENT',
            toStatus: 'SEARCHING',
            actorType: 'SYSTEM',
            reason: 'test_seed',
          },
        },
      },
    });

    const dispatched = await matching.dispatchForBooking(booking.id);
    expect(dispatched.offered).toBe(3);
    const offers = await prisma.bookingOffer.findMany({
      where: { bookingId: booking.id, status: 'PENDING' },
    });
    expect(offers).toHaveLength(3);

    const [a, b] = offers;
    const results = await Promise.allSettled([
      matching.acceptOffer(a!.riderId, a!.id),
      matching.acceptOffer(b!.riderId, b!.id),
    ]);
    const fulfilled = results.filter((row) => row.status === 'fulfilled');
    const rejected = results.filter((row) => row.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const acceptedBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(acceptedBooking?.status).toBe('ACCEPTED');
    expect(acceptedBooking?.riderId).toBeTruthy();

    const debits = await prisma.tokenLedgerEntry.findMany({
      where: { bookingId: booking.id, type: 'DEDUCTION' },
    });
    expect(debits).toHaveLength(1);
    expect(debits[0]?.tokenDelta).toBe(-1);

    const pendingLeft = await prisma.bookingOffer.count({
      where: { bookingId: booking.id, status: 'PENDING' },
    });
    expect(pendingLeft).toBe(0);
    const invalidated = await prisma.bookingOffer.count({
      where: { bookingId: booking.id, status: 'INVALIDATED' },
    });
    expect(invalidated).toBeGreaterThanOrEqual(2);

    await expect(
      matching.dispatchForBooking(booking.id),
    ).rejects.toMatchObject({ message: /not in SEARCHING/ });
  });

  it('rejects after all batch offers and expires search without token debit', async () => {
    const { boundary, boundingBox } = validateAndNormalizeBoundary(polygon);
    const zone = await prisma.serviceZone.create({
      data: {
        name: `${marker}-zone-exp`,
        isActive: true,
        boundary,
        minLatitude: boundingBox.minLatitude,
        maxLatitude: boundingBox.maxLatitude,
        minLongitude: boundingBox.minLongitude,
        maxLongitude: boundingBox.maxLongitude,
      },
    });
    zoneIds.push(zone.id);

    const passenger = await prisma.user.create({
      data: {
        phoneNumber: `+23332${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'PASSENGER',
        status: 'ACTIVE',
      },
    });
    userIds.push(passenger.id);

    const rider = await prisma.user.create({
      data: {
        phoneNumber: `+23333${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'RIDER',
        status: 'ACTIVE',
        riderProfile: {
          create: {
            fullName: `${marker} Solo`,
            verificationStatus: 'APPROVED',
            availability: 'AVAILABLE',
            vehicles: {
              create: {
                category: 'PRAGYA',
                registrationNumber: `SOLO-${Date.now()}`,
                make: 'Test',
                model: 'Trike',
                colour: 'Green',
                capacity: 3,
                verificationStatus: 'APPROVED',
              },
            },
            wallet: { create: { tokenBalance: 3 } },
            location: {
              create: {
                latitude: 6.685,
                longitude: -1.625,
                sharingEnabled: true,
                recordedAt: new Date(),
                receivedAt: new Date(),
              },
            },
            zoneApprovals: {
              create: { zoneId: zone.id, status: 'APPROVED', decidedAt: new Date() },
            },
          },
        },
      },
    });
    userIds.push(rider.id);

    const started = new Date();
    let clock = started;
    const audit = new MemoryAuditService();
    const bookings = new BookingsServiceImpl(new BookingsRepository(prisma), {
      audit,
      prisma,
      paystack: new MemoryPaystackClient(),
      now: () => clock,
    });
    const matching = new MatchingServiceImpl(new MatchingRepository(prisma), {
      audit,
      prisma,
      bookings,
      ordering: new IdentityOrderingStrategy(),
      offerTimeoutSeconds: 30,
      now: () => clock,
    });

    const booking = await prisma.booking.create({
      data: {
        passengerId: passenger.id,
        serviceZoneId: zone.id,
        status: 'SEARCHING',
        vehicleCategory: 'PRAGYA',
        pickupLatitude: 6.685,
        pickupLongitude: -1.625,
        destinationLatitude: 6.686,
        destinationLongitude: -1.626,
        bookingFeePesewas: 100,
        paymentExpiresAt: new Date(started.getTime() - 60_000),
        searchExpiresAt: new Date(started.getTime() + 60_000),
        payments: {
          create: {
            userId: passenger.id,
            purpose: 'BOOKING_FEE',
            amountPesewas: 100,
            currency: 'GHS',
            status: 'SUCCESS',
            providerReference: `bf_m7e_${randomUUID().replace(/-/g, '')}`,
            idempotencyKey: `booking-fee:${randomUUID()}`,
          },
        },
        statusHistory: {
          create: {
            fromStatus: 'AWAITING_PAYMENT',
            toStatus: 'SEARCHING',
            actorType: 'SYSTEM',
            reason: 'test_seed',
          },
        },
      },
    });

    const first = await matching.dispatchForBooking(booking.id);
    expect(first.offered).toBe(1);
    const offer = await prisma.bookingOffer.findFirstOrThrow({
      where: { bookingId: booking.id, status: 'PENDING' },
    });
    await matching.rejectOffer(rider.id, offer.id);
    // Rejected rider is excluded; no other candidates → no new offers.
    const second = await matching.dispatchForBooking(booking.id);
    expect(second.offered).toBe(0);

    clock = new Date(started.getTime() + 120_000);
    const expired = await matching.expireOffersAndSearches();
    expect(expired.expiredBookings).toBeGreaterThanOrEqual(1);
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(row.status).toBe('EXPIRED');
    const debits = await prisma.tokenLedgerEntry.count({
      where: { bookingId: booking.id, type: 'DEDUCTION' },
    });
    expect(debits).toBe(0);
    const refunds = await prisma.paymentRefund.count({ where: { bookingId: booking.id } });
    expect(refunds).toBe(1);
  });

  it('fails closed when offer timeout is missing', async () => {
    const matching = new MatchingServiceImpl(new MatchingRepository(prisma), {
      audit: new MemoryAuditService(),
      prisma,
      bookings: new BookingsServiceImpl(new BookingsRepository(prisma), {
        audit: new MemoryAuditService(),
        prisma,
      }),
      // omit offerTimeoutSeconds and rely on empty env override
      offerTimeoutSeconds: 0,
    });
    await expect(matching.dispatchOpenBookings()).rejects.toMatchObject({
      message: /RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS/,
    });
  });
});
