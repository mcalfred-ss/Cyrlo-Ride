import type { Prisma, PrismaClient } from '@prisma/client';

import { AppError } from '../../common/errors/app-error.js';
import { ACTIVE_TRIP_BOOKING_STATUSES } from '../riders/operational-eligibility.js';

export interface UpsertLocationInput {
  riderId: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  heading?: number | null;
  recordedAt: Date;
  receivedAt: Date;
  sharingEnabled: boolean;
}

/** Private to the locations module. */
export class LocationsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  protected database(): PrismaClient {
    return this.prisma;
  }

  async findRiderProfile(riderId: string) {
    return this.prisma.riderProfile.findUnique({
      where: { userId: riderId },
      select: {
        userId: true,
        verificationStatus: true,
        availability: true,
        user: { select: { id: true, status: true, role: true } },
      },
    });
  }

  async findLocation(riderId: string) {
    return this.prisma.riderLocation.findUnique({ where: { riderId } });
  }

  /**
   * Upserts latest location. Rejects when the stored device timestamp is newer
   * than the incoming recordedAt (monotonic device time).
   */
  async upsertLocationIfNewer(input: UpsertLocationInput) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.riderLocation.findUnique({
        where: { riderId: input.riderId },
      });
      if (existing && existing.recordedAt.getTime() > input.recordedAt.getTime()) {
        throw new AppError({
          status: 409,
          code: 'CONFLICT',
          message: 'Older location update cannot overwrite a newer accepted location',
        });
      }

      const data = {
        latitude: input.latitude,
        longitude: input.longitude,
        accuracyMeters: input.accuracyMeters ?? null,
        heading: input.heading ?? null,
        recordedAt: input.recordedAt,
        receivedAt: input.receivedAt,
        sharingEnabled: input.sharingEnabled,
      };

      if (!existing) {
        return tx.riderLocation.create({
          data: { riderId: input.riderId, ...data },
        });
      }

      return tx.riderLocation.update({
        where: { riderId: input.riderId },
        data,
      });
    });
  }

  async setSharingEnabled(riderId: string, sharingEnabled: boolean) {
    const existing = await this.prisma.riderLocation.findUnique({ where: { riderId } });
    if (!existing) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'No location on file for this rider',
      });
    }
    return this.prisma.riderLocation.update({
      where: { riderId },
      data: { sharingEnabled },
    });
  }

  async findActiveTripBookingId(riderId: string): Promise<string | null> {
    const booking = await this.prisma.booking.findFirst({
      where: {
        riderId,
        status: { in: [...ACTIVE_TRIP_BOOKING_STATUSES] },
      },
      select: { id: true },
      orderBy: { acceptedAt: 'desc' },
    });
    return booking?.id ?? null;
  }

  async appendTripLocationPoint(input: {
    bookingId: string;
    riderId: string;
    latitude: number;
    longitude: number;
    accuracyMeters?: number | null;
    heading?: number | null;
    recordedAt: Date;
    receivedAt: Date;
  }) {
    return this.prisma.tripLocationPoint.create({
      data: {
        bookingId: input.bookingId,
        riderId: input.riderId,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracyMeters: input.accuracyMeters ?? null,
        heading: input.heading ?? null,
        recordedAt: input.recordedAt,
        receivedAt: input.receivedAt,
      },
    });
  }

  async loadOperationalSnapshot(riderId: string) {
    const [user, profile, location, approvedZone, activeTrip, wallet] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: riderId },
        select: { status: true },
      }),
      this.prisma.riderProfile.findUnique({
        where: { userId: riderId },
        select: {
          verificationStatus: true,
          availability: true,
          vehicles: { select: { verificationStatus: true } },
        },
      }),
      this.prisma.riderLocation.findUnique({ where: { riderId } }),
      this.prisma.riderZoneApproval.findFirst({
        where: {
          riderId,
          status: 'APPROVED',
          zone: { isActive: true },
        },
        select: { id: true },
      }),
      this.prisma.booking.findFirst({
        where: {
          riderId,
          status: { in: [...ACTIVE_TRIP_BOOKING_STATUSES] },
        },
        select: { id: true },
      }),
      this.prisma.riderWallet.findUnique({
        where: { riderId },
        select: { tokenBalance: true },
      }),
    ]);

    if (!user || !profile) return null;

    return {
      userStatus: user.status,
      riderVerificationStatus: profile.verificationStatus,
      hasApprovedVehicle: profile.vehicles.some((v) => v.verificationStatus === 'APPROVED'),
      hasApprovedActiveZone: Boolean(approvedZone),
      availability: profile.availability,
      onActiveTrip: Boolean(activeTrip),
      tokenBalance: wallet?.tokenBalance ?? 0,
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
}

export type LocationRow = Prisma.RiderLocationGetPayload<object>;
