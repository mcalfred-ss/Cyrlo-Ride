import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { RIDER_LOCATION_MAX_AGE_MS } from '../../config/constants.js';
import { MemoryAuditService } from '../audit/module.service.js';
import {
  evaluateLocationFreshness,
  isFreshLocation,
  isOperationallyFreshLocation,
} from './location-freshness.js';
import { MemoryLocationsRepository } from './memory-locations-repository.js';
import { updateLocationSchema } from './module.schema.js';
import { LocationsServiceImpl } from './module.service.js';
import type { LocationsRepository } from './module.repository.js';

describe('location freshness', () => {
  const now = new Date('2026-11-06T12:00:00.000Z');

  it('treats exact 30-second server age as fresh and 30.001 as stale', () => {
    const recordedAt = new Date(now.getTime() - 5_000);
    expect(
      evaluateLocationFreshness({
        recordedAt,
        receivedAt: new Date(now.getTime() - RIDER_LOCATION_MAX_AGE_MS),
        now,
      }).fresh,
    ).toBe(true);
    expect(
      evaluateLocationFreshness({
        recordedAt,
        receivedAt: new Date(now.getTime() - RIDER_LOCATION_MAX_AGE_MS - 1),
        now,
      }).fresh,
    ).toBe(false);
  });

  it('rejects device timestamps beyond clock skew and preserves legacy helper', () => {
    expect(
      evaluateLocationFreshness({
        recordedAt: new Date(now.getTime() + 5_000),
        receivedAt: now,
        now,
      }).reasons,
    ).toContain('DEVICE_TIMESTAMP_IN_FUTURE');
    expect(isFreshLocation(new Date(now.getTime() - 10_000), now)).toBe(true);
    expect(
      isOperationallyFreshLocation({
        recordedAt: new Date(now.getTime() - 1_000),
        receivedAt: new Date(now.getTime() - 1_000),
        now,
      }),
    ).toBe(true);
  });
});

describe('location schema', () => {
  it('rejects invalid coordinates and malformed timestamps', () => {
    expect(
      updateLocationSchema.safeParse({
        latitude: 91,
        longitude: -1.62,
        recordedAt: '2026-11-06T12:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      updateLocationSchema.safeParse({
        latitude: 6.68,
        longitude: -1.62,
        recordedAt: 'not-a-date',
      }).success,
    ).toBe(false);
    expect(
      updateLocationSchema.safeParse({
        latitude: 6.68,
        longitude: -1.62,
      }).success,
    ).toBe(false);
  });
});

describe('locations service', () => {
  it('accepts a valid update, rejects future and older overwrites, and stops sharing', async () => {
    const riderId = randomUUID();
    const repo = new MemoryLocationsRepository();
    repo.seedRider({ userId: riderId });
    let now = new Date('2026-11-06T12:00:00.000Z');
    const audit = new MemoryAuditService();
    const service = new LocationsServiceImpl(repo as unknown as LocationsRepository, {
      audit,
      now: () => now,
    });

    const first = (await service.updateOwnLocation(riderId, {
      latitude: 6.68,
      longitude: -1.62,
      recordedAt: '2026-11-06T11:59:55.000Z',
    })) as { fresh: boolean; sharingEnabled: boolean; receivedAt: string };

    expect(first.sharingEnabled).toBe(true);
    expect(first.fresh).toBe(true);

    await expect(
      service.updateOwnLocation(riderId, {
        latitude: 6.681,
        longitude: -1.621,
        recordedAt: '2026-11-06T12:00:05.000Z',
      }),
    ).rejects.toMatchObject({ message: /future/ });

    await expect(
      service.updateOwnLocation(riderId, {
        latitude: 6.682,
        longitude: -1.622,
        recordedAt: '2026-11-06T11:59:50.000Z',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    now = new Date('2026-11-06T12:00:31.000Z');
    const staleView = (await service.getOwnLocation(riderId)) as { fresh: boolean };
    expect(staleView.fresh).toBe(false);

    const stopped = (await service.stopSharing(riderId)) as { sharingEnabled: boolean };
    expect(stopped.sharingEnabled).toBe(false);
  });

  it('audits privileged staff location access without storing coordinates in audit metadata', async () => {
    const riderId = randomUUID();
    const actorId = randomUUID();
    const repo = new MemoryLocationsRepository();
    repo.seedRider({ userId: riderId });
    const now = new Date('2026-11-06T12:00:00.000Z');
    const audit = new MemoryAuditService();
    const service = new LocationsServiceImpl(repo as unknown as LocationsRepository, {
      audit,
      now: () => now,
    });
    await service.updateOwnLocation(riderId, {
      latitude: 6.68,
      longitude: -1.62,
      recordedAt: '2026-11-06T11:59:58.000Z',
    });
    const view = (await service.getRiderLocationForStaff(actorId, riderId)) as {
      latitude: number;
    };
    expect(view.latitude).toBe(6.68);
    expect(audit.entries[0]?.action).toBe('rider.location.accessed');
    expect(JSON.stringify(audit.entries[0]?.metadata ?? {})).not.toMatch(/6\.68/);
  });
});
