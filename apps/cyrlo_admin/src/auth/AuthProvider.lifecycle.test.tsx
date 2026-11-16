import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { privilegedAccessToken } from '../test/jwt';
import { clearMemorySession, getAccessToken, getRefreshToken } from './session-store';
import { AuthProvider, useAuth } from './AuthProvider';

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

const mePayload = {
  id: '11111111-1111-1111-1111-111111111111',
  phoneNumber: '+233244000001',
  role: 'ADMIN' as const,
  status: 'ACTIVE',
  displayName: 'Ops',
  staffRole: 'OPERATIONS_ADMIN' as const,
  mfaEnabled: true,
};

afterEach(() => {
  cleanup();
  clearMemorySession();
});

beforeEach(() => {
  clearMemorySession();
  vi.restoreAllMocks();
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000/api/v1');
  localStorage.clear();
  sessionStorage.clear();
});

describe('C4 auth lifecycle', () => {
  it('keeps phase on mfa_required after failed MFA verification', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/admin/auth/otp')) {
        return jsonOk({ expiresIn: 300, resendAfter: 30 });
      }
      if (url.endsWith('/admin/auth/otp/verify')) {
        return jsonOk({
          status: 'MFA_REQUIRED',
          mfaToken: 'mfa-pending-token-xxxxxxxxxxxx',
          expiresIn: 600,
        });
      }
      if (url.endsWith('/admin/auth/mfa/verify')) {
        return jsonErr(401, 'UNAUTHORIZED', 'MFA code is invalid');
      }
      return new Response('missing', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    function Probe() {
      const auth = useAuth();
      return (
        <div>
          <div data-testid="phase">{auth.phase}</div>
          <div data-testid="error">{auth.error ?? ''}</div>
          <button type="button" onClick={() => void auth.requestOtp('+233244000001')}>
            otp-request
          </button>
          <button type="button" onClick={() => void auth.verifyOtp('123456')}>
            otp-verify
          </button>
          <button
            type="button"
            onClick={() => void auth.verifyMfa({ code: '000000' }).catch(() => undefined)}
          >
            mfa-fail
          </button>
        </div>
      );
    }

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByText('otp-request'));
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('awaiting_otp'));
    await user.click(screen.getByText('otp-verify'));
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('mfa_required'));
    await user.click(screen.getByText('mfa-fail'));
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('MFA code is invalid'));
    expect(screen.getByTestId('phase')).toHaveTextContent('mfa_required');
    expect(getAccessToken()).toBeNull();
  });

  it('logout clears in-memory session and identity', async () => {
    const access = privilegedAccessToken();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/admin/me')) return jsonOk(mePayload);
      if (url.endsWith('/auth/logout')) return jsonOk({ revoked: true });
      return new Response('missing', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    function Probe() {
      const auth = useAuth();
      return (
        <div>
          <div data-testid="phase">{auth.phase}</div>
          <div data-testid="role">{auth.staffRole ?? ''}</div>
          <button
            type="button"
            onClick={() =>
              void auth.establishFromTokens(access, 'refresh-token-value-20chars')
            }
          >
            establish
          </button>
          <button type="button" onClick={() => void auth.logout()}>
            logout
          </button>
        </div>
      );
    }

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByText('establish'));
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('authenticated'));
    expect(getAccessToken()).toBe(access);
    await user.click(screen.getByText('logout'));
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('anonymous'));
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(screen.getByTestId('role')).toHaveTextContent('');
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(sessionStorage.getItem('accessToken')).toBeNull();
  });

  it('does not restore a privileged session from persistent storage after remount (reload)', async () => {
    const access = privilegedAccessToken();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/admin/me')) return jsonOk(mePayload);
        return new Response('missing', { status: 404 });
      }),
    );

    function Probe() {
      const auth = useAuth();
      return (
        <div>
          <div data-testid="phase">{auth.phase}</div>
          <button
            type="button"
            onClick={() =>
              void auth.establishFromTokens(access, 'refresh-token-value-20chars')
            }
          >
            establish
          </button>
        </div>
      );
    }

    const user = userEvent.setup();
    const first = render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>,
    );
    await user.click(screen.getByText('establish'));
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('authenticated'));
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    // Simulate full page reload: unmount providers and clear memory session.
    first.unmount();
    clearMemorySession();

    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('phase')).toHaveTextContent('anonymous');
    expect(getAccessToken()).toBeNull();
  });

  it('MFA enrollment confirm transitions to authenticated', async () => {
    const access = privilegedAccessToken({ staffRole: 'SUPER_ADMIN' });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/admin/auth/otp')) {
        return jsonOk({ expiresIn: 300, resendAfter: 30 });
      }
      if (url.endsWith('/admin/auth/otp/verify')) {
        return jsonOk({
          status: 'MFA_ENROLLMENT_REQUIRED',
          enrollmentToken: 'enroll-token-xxxxxxxxxxxxxxxx',
          expiresIn: 600,
        });
      }
      if (url.endsWith('/admin/mfa/enroll/confirm')) {
        return jsonOk({
          recoveryCodes: ['AAAA-BBBB-CCCC'],
          accessToken: access,
          refreshToken: 'refresh-token-value-20chars',
          expiresIn: 900,
        });
      }
      if (url.endsWith('/admin/me')) {
        return jsonOk({ ...mePayload, staffRole: 'SUPER_ADMIN', mfaEnabled: true });
      }
      return new Response('missing', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    function Probe() {
      const auth = useAuth();
      return (
        <div>
          <div data-testid="phase">{auth.phase}</div>
          <div data-testid="role">{auth.staffRole ?? ''}</div>
          <button type="button" onClick={() => void auth.requestOtp('+233244000001')}>
            otp-request
          </button>
          <button type="button" onClick={() => void auth.verifyOtp('123456')}>
            otp-verify
          </button>
          <button type="button" onClick={() => void auth.confirmEnrollment('654321')}>
            enroll-confirm
          </button>
        </div>
      );
    }

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByText('otp-request'));
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('awaiting_otp'));
    await user.click(screen.getByText('otp-verify'));
    await waitFor(() =>
      expect(screen.getByTestId('phase')).toHaveTextContent('mfa_enrollment_required'),
    );
    await user.click(screen.getByText('enroll-confirm'));
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('role')).toHaveTextContent('SUPER_ADMIN');
    expect(getAccessToken()).toBe(access);
  });

  it('rolls back provisional tokens when /admin/me fails (C1)', async () => {
    const access = privilegedAccessToken();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/admin/me')) {
          return jsonErr(403, 'FORBIDDEN', 'No active administrator grant');
        }
        return new Response('missing', { status: 404 });
      }),
    );

    function Probe() {
      const auth = useAuth();
      return (
        <div>
          <div data-testid="phase">{auth.phase}</div>
          <button
            type="button"
            onClick={() =>
              void auth
                .establishFromTokens(access, 'refresh-token-value-20chars')
                .catch(() => undefined)
            }
          >
            establish-fail-me
          </button>
        </div>
      );
    }

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByText('establish-fail-me'));
    await waitFor(() => expect(getAccessToken()).toBeNull());
    expect(getRefreshToken()).toBeNull();
    expect(screen.getByTestId('phase')).toHaveTextContent('anonymous');
  });

  it('ignores stale concurrent MFA completion (C2)', async () => {
    const staleAccess = privilegedAccessToken({ staffRole: 'SUPPORT_ADMIN', sub: 'stale-user' });
    const freshAccess = privilegedAccessToken({
      staffRole: 'OPERATIONS_ADMIN',
      sub: '11111111-1111-1111-1111-111111111111',
    });

    let releaseStale!: (value: Response) => void;
    const staleGate = new Promise<Response>((resolve) => {
      releaseStale = resolve;
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/admin/auth/otp')) {
        return jsonOk({ expiresIn: 300, resendAfter: 30 });
      }
      if (url.endsWith('/admin/auth/otp/verify')) {
        return jsonOk({
          status: 'MFA_REQUIRED',
          mfaToken: 'mfa-pending-token-xxxxxxxxxxxx',
          expiresIn: 600,
        });
      }
      if (url.endsWith('/admin/auth/mfa/verify')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { code?: string };
        if (body.code === '111111') {
          return staleGate;
        }
        return jsonOk({
          accessToken: freshAccess,
          refreshToken: 'refresh-token-fresh-20chars',
          expiresIn: 900,
          staffRole: 'OPERATIONS_ADMIN',
        });
      }
      if (url.endsWith('/admin/me')) {
        return jsonOk(mePayload);
      }
      return new Response('missing', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    function Probe() {
      const auth = useAuth();
      return (
        <div>
          <div data-testid="phase">{auth.phase}</div>
          <div data-testid="role">{auth.staffRole ?? ''}</div>
          <button type="button" onClick={() => void auth.requestOtp('+233244000001')}>
            otp-request
          </button>
          <button type="button" onClick={() => void auth.verifyOtp('123456')}>
            otp-verify
          </button>
          <button
            type="button"
            onClick={() => void auth.verifyMfa({ code: '111111' }).catch(() => undefined)}
          >
            mfa-stale
          </button>
          <button
            type="button"
            onClick={() => void auth.verifyMfa({ code: '222222' }).catch(() => undefined)}
          >
            mfa-fresh
          </button>
        </div>
      );
    }

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByText('otp-request'));
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('awaiting_otp'));
    await user.click(screen.getByText('otp-verify'));
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('mfa_required'));

    await user.click(screen.getByText('mfa-stale'));
    await user.click(screen.getByText('mfa-fresh'));
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('role')).toHaveTextContent('OPERATIONS_ADMIN');
    expect(getAccessToken()).toBe(freshAccess);

    releaseStale(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            accessToken: staleAccess,
            refreshToken: 'refresh-token-stale-20chars',
            expiresIn: 900,
            staffRole: 'SUPPORT_ADMIN',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    // Allow the stale promise chain to settle; privileged session must remain the fresh one.
    await waitFor(() => expect(getAccessToken()).toBe(freshAccess));
    expect(screen.getByTestId('role')).toHaveTextContent('OPERATIONS_ADMIN');
    expect(screen.getByTestId('phase')).toHaveTextContent('authenticated');
  });
});
