import { randomUUID } from 'node:crypto';

import type { BookingOfferStatus, Prisma, PrismaClient, VehicleCategory } from '@prisma/client';

import { AppError } from '../../common/errors/app-error.js';
import { IdempotencyKey } from '../../common/utils/idempotency.js';
import {
  BOOKING_FEE_PESEWAS,
  BOOKING_PAYMENT_TIMEOUT_MS,
} from '../../config/constants.js';
import { ACTIVE_TRIP_BOOKING_STATUSES } from '../riders/operational-eligibility.js';
import { WalletRepository } from '../wallet/module.repository.js';
import { evaluateMatchingEligibility } from './matching-eligibility.js';

const EXCLUDED_OFFER_STATUSES: BookingOfferStatus[] = [
  'REJECTED',
  'TIMED_OUT',
  'EXPIRED',
];

/** Private to the matching module. */
export class MatchingRepository {
  private readonly wallet: WalletRepository;

  constructor(private readonly prisma: PrismaClient) {
    this.wallet = new WalletRepository(prisma);
  }

  protected database(): PrismaClient {
    return this.prisma;
  }

  async findSearchingBooking(bookingId: string) {
    return this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        payments: {
          where: { purpose: 'BOOKING_FEE', status: 'SUCCESS' },
          take: 1,
        },
      },
    });
  }

  async listSearchingBookingsDue(now: Date) {
    return this.prisma.booking.findMany({
      where: {
        status: 'SEARCHING',
        searchExpiresAt: { lte: now },
      },
      select: { id: true, passengerId: true },
      take: 50,
    });
  }

  async listSearchingBookingsNeedingDispatch(now: Date) {
    return this.prisma.booking.findMany({
      where: {
        status: 'SEARCHING',
        OR: [{ searchExpiresAt: null }, { searchExpiresAt: { gt: now } }],
        offers: {
          none: { status: 'PENDING' },
        },
      },
      select: { id: true },
      take: 50,
      orderBy: { searchExpiresAt: 'asc' },
    });
  }

  async listPendingOffersPastDeadline(now: Date) {
    return this.prisma.bookingOffer.findMany({
      where: { status: 'PENDING', expiresAt: { lte: now } },
      select: { id: true, bookingId: true, riderId: true },
      take: 100,
    });
  }

  async getExcludedRiderIds(bookingId: string) {
    const rows = await this.prisma.bookingOffer.findMany({
      where: {
        bookingId,
        status: { in: EXCLUDED_OFFER_STATUSES },
      },
      select: { riderId: true },
    });
    return new Set(rows.map((row) => row.riderId));
  }

  async nextBatchSequence(bookingId: string) {
    const agg = await this.prisma.bookingOffer.aggregate({
      where: { bookingId },
      _max: { batchSequence: true },
    });
    return (agg._max.batchSequence ?? 0) + 1;
  }

  async loadMatchingCandidates(input: {
    pickupZoneId: string;
    vehicleCategory: VehicleCategory;
    excludeRiderIds: Set<string>;
  }) {
    const riders = await this.prisma.riderProfile.findMany({
      where: {
        verificationStatus: 'APPROVED',
        availability: 'AVAILABLE',
        user: { status: 'ACTIVE', role: 'RIDER' },
        vehicles: {
          some: {
            verificationStatus: 'APPROVED',
            category: input.vehicleCategory,
          },
        },
        zoneApprovals: {
          some: {
            status: 'APPROVED',
            zoneId: input.pickupZoneId,
            zone: { isActive: true },
          },
        },
        location: { isNot: null },
      },
      include: {
        user: { select: { status: true } },
        location: true,
        wallet: true,
        vehicles: {
          where: {
            verificationStatus: 'APPROVED',
            category: input.vehicleCategory,
          },
          select: { id: true },
        },
        bookings: {
          where: { status: { in: [...ACTIVE_TRIP_BOOKING_STATUSES] } },
          select: { id: true },
          take: 1,
        },
      },
    });

    return riders.filter((rider) => !input.excludeRiderIds.has(rider.userId));
  }

  async createOffers(
    offers: Array<{
      bookingId: string;
      riderId: string;
      batchSequence: number;
      expiresAt: Date;
    }>,
  ) {
    return this.prisma.$transaction(
      offers.map((offer) =>
        this.prisma.bookingOffer.create({
          data: {
            id: randomUUID(),
            bookingId: offer.bookingId,
            riderId: offer.riderId,
            status: 'PENDING',
            batchSequence: offer.batchSequence,
            expiresAt: offer.expiresAt,
          },
        }),
      ),
    );
  }

  async findOfferForRider(offerId: string, riderId: string) {
    return this.prisma.bookingOffer.findFirst({
      where: { id: offerId, riderId },
      include: {
        booking: {
          include: {
            payments: {
              where: { purpose: 'BOOKING_FEE', status: 'SUCCESS' },
              take: 1,
            },
          },
        },
      },
    });
  }

  async listPendingOffersForRider(riderId: string) {
    return this.prisma.bookingOffer.findMany({
      where: { riderId, status: 'PENDING' },
      orderBy: { offeredAt: 'asc' },
      include: {
        booking: {
          select: {
            id: true,
            status: true,
            vehicleCategory: true,
            pickupLatitude: true,
            pickupLongitude: true,
            destinationLatitude: true,
            destinationLongitude: true,
            pickupLabel: true,
            destinationLabel: true,
            searchExpiresAt: true,
          },
        },
      },
    });
  }

  async rejectOffer(offerId: string, riderId: string, now: Date) {
    const result = await this.prisma.bookingOffer.updateMany({
      where: { id: offerId, riderId, status: 'PENDING' },
      data: { status: 'REJECTED', respondedAt: now },
    });
    return result.count === 1;
  }

  async markOfferTimedOut(offerId: string, now: Date) {
    const result = await this.prisma.bookingOffer.updateMany({
      where: { id: offerId, status: 'PENDING' },
      data: { status: 'TIMED_OUT', respondedAt: now },
    });
    return result.count === 1;
  }

  async countPendingOffers(bookingId: string) {
    return this.prisma.bookingOffer.count({
      where: { bookingId, status: 'PENDING' },
    });
  }

  async acceptOfferAtomically(input: {
    offerId: string;
    riderId: string;
    bookingId: string;
    now: Date;
  }) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM bookings WHERE id = ${input.bookingId}::uuid FOR UPDATE`;
        await tx.$executeRaw`SELECT id FROM booking_offers WHERE id = ${input.offerId}::uuid FOR UPDATE`;

        const offer = await tx.bookingOffer.findUnique({ where: { id: input.offerId } });
        if (!offer || offer.riderId !== input.riderId) {
          throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Offer not found' });
        }
        if (offer.status !== 'PENDING') {
          throw new AppError({
            status: 409,
            code: 'CONFLICT',
            message: `Offer cannot be accepted from status ${offer.status}`,
          });
        }
        if (offer.expiresAt.getTime() < input.now.getTime()) {
          throw new AppError({
            status: 409,
            code: 'CONFLICT',
            message: 'Offer response deadline has passed',
          });
        }

        const booking = await tx.booking.findUnique({ where: { id: input.bookingId } });
        if (!booking || booking.status !== 'SEARCHING') {
          throw new AppError({
            status: 409,
            code: 'CONFLICT',
            message: 'Booking is not searching for a rider',
          });
        }
        if (booking.searchExpiresAt && booking.searchExpiresAt.getTime() < input.now.getTime()) {
          throw new AppError({
            status: 409,
            code: 'CONFLICT',
            message: 'Booking search deadline has passed',
          });
        }
        if (!booking.serviceZoneId) {
          throw new AppError({
            status: 409,
            code: 'CONFLICT',
            message: 'Booking has no pickup service zone',
          });
        }

        const rider = await tx.riderProfile.findUnique({
          where: { userId: input.riderId },
          include: {
            user: { select: { status: true } },
            location: true,
            wallet: true,
            vehicles: {
              where: {
                verificationStatus: 'APPROVED',
                category: booking.vehicleCategory,
              },
            },
            zoneApprovals: {
              where: {
                status: 'APPROVED',
                zoneId: booking.serviceZoneId,
                zone: { isActive: true },
              },
            },
            bookings: {
              where: {
                status: { in: [...ACTIVE_TRIP_BOOKING_STATUSES] },
                id: { not: input.bookingId },
              },
              take: 1,
            },
          },
        });
        if (!rider?.location) {
          throw new AppError({
            status: 409,
            code: 'CONFLICT',
            message: 'Rider is not eligible to accept',
          });
        }
        const eligibility = evaluateMatchingEligibility(
          {
            userStatus: rider.user.status,
            riderVerificationStatus: rider.verificationStatus,
            hasApprovedVehicle: rider.vehicles.length > 0,
            hasApprovedVehicleForCategory: rider.vehicles.length > 0,
            hasApprovedActiveZone: rider.zoneApprovals.length > 0,
            hasApprovedActiveZoneForPickup: rider.zoneApprovals.length > 0,
            availability: rider.availability,
            onActiveTrip: rider.bookings.length > 0,
            tokenBalance: rider.wallet?.tokenBalance ?? 0,
            previouslyExcludedFromBooking: false,
            location: {
              sharingEnabled: rider.location.sharingEnabled,
              recordedAt: rider.location.recordedAt,
              receivedAt: rider.location.receivedAt,
              latitude: Number(rider.location.latitude),
              longitude: Number(rider.location.longitude),
            },
            pickup: {
              latitude: Number(booking.pickupLatitude),
              longitude: Number(booking.pickupLongitude),
            },
          },
          input.now,
        );
        if (!eligibility.eligible) {
          throw new AppError({
            status: 409,
            code: 'CONFLICT',
            message: 'Rider is not eligible to accept',
          });
        }

        const updated = await tx.booking.updateMany({
          where: { id: input.bookingId, status: 'SEARCHING' },
          data: {
            status: 'ACCEPTED',
            riderId: input.riderId,
            acceptedAt: input.now,
          },
        });
        if (updated.count !== 1) {
          throw new AppError({
            status: 409,
            code: 'CONFLICT',
            message: 'Another rider already accepted this booking',
          });
        }

        await tx.bookingOffer.update({
          where: { id: input.offerId },
          data: { status: 'ACCEPTED', respondedAt: input.now },
        });
        const invalidated = await tx.bookingOffer.findMany({
          where: {
            bookingId: input.bookingId,
            status: 'PENDING',
            id: { not: input.offerId },
          },
          select: { id: true, riderId: true },
        });
        if (invalidated.length > 0) {
          await tx.bookingOffer.updateMany({
            where: { id: { in: invalidated.map((row) => row.id) } },
            data: { status: 'INVALIDATED', respondedAt: input.now },
          });
        }

        await this.wallet.debitForAcceptanceInTx(tx, {
          riderId: input.riderId,
          bookingId: input.bookingId,
        });

        // Durable connection-fee row + deadline in the same txn as ACCEPTED.
        // Paystack initializeTransaction runs after commit; failure cannot orphan without expiry.
        const feeKey = IdempotencyKey.bookingFee(input.bookingId);
        let feePayment = await tx.payment.findUnique({ where: { idempotencyKey: feeKey } });
        if (!feePayment) {
          const providerReference = `bf_${randomUUID().replace(/-/g, '')}`;
          feePayment = await tx.payment.create({
            data: {
              id: randomUUID(),
              userId: booking.passengerId,
              bookingId: input.bookingId,
              purpose: 'BOOKING_FEE',
              amountPesewas: BOOKING_FEE_PESEWAS,
              currency: 'GHS',
              status: 'PENDING',
              provider: 'paystack',
              providerReference,
              idempotencyKey: feeKey,
            },
          });
        }
        const paymentExpiresAt =
          booking.paymentExpiresAt && booking.paymentExpiresAt.getTime() > input.now.getTime()
            ? booking.paymentExpiresAt
            : new Date(input.now.getTime() + BOOKING_PAYMENT_TIMEOUT_MS);
        await tx.booking.update({
          where: { id: input.bookingId },
          data: { paymentExpiresAt },
        });

        await tx.bookingStatusHistory.create({
          data: {
            bookingId: input.bookingId,
            fromStatus: 'SEARCHING',
            toStatus: 'ACCEPTED',
            actorType: 'RIDER',
            actorId: input.riderId,
            reason: 'offer_accepted',
          },
        });

        await tx.riderProfile.update({
          where: { userId: input.riderId },
          data: { availability: 'BUSY' },
        });

        const accepted = await tx.booking.findUniqueOrThrow({ where: { id: input.bookingId } });
        return {
          booking: accepted,
          invalidatedOffers: invalidated,
          connectionFeePayment: feePayment,
          paymentExpiresAt,
        };
      });
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        throw new AppError({
          status: 409,
          code: 'CONFLICT',
          message: 'Rider already has an active trip or booking already assigned',
        });
      }
      throw error;
    }
  }

  async expireSearchingBooking(bookingId: string, now: Date) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.updateMany({
        where: { id: bookingId, status: 'SEARCHING' },
        data: { status: 'EXPIRED', expiredAt: now },
      });
      if (updated.count !== 1) return null;
      const pending = await tx.bookingOffer.findMany({
        where: { bookingId, status: 'PENDING' },
        select: { id: true, riderId: true },
      });
      if (pending.length > 0) {
        await tx.bookingOffer.updateMany({
          where: { id: { in: pending.map((row) => row.id) } },
          data: { status: 'INVALIDATED', respondedAt: now },
        });
      }
      await tx.bookingStatusHistory.create({
        data: {
          bookingId,
          fromStatus: 'SEARCHING',
          toStatus: 'EXPIRED',
          actorType: 'SYSTEM',
          reason: 'search_timeout',
        },
      });
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          payments: {
            where: { purpose: 'BOOKING_FEE', status: 'SUCCESS' },
            take: 1,
          },
        },
      });
      return booking ? { ...booking, invalidatedOffers: pending } : null;
    });
  }

  async getMatchingStatusForPassenger(bookingId: string, passengerId: string) {
    return this.prisma.booking.findFirst({
      where: { id: bookingId, passengerId },
      select: {
        id: true,
        status: true,
        searchExpiresAt: true,
        riderId: true,
        acceptedAt: true,
        offers: {
          select: { status: true, batchSequence: true, offeredAt: true },
          orderBy: { offeredAt: 'desc' },
          take: 20,
        },
      },
    });
  }
}
