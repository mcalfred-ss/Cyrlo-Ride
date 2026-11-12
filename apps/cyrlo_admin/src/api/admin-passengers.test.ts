import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearMemorySession, setMemorySession } from '../auth/session-store';
import { privilegedAccessToken } from '../test/jwt';
import {
  fetchAdminPassenger,
  fetchAdminPassengers,
  fetchPassengerBookings,
  fetchPassengerCancellations,
} from './admin-passengers';
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

const passengerId = '11111111-1111-1111-1111-111111111111';

describe('admin passengers API clients', () => {
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

  it('GETs passenger directory with pagination, search and status filters', async () => {
    const fetchMock = vi.fn(async () =>
      jsonOk({
        items: [],
        pagination: { page: 2, pageSize: 10, total: 0, hasNextPage: false },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchAdminPassengers({
      page: 2,
      pageSize: 10,
      q: 'Ama',
      status: 'ACTIVE',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/admin/passengers?page=2&pageSize=10&q=Ama&status=ACTIVE',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('GETs passenger profile by id', async () => {
    const fetchMock = vi.fn(async () =>
      jsonOk({
        id: passengerId,
        phoneNumber: '+233201000010',
        status: 'ACTIVE',
        displayName: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        profile: null,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchAdminPassenger(passengerId);
    expect(result.id).toBe(passengerId);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/admin/passengers/${passengerId}`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('GETs booking and cancellation history with pagination', async () => {
    const fetchMock = vi.fn(async () =>
      jsonOk({
        items: [],
        pagination: { page: 1, pageSize: 10, total: 0, hasNextPage: false },
        privacy: {
          exactCoordinatesIncluded: false,
          note: 'omitted',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchPassengerBookings(passengerId, { page: 1, pageSize: 10 });
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/admin/passengers/${passengerId}/bookings?page=1&pageSize=10`,
      expect.objectContaining({ method: 'GET' }),
    );

    await fetchPassengerCancellations(passengerId, { page: 3, pageSize: 20 });
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/admin/passengers/${passengerId}/cancellations?page=3&pageSize=20`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('propagates 401 and 403 from passenger endpoints', async () => {
    const unauthorized = vi.fn();
    setUnauthorizedHandler(unauthorized);

    vi.stubGlobal('fetch', vi.fn(async () => jsonErr(403, 'FORBIDDEN', 'No ViewBookingHistory')));
    await expect(fetchAdminPassengers()).rejects.toMatchObject({ status: 403 });
    await expect(fetchAdminPassengers()).rejects.toBeInstanceOf(ApiError);

    vi.stubGlobal('fetch', vi.fn(async () => jsonErr(401, 'UNAUTHORIZED', 'Session expired')));
    await expect(fetchAdminPassenger(passengerId)).rejects.toMatchObject({ status: 401 });
    expect(unauthorized).toHaveBeenCalled();
  });
});
