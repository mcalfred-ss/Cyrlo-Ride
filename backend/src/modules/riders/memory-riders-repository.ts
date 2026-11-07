import { randomUUID } from 'node:crypto';

import { AppError } from '../../common/errors/app-error.js';
import type { RidersRepository } from './module.repository.js';

type Profile = Awaited<ReturnType<RidersRepository['findProfile']>>;

/** Test double with the same method surface as RidersRepository. */
export class MemoryRidersRepository {
  users = new Map<
    string,
    {
      id: string;
      phoneNumber: string;
      role: 'PASSENGER' | 'RIDER' | 'ADMIN';
      status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
      displayName: string | null;
    }
  >();
  profiles = new Map<string, NonNullable<Profile>>();
  secrets = new Map<string, { purpose: string; ciphertext: string; keyVersion: number }>();
  wallets = new Set<string>();

  seedUser(user: {
    id: string;
    phoneNumber: string;
    role: 'PASSENGER' | 'RIDER' | 'ADMIN';
    status?: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  }) {
    this.users.set(user.id, {
      id: user.id,
      phoneNumber: user.phoneNumber,
      role: user.role,
      status: user.status ?? 'ACTIVE',
      displayName: null,
    });
  }

  async findUser(userId: string) {
    return this.users.get(userId) ?? null;
  }

  async findProfile(userId: string) {
    const profile = this.profiles.get(userId);
    return profile ? structuredClone(profile) : null;
  }

  async createDraftProfile(input: {
    userId: string;
    fullName: string;
    driversLicenceNumber: string;
    driversLicenceExpiry: Date;
  }) {
    if (this.profiles.has(input.userId)) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Rider onboarding already started for this account',
      });
    }
    const profile = {
      userId: input.userId,
      fullName: input.fullName,
      verificationStatus: 'DRAFT' as const,
      availability: 'OFFLINE' as const,
      ghanaCardNumber: null,
      vehicleRegistration: null,
      vehicleDescription: null,
      verificationNotes: null,
      driversLicenceNumber: input.driversLicenceNumber,
      driversLicenceExpiry: input.driversLicenceExpiry,
      submittedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      vehicles: [],
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
    this.profiles.set(input.userId, profile as NonNullable<Profile>);
    return profile;
  }

  async updateProfile(userId: string, data: Record<string, unknown>) {
    const profile = this.profiles.get(userId);
    if (!profile) throw new Error('missing profile');
    Object.assign(profile, data, { updatedAt: new Date() });
    return profile;
  }

  async upsertIdentitySecret(input: {
    riderId: string;
    purpose: string;
    ciphertext: string;
    keyVersion: number;
  }) {
    this.secrets.set(`${input.riderId}:${input.purpose}`, input);
    const profile = this.profiles.get(input.riderId);
    if (profile) {
      profile.identitySecrets = [
        {
          purpose: input.purpose,
          keyVersion: input.keyVersion,
          updatedAt: new Date(),
        } as never,
      ];
    }
    return input;
  }

  async getIdentitySecret(riderId: string, purpose: string) {
    const row = this.secrets.get(`${riderId}:${purpose}`);
    return row
      ? {
          id: randomUUID(),
          riderId,
          purpose: row.purpose,
          ciphertext: row.ciphertext,
          keyVersion: row.keyVersion,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      : null;
  }

  async createVehicle(input: {
    riderId: string;
    category: 'TRICYCLE' | 'CAR';
    registrationNumber: string;
    make: string;
    model: string;
    colour: string;
    capacity: number;
  }) {
    const profile = this.profiles.get(input.riderId);
    if (!profile) throw new Error('missing profile');
    const vehicle = {
      id: randomUUID(),
      riderId: input.riderId,
      category: input.category,
      registrationNumber: input.registrationNumber,
      make: input.make,
      model: input.model,
      colour: input.colour,
      capacity: input.capacity,
      verificationStatus: 'DRAFT' as const,
      rejectionReason: null,
      submittedAt: null,
      reviewedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      documents: [],
      reviewDecisions: [],
    };
    profile.vehicles.push(vehicle as never);
    return vehicle;
  }

  async findVehicle(vehicleId: string) {
    for (const profile of this.profiles.values()) {
      const vehicle = profile.vehicles.find((row) => row.id === vehicleId);
      if (vehicle) {
        return {
          ...vehicle,
          documents: profile.documents.filter((doc) => doc.vehicleId === vehicleId),
          reviewDecisions: [],
        } as never;
      }
    }
    return null;
  }

  async updateVehicle(vehicleId: string, data: Record<string, unknown>) {
    for (const profile of this.profiles.values()) {
      const vehicle = profile.vehicles.find((row) => row.id === vehicleId);
      if (vehicle) {
        Object.assign(vehicle, data, { updatedAt: new Date() });
        return vehicle;
      }
    }
    throw new Error('missing vehicle');
  }

  async createDocument(input: {
    riderId: string;
    vehicleId?: string | null;
    kind: string;
    storageKey: string;
    contentType: string;
    sizeBytes: number;
    checksumSha256?: string;
    retainUntil?: Date | null;
  }) {
    const profile = this.profiles.get(input.riderId);
    if (!profile) throw new Error('missing profile');
    for (const doc of profile.documents) {
      if (
        doc.kind === input.kind &&
        (doc.vehicleId ?? null) === (input.vehicleId ?? null) &&
        !doc.replacedAt
      ) {
        (doc as { replacedAt: Date | null }).replacedAt = new Date();
      }
    }
    const created = {
      id: randomUUID(),
      riderId: input.riderId,
      vehicleId: input.vehicleId ?? null,
      kind: input.kind,
      storageKey: input.storageKey,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      checksumSha256: input.checksumSha256 ?? null,
      retainUntil: input.retainUntil ?? null,
      replacedAt: null,
      createdAt: new Date(),
    };
    profile.documents.push(created as never);
    return created;
  }

  async findDocument(documentId: string) {
    for (const profile of this.profiles.values()) {
      const doc = profile.documents.find((row) => row.id === documentId);
      if (doc) return doc;
    }
    return null;
  }

  async listPendingApplications() {
    return [...this.profiles.values()]
      .filter((profile) => profile.verificationStatus === 'PENDING_REVIEW')
      .map((profile) => ({
        ...profile,
        user: this.users.get(profile.userId)!,
      }));
  }

  async addReviewDecision(input: {
    riderId: string;
    vehicleId?: string | null;
    actorId: string;
    decision: 'APPROVED' | 'REJECTED';
    reason?: string | null;
  }) {
    const profile = this.profiles.get(input.riderId);
    if (!profile) throw new Error('missing profile');
    const row = {
      id: randomUUID(),
      riderId: input.riderId,
      vehicleId: input.vehicleId ?? null,
      actorId: input.actorId,
      decision: input.decision,
      reason: input.reason ?? null,
      createdAt: new Date(),
    };
    profile.reviewDecisions.unshift(row as never);
    return row;
  }

  async setUserRole(userId: string, role: 'PASSENGER' | 'RIDER' | 'ADMIN') {
    const user = this.users.get(userId);
    if (!user) throw new Error('missing user');
    user.role = role;
    return user;
  }

  async ensureWallet(riderId: string) {
    this.wallets.add(riderId);
    return { riderId, tokenBalance: 0, updatedAt: new Date() };
  }

  locations = new Map<
    string,
    {
      sharingEnabled: boolean;
      recordedAt: Date;
      receivedAt: Date;
    }
  >();
  approvedActiveZones = new Set<string>();
  activeTrips = new Set<string>();

  seedLocation(
    riderId: string,
    input: { sharingEnabled?: boolean; recordedAt: Date; receivedAt: Date },
  ) {
    this.locations.set(riderId, {
      sharingEnabled: input.sharingEnabled ?? true,
      recordedAt: input.recordedAt,
      receivedAt: input.receivedAt,
    });
  }

  seedApprovedActiveZone(riderId: string) {
    this.approvedActiveZones.add(riderId);
  }

  seedActiveTrip(riderId: string) {
    this.activeTrips.add(riderId);
  }

  async loadOperationalSnapshot(riderId: string) {
    const user = this.users.get(riderId);
    const profile = this.profiles.get(riderId);
    if (!user || !profile) return null;
    const location = this.locations.get(riderId);
    return {
      userStatus: user.status,
      riderVerificationStatus: profile.verificationStatus,
      hasApprovedVehicle: profile.vehicles.some((v) => v.verificationStatus === 'APPROVED'),
      hasApprovedActiveZone: this.approvedActiveZones.has(riderId),
      availability: profile.availability,
      onActiveTrip: this.activeTrips.has(riderId),
      location: location
        ? {
            sharingEnabled: location.sharingEnabled,
            recordedAt: location.recordedAt,
            receivedAt: location.receivedAt,
          }
        : null,
    };
  }

  async updateAvailability(riderId: string, availability: 'OFFLINE' | 'AVAILABLE') {
    const profile = this.profiles.get(riderId);
    if (!profile) throw new Error('missing profile');
    profile.availability = availability;
    profile.updatedAt = new Date();
    const location = this.locations.get(riderId);
    if (location) {
      location.sharingEnabled = availability === 'AVAILABLE';
    }
    return profile;
  }
}
