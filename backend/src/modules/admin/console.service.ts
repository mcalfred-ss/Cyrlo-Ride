import { AppError } from '../../common/errors/app-error.js';
import { paginationMeta } from '../../common/utils/pagination.js';
import { BOOKING_FEE_PESEWAS } from '../../config/constants.js';
import type {
  AnalyticsQuery,
  ListAdminBookingsQuery,
  ListAuditLogsQuery,
  ListPassengersQuery,
} from './console.schema.js';
import type { AdminConsoleRepository } from './console.repository.js';

/**
 * Analytics date filters use inclusive UTC bounds on record `createdAt`
 * (`gte` from, `lte` to). Clients should send ISO-8601 with explicit offset
 * (prefer `Z`). Snapshot metrics ignore the window.
 */
export const ANALYTICS_DATE_RANGE_SEMANTICS = {
  timezone: 'UTC',
  boundInclusivity: 'inclusive',
  field: 'createdAt',
  interpretation:
    'from/to are inclusive UTC instants applied to period metrics via createdAt; snapshot metrics are current-state and ignore the window.',
} as const;

function parseOptionalDate(value: string | undefined, label: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: `Invalid ${label} datetime`,
    });
  }
  return date;
}

function assertRange(from?: Date, to?: Date) {
  if (from && to && from.getTime() > to.getTime()) {
    throw new AppError({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: '`from` must be before or equal to `to`',
    });
  }
}

/** Read-only admin console aggregates and listings. */
export class AdminConsoleService {
  constructor(
    private readonly repository: AdminConsoleRepository,
    private readonly deps: { now?: () => Date } = {},
  ) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  async getAnalytics(query: AnalyticsQuery) {
    const from = parseOptionalDate(query.from, 'from');
    const to = parseOptionalDate(query.to, 'to');
    assertRange(from, to);
    const now = this.now();
    const periodFilter = { from, to };

    const [
      totalPassengers,
      activePassengers,
      suspendedPassengers,
      registeredRiders,
      availableRidersApprox,
      pendingRiderApplications,
      bookingsByStatus,
      feeSuccess,
      feePending,
      feeFailed,
      refundsByStatus,
      tokenStats,
    ] = await Promise.all([
      this.repository.countPassengers(),
      this.repository.countPassengers('ACTIVE'),
      this.repository.countPassengers('SUSPENDED'),
      this.repository.countRiders(),
      this.repository.countAvailableRidersApprox(now),
      this.repository.countPendingRiderApplications(),
      this.repository.countBookingsByStatus(periodFilter),
      this.repository.sumBookingFeePayments({ status: 'SUCCESS', ...periodFilter }),
      this.repository.sumBookingFeePayments({ status: 'PENDING', ...periodFilter }),
      this.repository.sumBookingFeePayments({ status: 'FAILED', ...periodFilter }),
      this.repository.sumRefundsByStatus(periodFilter),
      this.repository.sumTokenPurchases(periodFilter),
    ]);

    const completedConnections = bookingsByStatus.COMPLETED ?? 0;

    return {
      generatedAt: now.toISOString(),
      dateRange: {
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
        ...ANALYTICS_DATE_RANGE_SEMANTICS,
      },
      /**
       * Current-state metrics. Ignore `from`/`to`.
       * Not historical counts for the selected window.
       */
      snapshot: {
        passengers: {
          total: totalPassengers,
          active: activePassengers,
          suspended: suspendedPassengers,
        },
        riders: {
          registered: registeredRiders,
          /** APPROVED + AVAILABLE + fresh GPS; not full matching eligibility. */
          availableApprox: availableRidersApprox,
          pendingApplications: pendingRiderApplications,
        },
      },
      /**
       * Period metrics. When `from`/`to` are set, every series below is filtered
       * on createdAt with inclusive UTC bounds. When unset, all-time.
       */
      period: {
        bookings: {
          byStatus: bookingsByStatus,
          completedConnections,
        },
        connectionFees: {
          unitPesewas: BOOKING_FEE_PESEWAS,
          currency: 'GHS',
          /** Cyrlo connection fee only — never transport fare. Gross SUCCESS sum. */
          collected: feeSuccess,
          pending: feePending,
          failed: feeFailed,
        },
        refunds: {
          byStatus: refundsByStatus,
        },
        tokens: {
          purchases: {
            count: tokenStats.purchaseCount,
            amountPesewas: tokenStats.purchaseAmountPesewas,
            currency: 'GHS',
          },
          usage: {
            deductionCount: tokenStats.deductionCount,
            tokensDeducted: tokenStats.tokensDeducted,
          },
        },
      },
      exclusions: {
        transportationFareRevenue: false,
        note: 'Cyrlo does not collect transportation fares; aggregates exclude fare revenue.',
        abandonedBookingFeePayments:
          'ABANDONED booking-fee payments are not included in period.connectionFees buckets.',
      },
    };
  }

  /** Finance-focused slice (ViewFinancialReports). Same period/snapshot split. */
  async getFinancialReport(query: AnalyticsQuery) {
    const analytics = await this.getAnalytics(query);
    return {
      generatedAt: analytics.generatedAt,
      dateRange: analytics.dateRange,
      snapshot: {
        note: 'Financial report does not include passenger/rider snapshot KPIs.',
      },
      period: {
        connectionFees: analytics.period.connectionFees,
        refunds: analytics.period.refunds,
        tokens: analytics.period.tokens,
        completedConnections: analytics.period.bookings.completedConnections,
      },
      exclusions: analytics.exclusions,
    };
  }

  async listPassengers(query: ListPassengersQuery) {
    const { total, items } = await this.repository.listPassengers({
      page: query.page,
      pageSize: query.pageSize,
      q: query.q,
      status: query.status,
    });
    return {
      items: items.map((row) => ({
        id: row.id,
        phoneNumber: row.phoneNumber,
        status: row.status,
        displayName: row.displayName,
        fullName: row.fullName,
        createdAt: row.createdAt.toISOString(),
      })),
      pagination: paginationMeta(query.page, query.pageSize, total),
    };
  }

  async getPassenger(passengerId: string) {
    const row = await this.repository.findPassenger(passengerId);
    if (!row) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Passenger not found' });
    }
    return {
      id: row.id,
      phoneNumber: row.phoneNumber,
      status: row.status,
      displayName: row.displayName,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      profile: row.passengerProfile
        ? {
            fullName: row.passengerProfile.fullName,
            dateOfBirth: row.passengerProfile.dateOfBirth?.toISOString().slice(0, 10) ?? null,
            gender: row.passengerProfile.gender,
            homeLocation: row.passengerProfile.homeLocation,
          }
        : null,
    };
  }

  async listPassengerBookings(passengerId: string, page: number, pageSize: number) {
    await this.requirePassenger(passengerId);
    const { total, items } = await this.repository.listPassengerBookings(
      passengerId,
      page,
      pageSize,
    );
    return {
      items: items.map((row) => ({
        id: row.id,
        status: row.status,
        vehicleCategory: row.vehicleCategory,
        bookingFeePesewas: row.bookingFeePesewas,
        pickupLabel: row.pickupLabel,
        riderId: row.riderId,
        createdAt: row.createdAt.toISOString(),
        acceptedAt: row.acceptedAt?.toISOString() ?? null,
        cancelledAt: row.cancelledAt?.toISOString() ?? null,
        completedAt: row.completedAt?.toISOString() ?? null,
        cancellationReason: row.cancellationReason,
        exactCoordinatesIncluded: false,
      })),
      pagination: paginationMeta(page, pageSize, total),
      privacy: {
        exactCoordinatesIncluded: false,
        note: 'Ordinary booking history omits exact lat/lng. Precise location needs a separate product/security decision (e.g. trip-gps).',
      },
    };
  }

  async listPassengerCancellations(passengerId: string, page: number, pageSize: number) {
    await this.requirePassenger(passengerId);
    const { total, items } = await this.repository.listPassengerCancellations(
      passengerId,
      page,
      pageSize,
    );
    return {
      items: items.map((row) => ({
        id: row.id,
        bookingId: row.bookingId,
        reason: row.reason,
        status: row.status,
        recommendation: row.recommendation,
        createdAt: row.createdAt.toISOString(),
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
      })),
      pagination: paginationMeta(page, pageSize, total),
    };
  }

  async listBookings(query: ListAdminBookingsQuery) {
    const from = parseOptionalDate(query.from, 'from');
    const to = parseOptionalDate(query.to, 'to');
    assertRange(from, to);
    const { total, items } = await this.repository.listBookings({
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      passengerId: query.passengerId,
      riderId: query.riderId,
      serviceZoneId: query.serviceZoneId,
      from,
      to,
    });
    return {
      items: items.map((row) => this.toBookingListItem(row)),
      pagination: paginationMeta(query.page, query.pageSize, total),
      privacy: {
        exactCoordinatesIncluded: false,
        note: 'Ordinary booking history omits exact lat/lng for all staff roles. Precise location requires a separate product/security decision (existing trip-gps is MFA-gated).',
      },
    };
  }

  async getBooking(bookingId: string) {
    const row = await this.repository.findBooking(bookingId);
    if (!row) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Booking not found' });
    }
    return {
      ...this.toBookingListItem(row),
      destinationLabel: row.destinationLabel,
      cancellationActorType: row.cancellationActorType,
      serviceZone: row.serviceZone
        ? {
            id: row.serviceZone.id,
            name: row.serviceZone.name,
            status: row.serviceZone.status,
            isActive: row.serviceZone.isActive,
          }
        : null,
      payments: row.payments.map((payment) => ({
        id: payment.id,
        purpose: payment.purpose,
        status: payment.status,
        amountPesewas: payment.amountPesewas,
        currency: payment.currency,
        providerReference: payment.providerReference,
        createdAt: payment.createdAt.toISOString(),
      })),
      statusHistory: row.statusHistory.map((entry) => ({
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        actorType: entry.actorType,
        createdAt: entry.createdAt.toISOString(),
      })),
      privacy: {
        exactCoordinatesIncluded: false,
        note: 'Ordinary booking detail omits exact lat/lng. Use MFA-gated trip-gps when product authorizes precise trails.',
      },
    };
  }

  async listAuditLogs(query: ListAuditLogsQuery) {
    const from = parseOptionalDate(query.from, 'from');
    const to = parseOptionalDate(query.to, 'to');
    assertRange(from, to);
    const { total, items } = await this.repository.listAuditLogs({
      page: query.page,
      pageSize: query.pageSize,
      actorId: query.actorId,
      action: query.action,
      entityType: query.entityType,
      entityId: query.entityId,
      from,
      to,
    });
    return {
      items: items.map((row) => ({
        id: row.id,
        actorId: row.actorId,
        actor: row.actor
          ? {
              id: row.actor.id,
              displayName: row.actor.displayName,
              role: row.actor.role,
            }
          : null,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        metadata: row.metadata,
        ipAddress: row.ipAddress,
        createdAt: row.createdAt.toISOString(),
      })),
      pagination: paginationMeta(query.page, query.pageSize, total),
    };
  }

  private async requirePassenger(passengerId: string) {
    const row = await this.repository.findPassenger(passengerId);
    if (!row) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Passenger not found' });
    }
    return row;
  }

  private toBookingListItem(row: {
    id: string;
    status: string;
    vehicleCategory: string;
    passengerId: string;
    riderId: string | null;
    serviceZoneId: string | null;
    pickupLabel: string | null;
    bookingFeePesewas: number;
    paymentExpiresAt: Date | null;
    searchExpiresAt: Date | null;
    createdAt: Date;
    acceptedAt: Date | null;
    startedAt: Date | null;
    cancelledAt: Date | null;
    completedAt: Date | null;
    cancellationReason: string | null;
    passenger: {
      id: string;
      phoneNumber: string;
      displayName: string | null;
      status: string;
    };
    rider: {
      userId: string;
      fullName: string;
      user: { phoneNumber: string; status: string };
    } | null;
    payments: Array<{
      id: string;
      status: string;
      amountPesewas: number;
      currency: string;
      providerReference: string | null;
      createdAt: Date;
      purpose?: string;
    }>;
  }) {
    const latestFee =
      row.payments.find((payment) =>
        'purpose' in payment ? payment.purpose === 'BOOKING_FEE' : true,
      ) ??
      row.payments[0] ??
      null;
    return {
      id: row.id,
      status: row.status,
      vehicleCategory: row.vehicleCategory,
      passengerId: row.passengerId,
      riderId: row.riderId,
      serviceZoneId: row.serviceZoneId,
      pickupLabel: row.pickupLabel,
      bookingFeePesewas: row.bookingFeePesewas,
      paymentExpiresAt: row.paymentExpiresAt?.toISOString() ?? null,
      searchExpiresAt: row.searchExpiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      startedAt: row.startedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      cancellationReason: row.cancellationReason,
      exactCoordinatesIncluded: false,
      passenger: {
        id: row.passenger.id,
        phoneNumber: row.passenger.phoneNumber,
        displayName: row.passenger.displayName,
        status: row.passenger.status,
      },
      rider: row.rider
        ? {
            id: row.rider.userId,
            fullName: row.rider.fullName,
            phoneNumber: row.rider.user.phoneNumber,
            status: row.rider.user.status,
          }
        : null,
      connectionFeePayment: latestFee
        ? {
            id: latestFee.id,
            status: latestFee.status,
            amountPesewas: latestFee.amountPesewas,
            currency: latestFee.currency,
            providerReference: latestFee.providerReference,
            createdAt: latestFee.createdAt.toISOString(),
          }
        : null,
    };
  }
}
