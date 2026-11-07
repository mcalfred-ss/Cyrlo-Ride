import { LOCATION_CLOCK_SKEW_MS } from '../../config/constants.js';
import { AppError } from '../../common/errors/app-error.js';
import {
  publishRiderLocationUpdated,
} from '../../infrastructure/realtime/publisher.js';
import type { AuditService } from '../audit/module.service.js';
import {
  evaluateGoOnlineEligibility,
  evaluateOperationalEligibility,
  type OperationalEligibilityResult,
} from '../riders/operational-eligibility.js';
import { evaluateLocationFreshness } from './location-freshness.js';
import type { UpdateLocationInput } from './module.schema.js';
import type { LocationsRepository } from './module.repository.js';

export interface LocationsServiceDeps {
  audit: AuditService;
  now?: () => Date;
}

export interface LocationsService {
  updateOwnLocation(
    riderId: string,
    input: UpdateLocationInput,
    ip?: string,
  ): Promise<unknown>;
  stopSharing(riderId: string, ip?: string): Promise<unknown>;
  getOwnLocation(riderId: string): Promise<unknown>;
  getRiderLocationForStaff(
    actorId: string,
    riderId: string,
    ip?: string,
  ): Promise<unknown>;
  evaluateEligibility(
    riderId: string,
    options?: { requireOnline?: boolean },
  ): Promise<OperationalEligibilityResult & { riderId: string }>;
}

export class LocationsServiceImpl implements LocationsService {
  private readonly now: () => Date;

  constructor(
    private readonly repository: LocationsRepository,
    private readonly deps: LocationsServiceDeps,
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  async updateOwnLocation(riderId: string, input: UpdateLocationInput, _ip?: string) {
    await this.requireRider(riderId);
    const now = this.now();
    const recordedAt = new Date(input.recordedAt);
    if (Number.isNaN(recordedAt.getTime())) {
      throw new AppError({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'recordedAt must be a valid ISO-8601 timestamp',
      });
    }
    if (recordedAt.getTime() > now.getTime() + LOCATION_CLOCK_SKEW_MS) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Location timestamp is in the future',
      });
    }

    const row = await this.repository.upsertLocationIfNewer({
      riderId,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyMeters: input.accuracyMeters,
      heading: input.heading,
      recordedAt,
      receivedAt: now,
      sharingEnabled: true,
    });

    const bookingId = await this.repository.findActiveTripBookingId(riderId);
    if (bookingId) {
      await this.repository.appendTripLocationPoint({
        bookingId,
        riderId,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracyMeters: input.accuracyMeters,
        heading: input.heading,
        recordedAt,
        receivedAt: now,
      });
    }
    const freshness = evaluateLocationFreshness({
      recordedAt: row.recordedAt,
      receivedAt: row.receivedAt,
      now,
    });

    publishRiderLocationUpdated(
      {
        riderId,
        bookingId: bookingId ?? undefined,
        latitude: decimalToNumber(row.latitude),
        longitude: decimalToNumber(row.longitude),
        heading: row.heading == null ? undefined : decimalToNumber(row.heading),
        accuracyMeters:
          row.accuracyMeters == null ? undefined : decimalToNumber(row.accuracyMeters),
        recordedAt: row.recordedAt.toISOString(),
      },
      { bookingId: bookingId ?? undefined },
    );

    return {
      sharingEnabled: row.sharingEnabled,
      recordedAt: row.recordedAt.toISOString(),
      receivedAt: row.receivedAt.toISOString(),
      fresh: freshness.fresh,
      // Coordinates returned only to the owning rider.
      latitude: decimalToNumber(row.latitude),
      longitude: decimalToNumber(row.longitude),
      accuracyMeters:
        row.accuracyMeters == null ? null : decimalToNumber(row.accuracyMeters),
      heading: row.heading == null ? null : decimalToNumber(row.heading),
    };
  }

  async stopSharing(riderId: string, _ip?: string) {
    await this.requireRider(riderId);
    const row = await this.repository.setSharingEnabled(riderId, false);
    return {
      sharingEnabled: row.sharingEnabled,
      recordedAt: row.recordedAt.toISOString(),
      receivedAt: row.receivedAt.toISOString(),
    };
  }

  async getOwnLocation(riderId: string) {
    await this.requireRider(riderId);
    const row = await this.repository.findLocation(riderId);
    if (!row) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'No location on file for this rider',
      });
    }
    const freshness = evaluateLocationFreshness({
      recordedAt: row.recordedAt,
      receivedAt: row.receivedAt,
      now: this.now(),
    });
    return {
      sharingEnabled: row.sharingEnabled,
      recordedAt: row.recordedAt.toISOString(),
      receivedAt: row.receivedAt.toISOString(),
      fresh: freshness.fresh,
      latitude: decimalToNumber(row.latitude),
      longitude: decimalToNumber(row.longitude),
      accuracyMeters:
        row.accuracyMeters == null ? null : decimalToNumber(row.accuracyMeters),
      heading: row.heading == null ? null : decimalToNumber(row.heading),
    };
  }

  async getRiderLocationForStaff(actorId: string, riderId: string, ip?: string) {
    const row = await this.repository.findLocation(riderId);
    if (!row) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'No location on file for this rider',
      });
    }
    await this.deps.audit.record({
      actorId,
      action: 'rider.location.accessed',
      entityType: 'rider_location',
      entityId: riderId,
      metadata: {
        purpose: 'staff_operational_view',
        sharingEnabled: row.sharingEnabled,
        receivedAt: row.receivedAt.toISOString(),
        // No precise coordinates in audit metadata.
      },
      ipAddress: ip,
    });
    const freshness = evaluateLocationFreshness({
      recordedAt: row.recordedAt,
      receivedAt: row.receivedAt,
      now: this.now(),
    });
    return {
      riderId,
      sharingEnabled: row.sharingEnabled,
      recordedAt: row.recordedAt.toISOString(),
      receivedAt: row.receivedAt.toISOString(),
      fresh: freshness.fresh,
      latitude: decimalToNumber(row.latitude),
      longitude: decimalToNumber(row.longitude),
      accuracyMeters:
        row.accuracyMeters == null ? null : decimalToNumber(row.accuracyMeters),
      heading: row.heading == null ? null : decimalToNumber(row.heading),
    };
  }

  async evaluateEligibility(
    riderId: string,
    options?: { requireOnline?: boolean },
  ) {
    const snapshot = await this.repository.loadOperationalSnapshot(riderId);
    if (!snapshot) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Rider profile not found',
      });
    }
    const result =
      options?.requireOnline === false
        ? evaluateGoOnlineEligibility(snapshot, this.now())
        : evaluateOperationalEligibility(snapshot, {
            now: this.now(),
            requireOnline: options?.requireOnline,
          });
    return { riderId, ...result };
  }

  private async requireRider(riderId: string) {
    const profile = await this.repository.findRiderProfile(riderId);
    if (!profile) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Rider profile not found',
      });
    }
    if (profile.user.status === 'SUSPENDED' || profile.user.status === 'DELETED') {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Account is not eligible to update location',
      });
    }
    return profile;
  }
}

function decimalToNumber(value: { toNumber?: () => number } | number | string): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (typeof value.toNumber === 'function') return value.toNumber();
  return Number(value);
}
