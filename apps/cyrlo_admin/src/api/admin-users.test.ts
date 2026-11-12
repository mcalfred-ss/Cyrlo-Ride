import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearMemorySession, setMemorySession } from '../auth/session-store';
import { privilegedAccessToken } from '../test/jwt';
import { reinstateUser, suspendUser } from './admin-users';
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

const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('admin users suspend/reinstate API clients', () => {
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

  it('POSTs suspend with userId and mandatory reason', async () => {
    const fetchMock = vi.fn(async () =>
      jsonOk({
        userId,
        status: 'SUSPENDED',
        activeTripsPreserved: 1,
        sessionsRevoked: 2,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await suspendUser({ userId, reason: 'safety review' });
    expect(result).toEqual({
      userId,
      status: 'SUSPENDED',
      activeTripsPreserved: 1,
      sessionsRevoked: 2,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/admin/users/suspend',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ userId, reason: 'safety review' }),
      }),
    );
  });

  it('POSTs reinstate with userId and mandatory reason', async () => {
    const fetchMock = vi.fn(async () => jsonOk({ userId, status: 'ACTIVE' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await reinstateUser({ userId, reason: 'cleared by ops' });
    expect(result).toEqual({ userId, status: 'ACTIVE' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/admin/users/reinstate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ userId, reason: 'cleared by ops' }),
      }),
    );
  });

  it('propagates 403, 409 and privileged 401', async () => {
    const unauthorized = vi.fn();
    setUnauthorizedHandler(unauthorized);

    vi.stubGlobal('fetch', vi.fn(async () => jsonErr(403, 'FORBIDDEN', 'No SuspendReinstateRiders')));
    await expect(suspendUser({ userId, reason: 'x' })).rejects.toMatchObject({ status: 403 });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonErr(409, 'CONFLICT', 'User is not suspended')),
    );
    await expect(reinstateUser({ userId, reason: 'cleared' })).rejects.toBeInstanceOf(ApiError);
    await expect(reinstateUser({ userId, reason: 'cleared' })).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
    });

    vi.stubGlobal('fetch', vi.fn(async () => jsonErr(401, 'UNAUTHORIZED', 'Session expired')));
    await expect(suspendUser({ userId, reason: 'session' })).rejects.toMatchObject({ status: 401 });
    expect(unauthorized).toHaveBeenCalled();
  });
});
