import { randomUUID } from 'node:crypto';

import {
  BOOKING_FEE_PESEWAS,
  BOOKING_PAYMENT_TIMEOUT_MS,
  BOOKING_SEARCH_TIMEOUT_MS,
} from '../../config/constants.js';
import { AppError } from '../../common/errors/app-error.js';
import { enqueueInAppNotification } from '../../infrastructure/notifications/notify.js';
import {
  createPaystackClient,
  passengerPaymentEmail,
  type PaystackClient,
} from '../../infrastructure/payments/paystack-client.js';
import {
  publishRiderAvailabilityUpdated,
} from '../../infrastructure/realtime/publisher.js';
import type { AuditService } from '../audit/module.service.js';
import { WalletRepository } from '../wallet/module.repository.js';
import { assertBookingTransition, decideRefunds } from './booking-rules.js';
import { decideUnpaidConnectionFeeCancel } from './connection-fee-lifecycle.js';
import type {
  CancelBookingInput,
  CreateBookingInput,
  ListBookingsQuery,
  PassengerCancelAfterAcceptInput,
  RiderCancelInput,
  RiderUnableToCompleteInput,
} from './module.schema.js';
import type { BookingsRepository } from './module.repository.js';
import type { PrismaClient } from '@prisma/client';
import { IdempotencyKey } from '../../common/utils/idempotency.js';

export interface BookingsServiceDeps {
  audit: AuditService;
  prisma: PrismaClient;
  paystack?: PaystackClient;
  now?: () => Date;
}

export type MatchingDispatch = {
  dispatchForBooking(bookingId: string): Promise<unknown>;
};

export interface ConnectionFeeCheckout {
  paymentId: string;
  amountPesewas: number;
  currency: string;
  status: string;
  reference: string;
  authorizationUrl: string;
  accessCode: string;
  paymentExpiresAt: string;
}

export interface BookingsService {
  create(passengerId: string, input: CreateBookingInput, ip?: string): Promise<unknown>;
  getOwn(passengerId: string, bookingId: string): Promise<unknown>;
  listOwn(passengerId: string, query: ListBookingsQuery): Promise<unknown>;
  cancel(
    passengerId: string,
    bookingId: string,
    input: CancelBookingInput,
    ip?: string,
  ): Promise<unknown>;
  startTrip(riderId: string, bookingId: string, ip?: string): Promise<unknown>;
  completeTrip(riderId: string, bookingId: string, ip?: string): Promise<unknown>;
  riderCancelAfterAccept(
    riderId: string,
    bookingId: string,
    input: RiderCancelInput,
    ip?: string,
  ): Promise<unknown>;
  riderUnableToComplete(
    riderId: string,
    bookingId: string,
    input: RiderUnableToCompleteInput,
    ip?: string,
  ): Promise<unknown>;
  requestPassengerCancelAfterAccept(
    passengerId: string,
    bookingId: string,
    input: PassengerCancelAfterAcceptInput,
    ip?: string,
  ): Promise<unknown>;
  /** System job: expire unpaid AWAITING_PAYMENT (legacy) + unpaid connection fees after accept. */
  expireUnpaidBookings(now?: Date): Promise<{ expired: number }>;
  /** After rider accept: create/idempotent GH₵1 connection-fee checkout (MemoryPaystack in tests). */
  initiateConnectionFeeAfterAccept(
    bookingId: string,
    passengerId: string,
  ): Promise<ConnectionFeeCheckout>;
  markSearchingAfterFeeSuccess(bookingId: string, now?: Date): Promise<unknown>;
  markPaymentFailed(bookingId: string, reason: string): Promise<unknown>;
  requestFeeRefund(input: {
    paymentId: string;
    bookingId: string;
    amountPesewas: number;
    requestedById?: string | null;
    reason: string;
    /**
     * When true, marks the refund authorized for worker Paystack execution
     * (approved matrix policy). Support recommendations leave this false.
     */
    authorizeForExecution?: boolean;
  }): Promise<string>;
  /**
   * Passenger completion acknowledgement. Does not change booking status
   * (master spec §6 / §14).
   */
  acknowledgeCompletion(
    passengerId: string,
    bookingId: string,
    ip?: string,
  ): Promise<unknown>;
  /** Late-bound matching dispatch so create can offer riders immediately. */
  attachMatching(matching: MatchingDispatch): void;
}

export class BookingsServiceImpl implements BookingsService {
  private readonly now: () => Date;
  private readonly paystack: PaystackClient;
  private readonly wallet: WalletRepository;
  private matching: MatchingDispatch | null = null;

  constructor(
    private readonly repository: BookingsRepository,
    private readonly deps: BookingsServiceDeps,
  ) {
    this.now = deps.now ?? (() => new Date());
    this.paystack = deps.paystack ?? createPaystackClient();
    this.wallet = new WalletRepository(deps.prisma);
  }

  attachMatching(matching: MatchingDispatch): void {
    this.matching = matching;
  }

  async create(passengerId: string, input: CreateBookingInput, ip?: string) {
    const user = await this.repository.findUser(passengerId);
    if (!user || user.status === 'DELETED') {
      throw new AppError({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Authentication is required',
      });
    }
    if (user.status === 'SUSPENDED') {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Account is suspended',
      });
    }
    if (user.role !== 'PASSENGER' && user.role !== 'RIDER') {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Only passenger accounts can create bookings',
      });
    }

    const zone = await this.repository.findActiveZoneCoveringPickup(
      input.pickup.latitude,
      input.pickup.longitude,
    );
    if (!zone) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Pickup is outside the active service area',
      });
    }

    const now = this.now();
    const searchExpiresAt = new Date(now.getTime() + BOOKING_SEARCH_TIMEOUT_MS);

    const booking = await this.repository.createPickupOnlySearchingBooking({
      passengerId,
      serviceZoneId: zone.id,
      vehicleCategory: input.vehicleCategory,
      pickupLatitude: input.pickup.latitude,
      pickupLongitude: input.pickup.longitude,
      destinationLatitude: input.destination?.latitude ?? null,
      destinationLongitude: input.destination?.longitude ?? null,
      pickupLabel: input.pickupLabel,
      destinationLabel: input.destinationLabel,
      bookingFeePesewas: BOOKING_FEE_PESEWAS,
      searchExpiresAt,
    });

    await this.deps.audit.record({
      actorId: passengerId,
      action: 'booking.created',
      entityType: 'booking',
      entityId: booking.id,
      metadata: {
        status: booking.status,
        serviceZoneId: zone.id,
        vehicleCategory: booking.vehicleCategory,
        bookingFeePesewas: BOOKING_FEE_PESEWAS,
        connectionFeeTiming: 'on_accept',
        destinationRequired: false,
      },
      ipAddress: ip,
    });

    enqueueInAppNotification(this.deps.prisma, {
      userId: passengerId,
      title: 'Looking for a rider',
      body: 'Nearby riders have been notified. Agree destination and transport fare with your rider after they accept. Cyrlo’s GH₵1 connection fee is collected when a rider accepts.',
      data: { bookingId: booking.id, status: 'SEARCHING' },
    });

    void this.matching?.dispatchForBooking(booking.id).catch(() => undefined);

    return {
      ...toBookingView(booking),
      /** No Paystack checkout at create — fee starts after rider acceptance. */
      payment: null,
      connectionFeePesewas: BOOKING_FEE_PESEWAS,
      connectionFeeNote:
        'GH₵1 Cyrlo connection fee is charged when a rider accepts. Transport fare is agreed directly with the rider.',
    };
  }

  async getOwn(passengerId: string, bookingId: string) {
    await this.expireIfNeeded(bookingId);
    const booking = await this.repository.findBookingForPassenger(bookingId, passengerId);
    if (!booking) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Booking not found' });
    }
    return toBookingView(booking);
  }

  async listOwn(passengerId: string, query: ListBookingsQuery) {
    const { total, items } = await this.repository.listBookingsForPassenger(
      passengerId,
      query.page,
      query.pageSize,
    );
    return {
      items: items.map(toBookingView),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        hasNextPage: query.page * query.pageSize < total,
      },
    };
  }

  async cancel(
    passengerId: string,
    bookingId: string,
    input: CancelBookingInput,
    ip?: string,
  ) {
    await this.expireIfNeeded(bookingId);
    const booking = await this.repository.findBookingForPassenger(bookingId, passengerId);
    if (!booking) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Booking not found' });
    }

    if (booking.status !== 'AWAITING_PAYMENT' && booking.status !== 'SEARCHING') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Booking cannot be cancelled in its current status',
      });
    }

    assertBookingTransition(booking.status, 'CANCELLED', 'PASSENGER');

    const fee = await this.repository.findSuccessfulFeePayment(bookingId);
    const decisions = decideRefunds({
      feeCaptured: Boolean(fee),
      tokenDebited: false,
      situation: 'PASSENGER_CANCEL_BEFORE_ACCEPT',
    });

    const updated = await this.repository.transitionBooking({
      bookingId,
      fromStatuses: ['AWAITING_PAYMENT', 'SEARCHING'],
      toStatus: 'CANCELLED',
      actorType: 'PASSENGER',
      actorId: passengerId,
      reason: input.reason ?? 'passenger_cancelled',
      extra: {
        cancelledAt: this.now(),
        cancellationReason: input.reason ?? null,
      },
    });
    if (!updated) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Booking could not be cancelled',
      });
    }

    let refundId: string | null = null;
    if (decisions.fee === 'REQUEST_REFUND' && fee) {
      refundId = await this.requestFeeRefund({
        paymentId: fee.id,
        bookingId,
        amountPesewas: fee.amountPesewas,
        requestedById: passengerId,
        reason: 'passenger_cancel_before_accept',
        authorizeForExecution: true,
      });
    } else if (booking.status === 'AWAITING_PAYMENT') {
      await this.deps.prisma.payment.updateMany({
        where: { bookingId, purpose: 'BOOKING_FEE', status: 'PENDING' },
        data: { status: 'ABANDONED' },
      });
    }

    await this.deps.audit.record({
      actorId: passengerId,
      action: 'booking.cancelled',
      entityType: 'booking',
      entityId: bookingId,
      metadata: { previousStatus: booking.status, refundId },
      ipAddress: ip,
    });

    enqueueInAppNotification(this.deps.prisma, {
      userId: passengerId,
      title: 'Booking cancelled',
      body:
        refundId != null
          ? 'Your booking was cancelled. A booking-fee refund has been requested for finance processing.'
          : 'Your booking was cancelled.',
      data: { bookingId, status: 'CANCELLED', refundId },
    });

    return toBookingView(updated);
  }

  async startTrip(riderId: string, bookingId: string, ip?: string) {
    await this.assertRiderActive(riderId);
    const booking = await this.repository.findBookingForAssignedRider(bookingId, riderId);
    if (!booking) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Booking not found' });
    }
    if (booking.status === 'IN_PROGRESS' && booking.startedAt) {
      return toBookingView(booking);
    }
    if (booking.status !== 'ACCEPTED') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Only an accepted booking can be started',
      });
    }
    assertBookingTransition('ACCEPTED', 'IN_PROGRESS', 'RIDER');
    const now = this.now();
    const otherActive = await this.deps.prisma.booking.findFirst({
      where: {
        riderId,
        status: { in: ['ACCEPTED', 'IN_PROGRESS'] },
        id: { not: bookingId },
      },
      select: { id: true },
    });
    if (otherActive) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Rider already has another active trip',
      });
    }

    const updated = await this.repository.transitionBooking({
      bookingId,
      fromStatuses: ['ACCEPTED'],
      toStatus: 'IN_PROGRESS',
      actorType: 'RIDER',
      actorId: riderId,
      reason: 'trip_started',
      extra: { startedAt: now },
    });
    if (!updated) {
      const again = await this.repository.findBookingForAssignedRider(bookingId, riderId);
      if (again?.status === 'IN_PROGRESS') return toBookingView(again);
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Booking could not be started',
      });
    }

    await this.deps.audit.record({
      actorId: riderId,
      action: 'booking.trip.started',
      entityType: 'booking',
      entityId: bookingId,
      ipAddress: ip,
    });
    enqueueInAppNotification(this.deps.prisma, {
      userId: booking.passengerId,
      title: 'Trip started',
      body: 'Your rider has started the trip.',
      data: { bookingId, status: 'IN_PROGRESS' },
    });
    return toBookingView(updated);
  }

  async completeTrip(riderId: string, bookingId: string, ip?: string) {
    await this.assertRiderActive(riderId);
    const booking = await this.repository.findBookingForAssignedRider(bookingId, riderId);
    if (!booking) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Booking not found' });
    }
    if (booking.status === 'COMPLETED' && booking.completedAt) {
      return toBookingView(booking);
    }
    if (booking.status !== 'IN_PROGRESS') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Only an in-progress booking can be completed',
      });
    }
    assertBookingTransition('IN_PROGRESS', 'COMPLETED', 'RIDER');
    const now = this.now();
    const updated = await this.deps.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
      const current = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!current || current.status !== 'IN_PROGRESS' || current.riderId !== riderId) {
        return null;
      }
      const moved = await tx.booking.updateMany({
        where: { id: bookingId, status: 'IN_PROGRESS', riderId },
        data: { status: 'COMPLETED', completedAt: now },
      });
      if (moved.count !== 1) {
        return null;
      }
      const next = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
      await tx.bookingStatusHistory.create({
        data: {
          bookingId,
          fromStatus: 'IN_PROGRESS',
          toStatus: 'COMPLETED',
          actorType: 'RIDER',
          actorId: riderId,
          reason: 'trip_completed',
        },
      });
      await this.repository.releaseRiderIfIdle(tx, riderId);
      return next;
    });
    if (!updated) {
      const again = await this.repository.findBookingForAssignedRider(bookingId, riderId);
      if (again?.status === 'COMPLETED') return toBookingView(again);
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Booking could not be completed',
      });
    }

    await this.deps.audit.record({
      actorId: riderId,
      action: 'booking.trip.completed',
      entityType: 'booking',
      entityId: bookingId,
      ipAddress: ip,
    });
    enqueueInAppNotification(this.deps.prisma, {
      userId: booking.passengerId,
      title: 'Trip completed',
      body: 'Your trip was marked completed. Fare is paid directly to the rider.',
      data: { bookingId, status: 'COMPLETED' },
    });
    publishRiderAvailabilityUpdated({
      riderId,
      availability: 'AVAILABLE',
      updatedAt: now.toISOString(),
    });
    return toBookingView(updated);
  }

  async riderCancelAfterAccept(
    riderId: string,
    bookingId: string,
    input: RiderCancelInput,
    ip?: string,
  ) {
    return this.riderCancelOrFail({
      riderId,
      bookingId,
      reason: input.reason,
      allowedFrom: ['ACCEPTED'],
      situation: 'RIDER_CANCEL_AFTER_ACCEPT',
      auditAction: 'booking.rider.cancelled',
      historyReason: 'rider_cancel_after_accept',
      ip,
    });
  }

  async riderUnableToComplete(
    riderId: string,
    bookingId: string,
    input: RiderUnableToCompleteInput,
    ip?: string,
  ) {
    const booking = await this.repository.findBookingForAssignedRider(bookingId, riderId);
    if (booking?.status === 'COMPLETED') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Completed trips cannot be rewritten; open a dispute instead',
      });
    }
    return this.riderCancelOrFail({
      riderId,
      bookingId,
      reason: input.reason,
      allowedFrom: ['IN_PROGRESS'],
      situation: 'RIDER_UNABLE_TO_COMPLETE',
      auditAction: 'booking.rider.unable_to_complete',
      historyReason: 'rider_unable_to_complete',
      ip,
    });
  }

  async requestPassengerCancelAfterAccept(
    passengerId: string,
    bookingId: string,
    input: PassengerCancelAfterAcceptInput,
    ip?: string,
  ) {
    const booking = await this.repository.findBookingForPassenger(bookingId, passengerId);
    if (!booking) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Booking not found' });
    }
    if (booking.status !== 'ACCEPTED' && booking.status !== 'IN_PROGRESS') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Post-acceptance cancellation review only applies after a rider is assigned',
      });
    }

    // Policy: no automatic refund / token reverse; booking stays until support decides.
    const decisions = decideRefunds({
      feeCaptured: true,
      tokenDebited: true,
      situation: 'PASSENGER_CANCEL_AFTER_ACCEPT',
    });
    if (decisions.fee !== 'NONE' || decisions.token !== 'NONE') {
      throw new AppError({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'Refund policy misconfiguration for passenger cancel after accept',
      });
    }

    try {
      const request = await this.deps.prisma.bookingCancellationRequest.create({
        data: {
          id: randomUUID(),
          bookingId,
          passengerId,
          reason: input.reason,
          status: 'OPEN',
          recommendation: 'NONE',
        },
      });
      await this.deps.audit.record({
        actorId: passengerId,
        action: 'booking.passenger.cancel_request.submitted',
        entityType: 'booking_cancellation_request',
        entityId: request.id,
        metadata: { bookingId },
        ipAddress: ip,
      });
      await this.notifySupportStaff(
        'Passenger cancellation review needed',
        'A passenger requested cancellation after rider acceptance. No automatic refund was created.',
        { bookingId, requestId: request.id },
      );
      enqueueInAppNotification(this.deps.prisma, {
        userId: passengerId,
        title: 'Cancellation request submitted',
        body: 'Support will review your request. No automatic refund was issued.',
        data: { bookingId, requestId: request.id, status: booking.status },
      });
      if (booking.riderId) {
        enqueueInAppNotification(this.deps.prisma, {
          userId: booking.riderId,
          title: 'Passenger cancellation request',
          body: 'The passenger asked Support to review cancelling this booking.',
          data: { bookingId, requestId: request.id },
        });
      }
      return {
        requestId: request.id,
        bookingId,
        bookingStatus: booking.status,
        status: request.status,
        automaticRefund: false,
        automaticTokenReversal: false,
      };
    } catch (error) {
      if (
        typeof error === 'object' &&
        error &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        const existing = await this.deps.prisma.bookingCancellationRequest.findFirst({
          where: { bookingId, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
        });
        if (existing) {
          return {
            requestId: existing.id,
            bookingId,
            bookingStatus: booking.status,
            status: existing.status,
            automaticRefund: false,
            automaticTokenReversal: false,
          };
        }
      }
      throw error;
    }
  }

  private async riderCancelOrFail(input: {
    riderId: string;
    bookingId: string;
    reason: string;
    allowedFrom: Array<'ACCEPTED' | 'IN_PROGRESS'>;
    situation: 'RIDER_CANCEL_AFTER_ACCEPT' | 'RIDER_UNABLE_TO_COMPLETE';
    auditAction: string;
    historyReason: string;
    ip?: string;
  }) {
    await this.assertRiderActive(input.riderId);
    const booking = await this.repository.findBookingForAssignedRider(
      input.bookingId,
      input.riderId,
    );
    if (!booking) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Booking not found' });
    }
    if (booking.status === 'CANCELLED') {
      return toBookingView(booking);
    }
    if (!input.allowedFrom.includes(booking.status as 'ACCEPTED' | 'IN_PROGRESS')) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: `Booking cannot use this path from status ${booking.status}`,
      });
    }
    assertBookingTransition(booking.status, 'CANCELLED', 'RIDER');

    const fee = await this.repository.findSuccessfulFeePayment(input.bookingId);
    const debit = await this.repository.findTokenDebit(input.bookingId, input.riderId);
    const decisions = decideRefunds({
      feeCaptured: Boolean(fee),
      tokenDebited: Boolean(debit),
      situation: input.situation,
    });
    const now = this.now();

    const result = await this.deps.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM bookings WHERE id = ${input.bookingId}::uuid FOR UPDATE`;
      const current = await tx.booking.findUnique({ where: { id: input.bookingId } });
      if (!current || current.riderId !== input.riderId) {
        throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Booking not found' });
      }
      if (current.status === 'CANCELLED') {
        return { booking: current, tokenReversalId: null as string | null };
      }
      if (!input.allowedFrom.includes(current.status as 'ACCEPTED' | 'IN_PROGRESS')) {
        throw new AppError({
          status: 409,
          code: 'CONFLICT',
          message: `Booking cannot use this path from status ${current.status}`,
        });
      }
      const updated = await tx.booking.update({
        where: { id: input.bookingId },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancellationReason: input.reason,
          cancellationActorType: 'RIDER',
        },
      });
      await tx.bookingStatusHistory.create({
        data: {
          bookingId: input.bookingId,
          fromStatus: current.status,
          toStatus: 'CANCELLED',
          actorType: 'RIDER',
          actorId: input.riderId,
          reason: input.historyReason,
        },
      });

      let tokenReversalId: string | null = null;
      if (decisions.token === 'REQUEST_REFUND') {
        const entry = await this.wallet.reverseAcceptanceDebitInTx(tx, {
          riderId: input.riderId,
          bookingId: input.bookingId,
          reason: input.historyReason,
        });
        tokenReversalId = entry.id;
      }
      await this.repository.releaseRiderIfIdle(tx, input.riderId);
      return { booking: updated, tokenReversalId };
    });

    let refundId: string | null = null;
    if (decisions.fee === 'REQUEST_REFUND' && fee) {
      refundId = await this.requestFeeRefund({
        paymentId: fee.id,
        bookingId: input.bookingId,
        amountPesewas: fee.amountPesewas,
        requestedById: input.riderId,
        reason: input.historyReason,
        authorizeForExecution: true,
      });
    }

    await this.deps.audit.record({
      actorId: input.riderId,
      action: input.auditAction,
      entityType: 'booking',
      entityId: input.bookingId,
      metadata: {
        refundId,
        tokenReversalId: result.tokenReversalId,
        reason: input.reason,
      },
      ipAddress: input.ip,
    });
    if (result.tokenReversalId) {
      await this.deps.audit.record({
        actorId: input.riderId,
        action: 'wallet.token.reversed',
        entityType: 'token_ledger_entry',
        entityId: result.tokenReversalId,
        metadata: { bookingId: input.bookingId },
        ipAddress: input.ip,
      });
    }

    enqueueInAppNotification(this.deps.prisma, {
      userId: booking.passengerId,
      title: 'Trip cancelled by rider',
      body:
        refundId != null
          ? 'The rider cancelled. A booking-fee refund was queued for finance processing.'
          : 'The rider cancelled the booking.',
      data: { bookingId: input.bookingId, status: 'CANCELLED', refundId },
      channels: ['IN_APP', 'PUSH', 'SMS'],
      eventType: 'booking.rider_cancelled',
      category: 'TRIP',
      dedupeKey: `booking.rider_cancelled:${input.bookingId}`,
    });
    await this.notifySupportStaff(
      'Rider cancellation',
      'A rider cancelled or could not complete a booking. Review refund queue if needed.',
      { bookingId: input.bookingId, refundId },
    );
    publishRiderAvailabilityUpdated({
      riderId: input.riderId,
      availability: 'AVAILABLE',
      updatedAt: now.toISOString(),
    });

    return {
      ...toBookingView(result.booking),
      refundId,
      tokenReversalId: result.tokenReversalId,
    };
  }

  private async assertRiderActive(riderId: string) {
    const user = await this.deps.prisma.user.findUnique({
      where: { id: riderId },
      select: { status: true, role: true },
    });
    if (!user || user.role !== 'RIDER') {
      throw new AppError({ status: 403, code: 'FORBIDDEN', message: 'Rider access required' });
    }
    if (user.status === 'SUSPENDED' || user.status === 'DELETED') {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Suspended riders cannot change trip state',
      });
    }
  }

  private async notifySupportStaff(
    title: string,
    body: string,
    data: Record<string, unknown>,
  ) {
    const grants = await this.deps.prisma.adminRoleGrant.findMany({
      where: {
        revokedAt: null,
        staffRole: { in: ['SUPPORT_ADMIN', 'SUPER_ADMIN'] },
      },
      select: { userId: true },
    });
    const unique = [...new Set(grants.map((g) => g.userId))];
    for (const userId of unique) {
      enqueueInAppNotification(this.deps.prisma, {
        userId,
        title,
        body,
        data,
      });
    }
  }

  async expireUnpaidBookings(now = this.now()) {
    let expired = 0;

    // Legacy fee-before-search rows.
    const legacyDue = await this.deps.prisma.booking.findMany({
      where: {
        status: 'AWAITING_PAYMENT',
        paymentExpiresAt: { lte: now },
      },
      select: { id: true, passengerId: true },
      take: 100,
    });
    for (const row of legacyDue) {
      const updated = await this.repository.transitionBooking({
        bookingId: row.id,
        fromStatuses: ['AWAITING_PAYMENT'],
        toStatus: 'PAYMENT_FAILED',
        actorType: 'SYSTEM',
        reason: 'payment_timeout',
      });
      if (!updated) continue;
      await this.deps.prisma.payment.updateMany({
        where: { bookingId: row.id, purpose: 'BOOKING_FEE', status: 'PENDING' },
        data: { status: 'ABANDONED' },
      });
      expired += 1;
      enqueueInAppNotification(this.deps.prisma, {
        userId: row.passengerId,
        title: 'Booking payment expired',
        body: 'The 10-minute booking-fee window ended without a successful payment.',
        data: { bookingId: row.id, status: 'PAYMENT_FAILED' },
      });
    }

    // Destination-free: accepted, fee deadline passed, still unpaid.
    const acceptedDue = await this.deps.prisma.booking.findMany({
      where: {
        status: 'ACCEPTED',
        paymentExpiresAt: { lte: now },
        payments: {
          none: { purpose: 'BOOKING_FEE', status: 'SUCCESS' },
        },
      },
      select: { id: true, passengerId: true, riderId: true },
      take: 50,
    });
    for (const row of acceptedDue) {
      const cancelled = await this.cancelAcceptedForUnpaidConnectionFee(row.id, now);
      if (cancelled) expired += 1;
    }

    // Reconciliation: ACCEPTED without paymentExpiresAt (should not happen after P0 accept txn).
    const orphans = await this.deps.prisma.booking.findMany({
      where: {
        status: 'ACCEPTED',
        paymentExpiresAt: null,
        payments: { none: { purpose: 'BOOKING_FEE', status: 'SUCCESS' } },
      },
      select: { id: true, passengerId: true },
      take: 20,
    });
    for (const row of orphans) {
      const paymentExpiresAt = new Date(now.getTime() + BOOKING_PAYMENT_TIMEOUT_MS);
      await this.deps.prisma.booking.update({
        where: { id: row.id },
        data: { paymentExpiresAt },
      });
      await this.repository.ensureConnectionFeePayment({
        bookingId: row.id,
        passengerId: row.passengerId,
        providerReference: `bf_${randomUUID().replace(/-/g, '')}`,
        paymentExpiresAt,
        amountPesewas: BOOKING_FEE_PESEWAS,
      });
    }

    return { expired };
  }

  /**
   * Initialize (or retry) Paystack checkout for an existing PENDING connection-fee row.
   * Payment row + paymentExpiresAt are created atomically on accept — this never invents SUCCESS.
   * Uses MemoryPaystackClient in automated tests (no live network).
   */
  async initiateConnectionFeeAfterAccept(
    bookingId: string,
    passengerId: string,
  ): Promise<ConnectionFeeCheckout> {
    const booking = await this.repository.findBookingById(bookingId);
    if (!booking || booking.passengerId !== passengerId) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Booking not found' });
    }
    if (booking.status !== 'ACCEPTED' && booking.status !== 'IN_PROGRESS') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Connection fee is only collected after a rider accepts',
      });
    }

    const success = booking.payments.find(
      (p) => p.purpose === 'BOOKING_FEE' && p.status === 'SUCCESS',
    );
    if (success) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Connection fee was already paid for this booking',
      });
    }

    const now = this.now();
    const paymentExpiresAt =
      booking.paymentExpiresAt && booking.paymentExpiresAt.getTime() > now.getTime()
        ? booking.paymentExpiresAt
        : new Date(now.getTime() + BOOKING_PAYMENT_TIMEOUT_MS);

    // Prefer the accept-txn row; ensure is idempotent fallback (same booking-fee:{id} key).
    const existingPending = booking.payments.find(
      (p) => p.purpose === 'BOOKING_FEE' && p.status === 'PENDING',
    );
    const providerReference =
      existingPending?.providerReference ?? `bf_${randomUUID().replace(/-/g, '')}`;

    const { payment } = await this.repository.ensureConnectionFeePayment({
      bookingId,
      passengerId,
      providerReference,
      paymentExpiresAt,
      amountPesewas: BOOKING_FEE_PESEWAS,
    });

    if (payment.status === 'SUCCESS') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Connection fee was already paid for this booking',
      });
    }
    if (payment.status === 'ABANDONED') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Connection fee window was closed for this booking',
      });
    }
    if (payment.amountPesewas !== BOOKING_FEE_PESEWAS) {
      throw new AppError({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'Stored connection fee amount is invalid',
      });
    }

    if (!booking.paymentExpiresAt) {
      await this.deps.prisma.booking.update({
        where: { id: bookingId },
        data: { paymentExpiresAt },
      });
    }

    const reference = payment.providerReference ?? providerReference;
    if (!payment.providerReference) {
      await this.deps.prisma.payment.update({
        where: { id: payment.id },
        data: { providerReference: reference },
      });
    }

    try {
      const init = await this.paystack.initializeTransaction({
        email: passengerPaymentEmail(passengerId),
        amountPesewas: BOOKING_FEE_PESEWAS,
        currency: 'GHS',
        reference,
        metadata: {
          bookingId,
          paymentId: payment.id,
          purpose: 'BOOKING_FEE',
          feeType: 'connection_fee',
        },
      });

      enqueueInAppNotification(this.deps.prisma, {
        userId: passengerId,
        title: 'Pay GH₵1 connection fee',
        body: 'A rider accepted your request. Pay Cyrlo’s GH₵1 connection fee (not the transport fare). Agree destination and fare with your rider directly.',
        data: {
          bookingId,
          status: booking.status,
          paymentId: payment.id,
          authorizationUrl: init.authorizationUrl,
          amountPesewas: BOOKING_FEE_PESEWAS,
        },
        dedupeKey: `connection_fee_checkout:${bookingId}:${payment.id}`,
      });

      return {
        paymentId: payment.id,
        amountPesewas: BOOKING_FEE_PESEWAS,
        currency: 'GHS',
        status: payment.status,
        reference: init.reference,
        authorizationUrl: init.authorizationUrl,
        accessCode: init.accessCode,
        paymentExpiresAt: paymentExpiresAt.toISOString(),
      };
    } catch (error) {
      // Keep PENDING + deadline; do not mark SUCCESS. Expiry will cancel if unpaid.
      const message =
        error instanceof AppError
          ? error.message
          : 'Connection fee checkout could not be started. Retry from the app.';
      enqueueInAppNotification(this.deps.prisma, {
        userId: passengerId,
        title: 'Connection fee checkout failed',
        body: `${message} Your rider is assigned — pay GH₵1 within the time window or the connection will cancel.`,
        data: {
          bookingId,
          status: booking.status,
          paymentId: payment.id,
          connectionFeeInitFailed: true,
        },
        dedupeKey: `connection_fee_init_failed:${bookingId}`,
      });
      if (booking.riderId) {
        enqueueInAppNotification(this.deps.prisma, {
          userId: booking.riderId,
          title: 'Passenger checkout delayed',
          body: 'The passenger could not open the GH₵1 connection-fee checkout yet. Stay available — the booking remains assigned until the fee window ends.',
          data: { bookingId, status: booking.status },
          dedupeKey: `connection_fee_init_failed_rider:${bookingId}`,
        });
      }
      throw new AppError({
        status: 502,
        code: 'PAYMENT_VERIFICATION_FAILED',
        message,
        details: {
          bookingId,
          paymentId: payment.id,
          paymentStatus: payment.status,
          retryable: true,
        },
      });
    }
  }

  /**
   * Cancel ACCEPTED when connection fee unpaid past deadline.
   * Locks booking then fee payments; SUCCESS under lock aborts cancel (paid wins).
   */
  private async cancelAcceptedForUnpaidConnectionFee(bookingId: string, now: Date) {
    const result = await this.deps.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
      const current = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!current || !current.riderId) {
        return { outcome: 'abort' as const, reason: 'not_accepted' as const };
      }

      await tx.$executeRaw`
        SELECT id FROM payments
        WHERE booking_id = ${bookingId}::uuid AND purpose = 'BOOKING_FEE'
        FOR UPDATE
      `;
      const feeRows = await tx.payment.findMany({
        where: { bookingId, purpose: 'BOOKING_FEE' },
        select: { id: true, status: true, amountPesewas: true },
      });
      const debit = await tx.tokenLedgerEntry.findFirst({
        where: { bookingId, riderId: current.riderId, type: 'DEDUCTION' },
        select: { id: true },
      });

      const decision = decideUnpaidConnectionFeeCancel({
        bookingStatus: current.status as 'ACCEPTED',
        paymentStatuses: feeRows.map((r) => r.status as 'PENDING' | 'SUCCESS' | 'FAILED' | 'ABANDONED'),
        paymentExpiresAt: current.paymentExpiresAt,
        now,
        tokenDebited: Boolean(debit),
      });
      if (decision.action === 'abort') {
        return { outcome: 'abort' as const, reason: decision.reason };
      }

      const moved = await tx.booking.updateMany({
        where: { id: bookingId, status: 'ACCEPTED' },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancellationReason: 'connection_fee_unpaid_timeout',
          cancellationActorType: 'SYSTEM',
        },
      });
      if (moved.count !== 1) {
        return { outcome: 'abort' as const, reason: 'not_accepted' as const };
      }
      await tx.bookingStatusHistory.create({
        data: {
          bookingId,
          fromStatus: 'ACCEPTED',
          toStatus: 'CANCELLED',
          actorType: 'SYSTEM',
          reason: 'connection_fee_unpaid_timeout',
        },
      });
      if (decision.abandonPending) {
        await tx.payment.updateMany({
          where: { bookingId, purpose: 'BOOKING_FEE', status: 'PENDING' },
          data: { status: 'ABANDONED' },
        });
      }
      let tokenReversalId: string | null = null;
      if (decision.reverseToken) {
        const entry = await this.wallet.reverseAcceptanceDebitInTx(tx, {
          riderId: current.riderId,
          bookingId,
          reason: 'connection_fee_unpaid_timeout',
        });
        tokenReversalId = entry.id;
      }
      await this.repository.releaseRiderIfIdle(tx, current.riderId);
      return {
        outcome: 'cancelled' as const,
        riderId: current.riderId,
        passengerId: current.passengerId,
        tokenReversalId,
      };
    });

    if (result.outcome !== 'cancelled') return false;

    enqueueInAppNotification(this.deps.prisma, {
      userId: result.passengerId,
      title: 'Connection fee unpaid',
      body: 'The GH₵1 connection fee was not paid in time, so the ride connection was cancelled.',
      data: { bookingId, status: 'CANCELLED' },
    });
    enqueueInAppNotification(this.deps.prisma, {
      userId: result.riderId,
      title: 'Booking cancelled',
      body: 'The passenger did not complete the connection fee. Your token was restored.',
      data: { bookingId, status: 'CANCELLED' },
    });
    publishRiderAvailabilityUpdated({
      riderId: result.riderId,
      availability: 'AVAILABLE',
      updatedAt: now.toISOString(),
    });
    return true;
  }

  /** Used by payments webhook after verified SUCCESS within deadline. */
  async markSearchingAfterFeeSuccess(bookingId: string, now = this.now()) {
    assertBookingTransition('AWAITING_PAYMENT', 'SEARCHING', 'SYSTEM');
    const searchExpiresAt = new Date(now.getTime() + BOOKING_SEARCH_TIMEOUT_MS);
    return this.repository.transitionBooking({
      bookingId,
      fromStatuses: ['AWAITING_PAYMENT'],
      toStatus: 'SEARCHING',
      actorType: 'SYSTEM',
      reason: 'booking_fee_paid',
      extra: { searchExpiresAt },
    });
  }

  async markPaymentFailed(bookingId: string, reason: string) {
    assertBookingTransition('AWAITING_PAYMENT', 'PAYMENT_FAILED', 'SYSTEM');
    return this.repository.transitionBooking({
      bookingId,
      fromStatuses: ['AWAITING_PAYMENT'],
      toStatus: 'PAYMENT_FAILED',
      actorType: 'SYSTEM',
      reason,
    });
  }

  async requestFeeRefund(input: {
    paymentId: string;
    bookingId: string;
    amountPesewas: number;
    requestedById?: string | null;
    reason: string;
    authorizeForExecution?: boolean;
  }): Promise<string> {
    const key = IdempotencyKey.bookingFeeRefund(input.paymentId);
    const authorizeForExecution = input.authorizeForExecution === true;
    const now = this.now();
    try {
      const refund = await this.deps.prisma.paymentRefund.create({
        data: {
          paymentId: input.paymentId,
          bookingId: input.bookingId,
          amountPesewas: input.amountPesewas,
          currency: 'GHS',
          status: 'REQUESTED',
          reason: input.reason,
          idempotencyKey: key,
          requestedById: input.requestedById ?? null,
          authorizedAt: authorizeForExecution ? now : null,
          authorizedById: null,
        },
      });
      await this.deps.audit.record({
        actorId: input.requestedById ?? undefined,
        action: 'payment.refund.queued',
        entityType: 'payment_refund',
        entityId: refund.id,
        metadata: {
          paymentId: input.paymentId,
          bookingId: input.bookingId,
          reason: input.reason,
          authorizeForExecution,
        },
      });
      enqueueInAppNotification(this.deps.prisma, {
        userId: input.requestedById ?? (await this.lookupPassenger(input.bookingId)),
        title: authorizeForExecution ? 'Refund queued' : 'Refund requested',
        body: authorizeForExecution
          ? 'A booking-fee refund was queued for automatic processing.'
          : 'A booking-fee refund was queued for finance review.',
        data: { bookingId: input.bookingId, refundId: refund.id, status: 'REQUESTED' },
      });
      return refund.id;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        const existing = await this.deps.prisma.paymentRefund.findUnique({
          where: { idempotencyKey: key },
        });
        if (existing) return existing.id;
      }
      throw error;
    }
  }

  private async lookupPassenger(bookingId: string) {
    const booking = await this.deps.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { passengerId: true },
    });
    return booking?.passengerId ?? randomUUID();
  }

  private async expireIfNeeded(bookingId: string) {
    const booking = await this.deps.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { status: true, paymentExpiresAt: true },
    });
    if (!booking?.paymentExpiresAt) return;
    const pastDeadline = booking.paymentExpiresAt.getTime() <= this.now().getTime();
    if (
      pastDeadline &&
      (booking.status === 'AWAITING_PAYMENT' || booking.status === 'ACCEPTED')
    ) {
      await this.expireUnpaidBookings(this.now());
    }
  }

  async acknowledgeCompletion(passengerId: string, bookingId: string, ip?: string) {
    const booking = await this.deps.prisma.booking.findFirst({
      where: { id: bookingId, passengerId },
    });
    if (!booking) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Booking not found' });
    }
    if (booking.status !== 'COMPLETED') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Only a completed booking can be acknowledged',
      });
    }
    if (booking.passengerAcknowledgedAt) {
      return toBookingView(booking);
    }
    const now = this.now();
    const updated = await this.deps.prisma.booking.update({
      where: { id: bookingId },
      data: { passengerAcknowledgedAt: now },
    });
    await this.deps.audit.record({
      actorId: passengerId,
      action: 'booking.passenger_acknowledged',
      entityType: 'booking',
      entityId: bookingId,
      metadata: { status: booking.status },
      ipAddress: ip,
    });
    return toBookingView(updated);
  }
}

function toBookingView(booking: {
  id: string;
  passengerId: string;
  riderId: string | null;
  serviceZoneId: string | null;
  status: string;
  vehicleCategory: string;
  pickupLatitude: { toNumber?: () => number } | number | string;
  pickupLongitude: { toNumber?: () => number } | number | string;
  destinationLatitude?: { toNumber?: () => number } | number | string | null;
  destinationLongitude?: { toNumber?: () => number } | number | string | null;
  pickupLabel: string | null;
  destinationLabel: string | null;
  bookingFeePesewas: number;
  paymentExpiresAt: Date | null;
  searchExpiresAt: Date | null;
  requestedAt: Date;
  acceptedAt: Date | null;
  startedAt?: Date | null;
  cancelledAt: Date | null;
  completedAt: Date | null;
  passengerAcknowledgedAt?: Date | null;
  expiredAt: Date | null;
  cancellationReason: string | null;
  cancellationActorType?: string | null;
  createdAt: Date;
  updatedAt: Date;
  serviceZone?: { id: string; name: string; isActive: boolean } | null;
}) {
  const destLat = booking.destinationLatitude;
  const destLng = booking.destinationLongitude;
  const hasDestination =
    destLat != null &&
    destLng != null &&
    !(typeof destLat === 'string' && destLat.trim() === '');
  return {
    id: booking.id,
    passengerId: booking.passengerId,
    riderId: booking.riderId,
    serviceZoneId: booking.serviceZoneId,
    serviceZone: booking.serviceZone ?? null,
    status: booking.status,
    vehicleCategory: booking.vehicleCategory,
    pickup: {
      latitude: decimalToNumber(booking.pickupLatitude),
      longitude: decimalToNumber(booking.pickupLongitude),
    },
    destination: hasDestination
      ? {
          latitude: decimalToNumber(destLat!),
          longitude: decimalToNumber(destLng!),
        }
      : null,
    pickupLabel: booking.pickupLabel,
    destinationLabel: booking.destinationLabel,
    bookingFeePesewas: booking.bookingFeePesewas,
    connectionFeePesewas: booking.bookingFeePesewas,
    paymentExpiresAt: booking.paymentExpiresAt?.toISOString() ?? null,
    searchExpiresAt: booking.searchExpiresAt?.toISOString() ?? null,
    requestedAt: booking.requestedAt.toISOString(),
    acceptedAt: booking.acceptedAt?.toISOString() ?? null,
    startedAt: booking.startedAt?.toISOString() ?? null,
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    completedAt: booking.completedAt?.toISOString() ?? null,
    passengerAcknowledgedAt: booking.passengerAcknowledgedAt?.toISOString() ?? null,
    expiredAt: booking.expiredAt?.toISOString() ?? null,
    cancellationReason: booking.cancellationReason,
    cancellationActorType: booking.cancellationActorType ?? null,
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
  };
}

function decimalToNumber(value: { toNumber?: () => number } | number | string): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (typeof value.toNumber === 'function') return value.toNumber();
  return Number(value);
}
