import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearMemorySession, getAccessToken, setMemorySession } from '../auth/session-store';
import { privilegedAccessToken } from '../test/jwt';
import { apiRequest, setUnauthorizedHandler } from './client';

describe('apiRequest', () => {
  beforeEach(() => {
    clearMemorySession();
    setUnauthorizedHandler(null);
    vi.restoreAllMocks();
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000/api/v1');
  });

  it('POSTs MFA enroll start even without a JSON body', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: { otpauthUrl: 'otpauth://totp/x', qrCodeDataUrl: 'data:image/png;base64,xx' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { startMfaEnrollment } = await import('./admin-auth');
    await startMfaEnrollment('enrollment-token-xxxxxxxx');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[1].method).toBe('POST');
    const headers = call[1].headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Bearer enrollment-token/);
  });

  it('maps fetch failures to a clear NETWORK_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    await expect(apiRequest('/admin/auth/otp', { auth: false, body: {} })).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
    });
  });

  it('does not expire session on public auth 401 (OTP/MFA failures)', async () => {
    setMemorySession({
      accessToken: privilegedAccessToken(),
      refreshToken: 'refresh-token-value-20chars',
    });
    const unauthorized = vi.fn();
    setUnauthorizedHandler(unauthorized);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: false,
              error: { code: 'UNAUTHORIZED', message: 'OTP is invalid' },
            }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    await expect(
      apiRequest('/admin/auth/otp/verify', { auth: false, body: {} }),
    ).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(getAccessToken()).toBeTruthy();
    expect(unauthorized).not.toHaveBeenCalled();
  });

  it('expires privileged session on authenticated 401', async () => {
    setMemorySession({
      accessToken: privilegedAccessToken(),
      refreshToken: 'refresh-token-value-20chars',
    });
    const unauthorized = vi.fn();
    setUnauthorizedHandler(unauthorized);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: false,
              error: { code: 'UNAUTHORIZED', message: 'Token expired' },
            }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    await expect(apiRequest('/admin/me')).rejects.toMatchObject({ status: 401 });
    expect(getAccessToken()).toBeNull();
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });

  it('surfaces 403 without clearing session (authorization denial)', async () => {
    setMemorySession({
      accessToken: privilegedAccessToken(),
      refreshToken: 'refresh-token-value-20chars',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: false,
              error: { code: 'FORBIDDEN', message: 'You do not have access to this resource' },
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    await expect(apiRequest('/admin/admins')).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
    expect(getAccessToken()).toBeTruthy();
  });
});
