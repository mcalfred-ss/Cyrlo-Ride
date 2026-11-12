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
import type { AdminRiderListResponse, AdminRiderProfile } from '../api/types';
import { clearMemorySession, setMemorySession } from '../auth/session-store';
import { privilegedAccessToken } from '../test/jwt';
import { RiderProfilePage } from './RiderProfilePage';
import { RidersPage } from './RidersPage';

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

const sampleProfile: AdminRiderProfile = {
  id: riderId,
  phoneNumber: '+233201000001',
  role: 'PASSENGER',
  status: 'ACTIVE',
  displayName: null,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  profile: {
    fullName: 'Kofi Applicant',
    verificationStatus: 'PENDING_REVIEW',
    availability: 'OFFLINE',
    submittedAt: '2026-11-01T10:00:00.000Z',
    driversLicenceNumber: 'DL-12345',
    driversLicenceExpiry: '2027-01-01T00:00:00.000Z',
    verificationNotes: 'Needs clearer licence photo',
  },
  vehicles: [
    {
      id: 'vvvvvvvv-vvvv-vvvv-vvvv-vvvvvvvvvvvv',
      category: 'OKADA',
      registrationNumber: 'GR-1234-20',
      make: 'Honda',
      model: 'CG125',
      colour: 'Red',
      capacity: 1,
      verificationStatus: 'PENDING_REVIEW',
      rejectionReason: null,
      submittedAt: '2026-11-01T10:00:00.000Z',
      reviewedAt: null,
    },
  ],
  gps: {
    sharingEnabled: true,
    recordedAt: '2026-11-12T12:00:00.000Z',
    receivedAt: '2026-11-12T12:00:05.000Z',
    fresh: false,
    maxAgeMs: 30000,
    snapshot: true,
  },
  tokens: {
    balance: 12,
    note: 'Current wallet balance snapshot for ops. Ledger history remains on GET /admin/token-ledgers (ViewTokenLedgers).',
  },
  privacy: {
    exactCoordinatesIncluded: false,
    note: 'Exact lat/lng are omitted here. Privileged coordinate reads use GET /admin/riders/:riderId/location when permitted.',
  },
  semantics: {
    accountStatus: 'users.status',
    verificationStatus: 'rider_profiles.verification_status',
    availability: 'rider_profiles.availability database_snapshot',
    gps: 'latest rider_locations row + freshness at request time (not a live track)',
    tokens: 'rider_wallets.token_balance snapshot',
  },
};

function renderProfile(entry = `/riders/${riderId}`) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/riders" element={<div>directory-screen</div>} />
        <Route path="/riders/:riderId" element={<RiderProfilePage />} />
        <Route path="/session-expired" element={<div>session-expired-screen</div>} />
        <Route path="/forbidden" element={<div>forbidden-screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RiderProfilePage', () => {
  beforeEach(() => {
    clearMemorySession();
    setUnauthorizedHandler(null);
    vi.restoreAllMocks();
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000/api/v1');
    setMemorySession({
      accessToken: privilegedAccessToken({ staffRole: 'SUPER_ADMIN' }),
      refreshToken: 'refresh-token-value-20chars',
    });
  });

  it('loads profile sections and labels GPS as a database snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonOk(sampleProfile)));
    renderProfile();

    expect(screen.getByTestId('rider-profile-loading')).toBeInTheDocument();
    expect(await screen.findByTestId('rider-profile')).toBeInTheDocument();
    expect(screen.getByTestId('rider-breadcrumb')).toHaveTextContent('Rider directory');
    expect(screen.getByTestId('rider-applicant-note')).toBeInTheDocument();
    expect(screen.getByText('Needs clearer licence photo')).toBeInTheDocument();
    expect(screen.getByText('GR-1234-20')).toBeInTheDocument();
    expect(screen.getByTestId('rider-gps-snapshot')).toBeInTheDocument();
    expect(screen.getByText(/Not live tracking/i)).toBeInTheDocument();
    expect(screen.getByTestId('rider-token-balance')).toHaveTextContent('12');
    expect(screen.getByText(/Wallet balance snapshot only/i)).toBeInTheDocument();
  });

  it('never renders exact GPS coordinates', async () => {
    const withCoords = {
      ...sampleProfile,
      gps: {
        ...sampleProfile.gps!,
        // Deliberately hostile payload — UI must not surface these keys.
        latitude: 5.6037,
        longitude: -0.187,
        lat: 5.6037,
        lng: -0.187,
      },
    };
    vi.stubGlobal('fetch', vi.fn(async () => jsonOk(withCoords)));
    const { container } = renderProfile();
    await screen.findByTestId('rider-profile');

    expect(container.textContent).not.toMatch(/5\.6037/);
    expect(container.textContent).not.toMatch(/-0\.187/);
    expect(container.textContent).not.toMatch(/latitude/i);
    expect(container.textContent).not.toMatch(/longitude/i);
    expect(screen.getByTestId('rider-gps-privacy')).toHaveTextContent('Coordinates included: no');
  });

  it('shows missing rider state on 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonErr(404, 'NOT_FOUND', 'Rider not found')));
    renderProfile();
    expect(await screen.findByTestId('rider-profile-error')).toHaveTextContent('Rider not found');
    expect(screen.queryByTestId('rider-profile')).not.toBeInTheDocument();
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
    vi.stubGlobal('fetch', vi.fn(async () => jsonErr(403, 'FORBIDDEN', 'No ReviewRiders')));
    renderProfile();
    expect(await screen.findByTestId('rider-profile-error')).toHaveTextContent('Permission denied');
    expect(screen.queryByTestId('rider-profile')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rider-token-balance')).not.toBeInTheDocument();
  });

  it('preserves directory query params when returning from profile', async () => {
    const user = userEvent.setup();
    const directoryQuery =
      'q=Kofi&status=ACTIVE&verificationStatus=PENDING_REVIEW&availability=OFFLINE&page=2&pageSize=10';

    const directoryList: AdminRiderListResponse = {
      items: [
        {
          id: riderId,
          phoneNumber: sampleProfile.phoneNumber,
          role: sampleProfile.role,
          status: sampleProfile.status,
          displayName: sampleProfile.displayName,
          fullName: sampleProfile.profile.fullName,
          verificationStatus: sampleProfile.profile.verificationStatus,
          availability: sampleProfile.profile.availability,
          submittedAt: sampleProfile.profile.submittedAt,
          createdAt: sampleProfile.createdAt,
        },
      ],
      pagination: { page: 2, pageSize: 10, total: 11, hasNextPage: false },
      semantics: {
        availability: 'database_snapshot',
        note: 'availability is the stored rider_profiles.availability value, not a live feed.',
      },
    };

    function DirectoryQueryProbe() {
      const [params] = useSearchParams();
      return (
        <div>
          <RidersPage />
          <pre data-testid="directory-location-search">{params.toString()}</pre>
        </div>
      );
    }

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(`/admin/riders/${riderId}`)) {
        return jsonOk(sampleProfile);
      }
      return jsonOk(directoryList);
    });
    vi.stubGlobal('fetch', fetchMock);

    const router = createMemoryRouter(
      [
        { path: '/riders', element: <DirectoryQueryProbe /> },
        { path: '/riders/:riderId', element: <RiderProfilePage /> },
        { path: '/session-expired', element: <div>session-expired-screen</div> },
        { path: '/forbidden', element: <div>forbidden-screen</div> },
      ],
      { initialEntries: [`/riders?${directoryQuery}`] },
    );
    render(<RouterProvider router={router} />);

    await screen.findByTestId('riders-table');
    expect(screen.getByTestId('directory-location-search')).toHaveTextContent('q=Kofi');
    expect(screen.getByTestId('directory-location-search')).toHaveTextContent('status=ACTIVE');
    expect(screen.getByTestId('directory-location-search')).toHaveTextContent(
      'verificationStatus=PENDING_REVIEW',
    );
    expect(screen.getByTestId('directory-location-search')).toHaveTextContent(
      'availability=OFFLINE',
    );
    expect(screen.getByTestId('directory-location-search')).toHaveTextContent('page=2');
    expect(screen.getByTestId('directory-location-search')).toHaveTextContent('pageSize=10');

    await user.click(screen.getByTestId(`riders-link-${riderId}`));
    await screen.findByTestId('rider-profile');
    expect(router.state.location.pathname).toBe(`/riders/${riderId}`);

    await user.click(screen.getByTestId('rider-back'));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/riders');
    });

    const returned = new URLSearchParams(router.state.location.search);
    expect(returned.get('q')).toBe('Kofi');
    expect(returned.get('status')).toBe('ACTIVE');
    expect(returned.get('verificationStatus')).toBe('PENDING_REVIEW');
    expect(returned.get('availability')).toBe('OFFLINE');
    expect(returned.get('page')).toBe('2');
    expect(returned.get('pageSize')).toBe('10');
    expect(await screen.findByTestId('directory-location-search')).toHaveTextContent('q=Kofi');
    expect(screen.getByTestId('directory-location-search')).toHaveTextContent('page=2');
    expect(screen.getByTestId('directory-location-search')).toHaveTextContent('pageSize=10');
    expect(screen.getByTestId('riders-filter-verification')).toHaveValue('PENDING_REVIEW');
    expect(screen.getByTestId('riders-search')).toHaveValue('Kofi');
  });
});
