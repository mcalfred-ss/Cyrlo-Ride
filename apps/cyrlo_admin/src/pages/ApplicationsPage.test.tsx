import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { setUnauthorizedHandler } from '../api/client';
import { clearMemorySession, setMemorySession } from '../auth/session-store';
import { privilegedAccessToken } from '../test/jwt';
import { ApplicationsPage } from './ApplicationsPage';

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

const riderId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('ApplicationsPage', () => {
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

  it('loads queue rows with vehicle progress and empty/error/retry', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => jsonErr(500, 'ERROR', 'boom'))
      .mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/admin/riders/applications')) {
          return jsonOk([
            {
              riderId,
              fullName: 'Kofi Applicant',
              phoneNumber: '+233201000001',
              status: 'ACTIVE',
              verificationStatus: 'PENDING_REVIEW',
              submittedAt: '2026-11-01T10:00:00.000Z',
              vehicleCount: 1,
            },
          ]);
        }
        if (url.includes(`/applications/${riderId}`)) {
          return jsonOk({
            riderId,
            fullName: 'Kofi Applicant',
            verificationStatus: 'PENDING_REVIEW',
            driversLicenceNumber: null,
            driversLicenceExpiry: null,
            submittedAt: '2026-11-01T10:00:00.000Z',
            hasEncryptedGhanaCard: false,
            ghanaCardNumber: null,
            documents: [],
            vehicles: [
              {
                id: 'vvvvvvvv-vvvv-vvvv-vvvv-vvvvvvvvvvvv',
                category: 'OKADA',
                registrationNumber: 'GR-1',
                make: 'Honda',
                model: 'CG',
                colour: 'Red',
                capacity: 1,
                verificationStatus: 'PENDING_REVIEW',
                rejectionReason: null,
              },
            ],
            reviewHistory: [],
          });
        }
        return jsonOk([]);
      });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/applications']}>
        <Routes>
          <Route path="/applications" element={<ApplicationsPage />} />
          <Route path="/session-expired" element={<div>session-expired-screen</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('applications-error')).toHaveTextContent('boom');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('applications-table')).toBeInTheDocument();
    expect(screen.getByText('Kofi Applicant')).toBeInTheDocument();
    expect(screen.getByText(/1 pending · 0 approved · 0 rejected/)).toBeInTheDocument();
  });

  it('shows empty state and handles 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonOk([])));
    const { unmount } = render(
      <MemoryRouter initialEntries={['/applications']}>
        <Routes>
          <Route path="/applications" element={<ApplicationsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('applications-empty')).toBeInTheDocument();
    unmount();

    setUnauthorizedHandler(() => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => jsonErr(401, 'UNAUTHORIZED', 'expired')));
    render(
      <MemoryRouter initialEntries={['/applications']}>
        <Routes>
          <Route path="/applications" element={<ApplicationsPage />} />
          <Route path="/session-expired" element={<div>session-expired-screen</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('session-expired-screen')).toBeInTheDocument();
  });
});
