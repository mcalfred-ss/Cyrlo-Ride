import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
      <button type="button" onClick={() => void auth.verifyMfa({ code: '654321' })}>
        mfa-verify
      </button>
      <button
        type="button"
        onClick={() =>
          void auth.establishFromTokens(privilegedAccessToken(), 'refresh-token-value-20chars')
        }
      >
        establish
      </button>
      <button
        type="button"
        onClick={() => {
          void auth
            .establishFromTokens(
              privilegedAccessToken({ mfa: false }),
              'refresh-token-value-20chars',
            )
            .catch(() => undefined);
        }}
      >
        establish-bad
      </button>
    </div>
  );
}

describe('AuthProvider flows', () => {
  beforeEach(() => {
    clearMemorySession();
    vi.restoreAllMocks();
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000/api/v1');
  });

  it('transitions OTP → MFA_REQUIRED → authenticated after MFA', async () => {
    const access = privilegedAccessToken({ staffRole: 'SUPPORT_ADMIN' });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/admin/auth/otp')) {
        return jsonOk({ expiresIn: 300, resendAfter: 30, developmentCode: '999999' });
      }
      if (url.endsWith('/admin/auth/otp/verify')) {
        return jsonOk({
          status: 'MFA_REQUIRED',
          mfaToken: 'mfa-pending-token-xxxxxxxxxxxx',
          expiresIn: 600,
        });
      }
      if (url.endsWith('/admin/auth/mfa/verify')) {
        return jsonOk({
          accessToken: access,
          refreshToken: 'refresh-token-value-20chars',
          expiresIn: 900,
          staffRole: 'SUPPORT_ADMIN',
        });
      }
      if (url.endsWith('/admin/me')) {
        return jsonOk({
          id: '11111111-1111-1111-1111-111111111111',
          phoneNumber: '+233244000001',
          role: 'ADMIN',
          status: 'ACTIVE',
          displayName: 'Support',
          staffRole: 'SUPPORT_ADMIN',
          mfaEnabled: true,
        });
      }
      return new Response('missing', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

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

    await user.click(screen.getByText('mfa-verify'));
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('role')).toHaveTextContent('SUPPORT_ADMIN');
    expect(getAccessToken()).toBe(access);
    expect(getRefreshToken()).toBe('refresh-token-value-20chars');
    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  it('transitions OTP → MFA_ENROLLMENT_REQUIRED', async () => {
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
      return new Response('missing', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
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
  });

  it('rejects establishing a session without MFA assurance', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>,
    );
    await user.click(screen.getByText('establish-bad'));
    await waitFor(() => expect(getAccessToken()).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('forced reauthentication markers', () => {
  beforeEach(() => {
    clearMemorySession();
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000/api/v1');
  });

  it('API 401 clears privileged session via unauthorized handler', async () => {
    const access = privilegedAccessToken();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/admin/me')) {
          return jsonOk({
            id: '11111111-1111-1111-1111-111111111111',
            phoneNumber: '+233244000001',
            role: 'ADMIN',
            status: 'ACTIVE',
            displayName: 'Ops',
            staffRole: 'OPERATIONS_ADMIN',
            mfaEnabled: true,
          });
        }
        if (url.endsWith('/admin/passengers')) {
          return new Response(
            JSON.stringify({
              success: false,
              error: { code: 'UNAUTHORIZED', message: 'Authentication is required' },
            }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('missing', { status: 404 });
      }),
    );

    function Caller() {
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
          <button
            type="button"
            onClick={() => {
              void import('../api/client').then(({ apiRequest }) =>
                apiRequest('/admin/passengers').catch(() => undefined),
              );
            }}
          >
            call-401
          </button>
        </div>
      );
    }

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthProvider>
          <Caller />
        </AuthProvider>
      </MemoryRouter>,
    );
    await user.click(screen.getByText('establish'));
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('authenticated'));
    await user.click(screen.getByText('call-401'));
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('session_expired'));
    expect(getAccessToken()).toBeNull();
  });
});
