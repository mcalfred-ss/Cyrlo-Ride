import { randomUUID } from 'node:crypto';

import type { BookingStatus, Prisma, PrismaClient, VehicleCategory } from '@prisma/client';

import { BOOKING_FEE_PESEWAS } from '../../config/constants.js';
import { IdempotencyKey } from '../../common/utils/idempotency.js';
import {
  isInsideBoundingBox,
  isPointInBoundary,
  type ZoneBoundary,
} from '../service-zones/zone-geometry.js';

export interface CreateBookingRecordInput {
  passengerId: string;
  serviceZoneId: string;
  vehicleCategory: VehicleCategory;
  pickupLatitude: number;
  pickupLongitude: number;
  destinationLatitude?: number | null;
  destinationLongitude?: number | null;
  pickupLabel?: string | null;
  destinationLabel?: string | null;
  bookingFeePesewas: number;
  searchExpiresAt: Date;
}

export interface CreateConnectionFeePaymentInput {
  bookingId: string;
  passengerId: string;
  providerReference: string;
  paymentExpiresAt: Date;
  amountPesewas: number;
}

/** Private to the bookings module. */
export class BookingsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  protected database(): PrismaClient {
    return this.prisma;
  }

  async findUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true, phoneNumber: true },
    });
  }

  async findActiveZoneCoveringPickup(latitude: number, longitude: number) {
    const candidates = await this.prisma.serviceZone.findMany({
      where: {
        isActive: true,
        status: 'ACTIVE',
        minLatitude: { lte: latitude },
        maxLatitude: { gte: latitude },
        minLongitude: { lte: longitude },
        maxLongitude: { gte: longitude },
      },
    });
    // Deterministic overlap: smallest bbox area, then oldest createdAt.
    const matches = [];
    for (const zone of candidates) {
      const box = {
        minLatitude: Number(zone.minLatitude),
        maxLatitude: Number(zone.maxLatitude),
        minLongitude: Number(zone.minLongitude),
        maxLongitude: Number(zone.maxLongitude),
      };
      if (!isInsideBoundingBox({ latitude, longitude }, box)) continue;
      const boundary = zone.boundary as unknown as ZoneBoundary;
      if (!isPointInBoundary(latitude, longitude, boundary)) continue;
      matches.push({
        zone,
        area:
          Math.max(0, box.maxLatitude - box.minLatitude) *
          Math.max(0, box.maxLongitude - box.minLongitude),
      });
    }
    if (matches.length === 0) return null;
    matches.sort((a, b) => {
      if (a.area !== b.area) return a.area - b.area;
      return a.zone.createdAt.getTime() - b.zone.createdAt.getTime();
    });
    return matches[0]!.zone;
  }

  /**
   * Destination-free create: SEARCHING immediately, no Paystack row.
   * Connection fee is created later on rider acceptance.
   */
  async createPickupOnlySearchingBooking(input: CreateBookingRecordInput) {
    const bookingId = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.create({
        data: {
          id: bookingId,
          passengerId: input.passengerId,
          serviceZoneId: input.serviceZoneId,
          status: 'SEARCHING',
          vehicleCategory: input.vehicleCategory,
          pickupLatitude: input.pickupLatitude,
          pickupLongitude: input.pickupLongitude,
          destinationLatitude: input.destinationLatitude ?? null,
          destinationLongitude: input.destinationLongitude ?? null,
          pickupLabel: input.pickupLabel ?? null,
          destinationLabel: input.destinationLabel ?? null,
          bookingFeePesewas: input.bookingFeePesewas,
          paymentExpiresAt: null,
          searchExpiresAt: input.searchExpiresAt,
        },
      });
      await tx.bookingStatusHistory.create({
        data: {
          bookingId: booking.id,
          fromStatus: null,
          toStatus: 'SEARCHING',
          actorType: 'PASSENGER',
          actorId: input.passengerId,
          reason: 'pickup_request_created',
        },
      });
      return booking;
    });
  }

  /**
   * Idempotent connection-fee payment row for an accepted booking.
   * Uses booking-fee:{bookingId} so duplicate accepts / retries share one payment.
   */
  async ensureConnectionFeePayment(input: CreateConnectionFeePaymentInput) {
    const existing = await this.prisma.payment.findFirst({
      where: {
        bookingId: input.bookingId,
        purpose: 'BOOKING_FEE',
        idempotencyKey: IdempotencyKey.bookingFee(input.bookingId),
      },
    });
    if (existing) {
      return { payment: existing, created: false as const };
    }
    try {
      const payment = await this.prisma.payment.create({
        data: {
          id: randomUUID(),
          userId: input.passengerId,
          bookingId: input.bookingId,
          purpose: 'BOOKING_FEE',
          amountPesewas: input.amountPesewas,
          currency: 'GHS',
          status: 'PENDING',
          provider: 'paystack',
          providerReference: input.providerReference,
          idempotencyKey: IdempotencyKey.bookingFee(input.bookingId),
        },
      });
      await this.prisma.booking.update({
        where: { id: input.bookingId },
        data: { paymentExpiresAt: input.paymentExpiresAt },
      });
      return { payment, created: true as const };
    } catch (error) {
      if (
        typeof error === 'object' &&
        error &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        const payment = await this.prisma.payment.findFirstOrThrow({
          where: {
            bookingId: input.bookingId,
            purpose: 'BOOKING_FEE',
            idempotencyKey: IdempotencyKey.bookingFee(input.bookingId),
          },
        });
        return { payment, created: false as const };
      }
      throw error;
    }
  }

  /** @deprecated Legacy fee-at-create path — kept for historical test fixtures only. */
  async createBookingWithFeePayment(
    input: CreateBookingRecordInput & {
      paymentExpiresAt: Date;
      providerReference: string;
      destinationLatitude: number;
      destinationLongitude: number;
    },
  ) {
    const bookingId = randomUUID();
    const paymentId = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.create({
        data: {
          id: bookingId,
          passengerId: input.passengerId,
          serviceZoneId: input.serviceZoneId,
          status: 'AWAITING_PAYMENT',
          vehicleCategory: input.vehicleCategory,
          pickupLatitude: input.pickupLatitude,
          pickupLongitude: input.pickupLongitude,
          destinationLatitude: input.destinationLatitude,
          destinationLongitude: input.destinationLongitude,
          pickupLabel: input.pickupLabel ?? null,
          destinationLabel: input.destinationLabel ?? null,
          bookingFeePesewas: input.bookingFeePesewas,
          paymentExpiresAt: input.paymentExpiresAt,
        },
      });
      await tx.bookingStatusHistory.create({
        data: {
          bookingId: booking.id,
          fromStatus: null,
          toStatus: 'AWAITING_PAYMENT',
          actorType: 'PASSENGER',
          actorId: input.passengerId,
          reason: 'booking_created',
        },
      });
      const payment = await tx.payment.create({
        data: {
          id: paymentId,
          userId: input.passengerId,
          bookingId: booking.id,
          purpose: 'BOOKING_FEE',
          amountPesewas: BOOKING_FEE_PESEWAS,
          currency: 'GHS',
          status: 'PENDING',
          provider: 'paystack',
          providerReference: input.providerReference,
          idempotencyKey: IdempotencyKey.bookingFee(booking.id),
        },
      });
      return { booking, payment };
    });
  }

  async findBookingForPassenger(bookingId: string, passengerId: string) {
    return this.prisma.booking.findFirst({
      where: { id: bookingId, passengerId },
      include: {
        payments: { orderBy: { createdAt: 'desc' } },
        serviceZone: { select: { id: true, name: true, isActive: true } },
      },
    });
  }

  async findBookingById(bookingId: string) {
    return this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        payments: { orderBy: { createdAt: 'desc' } },
        serviceZone: { select: { id: true, name: true, isActive: true } },
      },
    });
  }

  async listBookingsForPassenger(passengerId: string, page: number, pageSize: number) {
    const where = { passengerId };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          serviceZone: { select: { id: true, name: true, isActive: true } },
        },
      }),
    ]);
    return { total, items };
  }

  async transitionBooking(input: {
    bookingId: string;
    fromStatuses: BookingStatus[];
    toStatus: BookingStatus;
    actorType: string;
    actorId?: string | null;
    reason?: string | null;
    extra?: Prisma.BookingUpdateInput;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM bookings WHERE id = ${input.bookingId}::uuid FOR UPDATE`;
      const current = await tx.booking.findUnique({ where: { id: input.bookingId } });
      if (!current || !input.fromStatuses.includes(current.status)) {
        return null;
      }
      // Conditional write: reject if another transaction already moved status.
      const moved = await tx.booking.updateMany({
        where: {
          id: input.bookingId,
          status: { in: input.fromStatuses },
        },
        data: {
          status: input.toStatus,
          ...(input.extra as Prisma.BookingUpdateManyMutationInput | undefined),
        },
      });
      if (moved.count !== 1) {
        return null;
      }
      const updated = await tx.booking.findUniqueOrThrow({ where: { id: input.bookingId } });
      await tx.bookingStatusHistory.create({
        data: {
          bookingId: input.bookingId,
          fromStatus: current.status,
          toStatus: input.toStatus,
          actorType: input.actorType,
          actorId: input.actorId ?? null,
          reason: input.reason ?? null,
        },
      });
      return updated;
    });
  }

  async findPendingFeePayment(bookingId: string) {
    return this.prisma.payment.findFirst({
      where: { bookingId, purpose: 'BOOKING_FEE', status: 'PENDING' },
    });
  }

  async findSuccessfulFeePayment(bookingId: string) {
    return this.prisma.payment.findFirst({
      where: { bookingId, purpose: 'BOOKING_FEE', status: 'SUCCESS' },
    });
  }

  async findBookingForAssignedRider(bookingId: string, riderId: string) {
    return this.prisma.booking.findFirst({
      where: { id: bookingId, riderId },
    });
  }

  async findTokenDebit(bookingId: string, riderId: string) {
    return this.prisma.tokenLedgerEntry.findFirst({
      where: { bookingId, riderId, type: 'DEDUCTION' },
      orderBy: { createdAt: 'asc' },
    });
  }

  async releaseRiderIfIdle(tx: Prisma.TransactionClient, riderId: string) {
    const active = await tx.booking.findFirst({
      where: {
        riderId,
        status: { in: ['ACCEPTED', 'IN_PROGRESS'] },
      },
      select: { id: true },
    });
    if (active) return;
    await tx.riderProfile.updateMany({
      where: { userId: riderId, availability: 'BUSY' },
      data: { availability: 'AVAILABLE' },
    });
  }
}
