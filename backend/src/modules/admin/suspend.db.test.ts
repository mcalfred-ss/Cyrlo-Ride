import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevelopmentSmsProvider } from '../../infrastructure/sms/sms.provider.js';
import { MemoryAuditService } from '../audit/module.service.js';
import { AdminRepository } from './module.repository.js';
import { AdminServiceImpl } from './module.service.js';

const prisma = new PrismaClient();
const marker = `suspend-db-${Date.now()}`;
const userIds: string[] = [];

describe('admin suspend postgres consistency', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (userIds.length > 0) {
      await prisma.bookingOffer.deleteMany({
        where: {
          OR: [{ riderId: { in: userIds } }, { booking: { passengerId: { in: userIds } } }],
        },
      });
      await prisma.bookingStatusHistory.deleteMany({
        where: { booking: { passengerId: { in: userIds } } },
      });
      await prisma.booking.deleteMany({
        where: {
          OR: [{ riderId: { in: userIds } }, { passengerId: { in: userIds } }],
        },
      });
      await prisma.riderWallet.deleteMany({ where: { riderId: { in: userIds } } });
      await prisma.riderProfile.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.passengerProfile.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.notificationOutbox.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.$disconnect();
  });

  it('suspends rider without changing active booking status or token balance', async () => {
    const passengerId = randomUUID();
    const riderId = randomUUID();
    const actorId = randomUUID();
    userIds.push(passengerId, riderId, actorId);

    await prisma.user.create({
      data: {
        id: passengerId,
        phoneNumber: `+23320${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'PASSENGER',
        status: 'ACTIVE',
        passengerProfile: { create: { fullName: `${marker} passenger` } },
      },
    });
    await prisma.user.create({
      data: {
        id: riderId,
        phoneNumber: `+23320${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'RIDER',
        status: 'ACTIVE',
        riderProfile: {
          create: {
            fullName: `${marker} rider`,
            verificationStatus: 'APPROVED',
            availability: 'AVAILABLE',
            wallet: { create: { tokenBalance: 7 } },
          },
        },
      },
    });
    await prisma.user.create({
      data: {
        id: actorId,
        phoneNumber: `+23320${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });

    const booking = await prisma.booking.create({
      data: {
        passengerId,
        riderId,
        status: 'IN_PROGRESS',
        vehicleCategory: 'CAR',
        pickupLatitude: 5.6,
        pickupLongitude: -0.18,
        destinationLatitude: 5.61,
        destinationLongitude: -0.19,
        bookingFeePesewas: 100,
        paymentExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
      },
    });

    const audit = new MemoryAuditService();
    const service = new AdminServiceImpl(new AdminRepository(prisma), {
      sms: new DevelopmentSmsProvider(),
      audit,
      prisma,
      now: () => new Date('2026-06-01T12:00:00.000Z'),
    });

    const result = await service.suspendUser(
      { userId: riderId, reason: 'ops safety hold' },
      { userId: actorId, staffRole: 'OPERATIONS_ADMIN' },
    );

    expect(result.activeTripsPreserved).toBe(1);
    expect(result.status).toBe('SUSPENDED');

    const user = await prisma.user.findUniqueOrThrow({ where: { id: riderId } });
    expect(user.status).toBe('SUSPENDED');

    const profile = await prisma.riderProfile.findUniqueOrThrow({ where: { userId: riderId } });
    expect(profile.availability).toBe('OFFLINE');

    const unchangedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(unchangedBooking.status).toBe('IN_PROGRESS');
    expect(unchangedBooking.riderId).toBe(riderId);
    expect(unchangedBooking.passengerAcknowledgedAt).toBeNull();

    const wallet = await prisma.riderWallet.findUniqueOrThrow({ where: { riderId } });
    expect(wallet.tokenBalance).toBe(7);

    expect(audit.entries.some((e) => e.action === 'admin.user.suspended')).toBe(true);
  });
});
