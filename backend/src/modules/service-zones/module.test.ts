import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { staffRoleHasPermission, Permission } from '../../common/authz/permissions.js';
import { MemoryAuditService } from '../audit/module.service.js';
import { MemoryServiceZonesRepository } from './memory-service-zones-repository.js';
import { rejectOrRevokeZoneSchema } from './module.schema.js';
import { ServiceZonesServiceImpl } from './module.service.js';
import type { ServiceZonesRepository } from './module.repository.js';
import { validateAndNormalizeBoundary } from './zone-geometry.js';

/** Synthetic square used only for geometry unit tests — not a real pilot boundary. */
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

const testMultiPolygon = {
  type: 'MultiPolygon' as const,
  coordinates: [testPolygon.coordinates, testPolygon.coordinates],
};

function createService(repo = new MemoryServiceZonesRepository()) {
  const audit = new MemoryAuditService();
  const service = new ServiceZonesServiceImpl(repo as unknown as ServiceZonesRepository, {
    audit,
  });
  return { service, repo, audit };
}

describe('zone permissions', () => {
  it('allows Super and Operations to manage zones, denies Finance and Support', () => {
    expect(staffRoleHasPermission('SUPER_ADMIN', Permission.ManageServiceZones)).toBe(true);
    expect(staffRoleHasPermission('OPERATIONS_ADMIN', Permission.ManageServiceZones)).toBe(true);
    expect(staffRoleHasPermission('FINANCE_ADMIN', Permission.ManageServiceZones)).toBe(false);
    expect(staffRoleHasPermission('SUPPORT_ADMIN', Permission.ManageServiceZones)).toBe(false);
  });
});

describe('zone geometry validation', () => {
  it('accepts valid Polygon and MultiPolygon and rejects malformed geometry', () => {
    expect(validateAndNormalizeBoundary(testPolygon).boundingBox.minLatitude).toBe(6.68);
    expect(validateAndNormalizeBoundary(testMultiPolygon).boundary.type).toBe('MultiPolygon');
    expect(() => validateAndNormalizeBoundary({ type: 'Point', coordinates: [0, 0] })).toThrow(
      /Polygon or MultiPolygon/,
    );
    expect(() =>
      validateAndNormalizeBoundary({
        type: 'Polygon',
        coordinates: [
          [
            [-1.63, 6.68],
            [-1.62, 6.68],
            [-1.63, 6.68],
          ],
        ],
      }),
    ).toThrow(/at least 4 positions/);
    expect(() =>
      validateAndNormalizeBoundary({
        type: 'Polygon',
        coordinates: [
          [
            [-1.63, 6.68],
            [-1.62, 6.68],
            [-1.62, 6.69],
            [-1.63, 6.69],
            [-1.62, 6.68],
          ],
        ],
      }),
    ).toThrow(/must be closed/);
    expect(() =>
      validateAndNormalizeBoundary({
        type: 'Polygon',
        coordinates: [[[200, 6.68], [201, 6.68], [201, 6.69], [200, 6.69], [200, 6.68]]],
      }),
    ).toThrow(/Longitude/);
  });
});

describe('reject/revoke reason schema', () => {
  it('requires a mandatory reason of at least 5 characters', () => {
    expect(rejectOrRevokeZoneSchema.safeParse({ reason: 'ab' }).success).toBe(false);
    expect(rejectOrRevokeZoneSchema.safeParse({}).success).toBe(false);
    expect(
      rejectOrRevokeZoneSchema.safeParse({ reason: 'Missing local coverage proof' }).success,
    ).toBe(true);
  });
});

describe('service zone management', () => {
  it('creates, updates, activates and deactivates a zone while preserving history', async () => {
    const actorId = randomUUID();
    const { service, repo, audit } = createService();
    const created = (await service.createZone(actorId, {
      name: 'Pilot Zone Placeholder',
      description: 'Boundary supplied by ops later; test geometry only',
      boundary: testPolygon,
    })) as { id: string; isActive: boolean };

    expect(created.isActive).toBe(false);
    expect(audit.entries.some((entry) => entry.action === 'service_zone.created')).toBe(true);

    await service.updateZone(actorId, created.id, {
      name: 'Pilot Zone Placeholder v2',
      boundary: testMultiPolygon,
    });
    expect(
      audit.entries.some((entry) => entry.action === 'service_zone.boundary_changed'),
    ).toBe(true);

    const active = (await service.activateZone(actorId, created.id)) as { isActive: boolean };
    expect(active.isActive).toBe(true);
    const inactive = (await service.deactivateZone(actorId, created.id)) as {
      isActive: boolean;
      id: string;
    };
    expect(inactive.isActive).toBe(false);
    expect(repo.zones.get(created.id)?.name).toBe('Pilot Zone Placeholder v2');
    expect(repo.zones.has(created.id)).toBe(true);
  });
});

describe('rider-zone approvals', () => {
  it('supports multi-zone assignment, rejects inactive approvals, and keeps history', async () => {
    const actorId = randomUUID();
    const riderId = randomUUID();
    const { service, repo, audit } = createService();
    repo.seedRider({ userId: riderId, phoneNumber: '+233244111111' });

    const zoneA = (await service.createZone(actorId, {
      name: 'Zone A',
      boundary: testPolygon,
      activate: true,
    })) as { id: string };
    const zoneB = (await service.createZone(actorId, {
      name: 'Zone B',
      boundary: testPolygon,
      activate: true,
    })) as { id: string };
    const inactive = (await service.createZone(actorId, {
      name: 'Inactive',
      boundary: testPolygon,
    })) as { id: string };

    const a1 = (await service.assignRider(actorId, zoneA.id, { riderId })) as { id: string };
    const b1 = (await service.assignRider(actorId, zoneB.id, { riderId })) as { id: string };
    expect(a1.id).not.toBe(b1.id);

    await expect(service.assignRider(actorId, zoneA.id, { riderId })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(service.assignRider(actorId, inactive.id, { riderId })).rejects.toMatchObject({
      message: /inactive zone/,
    });

    await service.approveRiderZone(actorId, a1.id);
    await expect(
      service.rejectRiderZone(actorId, a1.id, { reason: 'too late' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    await service.rejectRiderZone(actorId, b1.id, { reason: 'Missing local coverage proof' });
    await service.revokeRiderZone(actorId, a1.id, { reason: 'Left the pilot area' });

    const history = (await service.listRiderZoneHistory(riderId)) as Array<{ status: string }>;
    expect(history.map((row) => row.status)).toEqual(
      expect.arrayContaining(['PENDING', 'APPROVED', 'REJECTED', 'REVOKED']),
    );
    expect(audit.entries.some((entry) => entry.action === 'rider_zone.approved')).toBe(true);
    expect(audit.entries.some((entry) => entry.action === 'rider_zone.revoked')).toBe(true);

    await service.activateZone(actorId, inactive.id);
    expect((await service.listRiderZoneHistory(riderId)).length).toBeGreaterThanOrEqual(4);

    const zoneRiders = (await service.listZoneRiders(zoneA.id)) as Array<{ status: string }>;
    expect(zoneRiders[0]?.status).toBe('REVOKED');
  });

  it('prevents self-approval', async () => {
    const riderId = randomUUID();
    const { service, repo } = createService();
    repo.seedRider({ userId: riderId });
    const zone = (await service.createZone(randomUUID(), {
      name: 'Self Zone',
      boundary: testPolygon,
      activate: true,
    })) as { id: string };
    const opsId = randomUUID();
    const approval = (await service.assignRider(opsId, zone.id, { riderId })) as { id: string };
    await expect(service.approveRiderZone(riderId, approval.id)).rejects.toMatchObject({
      message: /cannot approve their own/,
    });
  });

  it('does not change rider Ghana Card verification when changing zone approval', async () => {
    const actorId = randomUUID();
    const riderId = randomUUID();
    const { service, repo } = createService();
    repo.seedRider({ userId: riderId, verificationStatus: 'APPROVED' });
    const zone = (await service.createZone(actorId, {
      name: 'Verify Isolation',
      boundary: testPolygon,
      activate: true,
    })) as { id: string };
    const approval = (await service.assignRider(actorId, zone.id, { riderId })) as { id: string };
    await service.approveRiderZone(actorId, approval.id);
    expect(repo.riders.get(riderId)?.verificationStatus).toBe('APPROVED');
    await service.revokeRiderZone(actorId, approval.id, { reason: 'Ops coverage change' });
    expect(repo.riders.get(riderId)?.verificationStatus).toBe('APPROVED');
  });
});
