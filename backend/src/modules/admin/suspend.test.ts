import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { Permission, staffRoleHasPermission } from '../../common/authz/permissions.js';
import { DevelopmentSmsProvider } from '../../infrastructure/sms/sms.provider.js';
import { MemoryAuditService } from '../audit/module.service.js';
import {
  evaluateMatchingEligibility,
} from '../matching/matching-eligibility.js';
import { IneligibilityReason } from '../riders/operational-eligibility.js';
import { MemoryAdminStore } from './memory-admin-store.js';
import { AdminServiceImpl } from './module.service.js';

const now = new Date('2026-06-01T12:00:00.000Z');

function createService(store = new MemoryAdminStore()) {
  const audit = new MemoryAuditService();
  const service = new AdminServiceImpl(store, {
    sms: new DevelopmentSmsProvider(),
    audit,
    now: () => now,
    bootstrapSecret: 'x'.repeat(40),
  });
  return { service, store, audit };
}

function seedRider(store: MemoryAdminStore, overrides?: { status?: 'ACTIVE' | 'SUSPENDED' }) {
  const id = randomUUID();
  const phoneNumber = `+23324${id.replace(/-/g, '').slice(0, 8)}`;
  const user = {
    id,
    phoneNumber,
    role: 'RIDER' as const,
    status: overrides?.status ?? ('ACTIVE' as const),
    displayName: 'Test Rider',
  };
  store.users.set(id, user);
  store.usersByPhone.set(phoneNumber, id);
  store.riderAvailability.set(id, 'AVAILABLE');
  return user;
}

describe('admin suspend / reinstate', () => {
  it('grants suspend permission to Operations and Super Admin only', () => {
    expect(staffRoleHasPermission('SUPER_ADMIN', Permission.SuspendReinstateRiders)).toBe(true);
    expect(staffRoleHasPermission('OPERATIONS_ADMIN', Permission.SuspendReinstateRiders)).toBe(
      true,
    );
    expect(staffRoleHasPermission('FINANCE_ADMIN', Permission.SuspendReinstateRiders)).toBe(false);
    expect(staffRoleHasPermission('SUPPORT_ADMIN', Permission.SuspendReinstateRiders)).toBe(false);
  });

  it('rejects unauthorized staff roles', async () => {
    const store = new MemoryAdminStore();
    const rider = seedRider(store);
    const { service } = createService(store);
    await expect(
      service.suspendUser(
        { userId: rider.id, reason: 'fraud review' },
        { userId: randomUUID(), staffRole: 'SUPPORT_ADMIN' },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('suspends a rider without terminating active trips or changing tokens', async () => {
    const store = new MemoryAdminStore();
    const rider = seedRider(store);
    store.activeTripsByRider.set(rider.id, 1);
    await store.issueRefreshSession({
      userId: rider.id,
      tokenHash: 'hash-a',
      familyId: 'fam-a',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });
    const { service, audit } = createService(store);
    const actorId = randomUUID();

    const result = await service.suspendUser(
      { userId: rider.id, reason: 'safety review' },
      { userId: actorId, staffRole: 'OPERATIONS_ADMIN' },
    );

    expect(result).toMatchObject({
      userId: rider.id,
      status: 'SUSPENDED',
      activeTripsPreserved: 1,
      sessionsRevoked: 1,
    });
    expect(store.users.get(rider.id)?.status).toBe('SUSPENDED');
    expect(store.riderAvailability.get(rider.id)).toBe('OFFLINE');
    expect(store.refresh.every((row) => row.userId !== rider.id || row.revokedAt)).toBe(true);
    expect(audit.entries.some((e) => e.action === 'admin.user.suspended')).toBe(true);
    expect(JSON.stringify(audit.entries)).toContain('safety review');
    // Active trip count is reported, not cleared — suspension does not rewrite bookings.
    expect(store.activeTripsByRider.get(rider.id)).toBe(1);
  });

  it('reinstates a suspended rider with audit', async () => {
    const store = new MemoryAdminStore();
    const rider = seedRider(store, { status: 'SUSPENDED' });
    const { service, audit } = createService(store);

    const result = await service.reinstateUser(
      { userId: rider.id, reason: 'cleared by ops' },
      { userId: randomUUID(), staffRole: 'SUPER_ADMIN' },
    );
    expect(result).toEqual({ userId: rider.id, status: 'ACTIVE' });
    expect(store.users.get(rider.id)?.status).toBe('ACTIVE');
    expect(audit.entries.some((e) => e.action === 'admin.user.reinstated')).toBe(true);
  });

  it('excludes suspended riders from matching and offer acceptance eligibility', () => {
    const eligibility = evaluateMatchingEligibility(
      {
        userStatus: 'SUSPENDED',
        riderVerificationStatus: 'APPROVED',
        hasApprovedVehicle: true,
        hasApprovedVehicleForCategory: true,
        hasApprovedActiveZone: true,
        hasApprovedActiveZoneForPickup: true,
        availability: 'AVAILABLE',
        onActiveTrip: false,
        tokenBalance: 5,
        previouslyExcludedFromBooking: false,
        location: {
          sharingEnabled: true,
          recordedAt: now,
          receivedAt: now,
          latitude: 5.6,
          longitude: -0.2,
        },
        pickup: { latitude: 5.6, longitude: -0.2 },
      },
      now,
    );
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reasons).toContain(IneligibilityReason.ACCOUNT_NOT_ACTIVE);
  });
});
