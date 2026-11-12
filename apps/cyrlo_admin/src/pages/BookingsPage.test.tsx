import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryRouter,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
} from 'react-router-dom';

import { setUnauthorizedHandler } from '../api/client';
import type { AdminBookingListResponse } from '../api/types';
import { clearMemorySession, setMemorySession } from '../auth/session-store';
import { privilegedAccessToken } from '../test/jwt';
import { BookingsPage } from './BookingsPage';

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

const bookingA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const bookingB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const passengerId = '11111111-1111-1111-1111-111111111111';
const riderId = '33333333-3333-3333-3333-333333333333';

const sampleList: AdminBookingListResponse = {
  items: [
    {
      id: bookingA,
      status: 'COMPLETED',
      vehicleCategory: 'OKADA',
      passengerId,
      riderId,
      serviceZoneId: null,
      pickupLabel: 'Accra Mall',
      bookingFeePesewas: 100,
      paymentExpiresAt: null,
      searchExpiresAt: null,
      createdAt: '2026-10-01T10:00:00.000Z',
      acceptedAt: '2026-10-01T10:05:00.000Z',
      startedAt: '2026-10-01T10:10:00.000Z',
      cancelledAt: null,
      completedAt: '2026-10-01T10:40:00.000Z',
      cancellationReason: null,
      exactCoordinatesIncluded: false,
      passenger: {
        id: passengerId,
        phoneNumber: '+233201000010',
        displayName: 'Ama Passenger',
        status: 'ACTIVE',
      },
      rider: {
        id: riderId,
        fullName: 'Kofi Rider',
        phoneNumber: '+233201000020',
        status: 'ACTIVE',
      },
      connectionFeePayment: {
        id: '44444444-4444-4444-4444-444444444444',
        status: 'SUCCESS',
        amountPesewas: 100,
        currency: 'GHS',
        providerReference: 'bf_ok',
        createdAt: '2026-10-01T10:06:00.000Z',
      },
    },
    {
      id: bookingB,
      status: 'SEARCHING',
      vehicleCategory: 'CAR',
      passengerId,
      riderId: null,
      serviceZoneId: null,
      pickupLabel: null,
      bookingFeePesewas: 100,
      paymentExpiresAt: null,
      searchExpiresAt: '2026-10-02T10:10:00.000Z',
      createdAt: '2026-10-02T10:00:00.000Z',
      acceptedAt: null,
      startedAt: null,
      cancelledAt: null,
      completedAt: null,
      cancellationReason: null,
      exactCoordinatesIncluded: false,
      passenger: {
        id: passengerId,
        phoneNumber: '+233201000010',
        displayName: 'Ama Passenger',
        status: 'ACTIVE',
      },
      rider: null,
      connectionFeePayment: null,
    },
  ],
  pagination: { page: 1, pageSize: 20, total: 2, hasNextPage: false },
  privacy: {
    exactCoordinatesIncluded: false,
    note: 'Ordinary booking history omits exact lat/lng.',
  },
};

function renderBookings(entry = '/bookings') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/bookings" element={<BookingsPage />} />
        <Route path="/bookings/:bookingId" element={<div>detail-route</div>} />
        <Route path="/session-expired" element={<div>session-expired-screen</div>} />
        <Route path="/forbidden" element={<div>forbidden-screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BookingsPage', () => {
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

  it('loads directory rows and labels connection fee', async () => {
    const fetchMock = vi.fn(async () => jsonOk(sampleList));
    vi.stubGlobal('fetch', fetchMock);

    renderBookings();
    expect(screen.getByTestId('bookings-loading')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('bookings-table')).toBeInTheDocument();
    });

    expect(screen.getByTestId('bookings-count')).toHaveTextContent('2 bookings');
    expect(within(screen.getByTestId(`bookings-row-${bookingA}`)).getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getAllByText('Ama Passenger').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Kofi Rider')).toBeInTheDocument();
    expect(screen.getByText('Accra Mall')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Connection fee' })).toBeInTheDocument();
    expect(screen.getByText(/not a transport fare/i)).toBeInTheDocument();
    expect(within(screen.getByTestId(`bookings-row-${bookingA}`)).getByText(/Payment SUCCESS/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/admin/bookings?page=1&pageSize=20',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('applies status and date filters via query params', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('status=SEARCHING')) {
        return jsonOk({
          ...sampleList,
          items: [sampleList.items[1]!],
          pagination: { page: 1, pageSize: 20, total: 1, hasNextPage: false },
        });
      }
      return jsonOk(sampleList);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderBookings();
    await screen.findByTestId('bookings-table');
    await user.selectOptions(screen.getByTestId('bookings-filter-status'), 'SEARCHING');
    await user.clear(screen.getByTestId('bookings-filter-from'));
    await user.type(screen.getByTestId('bookings-filter-from'), '2026-10-01T00:00:00.000Z');
    await user.clear(screen.getByTestId('bookings-filter-to'));
    await user.type(screen.getByTestId('bookings-filter-to'), '2026-10-31T23:59:59.999Z');
    await user.click(screen.getByTestId('bookings-filters-apply'));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('status=SEARCHING'))).toBe(
        true,
      );
    });
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('from='))).toBe(true);
    });
    expect(
      within(await screen.findByTestId(`bookings-row-${bookingB}`)).getByText('SEARCHING'),
    ).toBeInTheDocument();
  });

  it('paginates with page and pageSize', async () => {
    const user = userEvent.setup();
    const page1: AdminBookingListResponse = {
      ...sampleList,
      items: [sampleList.items[0]!],
      pagination: { page: 1, pageSize: 10, total: 2, hasNextPage: true },
    };
    const page2: AdminBookingListResponse = {
      ...sampleList,
      items: [sampleList.items[1]!],
      pagination: { page: 2, pageSize: 10, total: 2, hasNextPage: false },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('page=2')) return jsonOk(page2);
      return jsonOk(page1);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderBookings('/bookings?pageSize=10');
    await screen.findByTestId('bookings-table');
    await user.click(screen.getByTestId('bookings-next'));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('page=2&pageSize=10'),
        expect.any(Object),
      );
    });
  });

  it('shows empty state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonOk({
          items: [],
          pagination: { page: 1, pageSize: 20, total: 0, hasNextPage: false },
          privacy: sampleList.privacy,
        }),
      ),
    );
    renderBookings();
    expect(await screen.findByTestId('bookings-empty')).toHaveTextContent(
      'No bookings match the current filters.',
    );
  });

  it('handles 401 via session expiry', async () => {
    setUnauthorizedHandler(() => {
      clearMemorySession();
    });
    vi.stubGlobal('fetch', vi.fn(async () => jsonErr(401, 'UNAUTHORIZED', 'Session expired')));
    renderBookings();
    expect(await screen.findByText('session-expired-screen')).toBeInTheDocument();
  });

  it('handles 403 without fabricating rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonErr(403, 'FORBIDDEN', 'No ViewBookingHistory')),
    );
    renderBookings();
    expect(await screen.findByTestId('bookings-error')).toHaveTextContent('Permission denied');
    expect(screen.queryByTestId('bookings-table')).not.toBeInTheDocument();
  });

  it('ignores a slower prior directory response after a newer filter request', async () => {
    const olderList: AdminBookingListResponse = {
      items: [sampleList.items[0]!],
      pagination: { page: 1, pageSize: 10, total: 40, hasNextPage: true },
      privacy: sampleList.privacy,
    };
    const newerList: AdminBookingListResponse = {
      items: [sampleList.items[1]!],
      pagination: { page: 1, pageSize: 10, total: 1, hasNextPage: false },
      privacy: sampleList.privacy,
    };

    let resolveOlder!: (value: Response) => void;
    let resolveNewer!: (value: Response) => void;
    const olderPromise = new Promise<Response>((resolve) => {
      resolveOlder = resolve;
    });
    const newerPromise = new Promise<Response>((resolve) => {
      resolveNewer = resolve;
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('status=SEARCHING')) return newerPromise;
      if (url.includes('status=COMPLETED')) return olderPromise;
      return jsonOk({
        items: [],
        pagination: { page: 1, pageSize: 20, total: 0, hasNextPage: false },
        privacy: sampleList.privacy,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const router = createMemoryRouter([{ path: '/bookings', element: <BookingsPage /> }], {
      initialEntries: ['/bookings?status=COMPLETED&page=1&pageSize=10'],
    });
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('status=COMPLETED'),
        expect.any(Object),
      );
    });

    await router.navigate('/bookings?status=SEARCHING&page=1&pageSize=10');
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('status=SEARCHING'),
        expect.any(Object),
      );
    });

    resolveNewer(
      new Response(JSON.stringify({ success: true, data: newerList }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId(`bookings-row-${bookingB}`)).toBeInTheDocument();
    });
    expect(screen.queryByTestId(`bookings-row-${bookingA}`)).not.toBeInTheDocument();
    expect(screen.getByTestId('bookings-filter-status')).toHaveValue('SEARCHING');

    resolveOlder(
      new Response(JSON.stringify({ success: true, data: olderList }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await new Promise((r) => setTimeout(r, 80));
    expect(screen.getByTestId(`bookings-row-${bookingB}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`bookings-row-${bookingA}`)).not.toBeInTheDocument();
  });

  it('navigates to detail while preserving directory query params', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async () => jsonOk(sampleList)));
    const router = createMemoryRouter(
      [
        { path: '/bookings', element: <BookingsPage /> },
        { path: '/bookings/:bookingId', element: <div>detail-route</div> },
      ],
      { initialEntries: ['/bookings?status=COMPLETED&page=1'] },
    );
    render(<RouterProvider router={router} />);
    await screen.findByTestId('bookings-table');
    await user.click(screen.getByTestId(`bookings-link-${bookingA}`));
    expect(router.state.location.pathname).toBe(`/bookings/${bookingA}`);
    expect(router.state.location.search).toContain('status=COMPLETED');
  });
});
