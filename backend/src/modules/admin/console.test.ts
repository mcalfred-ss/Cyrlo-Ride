import { describe, expect, it, vi } from 'vitest';

import { Permission, staffRoleHasPermission } from '../../common/authz/permissions.js';
import {
  analyticsQuerySchema,
  listAdminBookingsQuerySchema,
  listAuditLogsQuerySchema,
  listPassengersQuerySchema,
} from './console.schema.js';
import {
  AdminConsoleService,
  ANALYTICS_DATE_RANGE_SEMANTICS,
} from './console.service.js';
import type { AdminConsoleRepository } from './console.repository.js';
import {
  ORDINARY_BOOKING_HISTORY_INCLUDES_EXACT_COORDINATES,
  PASSENGER_DIRECTORY_PERMISSION,
} from './module.routes.js';

function mockRepo(partial: Partial<AdminConsoleRepository>): AdminConsoleRepository {
  return partial as AdminConsoleRepository;
}

function assertNoExactCoordinates(payload: unknown) {
  const json = JSON.stringify(payload);
  expect(json).not.toMatch(/latitude/i);
  expect(json).not.toMatch(/longitude/i);
  expect(json).not.toMatch(/"lat"/i);
  expect(json).not.toMatch(/"lng"/i);
  expect(json).not.toMatch(/"lon"/i);
}

describe('admin console permission matrix (phase 0 review fixes)', () => {
  it('gates passenger directory on ViewBookingHistory only', () => {
    expect(PASSENGER_DIRECTORY_PERMISSION).toBe(Permission.ViewBookingHistory);
    expect(PASSENGER_DIRECTORY_PERMISSION).not.toBe(Permission.SuspendReinstateRiders);

    expect(staffRoleHasPermission('OPERATIONS_ADMIN', Permission.ViewBookingHistory)).toBe(true);
    expect(staffRoleHasPermission('SUPPORT_ADMIN', Permission.ViewBookingHistory)).toBe(true);
    expect(staffRoleHasPermission('FINANCE_ADMIN', Permission.ViewBookingHistory)).toBe(false);

    // Support can browse directory without suspend; suspend alone is not the directory gate.
    expect(staffRoleHasPermission('SUPPORT_ADMIN', Permission.SuspendReinstateRiders)).toBe(false);
    expect(staffRoleHasPermission('OPERATIONS_ADMIN', Permission.SuspendReinstateRiders)).toBe(true);
  });

  it('does not expose exact coordinates on ordinary booking history', () => {
    expect(ORDINARY_BOOKING_HISTORY_INCLUDES_EXACT_COORDINATES).toBe(false);
  });
});

describe('admin console query schemas', () => {
  it('enforces pagination limits', () => {
    expect(listPassengersQuerySchema.parse({}).pageSize).toBe(20);
    expect(listPassengersQuerySchema.parse({ pageSize: '100' }).pageSize).toBe(100);
    expect(() => listPassengersQuerySchema.parse({ pageSize: 101 })).toThrow();
    expect(() => listAdminBookingsQuerySchema.parse({ page: 0 })).toThrow();
  });

  it('validates booking filters and rejects unknown fields', () => {
    expect(
      listAdminBookingsQuerySchema.parse({
        status: 'SEARCHING',
        from: '2026-01-01T00:00:00.000Z',
      }).status,
    ).toBe('SEARCHING');
    expect(() => listAdminBookingsQuerySchema.parse({ status: 'NOPE' })).toThrow();
    expect(() => listAdminBookingsQuerySchema.parse({ extra: true })).toThrow();
  });

  it('validates audit filters', () => {
    const parsed = listAuditLogsQuerySchema.parse({
      action: 'admin.',
      entityType: 'user',
      page: '2',
    });
    expect(parsed.page).toBe(2);
    expect(parsed.action).toBe('admin.');
  });

  it('validates analytics window', () => {
    expect(analyticsQuerySchema.parse({}).from).toBeUndefined();
    expect(() => analyticsQuerySchema.parse({ from: 'yesterday' })).toThrow();
  });
});

describe('AdminConsoleService analytics period vs snapshot', () => {
  it('separates snapshot and period metrics and documents UTC inclusive bounds', async () => {
    const countBookingsByStatus = vi.fn(async () => ({ COMPLETED: 4, SEARCHING: 2 }));
    const sumBookingFeePayments = vi.fn(async ({ status }) => {
      if (status === 'SUCCESS') return { count: 4, amountPesewas: 400 };
      if (status === 'PENDING') return { count: 1, amountPesewas: 100 };
      return { count: 1, amountPesewas: 100 };
    });
    const sumRefundsByStatus = vi.fn(async () => ({
      REQUESTED: { count: 1, amountPesewas: 100 },
    }));
    const sumTokenPurchases = vi.fn(async () => ({
      purchaseCount: 2,
      purchaseAmountPesewas: 5000,
      deductionCount: 3,
      tokensDeducted: 3,
    }));

    const repo = mockRepo({
      countPassengers: vi.fn(async (status?: string) => {
        if (status === 'ACTIVE') return 8;
        if (status === 'SUSPENDED') return 2;
        return 10;
      }),
      countRiders: vi.fn(async () => 5),
      countAvailableRidersApprox: vi.fn(async () => 3),
      countPendingRiderApplications: vi.fn(async () => 1),
      countBookingsByStatus,
      sumBookingFeePayments,
      sumRefundsByStatus,
      sumTokenPurchases,
    });

    const service = new AdminConsoleService(repo, {
      now: () => new Date('2026-11-12T12:00:00.000Z'),
    });
    const from = '2026-11-01T00:00:00.000Z';
    const to = '2026-11-12T23:59:59.999Z';
    const data = await service.getAnalytics({ from, to });

    expect(data.dateRange.from).toBe(from);
    expect(data.dateRange.to).toBe(to);
    expect(data.dateRange.timezone).toBe(ANALYTICS_DATE_RANGE_SEMANTICS.timezone);
    expect(data.snapshot.passengers.total).toBe(10);
    expect(data.snapshot.riders.availableApprox).toBe(3);
    expect(data.period.bookings.completedConnections).toBe(4);
    expect(data.period.connectionFees.collected.amountPesewas).toBe(400);
    expect(data.period.refunds.byStatus.REQUESTED?.amountPesewas).toBe(100);
    expect(data.exclusions.transportationFareRevenue).toBe(false);

    const periodFilter = {
      from: new Date(from),
      to: new Date(to),
    };
    expect(countBookingsByStatus).toHaveBeenCalledWith(periodFilter);
    expect(sumBookingFeePayments).toHaveBeenCalledWith(
      expect.objectContaining(periodFilter),
    );
    expect(sumRefundsByStatus).toHaveBeenCalledWith(periodFilter);
    expect(sumTokenPurchases).toHaveBeenCalledWith(periodFilter);
  });

  it('rejects inverted analytics date range and invalid dates', async () => {
    const service = new AdminConsoleService(mockRepo({}));
    await expect(
      service.getAnalytics({
        from: '2026-11-12T00:00:00.000Z',
        to: '2026-11-01T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('keeps snapshot counts when period filter changes (mock period only)', async () => {
    let bookingCompleted = 10;
    const repo = mockRepo({
      countPassengers: vi.fn(async () => 42),
      countRiders: vi.fn(async () => 7),
      countAvailableRidersApprox: vi.fn(async () => 2),
      countPendingRiderApplications: vi.fn(async () => 1),
      countBookingsByStatus: vi.fn(async () => ({ COMPLETED: bookingCompleted })),
      sumBookingFeePayments: vi.fn(async () => ({
        count: bookingCompleted,
        amountPesewas: bookingCompleted * 100,
      })),
      sumRefundsByStatus: vi.fn(async () => ({})),
      sumTokenPurchases: vi.fn(async () => ({
        purchaseCount: 0,
        purchaseAmountPesewas: 0,
        deductionCount: 0,
        tokensDeducted: 0,
      })),
    });
    const service = new AdminConsoleService(repo, {
      now: () => new Date('2026-11-12T12:00:00.000Z'),
    });

    const wide = await service.getAnalytics({});
    bookingCompleted = 1;
    const narrow = await service.getAnalytics({
      from: '2026-11-12T00:00:00.000Z',
      to: '2026-11-12T23:59:59.999Z',
    });

    expect(wide.snapshot.passengers.total).toBe(42);
    expect(narrow.snapshot.passengers.total).toBe(42);
    expect(wide.period.bookings.completedConnections).toBe(10);
    expect(narrow.period.bookings.completedConnections).toBe(1);
  });
});

describe('AdminConsoleService booking coordinate privacy', () => {
  it('omits exact coordinates from full booking list serialization', async () => {
    const listBookings = vi.fn(async () => ({
      total: 1,
      items: [
        {
          id: '22222222-2222-2222-2222-222222222222',
          status: 'ACCEPTED',
          vehicleCategory: 'OKADA',
          passengerId: '11111111-1111-1111-1111-111111111111',
          riderId: '33333333-3333-3333-3333-333333333333',
          serviceZoneId: null,
          pickupLabel: 'Near market',
          bookingFeePesewas: 100,
          paymentExpiresAt: null,
          searchExpiresAt: null,
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
          acceptedAt: new Date('2026-06-01T00:01:00.000Z'),
          startedAt: null,
          cancelledAt: null,
          completedAt: null,
          cancellationReason: null,
          passenger: {
            id: '11111111-1111-1111-1111-111111111111',
            phoneNumber: '+233244000001',
            displayName: 'Ama',
            status: 'ACTIVE',
          },
          rider: {
            userId: '33333333-3333-3333-3333-333333333333',
            fullName: 'Kofi',
            user: { phoneNumber: '+233244000002', status: 'ACTIVE' },
          },
          payments: [
            {
              id: '44444444-4444-4444-4444-444444444444',
              status: 'PENDING',
              amountPesewas: 100,
              currency: 'GHS',
              providerReference: 'bf_test',
              createdAt: new Date('2026-06-01T00:01:30.000Z'),
            },
          ],
        },
      ],
    }));
    const service = new AdminConsoleService(mockRepo({ listBookings }));
    const result = await service.listBookings({ page: 1, pageSize: 20, status: 'ACCEPTED' });
    assertNoExactCoordinates(result);
    expect(result.items[0]?.pickupLabel).toBe('Near market');
    expect(result.items[0]?.exactCoordinatesIncluded).toBe(false);
    expect(result.privacy.exactCoordinatesIncluded).toBe(false);
  });

  it('omits exact coordinates from full booking detail serialization', async () => {
    const service = new AdminConsoleService(
      mockRepo({
        findBooking: vi.fn(async () => ({
          id: '22222222-2222-2222-2222-222222222222',
          status: 'COMPLETED',
          vehicleCategory: 'OKADA',
          passengerId: '11111111-1111-1111-1111-111111111111',
          riderId: '33333333-3333-3333-3333-333333333333',
          serviceZoneId: null,
          pickupLabel: 'Market',
          destinationLabel: null,
          bookingFeePesewas: 100,
          paymentExpiresAt: null,
          searchExpiresAt: null,
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
          acceptedAt: null,
          startedAt: null,
          cancelledAt: null,
          completedAt: new Date('2026-06-01T01:00:00.000Z'),
          cancellationReason: null,
          cancellationActorType: null,
          passenger: {
            id: '11111111-1111-1111-1111-111111111111',
            phoneNumber: '+233244000001',
            displayName: 'Ama',
            status: 'ACTIVE',
          },
          rider: {
            userId: '33333333-3333-3333-3333-333333333333',
            fullName: 'Kofi',
            availability: 'OFFLINE',
            user: { phoneNumber: '+233244000002', status: 'ACTIVE' },
          },
          serviceZone: null,
          payments: [
            {
              id: '44444444-4444-4444-4444-444444444444',
              purpose: 'BOOKING_FEE',
              status: 'SUCCESS',
              amountPesewas: 100,
              currency: 'GHS',
              providerReference: 'bf_ok',
              createdAt: new Date('2026-06-01T00:01:00.000Z'),
            },
          ],
          statusHistory: [],
        })),
      }),
    );
    const detail = await service.getBooking('22222222-2222-2222-2222-222222222222');
    assertNoExactCoordinates(detail);
    expect(detail.privacy.exactCoordinatesIncluded).toBe(false);
  });

  it('omits home coordinates from passenger profile', async () => {
    const service = new AdminConsoleService(
      mockRepo({
        findPassenger: vi.fn(async () => ({
          id: '11111111-1111-1111-1111-111111111111',
          phoneNumber: '+233244000001',
          status: 'ACTIVE' as const,
          displayName: 'Ama',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
          passengerProfile: {
            fullName: 'Ama Mensah',
            dateOfBirth: new Date('1995-05-05T00:00:00.000Z'),
            gender: 'FEMALE' as const,
            homeLocation: 'Kumasi',
          },
        })),
      }),
    );

    const profile = await service.getPassenger('11111111-1111-1111-1111-111111111111');
    assertNoExactCoordinates(profile);
    expect(profile.profile?.homeLocation).toBe('Kumasi');
  });
});
