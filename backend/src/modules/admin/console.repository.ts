import type { BookingStatus, PaymentStatus, Prisma, PrismaClient, UserStatus } from '@prisma/client';

import { RIDER_LOCATION_MAX_AGE_MS } from '../../config/constants.js';

export interface ConsoleListPage<T> {
  total: number;
  items: T[];
}

/** Private to the admin module. */
export class AdminConsoleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  protected database(): PrismaClient {
    return this.prisma;
  }

  async countPassengers(status?: UserStatus) {
    return this.prisma.user.count({
      where: { role: 'PASSENGER', ...(status ? { status } : {}) },
    });
  }

  async countRiders() {
    return this.prisma.user.count({ where: { role: 'RIDER' } });
  }

  async countPendingRiderApplications() {
    return this.prisma.riderProfile.count({
      where: { verificationStatus: 'PENDING_REVIEW' },
    });
  }

  /**
   * Approximate “available” supply for dashboards: APPROVED + AVAILABLE + fresh GPS.
   * Does not re-run full matching eligibility (tokens/zones) — documented as approximate.
   */
  async countAvailableRidersApprox(now: Date) {
    const freshAfter = new Date(now.getTime() - RIDER_LOCATION_MAX_AGE_MS);
    return this.prisma.riderProfile.count({
      where: {
        verificationStatus: 'APPROVED',
        availability: 'AVAILABLE',
        user: { status: 'ACTIVE', role: 'RIDER' },
        location: {
          is: {
            sharingEnabled: true,
            receivedAt: { gte: freshAfter },
          },
        },
      },
    });
  }

  async countBookingsByStatus(input: { from?: Date; to?: Date } = {}) {
    const where: Prisma.BookingWhereInput =
      input.from || input.to
        ? {
            createdAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {}),
            },
          }
        : {};
    const rows = await this.prisma.booking.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const byStatus: Record<string, number> = {};
    for (const row of rows) {
      byStatus[row.status] = row._count._all;
    }
    return byStatus;
  }

  async sumBookingFeePayments(input: {
    status?: PaymentStatus | PaymentStatus[];
    from?: Date;
    to?: Date;
  }) {
    const statusFilter = input.status
      ? Array.isArray(input.status)
        ? { in: input.status }
        : input.status
      : undefined;
    const where: Prisma.PaymentWhereInput = {
      purpose: 'BOOKING_FEE',
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(input.from || input.to
        ? {
            createdAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {}),
            },
          }
        : {}),
    };
    const aggregate = await this.prisma.payment.aggregate({
      where,
      _sum: { amountPesewas: true },
      _count: { _all: true },
    });
    return {
      count: aggregate._count._all,
      amountPesewas: aggregate._sum.amountPesewas ?? 0,
    };
  }

  async countRefundsByStatus(input: { from?: Date; to?: Date } = {}) {
    const where: Prisma.PaymentRefundWhereInput =
      input.from || input.to
        ? {
            createdAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {}),
            },
          }
        : {};
    const rows = await this.prisma.paymentRefund.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const byStatus: Record<string, number> = {};
    for (const row of rows) {
      byStatus[row.status] = row._count._all;
    }
    return byStatus;
  }

  /** Refund amounts (pesewas) by status for period financial clarity. */
  async sumRefundsByStatus(input: { from?: Date; to?: Date } = {}) {
    const where: Prisma.PaymentRefundWhereInput =
      input.from || input.to
        ? {
            createdAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {}),
            },
          }
        : {};
    const rows = await this.prisma.paymentRefund.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
      _sum: { amountPesewas: true },
    });
    const byStatus: Record<string, { count: number; amountPesewas: number }> = {};
    for (const row of rows) {
      byStatus[row.status] = {
        count: row._count._all,
        amountPesewas: row._sum.amountPesewas ?? 0,
      };
    }
    return byStatus;
  }

  async sumTokenPurchases(input: { from?: Date; to?: Date }) {
    const where: Prisma.PaymentWhereInput = {
      purpose: 'TOKEN_PURCHASE',
      status: 'SUCCESS',
      ...(input.from || input.to
        ? {
            createdAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {}),
            },
          }
        : {}),
    };
    const aggregate = await this.prisma.payment.aggregate({
      where,
      _sum: { amountPesewas: true },
      _count: { _all: true },
    });
    const deductions = await this.prisma.tokenLedgerEntry.aggregate({
      where: {
        type: 'DEDUCTION',
        ...(input.from || input.to
          ? {
              createdAt: {
                ...(input.from ? { gte: input.from } : {}),
                ...(input.to ? { lte: input.to } : {}),
              },
            }
          : {}),
      },
      _sum: { tokenDelta: true },
      _count: { _all: true },
    });
    return {
      purchaseCount: aggregate._count._all,
      purchaseAmountPesewas: aggregate._sum.amountPesewas ?? 0,
      deductionCount: deductions._count._all,
      /** Absolute sum of deduction token deltas (tokens spent). */
      tokensDeducted: Math.abs(deductions._sum.tokenDelta ?? 0),
    };
  }

  async listPassengers(input: {
    page: number;
    pageSize: number;
    q?: string;
    status?: UserStatus;
  }): Promise<ConsoleListPage<{
    id: string;
    phoneNumber: string;
    status: UserStatus;
    displayName: string | null;
    createdAt: Date;
    fullName: string | null;
  }>> {
    const where: Prisma.UserWhereInput = {
      role: 'PASSENGER',
      ...(input.status ? { status: input.status } : {}),
      ...(input.q
        ? {
            OR: [
              { phoneNumber: { contains: input.q } },
              { displayName: { contains: input.q, mode: 'insensitive' } },
              {
                passengerProfile: {
                  fullName: { contains: input.q, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          phoneNumber: true,
          status: true,
          displayName: true,
          createdAt: true,
          passengerProfile: { select: { fullName: true } },
        },
      }),
    ]);
    return {
      total,
      items: rows.map((row) => ({
        id: row.id,
        phoneNumber: row.phoneNumber,
        status: row.status,
        displayName: row.displayName,
        createdAt: row.createdAt,
        fullName: row.passengerProfile?.fullName ?? null,
      })),
    };
  }

  async findPassenger(passengerId: string) {
    return this.prisma.user.findFirst({
      where: { id: passengerId, role: 'PASSENGER' },
      select: {
        id: true,
        phoneNumber: true,
        status: true,
        displayName: true,
        createdAt: true,
        updatedAt: true,
        passengerProfile: {
          select: {
            fullName: true,
            dateOfBirth: true,
            gender: true,
            homeLocation: true,
          },
        },
      },
    });
  }

  async listPassengerBookings(passengerId: string, page: number, pageSize: number) {
    const where = { passengerId };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          status: true,
          vehicleCategory: true,
          bookingFeePesewas: true,
          pickupLabel: true,
          createdAt: true,
          acceptedAt: true,
          cancelledAt: true,
          completedAt: true,
          cancellationReason: true,
          riderId: true,
        },
      }),
    ]);
    return { total, items };
  }

  async listPassengerCancellations(passengerId: string, page: number, pageSize: number) {
    const where = { passengerId };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.bookingCancellationRequest.count({ where }),
      this.prisma.bookingCancellationRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          bookingId: true,
          reason: true,
          status: true,
          recommendation: true,
          createdAt: true,
          resolvedAt: true,
        },
      }),
    ]);
    return { total, items };
  }

  async listBookings(input: {
    page: number;
    pageSize: number;
    status?: BookingStatus;
    passengerId?: string;
    riderId?: string;
    serviceZoneId?: string;
    from?: Date;
    to?: Date;
  }) {
    const where: Prisma.BookingWhereInput = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.passengerId ? { passengerId: input.passengerId } : {}),
      ...(input.riderId ? { riderId: input.riderId } : {}),
      ...(input.serviceZoneId ? { serviceZoneId: input.serviceZoneId } : {}),
      ...(input.from || input.to
        ? {
            createdAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {}),
            },
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          status: true,
          vehicleCategory: true,
          passengerId: true,
          riderId: true,
          serviceZoneId: true,
          // Exact lat/lng intentionally omitted — ordinary booking history privacy.
          pickupLabel: true,
          bookingFeePesewas: true,
          paymentExpiresAt: true,
          searchExpiresAt: true,
          createdAt: true,
          acceptedAt: true,
          startedAt: true,
          cancelledAt: true,
          completedAt: true,
          cancellationReason: true,
          passenger: {
            select: { id: true, phoneNumber: true, displayName: true, status: true },
          },
          rider: {
            select: {
              userId: true,
              fullName: true,
              user: { select: { phoneNumber: true, status: true } },
            },
          },
          payments: {
            where: { purpose: 'BOOKING_FEE' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              status: true,
              amountPesewas: true,
              currency: true,
              providerReference: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);
    return { total, items };
  }

  async findBooking(bookingId: string) {
    return this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        vehicleCategory: true,
        passengerId: true,
        riderId: true,
        serviceZoneId: true,
        // Exact pickup/destination lat/lng omitted from ordinary admin booking history.
        pickupLabel: true,
        destinationLabel: true,
        bookingFeePesewas: true,
        paymentExpiresAt: true,
        searchExpiresAt: true,
        createdAt: true,
        acceptedAt: true,
        startedAt: true,
        cancelledAt: true,
        completedAt: true,
        cancellationReason: true,
        cancellationActorType: true,
        passenger: {
          select: { id: true, phoneNumber: true, displayName: true, status: true },
        },
        rider: {
          select: {
            userId: true,
            fullName: true,
            availability: true,
            user: { select: { phoneNumber: true, status: true } },
          },
        },
        serviceZone: { select: { id: true, name: true, status: true, isActive: true } },
        payments: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            purpose: true,
            status: true,
            amountPesewas: true,
            currency: true,
            providerReference: true,
            createdAt: true,
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          select: {
            fromStatus: true,
            toStatus: true,
            actorType: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async listAuditLogs(input: {
    page: number;
    pageSize: number;
    actorId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    from?: Date;
    to?: Date;
  }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(input.actorId ? { actorId: input.actorId } : {}),
      ...(input.action ? { action: { contains: input.action, mode: 'insensitive' } } : {}),
      ...(input.entityType ? { entityType: input.entityType } : {}),
      ...(input.entityId ? { entityId: input.entityId } : {}),
      ...(input.from || input.to
        ? {
            createdAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {}),
            },
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          actorId: true,
          action: true,
          entityType: true,
          entityId: true,
          metadata: true,
          ipAddress: true,
          createdAt: true,
          actor: { select: { id: true, displayName: true, role: true } },
        },
      }),
    ]);
    return { total, items };
  }
}
