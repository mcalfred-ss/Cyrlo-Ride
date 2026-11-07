import { DISPUTE_WINDOW_MS } from '../../config/constants.js';
import { AppError } from '../../common/errors/app-error.js';
import { enqueueInAppNotification } from '../../infrastructure/notifications/notify.js';
import type { AuditService } from '../audit/module.service.js';
import type { BookingsService } from '../bookings/module.service.js';
import type {
  CreateDisputeInput,
  ListDisputesQuery,
  SupportRecommendationInput,
} from './module.schema.js';
import type { DisputesRepository } from './module.repository.js';
import type { PrismaClient } from '@prisma/client';

export interface DisputesServiceDeps {
  audit: AuditService;
  prisma: PrismaClient;
  bookings: BookingsService;
  now?: () => Date;
}

export interface DisputesService {
  submit(
    userId: string,
    role: string,
    bookingId: string,
    input: CreateDisputeInput,
    ip?: string,
  ): Promise<unknown>;
  listForSupport(query: ListDisputesQuery): Promise<unknown>;
  getForSupport(disputeId: string): Promise<unknown>;
  getTripGpsEvidence(actorId: string, bookingId: string, ip?: string): Promise<unknown>;
  recommendOnDispute(
    actorId: string,
    disputeId: string,
    input: SupportRecommendationInput,
    ip?: string,
  ): Promise<unknown>;
  listCancellationRequests(page: number, pageSize: number): Promise<unknown>;
  recommendOnCancellationRequest(
    actorId: string,
    requestId: string,
    input: SupportRecommendationInput,
    ip?: string,
  ): Promise<unknown>;
}

export class DisputesServiceImpl implements DisputesService {
  private readonly now: () => Date;

  constructor(
    private readonly repository: DisputesRepository,
    private readonly deps: DisputesServiceDeps,
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  async submit(
    userId: string,
    role: string,
    bookingId: string,
    input: CreateDisputeInput,
    ip?: string,
  ) {
    const booking = await this.repository.findBookingForDispute(bookingId);
    if (!booking) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Booking not found' });
    }
    const isPassenger = booking.passengerId === userId;
    const isRider = booking.riderId === userId;
    if (!isPassenger && !isRider) {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Only the passenger or assigned rider may dispute this booking',
      });
    }
    if (booking.status !== 'COMPLETED' && booking.status !== 'CANCELLED') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Disputes are only accepted after completion or cancellation',
      });
    }
    const anchor =
      booking.status === 'COMPLETED' ? booking.completedAt : booking.cancelledAt;
    if (!anchor) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Booking is missing a completion or cancellation timestamp',
      });
    }
    if (this.now().getTime() - anchor.getTime() > DISPUTE_WINDOW_MS) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Dispute window of 24 hours has expired',
      });
    }

    const submitterRole = isPassenger ? 'PASSENGER' : 'RIDER';
    if (role !== submitterRole && role !== 'RIDER' && role !== 'PASSENGER') {
      throw new AppError({ status: 403, code: 'FORBIDDEN', message: 'Invalid submitter role' });
    }

    const dispute = await this.repository.createDispute({
      bookingId,
      submittedById: userId,
      submitterRole,
      category: input.category,
      description: input.description,
    });

    await this.deps.audit.record({
      actorId: userId,
      action: 'dispute.submitted',
      entityType: 'dispute',
      entityId: dispute.id,
      metadata: { bookingId, category: input.category },
      ipAddress: ip,
    });

    await this.notifySupport(
      'New dispute submitted',
      'A passenger or rider opened a dispute for support review.',
      { bookingId, disputeId: dispute.id },
    );
    enqueueInAppNotification(this.deps.prisma, {
      userId,
      title: 'Dispute submitted',
      body: 'Support will review your dispute. This does not change booking or payment status by itself.',
      data: { bookingId, disputeId: dispute.id, status: 'OPEN' },
    });

    return {
      disputeId: dispute.id,
      bookingId,
      status: dispute.status,
      createdAt: dispute.createdAt.toISOString(),
    };
  }

  async listForSupport(query: ListDisputesQuery) {
    const { total, items } = await this.repository.listDisputes(query);
    return {
      items: items.map((row) => ({
        id: row.id,
        bookingId: row.bookingId,
        status: row.status,
        category: row.category,
        recommendation: row.recommendation,
        submittedById: row.submittedById,
        submitterRole: row.submitterRole,
        createdAt: row.createdAt.toISOString(),
        eventCount: row.events.length,
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        hasNextPage: query.page * query.pageSize < total,
      },
    };
  }

  async getForSupport(disputeId: string) {
    const dispute = await this.repository.findDispute(disputeId);
    if (!dispute) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Dispute not found' });
    }
    // Ghana Card / identity documents are intentionally omitted.
    return {
      id: dispute.id,
      bookingId: dispute.bookingId,
      status: dispute.status,
      category: dispute.category,
      description: dispute.description,
      recommendation: dispute.recommendation,
      recommendedById: dispute.recommendedById,
      resolutionNotes: dispute.resolutionNotes,
      refundId: dispute.refundId,
      submittedById: dispute.submittedById,
      submitterRole: dispute.submitterRole,
      createdAt: dispute.createdAt.toISOString(),
      resolvedAt: dispute.resolvedAt?.toISOString() ?? null,
      events: dispute.events.map((event) => ({
        id: event.id,
        action: event.action,
        actorId: event.actorId,
        notes: event.notes,
        createdAt: event.createdAt.toISOString(),
      })),
      evidence: {
        booking: {
          id: dispute.booking.id,
          status: dispute.booking.status,
          passengerId: dispute.booking.passengerId,
          riderId: dispute.booking.riderId,
          acceptedAt: dispute.booking.acceptedAt?.toISOString() ?? null,
          startedAt: dispute.booking.startedAt?.toISOString() ?? null,
          completedAt: dispute.booking.completedAt?.toISOString() ?? null,
          cancelledAt: dispute.booking.cancelledAt?.toISOString() ?? null,
          cancellationReason: dispute.booking.cancellationReason,
          cancellationActorType: dispute.booking.cancellationActorType,
        },
        statusHistory: dispute.booking.statusHistory.map((row) => ({
          fromStatus: row.fromStatus,
          toStatus: row.toStatus,
          actorType: row.actorType,
          actorId: row.actorId,
          reason: row.reason,
          createdAt: row.createdAt.toISOString(),
        })),
        payments: dispute.booking.payments,
        ledgerEntries: dispute.booking.ledgerEntries,
        tripLocationPointCount: dispute.booking.tripLocations.length,
        tripLocationTimestamps: dispute.booking.tripLocations.map((p) => ({
          id: p.id,
          recordedAt: p.recordedAt.toISOString(),
          receivedAt: p.receivedAt.toISOString(),
          accuracyMeters: p.accuracyMeters,
        })),
      },
    };
  }

  async getTripGpsEvidence(actorId: string, bookingId: string, ip?: string) {
    const points = await this.repository.findTripGpsEvidence(bookingId);
    await this.deps.audit.record({
      actorId,
      action: 'dispute.trip_gps.viewed',
      entityType: 'booking',
      entityId: bookingId,
      metadata: { pointCount: points.length },
      ipAddress: ip,
    });
    return {
      bookingId,
      points: points.map((p) => ({
        id: p.id,
        recordedAt: p.recordedAt.toISOString(),
        receivedAt: p.receivedAt.toISOString(),
        latitude: Number(p.latitude),
        longitude: Number(p.longitude),
        accuracyMeters: p.accuracyMeters == null ? null : Number(p.accuracyMeters),
        heading: p.heading == null ? null : Number(p.heading),
      })),
    };
  }

  async recommendOnDispute(
    actorId: string,
    disputeId: string,
    input: SupportRecommendationInput,
    ip?: string,
  ) {
    const dispute = await this.repository.findDispute(disputeId);
    if (!dispute) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Dispute not found' });
    }
    if (dispute.status === 'RESOLVED' || dispute.status === 'REJECTED') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Dispute is already closed',
      });
    }

    let refundId: string | null = dispute.refundId;
    let nextStatus: 'UNDER_REVIEW' | 'RESOLVED' | 'REJECTED' | 'ESCALATED' = 'UNDER_REVIEW';

    if (input.recommendation === 'ESCALATE') {
      nextStatus = 'ESCALATED';
    } else if (input.recommendation === 'NO_REFUND') {
      nextStatus = 'REJECTED';
    } else if (input.recommendation === 'REFUND_FEE') {
      // Support recommends only — queues a REQUESTED refund for Finance; does not execute.
      const fee = dispute.booking.payments.find(
        (p) => p.purpose === 'BOOKING_FEE' && p.status === 'SUCCESS',
      );
      if (!fee) {
        throw new AppError({
          status: 409,
          code: 'CONFLICT',
          message: 'No successful booking fee payment to recommend for refund',
        });
      }
      refundId = await this.deps.bookings.requestFeeRefund({
        paymentId: fee.id,
        bookingId: dispute.bookingId,
        amountPesewas: fee.amountPesewas,
        requestedById: actorId,
        reason: `dispute_recommendation:${disputeId}`,
      });
      nextStatus = 'RESOLVED';
    }

    const updated = await this.repository.applyRecommendation({
      disputeId,
      actorId,
      recommendation: input.recommendation,
      notes: input.notes,
      nextStatus,
      refundId,
    });

    await this.deps.audit.record({
      actorId,
      action: 'dispute.recommendation.recorded',
      entityType: 'dispute',
      entityId: disputeId,
      metadata: {
        recommendation: input.recommendation,
        refundId,
        // Monetary approval thresholds are unresolved — not invented here.
      },
      ipAddress: ip,
    });

    enqueueInAppNotification(this.deps.prisma, {
      userId: dispute.submittedById,
      title: 'Dispute updated',
      body: `Support recorded a ${input.recommendation} recommendation.`,
      data: {
        disputeId,
        bookingId: dispute.bookingId,
        status: updated.status,
        refundId,
        refundStatus: refundId ? 'REQUESTED' : null,
      },
    });

    return {
      disputeId: updated.id,
      status: updated.status,
      recommendation: updated.recommendation,
      refundId,
      refundExecuted: false,
    };
  }

  async listCancellationRequests(page: number, pageSize: number) {
    const { total, items } = await this.repository.listOpenCancellationRequests(page, pageSize);
    return {
      items: items.map((row) => ({
        id: row.id,
        bookingId: row.bookingId,
        passengerId: row.passengerId,
        reason: row.reason,
        status: row.status,
        recommendation: row.recommendation,
        createdAt: row.createdAt.toISOString(),
      })),
      pagination: { page, pageSize, total, hasNextPage: page * pageSize < total },
    };
  }

  async recommendOnCancellationRequest(
    actorId: string,
    requestId: string,
    input: SupportRecommendationInput,
    ip?: string,
  ) {
    const request = await this.repository.findCancellationRequest(requestId);
    if (!request) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Cancellation request not found' });
    }
    if (request.status === 'RESOLVED' || request.status === 'DECLINED') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Cancellation request is already closed',
      });
    }

    let refundId: string | null = request.refundId;
    let status: 'UNDER_REVIEW' | 'RESOLVED' | 'DECLINED' | 'ESCALATED' = 'UNDER_REVIEW';

    if (input.recommendation === 'ESCALATE') {
      status = 'ESCALATED';
    } else if (input.recommendation === 'NO_REFUND') {
      status = 'DECLINED';
    } else if (input.recommendation === 'REFUND_FEE') {
      const fee = await this.deps.prisma.payment.findFirst({
        where: {
          bookingId: request.bookingId,
          purpose: 'BOOKING_FEE',
          status: 'SUCCESS',
        },
      });
      if (!fee) {
        throw new AppError({
          status: 409,
          code: 'CONFLICT',
          message: 'No successful booking fee payment to recommend for refund',
        });
      }
      refundId = await this.deps.bookings.requestFeeRefund({
        paymentId: fee.id,
        bookingId: request.bookingId,
        amountPesewas: fee.amountPesewas,
        requestedById: actorId,
        reason: `passenger_cancel_review:${requestId}`,
      });
      status = 'RESOLVED';
    }

    if (input.cancelBooking) {
      const booking = request.booking;
      if (booking.status === 'ACCEPTED' || booking.status === 'IN_PROGRESS') {
        await this.deps.prisma.$transaction(async (tx) => {
          const updated = await tx.booking.updateMany({
            where: {
              id: request.bookingId,
              status: { in: ['ACCEPTED', 'IN_PROGRESS'] },
            },
            data: {
              status: 'CANCELLED',
              cancelledAt: this.now(),
              cancellationReason: request.reason,
              cancellationActorType: 'ADMIN',
            },
          });
          if (updated.count === 1) {
            await tx.bookingStatusHistory.create({
              data: {
                bookingId: request.bookingId,
                fromStatus: booking.status,
                toStatus: 'CANCELLED',
                actorType: 'ADMIN',
                actorId: actorId,
                reason: 'support_passenger_cancel_review',
              },
            });
            if (booking.riderId) {
              const active = await tx.booking.findFirst({
                where: {
                  riderId: booking.riderId,
                  status: { in: ['ACCEPTED', 'IN_PROGRESS'] },
                },
              });
              if (!active) {
                await tx.riderProfile.updateMany({
                  where: { userId: booking.riderId, availability: 'BUSY' },
                  data: { availability: 'AVAILABLE' },
                });
              }
            }
          }
        });
        // No automatic fee/token movement — policy is support-review only.
      }
    }

    const updated = await this.repository.updateCancellationRequest({
      requestId,
      status,
      recommendation: input.recommendation,
      recommendedById: actorId,
      resolutionNotes: input.notes,
      refundId,
    });

    await this.deps.audit.record({
      actorId,
      action: 'booking.passenger.cancel_request.reviewed',
      entityType: 'booking_cancellation_request',
      entityId: requestId,
      metadata: {
        recommendation: input.recommendation,
        refundId,
        cancelBooking: Boolean(input.cancelBooking),
      },
      ipAddress: ip,
    });

    enqueueInAppNotification(this.deps.prisma, {
      userId: request.passengerId,
      title: 'Cancellation request updated',
      body: `Support recorded a ${input.recommendation} recommendation.`,
      data: {
        requestId,
        bookingId: request.bookingId,
        status: updated.status,
        refundId,
        refundStatus: refundId ? 'REQUESTED' : null,
      },
    });

    return {
      requestId: updated.id,
      status: updated.status,
      recommendation: updated.recommendation,
      refundId,
      refundExecuted: false,
    };
  }

  private async notifySupport(title: string, body: string, data: Record<string, unknown>) {
    const grants = await this.deps.prisma.adminRoleGrant.findMany({
      where: {
        revokedAt: null,
        staffRole: { in: ['SUPPORT_ADMIN', 'SUPER_ADMIN'] },
      },
      select: { userId: true },
    });
    for (const userId of new Set(grants.map((g) => g.userId))) {
      enqueueInAppNotification(this.deps.prisma, {
        userId,
        title,
        body,
        data,
      });
    }
  }
}
