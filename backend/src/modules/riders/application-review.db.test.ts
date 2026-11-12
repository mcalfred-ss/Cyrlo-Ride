import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemoryObjectStorage } from '../../infrastructure/storage/object-storage.js';
import { MemoryAuditService } from '../audit/module.service.js';
import { RidersRepository } from './module.repository.js';
import { RidersServiceImpl } from './module.service.js';

const prisma = new PrismaClient();
const marker = `app-review-${Date.now()}`;
const userIds: string[] = [];

describe('application approval vehicle enforcement (postgres)', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (userIds.length) {
      await prisma.tokenLedgerEntry.deleteMany({ where: { riderId: { in: userIds } } });
      await prisma.riderReviewDecision.deleteMany({ where: { riderId: { in: userIds } } });
      await prisma.riderWallet.deleteMany({ where: { riderId: { in: userIds } } });
      await prisma.riderVehicle.deleteMany({ where: { riderId: { in: userIds } } });
      await prisma.riderProfile.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.$disconnect();
  });

  it('transactionally blocks pending vehicles and concurrent double-approve', async () => {
    const riderId = randomUUID();
    const opsId = randomUUID();
    const vehicleA = randomUUID();
    const vehicleB = randomUUID();
    userIds.push(riderId, opsId);

    await prisma.user.create({
      data: {
        id: opsId,
        phoneNumber: `+23320${opsId.replace(/-/g, '').slice(0, 9)}`,
        role: 'ADMIN',
        status: 'ACTIVE',
        displayName: `${marker} ops`,
      },
    });
    await prisma.user.create({
      data: {
        id: riderId,
        phoneNumber: `+23324${riderId.replace(/-/g, '').slice(0, 9)}`,
        role: 'PASSENGER',
        status: 'ACTIVE',
        displayName: `${marker} rider`,
        riderProfile: {
          create: {
            fullName: `${marker} Candidate`,
            verificationStatus: 'PENDING_REVIEW',
            submittedAt: new Date(),
            vehicles: {
              create: [
                {
                  id: vehicleA,
                  category: 'OKADA',
                  registrationNumber: `${marker}-A`,
                  make: 'Honda',
                  model: 'CG',
                  colour: 'Red',
                  capacity: 1,
                  verificationStatus: 'PENDING_REVIEW',
                  submittedAt: new Date(),
                },
                {
                  id: vehicleB,
                  category: 'OKADA',
                  registrationNumber: `${marker}-B`,
                  make: 'Yamaha',
                  model: 'YZ',
                  colour: 'Blue',
                  capacity: 1,
                  verificationStatus: 'PENDING_REVIEW',
                  submittedAt: new Date(),
                },
              ],
            },
          },
        },
      },
    });

    const audit = new MemoryAuditService();
    const service = new RidersServiceImpl(new RidersRepository(prisma), {
      storage: new MemoryObjectStorage(),
      audit,
    });

    await expect(
      service.reviewApplication(opsId, riderId, { decision: 'APPROVED' }),
    ).rejects.toMatchObject({
      status: 409,
      message: /individually reviewed/,
    });
    expect(audit.entries.some((e) => e.action === 'rider.application.approved')).toBe(false);

    await service.reviewVehicle(opsId, vehicleA, { decision: 'APPROVED' });
    await service.reviewVehicle(opsId, vehicleB, {
      decision: 'REJECTED',
      reason: 'Wrong category paperwork',
    });

    const results = await Promise.allSettled([
      service.reviewApplication(opsId, riderId, { decision: 'APPROVED' }),
      service.reviewApplication(opsId, riderId, { decision: 'APPROVED' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);

    const profile = await prisma.riderProfile.findUniqueOrThrow({ where: { userId: riderId } });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: riderId } });
    const vehicles = await prisma.riderVehicle.findMany({
      where: { riderId },
      orderBy: { registrationNumber: 'asc' },
    });
    expect(profile.verificationStatus).toBe('APPROVED');
    expect(user.role).toBe('RIDER');
    expect(vehicles.find((v) => v.id === vehicleA)?.verificationStatus).toBe('APPROVED');
    expect(vehicles.find((v) => v.id === vehicleB)?.verificationStatus).toBe('REJECTED');
    expect(audit.entries.filter((e) => e.action === 'rider.application.approved')).toHaveLength(1);
  });
});
