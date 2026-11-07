import { randomUUID } from 'node:crypto';

import type { DisputeStatus, PrismaClient, SupportRecommendation } from '@prisma/client';

/** Private to the disputes module. */
export class DisputesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  protected database(): PrismaClient {
    return this.prisma;
  }

  async findBookingForDispute(bookingId: string) {
    return this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        passengerId: true,
        riderId: true,
        status: true,
        completedAt: true,
        cancelledAt: true,
        cancellationReason: true,
        cancellationActorType: true,
      },
    });
  }

  async createDispute(input: {
    bookingId: string;
    submittedById: string;
    submitterRole: string;
    category: string;
    description: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const dispute = await tx.dispute.create({
        data: {
          id: randomUUID(),
          bookingId: input.bookingId,
          submittedById: input.submittedById,
          submitterRole: input.submitterRole,
          category: input.category,
          description: input.description,
          status: 'OPEN',
        },
      });
      await tx.disputeEvent.create({
        data: {
          id: randomUUID(),
          disputeId: dispute.id,
          actorId: input.submittedById,
          action: 'submitted',
          notes: input.category,
        },
      });
      return dispute;
    });
  }

  async listDisputes(input: {
    status?: DisputeStatus;
    page: number;
    pageSize: number;
  }) {
    const where = input.status ? { status: input.status } : {};
    const [total, items] = await this.prisma.$transaction([
      this.prisma.dispute.count({ where }),
      this.prisma.dispute.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: {
          events: { orderBy: { createdAt: 'asc' }, take: 20 },
        },
      }),
    ]);
    return { total, items };
  }

  async findDispute(disputeId: string) {
    return this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        events: { orderBy: { createdAt: 'asc' } },
        booking: {
          select: {
            id: true,
            status: true,
            passengerId: true,
            riderId: true,
            completedAt: true,
            cancelledAt: true,
            cancellationReason: true,
            cancellationActorType: true,
            startedAt: true,
            acceptedAt: true,
            statusHistory: { orderBy: { createdAt: 'asc' } },
            payments: {
              select: {
                id: true,
                purpose: true,
                amountPesewas: true,
                currency: true,
                status: true,
                createdAt: true,
                refunds: {
                  select: {
                    id: true,
                    status: true,
                    amountPesewas: true,
                    reason: true,
                    createdAt: true,
                  },
                },
              },
            },
            ledgerEntries: {
              select: {
                id: true,
                type: true,
                tokenDelta: true,
                balanceAfter: true,
                reason: true,
                reversesEntryId: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'asc' },
            },
            tripLocations: {
              select: {
                id: true,
                recordedAt: true,
                receivedAt: true,
                accuracyMeters: true,
                // Precise coordinates omitted from default select; loaded only via GPS evidence endpoint.
              },
              orderBy: { recordedAt: 'asc' },
              take: 200,
            },
          },
        },
      },
    });
  }

  async findTripGpsEvidence(bookingId: string) {
    return this.prisma.tripLocationPoint.findMany({
      where: { bookingId },
      orderBy: { recordedAt: 'asc' },
      take: 500,
      select: {
        id: true,
        recordedAt: true,
        receivedAt: true,
        latitude: true,
        longitude: true,
        accuracyMeters: true,
        heading: true,
      },
    });
  }

  async applyRecommendation(input: {
    disputeId: string;
    actorId: string;
    recommendation: SupportRecommendation;
    notes?: string | null;
    nextStatus: DisputeStatus;
    refundId?: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const dispute = await tx.dispute.update({
        where: { id: input.disputeId },
        data: {
          recommendation: input.recommendation,
          recommendedById: input.actorId,
          resolutionNotes: input.notes ?? null,
          status: input.nextStatus,
          refundId: input.refundId ?? undefined,
          resolvedAt:
            input.nextStatus === 'RESOLVED' ||
            input.nextStatus === 'REJECTED' ||
            input.nextStatus === 'ESCALATED'
              ? new Date()
              : null,
        },
      });
      await tx.disputeEvent.create({
        data: {
          id: randomUUID(),
          disputeId: input.disputeId,
          actorId: input.actorId,
          action: `recommendation:${input.recommendation}`,
          notes: input.notes ?? null,
        },
      });
      return dispute;
    });
  }

  async findCancellationRequest(requestId: string) {
    return this.prisma.bookingCancellationRequest.findUnique({
      where: { id: requestId },
      include: {
        booking: {
          select: {
            id: true,
            status: true,
            passengerId: true,
            riderId: true,
          },
        },
      },
    });
  }

  async listOpenCancellationRequests(page: number, pageSize: number) {
    const where = { status: { in: ['OPEN' as const, 'UNDER_REVIEW' as const] } };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.bookingCancellationRequest.count({ where }),
      this.prisma.bookingCancellationRequest.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, items };
  }

  async updateCancellationRequest(input: {
    requestId: string;
    status: 'UNDER_REVIEW' | 'RESOLVED' | 'DECLINED' | 'ESCALATED';
    recommendation: SupportRecommendation;
    recommendedById: string;
    resolutionNotes?: string | null;
    refundId?: string | null;
  }) {
    return this.prisma.bookingCancellationRequest.update({
      where: { id: input.requestId },
      data: {
        status: input.status,
        recommendation: input.recommendation,
        recommendedById: input.recommendedById,
        resolutionNotes: input.resolutionNotes ?? null,
        refundId: input.refundId ?? undefined,
        resolvedAt:
          input.status === 'RESOLVED' ||
          input.status === 'DECLINED' ||
          input.status === 'ESCALATED'
            ? new Date()
            : null,
      },
    });
  }
}
