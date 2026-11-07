import { AppError } from '../../common/errors/app-error.js';
import type { UpsertLocationInput } from './module.repository.js';

type LocationRow = {
  riderId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  heading: number | null;
  sharingEnabled: boolean;
  recordedAt: Date;
  receivedAt: Date;
  updatedAt: Date;
};

export class MemoryLocationsRepository {
  locations = new Map<string, LocationRow>();
  riders = new Map<
    string,
    {
      userId: string;
      verificationStatus: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
      availability: 'OFFLINE' | 'AVAILABLE' | 'BUSY';
      user: { id: string; status: 'ACTIVE' | 'SUSPENDED' | 'DELETED'; role: string };
      hasApprovedVehicle: boolean;
      hasApprovedActiveZone: boolean;
      activeTripBookingId: string | null;
    }
  >();

  seedRider(input: {
    userId: string;
    verificationStatus?: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
    availability?: 'OFFLINE' | 'AVAILABLE' | 'BUSY';
    userStatus?: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
    hasApprovedVehicle?: boolean;
    hasApprovedActiveZone?: boolean;
    activeTripBookingId?: string | null;
  }) {
    this.riders.set(input.userId, {
      userId: input.userId,
      verificationStatus: input.verificationStatus ?? 'APPROVED',
      availability: input.availability ?? 'OFFLINE',
      user: {
        id: input.userId,
        status: input.userStatus ?? 'ACTIVE',
        role: 'RIDER',
      },
      hasApprovedVehicle: input.hasApprovedVehicle ?? true,
      hasApprovedActiveZone: input.hasApprovedActiveZone ?? true,
      activeTripBookingId: input.activeTripBookingId ?? null,
    });
  }

  async findRiderProfile(riderId: string) {
    const row = this.riders.get(riderId);
    if (!row) return null;
    return {
      userId: row.userId,
      verificationStatus: row.verificationStatus,
      availability: row.availability,
      user: row.user,
    };
  }

  async findLocation(riderId: string) {
    return this.locations.get(riderId) ?? null;
  }

  async upsertLocationIfNewer(input: UpsertLocationInput) {
    const existing = this.locations.get(input.riderId);
    if (existing && existing.recordedAt.getTime() > input.recordedAt.getTime()) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Older location update cannot overwrite a newer accepted location',
      });
    }
    const row: LocationRow = {
      riderId: input.riderId,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyMeters: input.accuracyMeters ?? null,
      heading: input.heading ?? null,
      sharingEnabled: input.sharingEnabled,
      recordedAt: input.recordedAt,
      receivedAt: input.receivedAt,
      updatedAt: input.receivedAt,
    };
    this.locations.set(input.riderId, row);
    return row;
  }

  async setSharingEnabled(riderId: string, sharingEnabled: boolean) {
    const existing = this.locations.get(riderId);
    if (!existing) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'No location on file for this rider',
      });
    }
    existing.sharingEnabled = sharingEnabled;
    existing.updatedAt = new Date();
    return existing;
  }

  async findActiveTripBookingId(riderId: string) {
    return this.riders.get(riderId)?.activeTripBookingId ?? null;
  }

  async loadOperationalSnapshot(riderId: string) {
    const rider = this.riders.get(riderId);
    if (!rider) return null;
    const location = this.locations.get(riderId);
    return {
      userStatus: rider.user.status,
      riderVerificationStatus: rider.verificationStatus,
      hasApprovedVehicle: rider.hasApprovedVehicle,
      hasApprovedActiveZone: rider.hasApprovedActiveZone,
      availability: rider.availability,
      onActiveTrip: Boolean(rider.activeTripBookingId),
      location: location
        ? {
            sharingEnabled: location.sharingEnabled,
            recordedAt: location.recordedAt,
            receivedAt: location.receivedAt,
            latitude: location.latitude,
            longitude: location.longitude,
            accuracyMeters: location.accuracyMeters,
            heading: location.heading,
          }
        : null,
    };
  }

  setAvailability(riderId: string, availability: 'OFFLINE' | 'AVAILABLE' | 'BUSY') {
    const rider = this.riders.get(riderId);
    if (rider) rider.availability = availability;
  }
}
