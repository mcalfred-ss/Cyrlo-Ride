import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { MemoryAuditService } from '../audit/module.service.js';
import { MemoryObjectStorage } from '../../infrastructure/storage/object-storage.js';
import {
  evaluateGoOnlineEligibility,
  evaluateOperationalEligibility,
  IneligibilityReason,
} from './operational-eligibility.js';
import { MemoryRidersRepository } from './memory-riders-repository.js';
import { RidersServiceImpl } from './module.service.js';
import type { RidersRepository } from './module.repository.js';

function createAvailabilityHarness(now = new Date('2026-11-06T12:00:00.000Z')) {
  const repo = new MemoryRidersRepository();
  const audit = new MemoryAuditService();
  const service = new RidersServiceImpl(repo as unknown as RidersRepository, {
    storage: new MemoryObjectStorage(),
    audit,
    now: () => now,
  });
  return { repo, audit, service, now };
}

function seedEligibleRider(
  repo: MemoryRidersRepository,
  riderId: string,
  now: Date,
  overrides?: {
    verificationStatus?: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
    userStatus?: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
    approveVehicle?: boolean;
    zone?: boolean;
    locationAgeMs?: number;
    sharingEnabled?: boolean;
  },
) {
  repo.seedUser({
    id: riderId,
    phoneNumber: `+23324${riderId.replace(/\D/g, '').slice(0, 8).padEnd(8, '0')}`,
    role: 'RIDER',
    status: overrides?.userStatus ?? 'ACTIVE',
  });
  const profile = {
    userId: riderId,
    fullName: 'Test Rider',
    verificationStatus: overrides?.verificationStatus ?? ('APPROVED' as const),
    availability: 'OFFLINE' as const,
    ghanaCardNumber: null,
    vehicleRegistration: null,
    vehicleDescription: null,
    verificationNotes: null,
    driversLicenceNumber: 'DL-1',
    driversLicenceExpiry: new Date('2030-01-01T00:00:00.000Z'),
    submittedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    vehicles: [] as Array<{
      id: string;
      verificationStatus: 'DRAFT' | 'APPROVED' | 'REJECTED' | 'PENDING_REVIEW';
    }>,
    documents: [],
    identitySecrets: [],
    reviewDecisions: [],
    location: null,
    wallet: null,
    bookings: [],
    offers: [],
    ledgerEntries: [],
    user: undefined as never,
  };
  if (overrides?.approveVehicle !== false) {
    profile.vehicles.push({
      id: randomUUID(),
      verificationStatus: 'APPROVED',
    });
  }
  repo.profiles.set(riderId, profile as never);
  if (overrides?.zone !== false) {
    repo.seedApprovedActiveZone(riderId);
  }
  const age = overrides?.locationAgeMs ?? 5_000;
  repo.seedLocation(riderId, {
    sharingEnabled: overrides?.sharingEnabled ?? true,
    recordedAt: new Date(now.getTime() - age),
    receivedAt: new Date(now.getTime() - age),
  });
}

describe('operational eligibility helper', () => {
  it('returns structured reasons for matching foundation checks', () => {
    const now = new Date('2026-11-06T12:00:00.000Z');
    const result = evaluateOperationalEligibility(
      {
        userStatus: 'SUSPENDED',
        riderVerificationStatus: 'DRAFT',
        hasApprovedVehicle: false,
        hasApprovedActiveZone: false,
        availability: 'OFFLINE',
        onActiveTrip: false,
        location: null,
      },
      { now },
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        IneligibilityReason.ACCOUNT_NOT_ACTIVE,
        IneligibilityReason.RIDER_NOT_APPROVED,
        IneligibilityReason.NO_APPROVED_VEHICLE,
        IneligibilityReason.NO_APPROVED_ACTIVE_ZONE,
        IneligibilityReason.NO_LOCATION,
        IneligibilityReason.NOT_ONLINE,
      ]),
    );
  });
});

describe('rider availability', () => {
  it('goes online when prerequisites are met and handles duplicate transitions', async () => {
    const riderId = randomUUID();
    const { repo, service, audit, now } = createAvailabilityHarness();
    seedEligibleRider(repo, riderId, now);

    const online = (await service.setAvailability(riderId, { availability: 'AVAILABLE' })) as {
      availability: string;
    };
    expect(online.availability).toBe('AVAILABLE');
    expect(audit.entries.some((e) => e.action === 'rider.availability.online')).toBe(true);

    const again = (await service.setAvailability(riderId, { availability: 'AVAILABLE' })) as {
      unchanged?: boolean;
    };
    expect(again.unchanged).toBe(true);

    const offline = (await service.setAvailability(riderId, { availability: 'OFFLINE' })) as {
      availability: string;
    };
    expect(offline.availability).toBe('OFFLINE');
  });

  it('rejects online attempts for stale GPS, missing verification, vehicle, zone, and suspension', async () => {
    const base = createAvailabilityHarness();

    const staleId = randomUUID();
    seedEligibleRider(base.repo, staleId, base.now, { locationAgeMs: 31_000 });
    await expect(
      base.service.setAvailability(staleId, { availability: 'AVAILABLE' }),
    ).rejects.toMatchObject({
      details: { reasons: expect.arrayContaining([IneligibilityReason.GPS_NOT_FRESH]) },
    });

    const unverified = randomUUID();
    seedEligibleRider(base.repo, unverified, base.now, {
      verificationStatus: 'PENDING_REVIEW',
    });
    await expect(
      base.service.setAvailability(unverified, { availability: 'AVAILABLE' }),
    ).rejects.toMatchObject({
      details: { reasons: expect.arrayContaining([IneligibilityReason.RIDER_NOT_APPROVED]) },
    });

    const noVehicle = randomUUID();
    seedEligibleRider(base.repo, noVehicle, base.now, { approveVehicle: false });
    await expect(
      base.service.setAvailability(noVehicle, { availability: 'AVAILABLE' }),
    ).rejects.toMatchObject({
      details: { reasons: expect.arrayContaining([IneligibilityReason.NO_APPROVED_VEHICLE]) },
    });

    const noZone = randomUUID();
    seedEligibleRider(base.repo, noZone, base.now, { zone: false });
    await expect(
      base.service.setAvailability(noZone, { availability: 'AVAILABLE' }),
    ).rejects.toMatchObject({
      details: {
        reasons: expect.arrayContaining([IneligibilityReason.NO_APPROVED_ACTIVE_ZONE]),
      },
    });

    const suspended = randomUUID();
    seedEligibleRider(base.repo, suspended, base.now, { userStatus: 'SUSPENDED' });
    await expect(
      base.service.setAvailability(suspended, { availability: 'AVAILABLE' }),
    ).rejects.toMatchObject({ message: /Suspended/ });
  });

  it('blocks going offline during ACCEPTED or IN_PROGRESS trips', async () => {
    const riderAccepted = randomUUID();
    const riderInProgress = randomUUID();
    const { repo, service, now } = createAvailabilityHarness();
    seedEligibleRider(repo, riderAccepted, now);
    seedEligibleRider(repo, riderInProgress, now);
    await service.setAvailability(riderAccepted, { availability: 'AVAILABLE' });
    await service.setAvailability(riderInProgress, { availability: 'AVAILABLE' });
    repo.seedActiveTrip(riderAccepted);
    repo.seedActiveTrip(riderInProgress);
    await expect(
      service.setAvailability(riderAccepted, { availability: 'OFFLINE' }),
    ).rejects.toMatchObject({
      details: { reasons: expect.arrayContaining([IneligibilityReason.ON_ACTIVE_TRIP]) },
    });
    await expect(
      service.setAvailability(riderInProgress, { availability: 'OFFLINE' }),
    ).rejects.toMatchObject({
      details: { reasons: expect.arrayContaining([IneligibilityReason.ON_ACTIVE_TRIP]) },
    });
  });

  it('exposes eligibility without sensitive fields', async () => {
    const riderId = randomUUID();
    const { repo, service, now } = createAvailabilityHarness();
    seedEligibleRider(repo, riderId, now);
    await service.setAvailability(riderId, { availability: 'AVAILABLE' });
    const eligibility = (await service.getOperationalEligibility(riderId)) as {
      eligible: boolean;
      reasons: string[];
    };
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.reasons).toEqual([]);
    expect(JSON.stringify(eligibility)).not.toMatch(/latitude|ghana|token/i);

    const goOnline = evaluateGoOnlineEligibility(
      (await repo.loadOperationalSnapshot(riderId))!,
      now,
    );
    expect(goOnline.eligible).toBe(true);
  });
});
