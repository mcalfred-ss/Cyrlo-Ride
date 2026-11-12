import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { MemoryObjectStorage } from '../../infrastructure/storage/object-storage.js';
import { MemoryAuditService } from '../audit/module.service.js';
import { MemoryRidersRepository } from './memory-riders-repository.js';
import type { RidersRepository } from './module.repository.js';
import { RidersServiceImpl } from './module.service.js';

function createService(repo = new MemoryRidersRepository()) {
  const storage = new MemoryObjectStorage();
  const audit = new MemoryAuditService();
  const service = new RidersServiceImpl(repo as unknown as RidersRepository, {
    storage,
    audit,
  });
  return { service, repo, audit };
}

async function seedPendingApplication(repo: MemoryRidersRepository, opts?: { vehicleCount?: number }) {
  const userId = randomUUID();
  const opsId = randomUUID();
  repo.seedUser({
    id: userId,
    phoneNumber: `+23324${userId.replace(/-/g, '').slice(0, 8)}`,
    role: 'PASSENGER',
    status: 'ACTIVE',
  });
  repo.seedUser({
    id: opsId,
    phoneNumber: `+23320${opsId.replace(/-/g, '').slice(0, 8)}`,
    role: 'ADMIN',
    status: 'ACTIVE',
  });
  await repo.createDraftProfile({
    userId,
    fullName: 'Review Candidate',
    driversLicenceNumber: 'DL-1',
    driversLicenceExpiry: new Date('2030-01-01T00:00:00.000Z'),
  });
  await repo.updateProfile(userId, {
    verificationStatus: 'PENDING_REVIEW',
    submittedAt: new Date(),
  });

  const vehicleCount = opts?.vehicleCount ?? 1;
  const vehicleIds: string[] = [];
  for (let i = 0; i < vehicleCount; i += 1) {
    const vehicle = await repo.createVehicle({
      riderId: userId,
      category: 'OKADA',
      registrationNumber: `GR-${i}`,
      make: 'Honda',
      model: 'CG',
      colour: 'Red',
      capacity: 1,
    });
    await repo.updateVehicle(vehicle.id, {
      verificationStatus: 'PENDING_REVIEW',
      submittedAt: new Date(),
    });
    vehicleIds.push(vehicle.id);
  }
  return { userId, opsId, vehicleIds };
}

describe('application approval vehicle enforcement', () => {
  it('blocks approval when any vehicle is still PENDING_REVIEW', async () => {
    const { service, repo, audit } = createService();
    const { userId, opsId, vehicleIds } = await seedPendingApplication(repo, { vehicleCount: 2 });
    await service.reviewVehicle(opsId, vehicleIds[0]!, { decision: 'APPROVED' });

    await expect(
      service.reviewApplication(opsId, userId, { decision: 'APPROVED' }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      message: /individually reviewed/,
    });
    expect(repo.profiles.get(userId)?.verificationStatus).toBe('PENDING_REVIEW');
    expect(repo.users.get(userId)?.role).toBe('PASSENGER');
    expect(audit.entries.some((e) => e.action === 'rider.application.approved')).toBe(false);
    expect(repo.profiles.get(userId)?.vehicles.find((v) => v.id === vehicleIds[1]!)?.verificationStatus).toBe(
      'PENDING_REVIEW',
    );
  });

  it('blocks approval when all vehicles are REJECTED', async () => {
    const { service, repo, audit } = createService();
    const { userId, opsId, vehicleIds } = await seedPendingApplication(repo);
    await service.reviewVehicle(opsId, vehicleIds[0]!, {
      decision: 'REJECTED',
      reason: 'Unreadable plate',
    });

    await expect(
      service.reviewApplication(opsId, userId, { decision: 'APPROVED' }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      message: /At least one vehicle must be approved/,
    });
    expect(repo.profiles.get(userId)?.verificationStatus).toBe('PENDING_REVIEW');
    expect(audit.entries.some((e) => e.action === 'rider.application.approved')).toBe(false);
  });

  it('approves when at least one vehicle is APPROVED and none are pending; keeps rejected vehicles', async () => {
    const { service, repo, audit } = createService();
    const { userId, opsId, vehicleIds } = await seedPendingApplication(repo, { vehicleCount: 2 });
    await service.reviewVehicle(opsId, vehicleIds[0]!, { decision: 'APPROVED' });
    await service.reviewVehicle(opsId, vehicleIds[1]!, {
      decision: 'REJECTED',
      reason: 'Insurance expired',
    });

    const beforeStatuses = repo.profiles
      .get(userId)!
      .vehicles.map((v) => ({ id: v.id, status: v.verificationStatus }));

    await service.reviewApplication(opsId, userId, { decision: 'APPROVED' });

    expect(repo.profiles.get(userId)?.verificationStatus).toBe('APPROVED');
    expect(repo.users.get(userId)?.role).toBe('RIDER');
    expect(repo.wallets.has(userId)).toBe(true);
    expect(
      repo.profiles.get(userId)!.vehicles.map((v) => ({ id: v.id, status: v.verificationStatus })),
    ).toEqual(beforeStatuses);
    expect(repo.profiles.get(userId)!.vehicles.find((v) => v.id === vehicleIds[1]!)?.verificationStatus).toBe(
      'REJECTED',
    );
    expect(audit.entries.filter((e) => e.action === 'rider.application.approved')).toHaveLength(1);
    expect(audit.entries.some((e) => e.action === 'rider.vehicle.approved')).toBe(true);
  });

  it('does not auto-approve pending vehicles during application approval', async () => {
    const { service, repo } = createService();
    const { userId, opsId, vehicleIds } = await seedPendingApplication(repo);
    await expect(
      service.reviewApplication(opsId, userId, { decision: 'APPROVED' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(repo.profiles.get(userId)?.vehicles[0]?.verificationStatus).toBe('PENDING_REVIEW');
    expect(vehicleIds).toHaveLength(1);
  });

  it('keeps application rejection behavior (cascade pending vehicles, audit rejected)', async () => {
    const { service, repo, audit } = createService();
    const { userId, opsId, vehicleIds } = await seedPendingApplication(repo, { vehicleCount: 2 });
    await service.reviewVehicle(opsId, vehicleIds[0]!, { decision: 'APPROVED' });

    await service.reviewApplication(opsId, userId, {
      decision: 'REJECTED',
      reason: 'Incomplete identity pack',
    });

    expect(repo.profiles.get(userId)?.verificationStatus).toBe('REJECTED');
    expect(repo.users.get(userId)?.role).toBe('PASSENGER');
    expect(repo.profiles.get(userId)?.vehicles.find((v) => v.id === vehicleIds[0]!)?.verificationStatus).toBe(
      'APPROVED',
    );
    expect(repo.profiles.get(userId)?.vehicles.find((v) => v.id === vehicleIds[1]!)?.verificationStatus).toBe(
      'REJECTED',
    );
    expect(audit.entries.some((e) => e.action === 'rider.application.rejected')).toBe(true);
    expect(audit.entries.some((e) => e.action === 'rider.application.approved')).toBe(false);
  });

  it('serializes concurrent approvals so only one succeeds and emits one audit', async () => {
    const { service, repo, audit } = createService();
    const { userId, opsId, vehicleIds } = await seedPendingApplication(repo);
    await service.reviewVehicle(opsId, vehicleIds[0]!, { decision: 'APPROVED' });

    const results = await Promise.allSettled([
      service.reviewApplication(opsId, userId, { decision: 'APPROVED' }),
      service.reviewApplication(opsId, userId, { decision: 'APPROVED' }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const failure = rejected[0] as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({ status: 409, code: 'CONFLICT' });
    expect(String(failure.reason.message)).toMatch(/not pending review/i);
    expect(repo.profiles.get(userId)?.verificationStatus).toBe('APPROVED');
    expect(audit.entries.filter((e) => e.action === 'rider.application.approved')).toHaveLength(1);
  });
});
