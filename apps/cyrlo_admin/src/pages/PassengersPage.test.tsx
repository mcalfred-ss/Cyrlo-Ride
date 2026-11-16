import { render, screen, waitFor } from '@testing-library/react';
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
import type { AdminPassengerListResponse } from '../api/types';
import { clearMemorySession, setMemorySession } from '../auth/session-store';
import { privilegedAccessToken } from '../test/jwt';
import { PassengersPage } from './PassengersPage';

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

const passengerA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const passengerB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const sampleList: AdminPassengerListResponse = {
  items: [
    {
      id: passengerA,
      phoneNumber: '+233201000010',
      status: 'ACTIVE',
      displayName: 'Ama Passenger',
      fullName: 'Ama Passenger',
      createdAt: '2026-09-01T10:00:00.000Z',
    },
    {
      id: passengerB,
      phoneNumber: '+233201000011',
      status: 'SUSPENDED',
      displayName: null,
      fullName: 'Kofi Rider-Not',
      createdAt: '2026-10-15T10:00:00.000Z',
    },
  ],
  pagination: { page: 1, pageSize: 20, total: 2, hasNextPage: false },
};

function renderPassengers(entry = '/passengers') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/passengers" element={<PassengersPage />} />
        <Route path="/passengers/:passengerId" element={<div>profile-route</div>} />
        <Route path="/session-expired" element={<div>session-expired-screen</div>} />
        <Route path="/forbidden" element={<div>forbidden-screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PassengersPage', () => {
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

  it('loads directory rows and labels passenger accounts', async () => {
    const fetchMock = vi.fn(async () => jsonOk(sampleList));
    vi.stubGlobal('fetch', fetchMock);

    renderPassengers();

    expect(screen.getByTestId('passengers-loading')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('passengers-table')).toBeInTheDocument();
    });

    expect(screen.getByTestId('passengers-count')).toHaveTextContent('2 passengers');
    expect(screen.getAllByText('Passenger account').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Approved rider')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/admin/passengers?page=1&pageSize=20',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('applies search and status filters via query params', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('q=Ama') && url.includes('status=ACTIVE')) {
        return jsonOk({
          ...sampleList,
          items: [sampleList.items[0]],
          pagination: { page: 1, pageSize: 20, total: 1, hasNextPage: false },
        });
      }
      return jsonOk(sampleList);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPassengers();
    await screen.findByTestId('passengers-table');

    await user.clear(screen.getByTestId('passengers-search'));
    await user.type(screen.getByTestId('passengers-search'), 'Ama');
    await user.selectOptions(screen.getByTestId('passengers-filter-status'), 'ACTIVE');
    await user.click(screen.getByTestId('passengers-search-apply'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('q=Ama'),
        expect.any(Object),
      );
    });
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('status=ACTIVE'))).toBe(
        true,
      );
    });
    expect(await screen.findByText('Ama Passenger')).toBeInTheDocument();
  });

  it('paginates with page and pageSize', async () => {
    const user = userEvent.setup();
    const page1: AdminPassengerListResponse = {
      ...sampleList,
      items: [sampleList.items[0]!],
      pagination: { page: 1, pageSize: 10, total: 2, hasNextPage: true },
    };
    const page2: AdminPassengerListResponse = {
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

    renderPassengers('/passengers?pageSize=10');
    await screen.findByTestId('passengers-table');
    expect(screen.getByTestId('passengers-next')).not.toBeDisabled();

    await user.click(screen.getByTestId('passengers-next'));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('page=2&pageSize=10'),
        expect.any(Object),
      );
    });
    expect(await screen.findByText('Kofi Rider-Not')).toBeInTheDocument();
  });

  it('shows empty state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonOk({
          items: [],
          pagination: { page: 1, pageSize: 20, total: 0, hasNextPage: false },
        }),
      ),
    );
    renderPassengers();
    expect(await screen.findByTestId('passengers-empty')).toHaveTextContent(
      'No passengers match the current filters.',
    );
  });

  it('handles 401 via session expiry', async () => {
    setUnauthorizedHandler(() => {
      clearMemorySession();
    });
    vi.stubGlobal('fetch', vi.fn(async () => jsonErr(401, 'UNAUTHORIZED', 'Session expired')));
    renderPassengers();
    expect(await screen.findByText('session-expired-screen')).toBeInTheDocument();
  });

  it('handles 403 without fabricating rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonErr(403, 'FORBIDDEN', 'No ViewBookingHistory')),
    );
    renderPassengers();
    expect(await screen.findByTestId('passengers-error')).toHaveTextContent('Permission denied');
    expect(screen.queryByTestId('passengers-table')).not.toBeInTheDocument();
  });

  it('ignores a slower prior directory response after a newer filter/page request', async () => {
    const olderList: AdminPassengerListResponse = {
      items: [sampleList.items[0]!],
      pagination: { page: 1, pageSize: 10, total: 40, hasNextPage: true },
    };
    const newerList: AdminPassengerListResponse = {
      items: [sampleList.items[1]!],
      pagination: { page: 2, pageSize: 10, total: 3, hasNextPage: false },
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
      if (url.includes('status=SUSPENDED') && url.includes('page=2') && url.includes('q=Kofi')) {
        return newerPromise;
      }
      if (url.includes('status=ACTIVE') && url.includes('page=1') && url.includes('pageSize=10')) {
        return olderPromise;
      }
      return jsonOk({
        items: [],
        pagination: { page: 1, pageSize: 20, total: 0, hasNextPage: false },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const router = createMemoryRouter([{ path: '/passengers', element: <PassengersPage /> }], {
      initialEntries: ['/passengers?status=ACTIVE&page=1&pageSize=10'],
    });
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('status=ACTIVE'),
        expect.any(Object),
      );
    });
    expect(screen.getByTestId('passengers-loading')).toBeInTheDocument();

    await router.navigate('/passengers?q=Kofi&status=SUSPENDED&page=2&pageSize=10');

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('status=SUSPENDED'),
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
      expect(screen.getByText('Kofi Rider-Not')).toBeInTheDocument();
    });
    expect(screen.getByTestId('passengers-pagination')).toHaveTextContent('Page 2');
    expect(screen.queryByText('Ama Passenger')).not.toBeInTheDocument();

    resolveOlder(
      new Response(JSON.stringify({ success: true, data: olderList }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await new Promise((r) => setTimeout(r, 80));
    expect(screen.getByText('Kofi Rider-Not')).toBeInTheDocument();
    expect(screen.queryByText('Ama Passenger')).not.toBeInTheDocument();
    expect(screen.getByTestId('passengers-page-size')).toHaveValue('10');
    expect(screen.getByTestId('passengers-filter-status')).toHaveValue('SUSPENDED');
    expect(screen.getByTestId('passengers-search')).toHaveValue('Kofi');
  });
});
