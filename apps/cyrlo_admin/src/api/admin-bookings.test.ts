import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearMemorySession, setMemorySession } from '../auth/session-store';
import { privilegedAccessToken } from '../test/jwt';
import { fetchAdminBooking, fetchAdminBookings } from './admin-bookings';
import { setUnauthorizedHandler } from './client';
import { ApiError } from './types';

function jsonOk(data: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function jsonErr(status: number, code: string, message: string) {
  return Promise.resolve(
    new Response(JSON.stringify({ success: false, error: { code, message } }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

const bookingId = '22222222-2222-2222-2222-222222222222';

describe('admin bookings API clients', () => {
  beforeEach(() => {
    clearMemorySession();
    setUnauthorizedHandler(null);
    vi.restoreAllMocks();
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000/api/v1');
    setMemorySession({
      accessToken: privilegedAccessToken({ staffRole: 'OPERATIONS_ADMIN' }),
      refreshToken: 'refresh-token-value-20chars',
    });
  });

  it('GETs booking directory with all supported filters', async () => {
    const fetchMock = vi.fn(async () =>
      jsonOk({
        items: [],
        pagination: { page: 2, pageSize: 10, total: 0, hasNextPage: false },
        privacy: { exactCoordinatesIncluded: false, note: 'omitted' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchAdminBookings({
      page: 2,
      pageSize: 10,
      status: 'SEARCHING',
      passengerId: '11111111-1111-1111-1111-111111111111',
      riderId: '33333333-3333-3333-3333-333333333333',
      serviceZoneId: '44444444-4444-4444-4444-444444444444',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-31T23:59:59.999Z',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/admin/bookings?page=2&pageSize=10&status=SEARCHING&passengerId=11111111-1111-1111-1111-111111111111&riderId=33333333-3333-3333-3333-333333333333&serviceZoneId=44444444-4444-4444-4444-444444444444&from=2026-01-01T00%3A00%3A00.000Z&to=2026-01-31T23%3A59%3A59.999Z',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('GETs booking detail by id', async () => {
    const fetchMock = vi.fn(async () =>
      jsonOk({
        id: bookingId,
        status: 'COMPLETED',
        vehicleCategory: 'OKADA',
        passengerId: '11111111-1111-1111-1111-111111111111',
        riderId: null,
        serviceZoneId: null,
        pickupLabel: null,
        bookingFeePesewas: 100,
        paymentExpiresAt: null,
        searchExpiresAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        acceptedAt: null,
        startedAt: null,
        cancelledAt: null,
        completedAt: null,
        cancellationReason: null,
        exactCoordinatesIncluded: false,
        passenger: {
          id: '11111111-1111-1111-1111-111111111111',
          phoneNumber: '+233201000010',
          displayName: null,
          status: 'ACTIVE',
        },
        rider: null,
        connectionFeePayment: null,
        destinationLabel: null,
        cancellationActorType: null,
        serviceZone: null,
        payments: [],
        statusHistory: [],
        privacy: { exactCoordinatesIncluded: false, note: 'omitted' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchAdminBooking(bookingId);
    expect(result.id).toBe(bookingId);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/admin/bookings/${bookingId}`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('propagates 401 and 403', async () => {
    const unauthorized = vi.fn();
    setUnauthorizedHandler(unauthorized);

    vi.stubGlobal('fetch', vi.fn(async () => jsonErr(403, 'FORBIDDEN', 'No ViewBookingHistory')));
    await expect(fetchAdminBookings()).rejects.toMatchObject({ status: 403 });
    await expect(fetchAdminBookings()).rejects.toBeInstanceOf(ApiError);

    vi.stubGlobal('fetch', vi.fn(async () => jsonErr(401, 'UNAUTHORIZED', 'Session expired')));
    await expect(fetchAdminBooking(bookingId)).rejects.toMatchObject({ status: 401 });
    expect(unauthorized).toHaveBeenCalled();
  });
});
