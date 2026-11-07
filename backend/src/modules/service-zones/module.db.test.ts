import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemoryAuditService } from '../audit/module.service.js';
import { ServiceZonesRepository } from './module.repository.js';
import { ServiceZonesServiceImpl } from './module.service.js';
import { validateAndNormalizeBoundary } from './zone-geometry.js';

/**
 * PostgreSQL-backed constraint checks against cyrlo_ride_app.
 * Synthetic geometry only — not a seeded pilot boundary.
 */
const testPolygon = {
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

const prisma = new PrismaClient();
const marker = `m4-${Date.now()}`;
const createdUserIds: string[] = [];
const createdZoneIds: string[] = [];

describe('service zones postgres constraints', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.riderZoneDecision.deleteMany({
      where: { zoneId: { in: createdZoneIds } },
    });
    await prisma.riderZoneApproval.deleteMany({
      where: { zoneId: { in: createdZoneIds } },
    });
    await prisma.serviceZone.deleteMany({
      where: { id: { in: createdZoneIds } },
    });
    await prisma.riderProfile.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
    await prisma.$disconnect();
  });

  it('enforces unique rider/zone approvals, preserves rows on deactivate, and restricts zone delete', async () => {
    const admin = await prisma.user.create({
      data: {
        phoneNumber: `+23320${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'ADMIN',
        status: 'ACTIVE',
        displayName: `${marker}-admin`,
      },
    });
    createdUserIds.push(admin.id);

    const rider = await prisma.user.create({
      data: {
        phoneNumber: `+23324${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'RIDER',
        status: 'ACTIVE',
        displayName: `${marker}-rider`,
        riderProfile: {
          create: {
            fullName: `${marker} Rider`,
            verificationStatus: 'APPROVED',
          },
        },
      },
    });
    createdUserIds.push(rider.id);

    const audit = new MemoryAuditService();
    const repository = new ServiceZonesRepository(prisma);
    const service = new ServiceZonesServiceImpl(repository, { audit });
    const { boundary, boundingBox } = validateAndNormalizeBoundary(testPolygon);

    const zone = await repository.createZone({
      name: `${marker}-zone`,
      description: 'integration test geometry only',
      boundary,
      box: boundingBox,
      isActive: true,
      actorId: admin.id,
    });
    createdZoneIds.push(zone.id);

    const approval = await service.assignRider(admin.id, zone.id, { riderId: rider.id });
    expect((approval as { status: string }).status).toBe('PENDING');

    await expect(
      repository.createApproval({
        riderId: rider.id,
        zoneId: zone.id,
        actorId: admin.id,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    await service.approveRiderZone(admin.id, (approval as { id: string }).id);
    await service.deactivateZone(admin.id, zone.id);

    const stillThere = await prisma.riderZoneApproval.findUnique({
      where: { id: (approval as { id: string }).id },
    });
    expect(stillThere?.status).toBe('APPROVED');
    expect(stillThere?.reason).toBeNull();

    const decisionCount = await prisma.riderZoneDecision.count({
      where: { approvalId: (approval as { id: string }).id },
    });
    expect(decisionCount).toBeGreaterThanOrEqual(2);

    await expect(prisma.serviceZone.delete({ where: { id: zone.id } })).rejects.toThrow();
    const zoneStillPresent = await prisma.serviceZone.findUnique({ where: { id: zone.id } });
    expect(zoneStillPresent).not.toBeNull();
  });

  it('rejects assigning a rider to an inactive zone at the service layer', async () => {
    const admin = await prisma.user.create({
      data: {
        phoneNumber: `+23326${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });
    createdUserIds.push(admin.id);
    const rider = await prisma.user.create({
      data: {
        phoneNumber: `+23327${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'RIDER',
        status: 'ACTIVE',
        riderProfile: {
          create: { fullName: `${marker} Rider B`, verificationStatus: 'APPROVED' },
        },
      },
    });
    createdUserIds.push(rider.id);

    const repository = new ServiceZonesRepository(prisma);
    const service = new ServiceZonesServiceImpl(repository, { audit: new MemoryAuditService() });
    const { boundary, boundingBox } = validateAndNormalizeBoundary(testPolygon);
    const inactive = await repository.createZone({
      name: `${marker}-off`,
      boundary,
      box: boundingBox,
      isActive: false,
      actorId: admin.id,
    });
    createdZoneIds.push(inactive.id);

    await expect(
      service.assignRider(admin.id, inactive.id, { riderId: rider.id }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: /inactive zone/,
    });
  });
});
