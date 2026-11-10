import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { encryptSecret, decryptSecret } from '../../common/security/secret-box.js';
import { env } from '../../config/env.js';
import { MemoryObjectStorage } from '../../infrastructure/storage/object-storage.js';
import { MemoryAuditService } from '../audit/module.service.js';
import { isVerificationEligible } from './eligibility.js';
import { MemoryRidersRepository } from './memory-riders-repository.js';
import { createVehicleSchema, startRiderOnboardingSchema } from './module.schema.js';
import { RidersServiceImpl } from './module.service.js';
import type { RidersRepository } from './module.repository.js';

function createService(repo = new MemoryRidersRepository()) {
  const storage = new MemoryObjectStorage();
  const audit = new MemoryAuditService();
  const service = new RidersServiceImpl(repo as unknown as RidersRepository, {
    storage,
    audit,
  });
  return { service, repo, storage, audit };
}

const ghanaCard = 'GHA-123456789-0';

describe('rider eligibility', () => {
  it('requires approved rider, approved vehicle, and active account', () => {
    expect(
      isVerificationEligible({
        userStatus: 'ACTIVE',
        riderVerificationStatus: 'APPROVED',
        hasApprovedVehicle: true,
      }),
    ).toBe(true);
    expect(
      isVerificationEligible({
        userStatus: 'SUSPENDED',
        riderVerificationStatus: 'APPROVED',
        hasApprovedVehicle: true,
      }),
    ).toBe(false);
    expect(
      isVerificationEligible({
        userStatus: 'ACTIVE',
        riderVerificationStatus: 'PENDING_REVIEW',
        hasApprovedVehicle: true,
      }),
    ).toBe(false);
    expect(
      isVerificationEligible({
        userStatus: 'ACTIVE',
        riderVerificationStatus: 'APPROVED',
        hasApprovedVehicle: false,
      }),
    ).toBe(false);
  });
});

describe('vehicle category validation', () => {
  it('accepts OKADA, PRAGYA, ABOBOYAA and rejects legacy or over-capacity values', () => {
    expect(
      createVehicleSchema.safeParse({
        category: 'PRAGYA',
        registrationNumber: 'GR-1234-25',
        make: 'TVS',
        model: 'King',
        colour: 'Yellow',
        capacity: 3,
      }).success,
    ).toBe(true);
    expect(
      createVehicleSchema.safeParse({
        category: 'OKADA',
        registrationNumber: 'M-1',
        make: 'X',
        model: 'Y',
        colour: 'Red',
        capacity: 1,
      }).success,
    ).toBe(true);
    expect(
      createVehicleSchema.safeParse({
        category: 'ABOBOYAA',
        registrationNumber: 'AB-1',
        make: 'Cargo',
        model: 'Z',
        colour: 'Blue',
        capacity: 4,
      }).success,
    ).toBe(true);
    expect(
      createVehicleSchema.safeParse({
        category: 'TRICYCLE',
        registrationNumber: 'GR-1',
        make: 'TVS',
        model: 'King',
        colour: 'Yellow',
        capacity: 3,
      }).success,
    ).toBe(false);
    expect(
      createVehicleSchema.safeParse({
        category: 'CAR',
        registrationNumber: 'GR-2',
        make: 'Toyota',
        model: 'Corolla',
        colour: 'Silver',
        capacity: 4,
      }).success,
    ).toBe(false);
    expect(
      createVehicleSchema.safeParse({
        category: 'OKADA',
        registrationNumber: 'M-2',
        make: 'X',
        model: 'Y',
        colour: 'Red',
        capacity: 2,
      }).success,
    ).toBe(false);
  });
});

describe('Ghana Card encryption', () => {
  it('encrypts with the identity key and never equals the MFA key material usage', () => {
    expect(env.IDENTITY_ENCRYPTION_KEY).not.toBe(env.ADMIN_MFA_ENCRYPTION_KEY);
    const ciphertext = encryptSecret(ghanaCard, env.IDENTITY_ENCRYPTION_KEY);
    expect(ciphertext).not.toContain(ghanaCard);
    expect(decryptSecret(ciphertext, env.IDENTITY_ENCRYPTION_KEY)).toBe(ghanaCard);
    expect(() => decryptSecret(ciphertext, env.ADMIN_MFA_ENCRYPTION_KEY)).toThrow();
  });
});

describe('rider onboarding service', () => {
  it('creates an application for a passenger without a second account', async () => {
    const { service, repo, audit } = createService();
    const userId = randomUUID();
    repo.seedUser({ id: userId, phoneNumber: '+233244111111', role: 'PASSENGER' });

    const created = (await service.startOnboarding(userId, {
      fullName: 'Kwame Boateng',
      driversLicenceNumber: 'DL-12345',
      driversLicenceExpiry: '2028-01-01T00:00:00.000Z',
      ghanaCardNumber: ghanaCard,
    })) as { verificationStatus: string; hasEncryptedGhanaCard: boolean };

    expect(created.verificationStatus).toBe('DRAFT');
    expect(created.hasEncryptedGhanaCard).toBe(true);
    expect(repo.profiles.get(userId)?.ghanaCardNumber).toBeNull();
    expect(audit.entries.some((entry) => entry.action === 'rider.application.created')).toBe(true);

    await expect(
      service.startOnboarding(userId, {
        fullName: 'Other',
        driversLicenceNumber: 'DL-99999',
        driversLicenceExpiry: '2028-01-01T00:00:00.000Z',
        ghanaCardNumber: ghanaCard,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('registers a vehicle, uploads documents, submits, and supports ops review', async () => {
    const { service, repo, storage, audit } = createService();
    const userId = randomUUID();
    const opsId = randomUUID();
    repo.seedUser({ id: userId, phoneNumber: '+233244222222', role: 'PASSENGER' });
    repo.seedUser({ id: opsId, phoneNumber: '+233244000000', role: 'ADMIN' });

    await service.startOnboarding(userId, {
      fullName: 'Ama Mensah',
      driversLicenceNumber: 'DL-55555',
      driversLicenceExpiry: '2029-01-01T00:00:00.000Z',
      ghanaCardNumber: ghanaCard,
    });

    const vehicle = (await service.createVehicle(userId, {
      category: 'PRAGYA',
      registrationNumber: 'GR-555-25',
      make: 'Bajaj',
      model: 'RE',
      colour: 'Green',
      capacity: 3,
    })) as { id: string };

    for (const kind of ['GHANA_CARD', 'DRIVERS_LICENCE', 'RIDER_PHOTO'] as const) {
      await service.uploadDocument(userId, {
        kind,
        contentType: 'image/jpeg',
        body: Buffer.from(`file-${kind}`),
      });
    }
    for (const kind of [
      'VEHICLE_REGISTRATION',
      'ROADWORTHINESS',
      'INSURANCE',
      'VEHICLE_PHOTO',
    ] as const) {
      await service.uploadDocument(userId, {
        kind,
        vehicleId: vehicle.id,
        contentType: 'application/pdf',
        body: Buffer.from(`file-${kind}`),
      });
    }

    await expect(
      service.submitApplication(userId),
    ).resolves.toMatchObject({ verificationStatus: 'PENDING_REVIEW' });

    const pending = (await service.listPendingForOps()) as Array<{ riderId: string }>;
    expect(pending.some((row) => row.riderId === userId)).toBe(true);

    const docs = repo.profiles.get(userId)!.documents.filter((doc) => !doc.replacedAt);
    const ghanaDoc = docs.find((doc) => doc.kind === 'GHANA_CARD')!;
    const opened = await service.openDocumentForOps(opsId, ghanaDoc.id);
    expect(opened.url.startsWith('memory://signed/')).toBe(true);
    expect(storage.objects.size).toBeGreaterThan(0);

    const revealed = await service.revealGhanaCardForOps(opsId, userId);
    expect(revealed.ghanaCardNumber).toBe(ghanaCard);
    expect(
      audit.entries.some((entry) => entry.action === 'rider.identity.accessed'),
    ).toBe(true);
    expect(JSON.stringify(audit.entries)).not.toContain(ghanaCard);

    await expect(
      service.reviewApplication(opsId, userId, { decision: 'REJECTED' }),
    ).rejects.toMatchObject({ message: /Rejection reason/ });

    // schema refine happens at HTTP layer; service trusts validated input shape
    await service.reviewApplication(opsId, userId, {
      decision: 'REJECTED',
      reason: 'Blurry Ghana Card photo',
    });
    expect(repo.profiles.get(userId)?.verificationStatus).toBe('REJECTED');
    expect(await service.verificationEligibility(userId)).toBe(false);

    await service.submitApplication(userId);
    await service.reviewApplication(opsId, userId, { decision: 'APPROVED' });
    expect(repo.users.get(userId)?.role).toBe('RIDER');
    expect(repo.wallets.has(userId)).toBe(true);
    expect(await service.verificationEligibility(userId)).toBe(true);
  });

  it('blocks suspended riders from submitting and keeps them ineligible', async () => {
    const { service, repo } = createService();
    const userId = randomUUID();
    repo.seedUser({
      id: userId,
      phoneNumber: '+233244333333',
      role: 'PASSENGER',
      status: 'SUSPENDED',
    });
    await expect(
      service.startOnboarding(userId, {
        fullName: 'Suspended',
        driversLicenceNumber: 'DL-1',
        driversLicenceExpiry: '2030-01-01T00:00:00.000Z',
        ghanaCardNumber: ghanaCard,
      }),
    ).rejects.toMatchObject({ message: 'Account is suspended' });

    repo.seedUser({
      id: userId,
      phoneNumber: '+233244333333',
      role: 'RIDER',
      status: 'SUSPENDED',
    });
    // Force an approved-looking profile for eligibility check.
    await (repo as MemoryRidersRepository).createDraftProfile({
      userId,
      fullName: 'X',
      driversLicenceNumber: 'DL',
      driversLicenceExpiry: new Date('2030-01-01'),
    });
    await repo.updateProfile(userId, { verificationStatus: 'APPROVED' });
    await repo.createVehicle({
      riderId: userId,
      category: 'OKADA',
      registrationNumber: 'GR-1',
      make: 'Toyota',
      model: 'Yaris',
      colour: 'White',
      capacity: 4,
    });
    const vehicleId = repo.profiles.get(userId)!.vehicles[0]!.id;
    await repo.updateVehicle(vehicleId, { verificationStatus: 'APPROVED' });
    expect(await service.verificationEligibility(userId)).toBe(false);
  });

  it('prevents unauthorized vehicle access across riders', async () => {
    const { service, repo } = createService();
    const a = randomUUID();
    const b = randomUUID();
    repo.seedUser({ id: a, phoneNumber: '+233244444441', role: 'PASSENGER' });
    repo.seedUser({ id: b, phoneNumber: '+233244444442', role: 'PASSENGER' });
    await service.startOnboarding(a, {
      fullName: 'A',
      driversLicenceNumber: 'DL-A',
      driversLicenceExpiry: '2030-01-01T00:00:00.000Z',
      ghanaCardNumber: ghanaCard,
    });
    await service.startOnboarding(b, {
      fullName: 'B',
      driversLicenceNumber: 'DL-B',
      driversLicenceExpiry: '2030-01-01T00:00:00.000Z',
      ghanaCardNumber: 'GHA-987654321-0',
    });
    const vehicle = (await service.createVehicle(a, {
      category: 'OKADA',
      registrationNumber: 'GR-9',
      make: 'Honda',
      model: 'Fit',
      colour: 'Blue',
      capacity: 4,
    })) as { id: string };
    await expect(
      service.updateVehicle(b, vehicle.id, { colour: 'Black' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('onboarding schema', () => {
  it('requires a Ghana Card shaped value', () => {
    expect(
      startRiderOnboardingSchema.safeParse({
        fullName: 'Test',
        driversLicenceNumber: 'DL-12345',
        driversLicenceExpiry: '2030-01-01T00:00:00.000Z',
        ghanaCardNumber: '12345',
      }).success,
    ).toBe(false);
  });
});
