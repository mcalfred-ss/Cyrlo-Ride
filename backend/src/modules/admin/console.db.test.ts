import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AdminConsoleRepository } from './console.repository.js';
import { AdminConsoleService } from './console.service.js';

const prisma = new PrismaClient();
const marker = `admin-console-${Date.now()}`;
const userIds: string[] = [];
const bookingIds: string[] = [];
const paymentIds: string[] = [];
const auditIds: string[] = [];
const ledgerIds: string[] = [];

function assertNoExactCoordinates(payload: unknown) {
  const json = JSON.stringify(payload);
  expect(json).not.toMatch(/latitude/i);
  expect(json).not.toMatch(/longitude/i);
  expect(json).not.toMatch(/"lat"/i);
  expect(json).not.toMatch(/"lng"/i);
  expect(json).not.toMatch(/"lon"/i);
}

describe('admin console postgres analytics and listings', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (ledgerIds.length) {
      await prisma.tokenLedgerEntry.deleteMany({ where: { id: { in: ledgerIds } } });
    }
    if (auditIds.length) {
      await prisma.auditLog.deleteMany({ where: { id: { in: auditIds } } });
    }
    if (paymentIds.length) {
      await prisma.paymentRefund.deleteMany({ where: { paymentId: { in: paymentIds } } });
      await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    }
    if (bookingIds.length) {
      await prisma.bookingStatusHistory.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await prisma.bookingCancellationRequest.deleteMany({
        where: { bookingId: { in: bookingIds } },
      });
      await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    }
    if (userIds.length) {
      await prisma.riderWallet.deleteMany({ where: { riderId: { in: userIds } } });
      await prisma.riderLocation.deleteMany({ where: { riderId: { in: userIds } } });
      await prisma.riderProfile.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.passengerProfile.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.$disconnect();
  });

  it('computes period/snapshot analytics, omits coords, and respects date windows', async () => {
    const passengerId = randomUUID();
    const riderId = randomUUID();
    const actorId = randomUUID();
    userIds.push(passengerId, riderId, actorId);

    await prisma.user.create({
      data: {
        id: passengerId,
        phoneNumber: `+23321${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'PASSENGER',
        status: 'ACTIVE',
        displayName: `${marker} pax`,
        passengerProfile: {
          create: {
            fullName: `${marker} Passenger`,
          },
        },
      },
    });
    await prisma.user.create({
      data: {
        id: riderId,
        phoneNumber: `+23322${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'RIDER',
        status: 'ACTIVE',
        riderProfile: {
          create: {
            fullName: `${marker} Rider`,
            verificationStatus: 'APPROVED',
            availability: 'AVAILABLE',
            wallet: { create: { tokenBalance: 9 } },
            location: {
              create: {
                latitude: 6.68,
                longitude: -1.62,
                accuracyMeters: 12,
                sharingEnabled: true,
                recordedAt: new Date(),
                receivedAt: new Date(),
              },
            },
          },
        },
      },
    });
    await prisma.user.create({
      data: {
        id: actorId,
        phoneNumber: `+23323${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'ADMIN',
        status: 'ACTIVE',
        displayName: `${marker} admin`,
      },
    });

    const oldCreatedAt = new Date('2020-01-15T12:00:00.000Z');
    const oldBooking = await prisma.booking.create({
      data: {
        passengerId,
        riderId,
        status: 'COMPLETED',
        vehicleCategory: 'OKADA',
        pickupLatitude: 6.1,
        pickupLongitude: -1.1,
        pickupLabel: `${marker} old`,
        bookingFeePesewas: 100,
        completedAt: oldCreatedAt,
        acceptedAt: oldCreatedAt,
        createdAt: oldCreatedAt,
      },
    });
    bookingIds.push(oldBooking.id);

    const oldPayment = await prisma.payment.create({
      data: {
        userId: passengerId,
        bookingId: oldBooking.id,
        purpose: 'BOOKING_FEE',
        amountPesewas: 100,
        currency: 'GHS',
        status: 'SUCCESS',
        idempotencyKey: `admin-console-old-${randomUUID()}`,
        providerReference: `bf_admin_${randomUUID().slice(0, 8)}`,
        createdAt: oldCreatedAt,
      },
    });
    paymentIds.push(oldPayment.id);

    const completed = await prisma.booking.create({
      data: {
        passengerId,
        riderId,
        status: 'COMPLETED',
        vehicleCategory: 'OKADA',
        pickupLatitude: 6.68,
        pickupLongitude: -1.62,
        pickupLabel: `${marker} pickup`,
        bookingFeePesewas: 100,
        completedAt: new Date(),
        acceptedAt: new Date(),
      },
    });
    bookingIds.push(completed.id);

    const searching = await prisma.booking.create({
      data: {
        passengerId,
        status: 'SEARCHING',
        vehicleCategory: 'OKADA',
        pickupLatitude: 6.681,
        pickupLongitude: -1.621,
        pickupLabel: `${marker} search`,
        bookingFeePesewas: 100,
        searchExpiresAt: new Date(Date.now() + 60_000),
      },
    });
    bookingIds.push(searching.id);

    const successPayment = await prisma.payment.create({
      data: {
        userId: passengerId,
        bookingId: completed.id,
        purpose: 'BOOKING_FEE',
        amountPesewas: 100,
        currency: 'GHS',
        status: 'SUCCESS',
        idempotencyKey: `admin-console-success-${randomUUID()}`,
        providerReference: `bf_admin_${randomUUID().slice(0, 8)}`,
      },
    });
    paymentIds.push(successPayment.id);

    const pendingPayment = await prisma.payment.create({
      data: {
        userId: passengerId,
        bookingId: searching.id,
        purpose: 'BOOKING_FEE',
        amountPesewas: 100,
        currency: 'GHS',
        status: 'PENDING',
        idempotencyKey: `admin-console-pending-${randomUUID()}`,
        providerReference: `bf_admin_${randomUUID().slice(0, 8)}`,
      },
    });
    paymentIds.push(pendingPayment.id);

    await prisma.paymentRefund.create({
      data: {
        paymentId: successPayment.id,
        bookingId: completed.id,
        amountPesewas: 100,
        currency: 'GHS',
        status: 'REQUESTED',
        reason: `${marker} test refund`,
        idempotencyKey: `admin-console-refund-${randomUUID()}`,
      },
    });

    const ledger = await prisma.tokenLedgerEntry.create({
      data: {
        riderId,
        bookingId: completed.id,
        type: 'DEDUCTION',
        tokenDelta: -1,
        balanceAfter: 8,
        idempotencyKey: `admin-console-ledger-${randomUUID()}`,
        reason: 'booking_acceptance',
      },
    });
    ledgerIds.push(ledger.id);

    const audit = await prisma.auditLog.create({
      data: {
        actorId,
        action: `admin.console.${marker}`,
        entityType: 'user',
        entityId: passengerId,
        metadata: { marker },
        ipAddress: '127.0.0.1',
      },
    });
    auditIds.push(audit.id);

    await prisma.bookingCancellationRequest.create({
      data: {
        bookingId: searching.id,
        passengerId,
        reason: `${marker} cancel`,
        status: 'OPEN',
      },
    });

    const service = new AdminConsoleService(new AdminConsoleRepository(prisma), {
      now: () => new Date(),
    });

    const allTime = await service.getAnalytics({});
    expect(allTime.snapshot.passengers.total).toBeGreaterThanOrEqual(1);
    expect(allTime.snapshot.riders.availableApprox).toBeGreaterThanOrEqual(1);
    expect(allTime.period.bookings.byStatus.COMPLETED ?? 0).toBeGreaterThanOrEqual(2);
    expect(allTime.period.connectionFees.collected.count).toBeGreaterThanOrEqual(2);
    expect(allTime.period.refunds.byStatus.REQUESTED?.count ?? 0).toBeGreaterThanOrEqual(1);
    expect(allTime.period.tokens.usage.tokensDeducted).toBeGreaterThanOrEqual(1);
    expect(allTime.exclusions.transportationFareRevenue).toBe(false);

    const windowed = await service.getAnalytics({
      from: '2026-01-01T00:00:00.000Z',
      to: '2030-01-01T00:00:00.000Z',
    });
    expect(windowed.snapshot.passengers.total).toBe(allTime.snapshot.passengers.total);
    expect(windowed.snapshot.riders.registered).toBe(allTime.snapshot.riders.registered);
    expect(windowed.period.bookings.byStatus.COMPLETED ?? 0).toBeGreaterThanOrEqual(1);
    expect(windowed.period.bookings.byStatus.COMPLETED ?? 0).toBeLessThan(
      allTime.period.bookings.byStatus.COMPLETED ?? 0,
    );
    expect(windowed.period.connectionFees.collected.count).toBeLessThan(
      allTime.period.connectionFees.collected.count,
    );
    expect(windowed.dateRange.timezone).toBe('UTC');
    expect(windowed.dateRange.boundInclusivity).toBe('inclusive');

    const ancientOnly = await service.getAnalytics({
      from: '2019-01-01T00:00:00.000Z',
      to: '2020-12-31T23:59:59.999Z',
    });
    expect(ancientOnly.snapshot.passengers.total).toBe(allTime.snapshot.passengers.total);
    expect(ancientOnly.period.connectionFees.collected.count).toBeGreaterThanOrEqual(1);
    expect(ancientOnly.period.bookings.byStatus.COMPLETED ?? 0).toBeGreaterThanOrEqual(1);

    const financial = await service.getFinancialReport({
      from: '2026-01-01T00:00:00.000Z',
      to: '2030-01-01T00:00:00.000Z',
    });
    expect(financial.period.connectionFees.collected.amountPesewas).toBeGreaterThanOrEqual(100);
    expect(financial.period).not.toHaveProperty('passengers');
    expect(financial).not.toHaveProperty('passengers');

    const passengers = await service.listPassengers({
      page: 1,
      pageSize: 20,
      q: marker,
      status: 'ACTIVE',
    });
    expect(passengers.items.some((row) => row.id === passengerId)).toBe(true);

    const profile = await service.getPassenger(passengerId);
    assertNoExactCoordinates(profile);

    const history = await service.listPassengerBookings(passengerId, 1, 10);
    expect(history.items.length).toBeGreaterThanOrEqual(2);
    assertNoExactCoordinates(history);

    const cancellations = await service.listPassengerCancellations(passengerId, 1, 10);
    expect(cancellations.items.some((row) => row.bookingId === searching.id)).toBe(true);

    const bookings = await service.listBookings({
      page: 1,
      pageSize: 20,
      status: 'COMPLETED',
      passengerId,
      from: '2026-01-01T00:00:00.000Z',
    });
    expect(bookings.items.some((row) => row.id === completed.id)).toBe(true);
    expect(bookings.items.some((row) => row.id === oldBooking.id)).toBe(false);
    assertNoExactCoordinates(bookings);
    expect(bookings.privacy.exactCoordinatesIncluded).toBe(false);

    const detail = await service.getBooking(completed.id);
    expect(detail.payments.some((p) => p.purpose === 'BOOKING_FEE')).toBe(true);
    assertNoExactCoordinates(detail);
    expect(detail.privacy.exactCoordinatesIncluded).toBe(false);
    expect(JSON.stringify(detail)).not.toContain('ghanaCard');

    const audits = await service.listAuditLogs({
      page: 1,
      pageSize: 20,
      action: marker,
      actorId,
    });
    expect(audits.items.some((row) => row.id === audit.id)).toBe(true);
  });
});
