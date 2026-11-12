import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemoryAuditService } from '../audit/module.service.js';
import { RidersRepository } from './module.repository.js';
import { RidersServiceImpl } from './module.service.js';

const prisma = new PrismaClient();
const marker = `rider-dir-${Date.now()}`;
const userIds: string[] = [];

function assertNoExactCoordinates(payload: unknown) {
  const json = JSON.stringify(payload);
  expect(json).not.toMatch(/latitude/i);
  expect(json).not.toMatch(/longitude/i);
}

describe('admin rider directory postgres', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (userIds.length) {
      await prisma.riderWallet.deleteMany({ where: { riderId: { in: userIds } } });
      await prisma.riderLocation.deleteMany({ where: { riderId: { in: userIds } } });
      await prisma.riderVehicle.deleteMany({ where: { riderId: { in: userIds } } });
      await prisma.riderProfile.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.$disconnect();
  });

  it('lists, filters, loads profile, and omits coordinates', async () => {
    const riderId = randomUUID();
    const otherId = randomUUID();
    userIds.push(riderId, otherId);

    await prisma.user.create({
      data: {
        id: riderId,
        phoneNumber: `+23323${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'RIDER',
        status: 'ACTIVE',
        displayName: `${marker} one`,
        riderProfile: {
          create: {
            fullName: `${marker} Alpha`,
            verificationStatus: 'APPROVED',
            availability: 'AVAILABLE',
            wallet: { create: { tokenBalance: 7 } },
            location: {
              create: {
                latitude: 6.69,
                longitude: -1.61,
                accuracyMeters: 8,
                sharingEnabled: true,
                recordedAt: new Date(),
                receivedAt: new Date(),
              },
            },
            vehicles: {
              create: {
                category: 'OKADA',
                registrationNumber: `GR-${marker.slice(-6)}`,
                make: 'Bajaj',
                model: 'Box',
                colour: 'black',
                capacity: 1,
                verificationStatus: 'APPROVED',
              },
            },
          },
        },
      },
    });

    await prisma.user.create({
      data: {
        id: otherId,
        phoneNumber: `+23324${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'RIDER',
        status: 'SUSPENDED',
        riderProfile: {
          create: {
            fullName: `${marker} Beta`,
            verificationStatus: 'PENDING_REVIEW',
            availability: 'OFFLINE',
          },
        },
      },
    });

    const service = new RidersServiceImpl(new RidersRepository(prisma), {
      storage: {
        putObject: async () => undefined,
        getSignedDownloadUrl: async () => 'https://example.test/x',
      } as never,
      audit: new MemoryAuditService(),
    });

    const listed = (await service.listRidersForAdmin({
      page: 1,
      pageSize: 20,
      q: marker,
      status: 'ACTIVE',
      verificationStatus: 'APPROVED',
    })) as {
      items: Array<{ id: string; fullName: string }>;
      pagination: { total: number };
    };
    expect(listed.items.some((row) => row.id === riderId)).toBe(true);
    expect(listed.items.every((row) => row.id !== otherId)).toBe(true);
    assertNoExactCoordinates(listed);

    const profile = (await service.getRiderForAdmin(riderId)) as {
      id: string;
      tokens: { balance: number };
      gps: { fresh: boolean } | null;
      vehicles: unknown[];
    };
    expect(profile.id).toBe(riderId);
    expect(profile.tokens.balance).toBe(7);
    expect(profile.gps).not.toBeNull();
    expect(profile.vehicles.length).toBe(1);
    assertNoExactCoordinates(profile);

    await expect(service.getRiderForAdmin(randomUUID())).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('uses createdAt DESC then id DESC so tied timestamps paginate without duplicates', async () => {
    const tiedAt = new Date('2025-06-01T00:00:00.000Z');
    const idLow = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const idHigh = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    userIds.push(idLow, idHigh);

    for (const [id, name] of [
      [idLow, 'TieLow'],
      [idHigh, 'TieHigh'],
    ] as const) {
      await prisma.user.create({
        data: {
          id,
          phoneNumber: `+23325${id.replace(/-/g, '').slice(0, 9)}`,
          role: 'RIDER',
          status: 'ACTIVE',
          createdAt: tiedAt,
          updatedAt: tiedAt,
          riderProfile: {
            create: {
              fullName: `${marker} ${name}`,
              verificationStatus: 'APPROVED',
              availability: 'OFFLINE',
            },
          },
        },
      });
    }

    const service = new RidersServiceImpl(new RidersRepository(prisma), {
      storage: {
        putObject: async () => undefined,
        getSignedDownloadUrl: async () => 'https://example.test/x',
      } as never,
      audit: new MemoryAuditService(),
    });

    const page1 = (await service.listRidersForAdmin({
      page: 1,
      pageSize: 1,
      q: `${marker} Tie`,
      verificationStatus: 'APPROVED',
      status: 'ACTIVE',
    })) as { items: Array<{ id: string }>; pagination: { total: number } };
    const page2 = (await service.listRidersForAdmin({
      page: 2,
      pageSize: 1,
      q: `${marker} Tie`,
      verificationStatus: 'APPROVED',
      status: 'ACTIVE',
    })) as { items: Array<{ id: string }> };

    expect(page1.pagination.total).toBe(2);
    expect(page1.items[0]?.id).toBe(idHigh);
    expect(page2.items[0]?.id).toBe(idLow);
    expect(page1.items[0]?.id).not.toBe(page2.items[0]?.id);
  });
});
