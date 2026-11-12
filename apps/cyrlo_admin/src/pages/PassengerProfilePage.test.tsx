import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryRouter,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
  useSearchParams,
} from 'react-router-dom';

import { setUnauthorizedHandler } from '../api/client';
import type {
  AdminPassengerBookingsResponse,
  AdminPassengerCancellationsResponse,
  AdminPassengerListResponse,
  AdminPassengerProfile,
} from '../api/types';
import { clearMemorySession, setMemorySession } from '../auth/session-store';
import type { StaffRole } from '../config/permissions';
import { privilegedAccessToken } from '../test/jwt';
import { PassengerProfilePage } from './PassengerProfilePage';
import { PassengersPage } from './PassengersPage';

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => mockAuth,
}));

let mockAuth: { staffRole: StaffRole | null };

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

const passengerId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const bookingId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const cancellationId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const sampleProfile: AdminPassengerProfile = {
  id: passengerId,
  phoneNumber: '+233201000010',
  status: 'ACTIVE',
  displayName: null,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  profile: {
    fullName: 'Ama Passenger',
    dateOfBirth: '1995-04-12',
    gender: 'FEMALE',
    homeLocation: 'East Legon area',
  },
};

const sampleBookings: AdminPassengerBookingsResponse = {
  items: [
    {
      id: bookingId,
      status: 'COMPLETED',
      vehicleCategory: 'OKADA',
      bookingFeePesewas: 100,
      pickupLabel: 'Accra Mall entrance',
      riderId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      createdAt: '2026-10-01T10:00:00.000Z',
      acceptedAt: '2026-10-01T10:05:00.000Z',
      cancelledAt: null,
      completedAt: '2026-10-01T10:40:00.000Z',
      cancellationReason: null,
      exactCoordinatesIncluded: false,
    },
  ],
  pagination: { page: 1, pageSize: 10, total: 1, hasNextPage: false },
  privacy: {
    exactCoordinatesIncluded: false,
    note: 'Ordinary booking history omits exact lat/lng.',
  },
};

const sampleCancellations: AdminPassengerCancellationsResponse = {
  items: [
    {
      id: cancellationId,
      bookingId,
      reason: 'Changed plans',
      status: 'PENDING',
      recommendation: null,
      createdAt: '2026-10-02T10:00:00.000Z',
      resolvedAt: null,
    },
  ],
  pagination: { page: 1, pageSize: 10, total: 1, hasNextPage: false },
};

function routeResponse(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  if (url.includes('/admin/users/suspend') && init?.method === 'POST') {
    return jsonOk({
      userId: passengerId,
      status: 'SUSPENDED',
      activeTripsPreserved: 0,
      sessionsRevoked: 2,
    });
  }
  if (url.includes('/admin/users/reinstate') && init?.method === 'POST') {
    return jsonOk({ userId: passengerId, status: 'ACTIVE' });
  }
  if (url.includes(`/admin/passengers/${passengerId}/bookings`)) {
    return jsonOk(sampleBookings);
  }
  if (url.includes(`/admin/passengers/${passengerId}/cancellations`)) {
    return jsonOk(sampleCancellations);
  }
  if (url.includes(`/admin/passengers/${passengerId}`)) {
    return jsonOk(sampleProfile);
  }
  return jsonOk({
    items: [],
    pagination: { page: 1, pageSize: 20, total: 0, hasNextPage: false },
  });
}

function renderProfile(entry = `/passengers/${passengerId}`) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/passengers" element={<div>directory-screen</div>} />
        <Route path="/passengers/:passengerId" element={<PassengerProfilePage />} />
        <Route path="/session-expired" element={<div>session-expired-screen</div>} />
        <Route path="/forbidden" element={<div>forbidden-screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PassengerProfilePage', () => {
  beforeEach(() => {
    clearMemorySession();
    setUnauthorizedHandler(null);
    vi.restoreAllMocks();
    mockAuth = { staffRole: 'SUPER_ADMIN' };
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000/api/v1');
    setMemorySession({
      accessToken: privilegedAccessToken({ staffRole: 'SUPER_ADMIN' }),
      refreshToken: 'refresh-token-value-20chars',
    });
  });

  it('loads profile, bookings and cancellations without sensitive fields', async () => {
    const hostile = {
      ...sampleProfile,
      passwordHash: 'secret-hash',
      accessToken: 'tok',
      refreshToken: 'ref',
      mfaSecret: 'otpsecret',
      ghanaCardNumber: 'GHA-123456789-0',
      profile: {
        ...sampleProfile.profile!,
        homeLatitude: 5.6037,
        homeLongitude: -0.187,
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes(`/admin/passengers/${passengerId}/bookings`)) {
          return jsonOk({
            ...sampleBookings,
            items: [
              {
                ...sampleBookings.items[0]!,
                pickupLatitude: 5.6037,
                pickupLongitude: -0.187,
              },
            ],
          });
        }
        if (url.includes(`/admin/passengers/${passengerId}/cancellations`)) {
          return jsonOk(sampleCancellations);
        }
        if (url.includes(`/admin/passengers/${passengerId}`)) {
          return jsonOk(hostile);
        }
        return routeResponse(input, init);
      }),
    );

    const { container } = renderProfile();
    expect(screen.getByTestId('passenger-profile-loading')).toBeInTheDocument();
    expect(await screen.findByTestId('passenger-profile')).toBeInTheDocument();
    expect(screen.getByTestId('passenger-breadcrumb')).toHaveTextContent('Passenger directory');
    expect(screen.getAllByText('Ama Passenger').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('East Legon area')).toBeInTheDocument();
    expect(screen.getByTestId('passenger-bookings-table')).toBeInTheDocument();
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getByText('Accra Mall entrance')).toBeInTheDocument();
    expect(screen.getByTestId('passenger-cancellations-table')).toBeInTheDocument();
    expect(screen.getByText('PENDING')).toBeInTheDocument();
    expect(screen.getByText('Changed plans')).toBeInTheDocument();
    expect(screen.getByTestId('passenger-privacy-note')).toHaveTextContent('Exact home coordinates');
    expect(container.textContent).not.toMatch(/5\.6037/);
    expect(container.textContent).not.toMatch(/-0\.187/);
    expect(container.textContent).not.toMatch(/secret-hash/);
    expect(container.textContent).not.toMatch(/GHA-123456789-0/);
    expect(container.textContent).not.toMatch(/otpsecret/);
    expect(container.textContent).not.toMatch(/passwordHash/i);
    expect(container.textContent).not.toMatch(/homeLatitude/i);
  });

  it('shows missing passenger state on 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes(`/admin/passengers/${passengerId}/bookings`)) {
          return jsonOk({
            items: [],
            pagination: { page: 1, pageSize: 10, total: 0, hasNextPage: false },
            privacy: sampleBookings.privacy,
          });
        }
        if (url.includes(`/admin/passengers/${passengerId}/cancellations`)) {
          return jsonOk({
            items: [],
            pagination: { page: 1, pageSize: 10, total: 0, hasNextPage: false },
          });
        }
        return jsonErr(404, 'NOT_FOUND', 'Passenger not found');
      }),
    );
    renderProfile();
    expect(await screen.findByTestId('passenger-profile-error')).toHaveTextContent(
      'Passenger not found',
    );
    expect(screen.queryByTestId('passenger-profile')).not.toBeInTheDocument();
  });

  it('handles 401 via session expiry', async () => {
    setUnauthorizedHandler(() => {
      clearMemorySession();
    });
    vi.stubGlobal('fetch', vi.fn(async () => jsonErr(401, 'UNAUTHORIZED', 'Session expired')));
    renderProfile();
    expect(await screen.findByText('session-expired-screen')).toBeInTheDocument();
  });

  it('handles 403 without fabricating profile data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonErr(403, 'FORBIDDEN', 'No ViewBookingHistory')),
    );
    renderProfile();
    expect(await screen.findByTestId('passenger-profile-error')).toHaveTextContent(
      'Permission denied',
    );
    expect(screen.queryByTestId('passenger-profile')).not.toBeInTheDocument();
  });

  it('shows empty booking and cancellation states independently', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/bookings')) {
          return jsonOk({
            items: [],
            pagination: { page: 1, pageSize: 10, total: 0, hasNextPage: false },
            privacy: sampleBookings.privacy,
          });
        }
        if (url.includes('/cancellations')) {
          return jsonOk({
            items: [],
            pagination: { page: 1, pageSize: 10, total: 0, hasNextPage: false },
          });
        }
        return jsonOk(sampleProfile);
      }),
    );
    renderProfile();
    expect(await screen.findByTestId('passenger-bookings-empty')).toBeInTheDocument();
    expect(screen.getByTestId('passenger-cancellations-empty')).toBeInTheDocument();
  });

  it('retries booking history errors independently', async () => {
    const user = userEvent.setup({ delay: null });
    let bookingsFail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/bookings')) {
          if (bookingsFail) {
            return jsonErr(500, 'INTERNAL', 'Bookings unavailable');
          }
          return jsonOk(sampleBookings);
        }
        if (url.includes('/cancellations')) return jsonOk(sampleCancellations);
        return jsonOk(sampleProfile);
      }),
    );
    renderProfile();
    expect(await screen.findByTestId('passenger-bookings-error')).toHaveTextContent(
      'Bookings unavailable',
    );
    expect(screen.getByTestId('passenger-cancellations-table')).toBeInTheDocument();
    bookingsFail = false;
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByTestId('passenger-bookings-table')).toBeInTheDocument();
  });

  it('preserves directory query params when returning from profile', async () => {
    const user = userEvent.setup();
    const directoryQuery = 'q=Ama&status=ACTIVE&page=2&pageSize=10';
    const directoryList: AdminPassengerListResponse = {
      items: [
        {
          id: passengerId,
          phoneNumber: sampleProfile.phoneNumber,
          status: sampleProfile.status,
          displayName: sampleProfile.displayName,
          fullName: sampleProfile.profile!.fullName,
          createdAt: sampleProfile.createdAt,
        },
      ],
      pagination: { page: 2, pageSize: 10, total: 11, hasNextPage: false },
    };

    function DirectoryQueryProbe() {
      const [params] = useSearchParams();
      return (
        <div>
          <PassengersPage />
          <pre data-testid="directory-location-search">{params.toString()}</pre>
        </div>
      );
    }

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes(`/admin/passengers/${passengerId}/`)) {
        return routeResponse(input, init);
      }
      if (url.includes(`/admin/passengers/${passengerId}`)) {
        return jsonOk(sampleProfile);
      }
      return jsonOk(directoryList);
    });
    vi.stubGlobal('fetch', fetchMock);

    const router = createMemoryRouter(
      [
        { path: '/passengers', element: <DirectoryQueryProbe /> },
        { path: '/passengers/:passengerId', element: <PassengerProfilePage /> },
        { path: '/session-expired', element: <div>session-expired-screen</div> },
        { path: '/forbidden', element: <div>forbidden-screen</div> },
      ],
      { initialEntries: [`/passengers?${directoryQuery}`] },
    );
    render(<RouterProvider router={router} />);

    await screen.findByTestId('passengers-table');
    await user.click(screen.getByTestId(`passengers-link-${passengerId}`));
    await screen.findByTestId('passenger-profile');
    await user.click(screen.getByTestId('passenger-back'));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/passengers');
    });
    const returned = new URLSearchParams(router.state.location.search);
    expect(returned.get('q')).toBe('Ama');
    expect(returned.get('status')).toBe('ACTIVE');
    expect(returned.get('page')).toBe('2');
    expect(returned.get('pageSize')).toBe('10');
  });

  it('hides account actions for Support and Finance', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input, init) => routeResponse(input, init)));
    mockAuth = { staffRole: 'SUPPORT_ADMIN' };
    const { unmount } = renderProfile();
    await screen.findByTestId('passenger-profile');
    expect(screen.queryByTestId('passenger-account-actions')).not.toBeInTheDocument();
    unmount();

    mockAuth = { staffRole: 'FINANCE_ADMIN' };
    renderProfile();
    await screen.findByTestId('passenger-profile');
    expect(screen.queryByTestId('passenger-account-actions')).not.toBeInTheDocument();
  });

  it(
    'suspends an active passenger with confirmation and refreshes status',
    async () => {
      const user = userEvent.setup({ delay: null });
      let profile: AdminPassengerProfile = { ...sampleProfile };
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (url.endsWith('/admin/users/suspend') && init?.method === 'POST') {
            profile = { ...profile, status: 'SUSPENDED' };
            return jsonOk({
              userId: passengerId,
              status: 'SUSPENDED',
              activeTripsPreserved: 0,
              sessionsRevoked: 2,
            });
          }
          if (url.includes('/bookings')) return jsonOk(sampleBookings);
          if (url.includes('/cancellations')) return jsonOk(sampleCancellations);
          return jsonOk(profile);
        }),
      );
      renderProfile();
      await screen.findByTestId('passenger-suspend');
      await user.click(screen.getByTestId('passenger-suspend'));
      expect(screen.getByTestId('passenger-account-confirm')).toHaveTextContent(
        /not cancelled by this action/i,
      );
      await user.clear(screen.getByTestId('passenger-account-confirm-reason'));
      await user.type(screen.getByTestId('passenger-account-confirm-reason'), 'Abuse report');
      await user.click(screen.getByTestId('passenger-account-confirm-confirm'));
      expect(await screen.findByTestId('passenger-account-flash')).toHaveTextContent(
        /session\(s\) revoked/i,
      );
      expect(await screen.findByTestId('passenger-reinstate')).toBeInTheDocument();
      expect(screen.queryByTestId('passenger-suspend')).not.toBeInTheDocument();
    },
    15000,
  );

  it(
    'reinstates a suspended passenger without inventing availability semantics',
    async () => {
      const user = userEvent.setup({ delay: null });
      let profile: AdminPassengerProfile = { ...sampleProfile, status: 'SUSPENDED' };
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (url.endsWith('/admin/users/reinstate') && init?.method === 'POST') {
            profile = { ...profile, status: 'ACTIVE' };
            return jsonOk({ userId: passengerId, status: 'ACTIVE' });
          }
          if (url.includes('/bookings')) return jsonOk(sampleBookings);
          if (url.includes('/cancellations')) return jsonOk(sampleCancellations);
          return jsonOk(profile);
        }),
      );
      renderProfile();
      await screen.findByTestId('passenger-reinstate');
      await user.click(screen.getByTestId('passenger-reinstate'));
      expect(screen.getByTestId('passenger-account-confirm')).toHaveTextContent(/returns to ACTIVE/i);
      expect(screen.getByTestId('passenger-account-confirm').textContent).not.toMatch(/offline/i);
      await user.type(screen.getByTestId('passenger-account-confirm-reason'), 'Cleared');
      await user.click(screen.getByTestId('passenger-account-confirm-confirm'));
      expect(await screen.findByTestId('passenger-account-flash')).toHaveTextContent(
        /reinstated to ACTIVE/i,
      );
      expect(await screen.findByTestId('passenger-suspend')).toBeInTheDocument();
    },
    15000,
  );

  it('prevents duplicate suspend submission while busy', async () => {
    const user = userEvent.setup({ delay: null });
    let resolveSuspend!: (value: Response) => void;
    const suspendPromise = new Promise<Response>((resolve) => {
      resolveSuspend = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/admin/users/suspend') && init?.method === 'POST') {
        return suspendPromise;
      }
      if (url.includes('/bookings')) return jsonOk(sampleBookings);
      if (url.includes('/cancellations')) return jsonOk(sampleCancellations);
      return jsonOk(sampleProfile);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderProfile();
    await screen.findByTestId('passenger-suspend');
    await user.click(screen.getByTestId('passenger-suspend'));
    await user.type(screen.getByTestId('passenger-account-confirm-reason'), 'Hold account');
    await user.click(screen.getByTestId('passenger-account-confirm-confirm'));
    expect(screen.getByTestId('passenger-account-confirm-confirm')).toBeDisabled();
    await user.click(screen.getByTestId('passenger-account-confirm-confirm'));
    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).endsWith('/admin/users/suspend') &&
          (init as RequestInit | undefined)?.method === 'POST',
      ),
    ).toHaveLength(1);
    resolveSuspend(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            userId: passengerId,
            status: 'SUSPENDED',
            activeTripsPreserved: 0,
            sessionsRevoked: 1,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await screen.findByTestId('passenger-account-flash');
  });
});
