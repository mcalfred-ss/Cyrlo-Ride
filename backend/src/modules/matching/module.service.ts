import { MATCHING_BATCH_SIZE } from '../../config/constants.js';
import { AppError } from '../../common/errors/app-error.js';
import { enqueueInAppNotification } from '../../infrastructure/notifications/notify.js';
import { publishRiderAvailabilityUpdated } from '../../infrastructure/realtime/publisher.js';
import type { AuditService } from '../audit/module.service.js';
import type { BookingsService } from '../bookings/module.service.js';
import { evaluateMatchingEligibility } from './matching-eligibility.js';
import {
  defaultCandidateOrderingStrategy,
  type CandidateOrderingStrategy,
  type MatchingCandidate,
} from './candidate-ordering.js';
import { offerExpiresAt, requireOfferResponseTimeoutSeconds } from './offer-timeout.js';
import type { MatchingRepository } from './module.repository.js';
import type { PrismaClient } from '@prisma/client';

export interface MatchingServiceDeps {
  audit: AuditService;
  prisma: PrismaClient;
  bookings: BookingsService;
  ordering?: CandidateOrderingStrategy;
  now?: () => Date;
  /** Injected override for tests; production reads env via requireOfferResponseTimeoutSeconds. */
  offerTimeoutSeconds?: number;
}

export interface MatchingService {
  dispatchForBooking(bookingId: string): Promise<{ offered: number; batchSequence: number }>;
  dispatchOpenBookings(): Promise<{ bookings: number; offers: number }>;
  expireOffersAndSearches(): Promise<{ timedOutOffers: number; expiredBookings: number }>;
  listMyPendingOffers(riderId: string): Promise<unknown>;
  acceptOffer(riderId: string, offerId: string, ip?: string): Promise<unknown>;
  rejectOffer(riderId: string, offerId: string, ip?: string): Promise<unknown>;
  getPassengerMatchingStatus(passengerId: string, bookingId: string): Promise<unknown>;
}

export class MatchingServiceImpl implements MatchingService {
  private readonly now: () => Date;
  private readonly ordering: CandidateOrderingStrategy;

  constructor(
    private readonly repository: MatchingRepository,
    private readonly deps: MatchingServiceDeps,
  ) {
    this.now = deps.now ?? (() => new Date());
    this.ordering = deps.ordering ?? defaultCandidateOrderingStrategy();
  }

  private offerTimeoutSeconds(): number {
    if (this.deps.offerTimeoutSeconds !== undefined) {
      if (this.deps.offerTimeoutSeconds <= 0) {
        throw new AppError({
          status: 503,
          code: 'SERVICE_UNAVAILABLE',
          message:
            'Matching dispatch is disabled until RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS is explicitly configured',
        });
      }
      return this.deps.offerTimeoutSeconds;
    }
    return requireOfferResponseTimeoutSeconds();
  }

  async dispatchForBooking(bookingId: string) {
    const timeoutSeconds = this.offerTimeoutSeconds();
    const now = this.now();
    const booking = await this.repository.findSearchingBooking(bookingId);
    if (!booking || booking.status !== 'SEARCHING') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Booking is not in SEARCHING',
      });
    }
    // Destination-free model: matching starts on SEARCHING without a prior connection fee.
    // GH₵1 is collected after acceptance via BookingsService.initiateConnectionFeeAfterAccept.
    if (!booking.serviceZoneId) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Booking has no pickup service zone',
      });
    }
    if (booking.searchExpiresAt && booking.searchExpiresAt.getTime() <= now.getTime()) {
      await this.expireSearch(bookingId);
      return { offered: 0, batchSequence: 0 };
    }

    const pending = await this.repository.countPendingOffers(bookingId);
    if (pending > 0) {
      return { offered: 0, batchSequence: 0 };
    }

    const excluded = await this.repository.getExcludedRiderIds(bookingId);
    const raw = await this.repository.loadMatchingCandidates({
      pickupZoneId: booking.serviceZoneId,
      vehicleCategory: booking.vehicleCategory,
      excludeRiderIds: excluded,
    });

    const pickup = {
      latitude: Number(booking.pickupLatitude),
      longitude: Number(booking.pickupLongitude),
    };

    const eligible: MatchingCandidate[] = [];
    for (const rider of raw) {
      if (!rider.location) continue;
      const result = evaluateMatchingEligibility(
        {
          userStatus: rider.user.status,
          riderVerificationStatus: rider.verificationStatus,
          hasApprovedVehicle: rider.vehicles.length > 0,
          hasApprovedVehicleForCategory: rider.vehicles.length > 0,
          hasApprovedActiveZone: true,
          hasApprovedActiveZoneForPickup: true,
          availability: rider.availability,
          onActiveTrip: rider.bookings.length > 0,
          tokenBalance: rider.wallet?.tokenBalance ?? 0,
          previouslyExcludedFromBooking: excluded.has(rider.userId),
          location: {
            sharingEnabled: rider.location.sharingEnabled,
            recordedAt: rider.location.recordedAt,
            receivedAt: rider.location.receivedAt,
            latitude: Number(rider.location.latitude),
            longitude: Number(rider.location.longitude),
          },
          pickup,
        },
        now,
      );
      if (!result.eligible || result.distanceMeters == null) continue;
      eligible.push({ riderId: rider.userId, distanceMeters: result.distanceMeters });
    }

    const ordered = this.ordering.order(eligible).slice(0, MATCHING_BATCH_SIZE);
    if (ordered.length === 0) {
      return { offered: 0, batchSequence: 0 };
    }

    const batchSequence = await this.repository.nextBatchSequence(bookingId);
    const expiresAt = offerExpiresAt(now, timeoutSeconds);
    const created = await this.repository.createOffers(
      ordered.map((candidate) => ({
        bookingId,
        riderId: candidate.riderId,
        batchSequence,
        expiresAt,
      })),
    );

    await this.deps.audit.record({
      action: 'matching.batch.created',
      entityType: 'booking',
      entityId: bookingId,
      metadata: {
        batchSequence,
        offered: created.length,
        ordering: this.ordering.name,
        // no coordinates
      },
    });

    for (const offer of created) {
      await this.deps.audit.record({
        action: 'matching.offer.created',
        entityType: 'booking_offer',
        entityId: offer.id,
        metadata: { bookingId, riderId: offer.riderId, batchSequence },
      });
      enqueueInAppNotification(this.deps.prisma, {
        userId: offer.riderId,
        title: 'New ride offer',
        body: 'A passenger nearby needs a ride. Respond before the offer expires.',
        data: { bookingId, offerId: offer.id, status: 'PENDING' },
      });
    }

    return { offered: created.length, batchSequence };
  }

  async dispatchOpenBookings() {
    const now = this.now();
    // Fail closed early if timeout unset.
    this.offerTimeoutSeconds();
    const due = await this.repository.listSearchingBookingsNeedingDispatch(now);
    let offers = 0;
    for (const row of due) {
      const result = await this.dispatchForBooking(row.id);
      offers += result.offered;
    }
    return { bookings: due.length, offers };
  }

  async expireOffersAndSearches() {
    const now = this.now();
    let timedOutOffers = 0;
    const expiredOffers = await this.repository.listPendingOffersPastDeadline(now);
    for (const offer of expiredOffers) {
      const ok = await this.repository.markOfferTimedOut(offer.id, now);
      if (!ok) continue;
      timedOutOffers += 1;
      await this.deps.audit.record({
        action: 'matching.offer.timed_out',
        entityType: 'booking_offer',
        entityId: offer.id,
        metadata: { bookingId: offer.bookingId, riderId: offer.riderId },
      });
      enqueueInAppNotification(this.deps.prisma, {
        userId: offer.riderId,
        title: 'Offer expired',
        body: 'The ride offer timed out before you responded.',
        data: { bookingId: offer.bookingId, offerId: offer.id, status: 'TIMED_OUT' },
      });
      // Immediately try next batch when a batch is exhausted.
      const pending = await this.repository.countPendingOffers(offer.bookingId);
      if (pending === 0) {
        await this.dispatchForBooking(offer.bookingId).catch(() => undefined);
      }
    }

    let expiredBookings = 0;
    const due = await this.repository.listSearchingBookingsDue(now);
    for (const row of due) {
      const expired = await this.expireSearch(row.id);
      if (expired) expiredBookings += 1;
    }
    return { timedOutOffers, expiredBookings };
  }

  async listMyPendingOffers(riderId: string) {
    const rows = await this.repository.listPendingOffersForRider(riderId);
    return rows.map((row) => ({
      offerId: row.id,
      bookingId: row.bookingId,
      status: row.status,
      batchSequence: row.batchSequence,
      offeredAt: row.offeredAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      booking: {
        id: row.booking.id,
        status: row.booking.status,
        vehicleCategory: row.booking.vehicleCategory,
        pickup: {
          latitude: Number(row.booking.pickupLatitude),
          longitude: Number(row.booking.pickupLongitude),
        },
        destination:
          row.booking.destinationLatitude != null &&
          row.booking.destinationLongitude != null
            ? {
                latitude: Number(row.booking.destinationLatitude),
                longitude: Number(row.booking.destinationLongitude),
              }
            : null,
        pickupLabel: row.booking.pickupLabel,
        destinationLabel: row.booking.destinationLabel,
        searchExpiresAt: row.booking.searchExpiresAt?.toISOString() ?? null,
      },
    }));
  }

  async acceptOffer(riderId: string, offerId: string, ip?: string) {
    const offer = await this.repository.findOfferForRider(offerId, riderId);
    if (!offer) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Offer not found' });
    }
    const now = this.now();
    // Re-check eligibility snapshot before transactional accept.
    const booking = offer.booking;
    if (!booking.serviceZoneId) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Booking has no pickup service zone',
      });
    }

    const rider = await this.deps.prisma.riderProfile.findUnique({
      where: { userId: riderId },
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
          where: { status: { in: ['ACCEPTED', 'IN_PROGRESS'] } },
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
      now,
    );
    if (!eligibility.eligible) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Rider is not eligible to accept',
        details: { reasons: eligibility.reasons },
      });
    }

    const { booking: accepted, invalidatedOffers } = await this.repository.acceptOfferAtomically({
      offerId,
      riderId,
      bookingId: booking.id,
      now,
    });

    await this.deps.audit.record({
      actorId: riderId,
      action: 'matching.offer.accepted',
      entityType: 'booking_offer',
      entityId: offerId,
      metadata: { bookingId: booking.id },
      ipAddress: ip,
    });
    await this.deps.audit.record({
      actorId: riderId,
      action: 'matching.booking.assigned',
      entityType: 'booking',
      entityId: booking.id,
      metadata: { riderId, offerId },
      ipAddress: ip,
    });
    await this.deps.audit.record({
      actorId: riderId,
      action: 'wallet.token.debited',
      entityType: 'booking',
      entityId: booking.id,
      metadata: { riderId, tokenDelta: -1 },
      ipAddress: ip,
    });

    for (const invalidated of invalidatedOffers) {
      await this.deps.audit.record({
        action: 'matching.offer.invalidated',
        entityType: 'booking_offer',
        entityId: invalidated.id,
        metadata: { bookingId: booking.id, reason: 'another_rider_accepted' },
      });
      enqueueInAppNotification(this.deps.prisma, {
        userId: invalidated.riderId,
        title: 'Offer no longer available',
        body: 'Another rider accepted this booking.',
        data: { bookingId: booking.id, offerId: invalidated.id, status: 'INVALIDATED' },
      });
    }

    enqueueInAppNotification(this.deps.prisma, {
      userId: booking.passengerId,
      title: 'Rider assigned',
      body: 'A rider accepted your request. Pay the GH₵1 Cyrlo connection fee, then agree destination and transport fare with your rider.',
      data: { bookingId: booking.id, status: 'ACCEPTED' },
    });
    publishRiderAvailabilityUpdated({
      riderId,
      availability: 'BUSY',
      updatedAt: now.toISOString(),
    });

    // PENDING fee row + paymentExpiresAt were committed with ACCEPTED.
    // Paystack init can fail; booking remains ACCEPTED until fee window expires.
    let connectionFee: unknown = null;
    let connectionFeeError: string | null = null;
    try {
      connectionFee = await this.deps.bookings.initiateConnectionFeeAfterAccept(
        booking.id,
        booking.passengerId,
      );
    } catch (error) {
      connectionFeeError =
        error instanceof Error
          ? error.message
          : 'Connection fee checkout failed; retry from the app before the fee window ends.';
    }

    return {
      bookingId: accepted.id,
      status: accepted.status,
      riderId: accepted.riderId,
      acceptedAt: accepted.acceptedAt?.toISOString() ?? now.toISOString(),
      connectionFee,
      connectionFeeError,
      paymentExpiresAt: accepted.paymentExpiresAt?.toISOString() ?? null,
    };
  }

  async rejectOffer(riderId: string, offerId: string, ip?: string) {
    const offer = await this.repository.findOfferForRider(offerId, riderId);
    if (!offer) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Offer not found' });
    }
    const now = this.now();
    if (offer.status !== 'PENDING') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: `Offer cannot be rejected from status ${offer.status}`,
      });
    }
    const ok = await this.repository.rejectOffer(offerId, riderId, now);
    if (!ok) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Offer could not be rejected',
      });
    }
    await this.deps.audit.record({
      actorId: riderId,
      action: 'matching.offer.rejected',
      entityType: 'booking_offer',
      entityId: offerId,
      metadata: { bookingId: offer.bookingId },
      ipAddress: ip,
    });

    const pending = await this.repository.countPendingOffers(offer.bookingId);
    if (pending === 0) {
      await this.dispatchForBooking(offer.bookingId).catch(() => undefined);
    }

    return { offerId, bookingId: offer.bookingId, status: 'REJECTED' };
  }

  async getPassengerMatchingStatus(passengerId: string, bookingId: string) {
    const booking = await this.repository.getMatchingStatusForPassenger(bookingId, passengerId);
    if (!booking) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Booking not found' });
    }
    return {
      bookingId: booking.id,
      status: booking.status,
      searchExpiresAt: booking.searchExpiresAt?.toISOString() ?? null,
      assignedRiderId: booking.riderId,
      acceptedAt: booking.acceptedAt?.toISOString() ?? null,
      offerSummary: {
        pending: booking.offers.filter((o) => o.status === 'PENDING').length,
        rejected: booking.offers.filter((o) => o.status === 'REJECTED').length,
        timedOut: booking.offers.filter((o) => o.status === 'TIMED_OUT').length,
        invalidated: booking.offers.filter((o) => o.status === 'INVALIDATED').length,
        accepted: booking.offers.filter((o) => o.status === 'ACCEPTED').length,
        latestBatchSequence: booking.offers[0]?.batchSequence ?? null,
      },
    };
  }

  private async expireSearch(bookingId: string) {
    const expired = await this.repository.expireSearchingBooking(bookingId, this.now());
    if (!expired) return false;
    await this.deps.audit.record({
      action: 'matching.search.expired',
      entityType: 'booking',
      entityId: bookingId,
    });
    for (const invalidated of expired.invalidatedOffers) {
      await this.deps.audit.record({
        action: 'matching.offer.invalidated',
        entityType: 'booking_offer',
        entityId: invalidated.id,
        metadata: { bookingId, reason: 'search_expired' },
      });
      enqueueInAppNotification(this.deps.prisma, {
        userId: invalidated.riderId,
        title: 'Offer no longer available',
        body: 'The passenger search window ended without an assignment.',
        data: { bookingId, offerId: invalidated.id, status: 'INVALIDATED' },
      });
    }
    const fee = expired.payments[0];
    if (fee) {
      // Legacy fee-before-search bookings only; destination-free SEARCHING has no fee yet.
      await this.deps.bookings.requestFeeRefund({
        paymentId: fee.id,
        bookingId,
        amountPesewas: fee.amountPesewas,
        reason: 'search_expired',
        authorizeForExecution: true,
      });
    }
    enqueueInAppNotification(this.deps.prisma, {
      userId: expired.passengerId,
      title: 'No rider found',
      body: fee
        ? 'The search window ended without an assigned rider. A connection-fee refund was queued.'
        : 'The search window ended without an assigned rider. Try again from a pickup in an active service zone.',
      data: { bookingId, status: 'EXPIRED' },
    });
    return true;
  }
}
