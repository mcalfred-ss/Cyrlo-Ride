import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemoryAuditService } from '../audit/module.service.js';
import { LocationsRepository } from './module.repository.js';
import { LocationsServiceImpl } from './module.service.js';

const prisma = new PrismaClient();
const marker = `m5-${Date.now()}`;
const createdUserIds: string[] = [];

describe('locations postgres constraints', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.riderLocation.deleteMany({ where: { riderId: { in: createdUserIds } } });
    await prisma.riderProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('persists receivedAt and rejects older recordedAt overwrites', async () => {
    const rider = await prisma.user.create({
      data: {
        phoneNumber: `+23328${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'RIDER',
        status: 'ACTIVE',
        displayName: `${marker}-rider`,
        riderProfile: {
          create: {
            fullName: `${marker} Rider`,
            verificationStatus: 'APPROVED',
            availability: 'OFFLINE',
          },
        },
      },
    });
    createdUserIds.push(rider.id);

    const audit = new MemoryAuditService();
    const repository = new LocationsRepository(prisma);
    let now = new Date('2026-11-07T12:00:00.000Z');
    const service = new LocationsServiceImpl(repository, {
      audit,
      now: () => now,
    });

    const first = (await service.updateOwnLocation(rider.id, {
      latitude: 6.68,
      longitude: -1.62,
      recordedAt: '2026-11-07T11:59:50.000Z',
    })) as { receivedAt: string; recordedAt: string };

    expect(first.receivedAt).toBe(now.toISOString());

    const stored = await prisma.riderLocation.findUnique({ where: { riderId: rider.id } });
    expect(stored?.receivedAt.toISOString()).toBe(now.toISOString());

    now = new Date('2026-11-07T12:00:05.000Z');
    await expect(
      service.updateOwnLocation(rider.id, {
        latitude: 6.681,
        longitude: -1.621,
        recordedAt: '2026-11-07T11:59:40.000Z',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    await service.updateOwnLocation(rider.id, {
      latitude: 6.682,
      longitude: -1.622,
      recordedAt: '2026-11-07T11:59:55.000Z',
    });
    const updated = await prisma.riderLocation.findUnique({ where: { riderId: rider.id } });
    expect(Number(updated?.latitude)).toBeCloseTo(6.682, 5);
  });
});
