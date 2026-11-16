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
import type { AdminRiderListResponse } from '../api/types';
import { clearMemorySession, setMemorySession } from '../auth/session-store';
import { privilegedAccessToken } from '../test/jwt';
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

const approvedId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const applicantId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const sampleList: AdminRiderListResponse = {
  items: [
    {
      id: approvedId,
      phoneNumber: '+233201000001',
      role: 'RIDER',
      status: 'ACTIVE',
      displayName: 'Ama Rider',
      fullName: 'Ama Rider',
      verificationStatus: 'APPROVED',
      availability: 'AVAILABLE',
      submittedAt: '2026-10-01T10:00:00.000Z',
      createdAt: '2026-09-01T10:00:00.000Z',
    },
    {
      id: applicantId,
      phoneNumber: '+233201000002',
      role: 'PASSENGER',
      status: 'ACTIVE',
      displayName: null,
      fullName: 'Kofi Applicant',
      verificationStatus: 'PENDING_REVIEW',
      availability: 'OFFLINE',
      submittedAt: '2026-11-01T10:00:00.000Z',
      createdAt: '2026-10-15T10:00:00.000Z',
    },
  ],
  pagination: { page: 1, pageSize: 20, total: 2, hasNextPage: false },
  semantics: {
    availability: 'database_snapshot',
    note: 'availability is the stored rider_profiles.availability value, not a live feed.',
  },
};

function renderRiders(entry = '/riders') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/riders" element={<RidersPage />} />
        <Route path="/riders/:riderId" element={<div>profile-route</div>} />
        <Route path="/session-expired" element={<div>session-expired-screen</div>} />
        <Route path="/forbidden" element={<div>forbidden-screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RidersPage', () => {
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

  it('loads directory rows and distinguishes applicants from approved riders', async () => {
    const fetchMock = vi.fn(async () => jsonOk(sampleList));
    vi.stubGlobal('fetch', fetchMock);

    renderRiders();

    expect(screen.getByTestId('riders-loading')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('riders-table')).toBeInTheDocument();
    });

    expect(screen.getByTestId('riders-count')).toHaveTextContent('2 rider profiles');
    expect(screen.getByText('Approved rider')).toBeInTheDocument();
    expect(screen.getByText('Pending applicant')).toBeInTheDocument();
    expect(screen.getByText('Applicant (PASSENGER)')).toBeInTheDocument();
    expect(screen.queryByText('Approved rider', { selector: 'td' })).toBeTruthy();
    expect(within(screen.getByTestId(`riders-row-${applicantId}`)).getByText('Pending applicant')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/admin/riders?page=1&pageSize=20',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('applies search and filters via query params', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('q=Kofi')) {
        return jsonOk({
          ...sampleList,
          items: [sampleList.items[1]],
          pagination: { page: 1, pageSize: 20, total: 1, hasNextPage: false },
        });
      }
      return jsonOk(sampleList);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderRiders();
    await screen.findByTestId('riders-table');

    await user.clear(screen.getByTestId('riders-search'));
    await user.type(screen.getByTestId('riders-search'), 'Kofi');
    await user.selectOptions(screen.getByTestId('riders-filter-verification'), 'PENDING_REVIEW');
    await user.click(screen.getByTestId('riders-search-apply'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('q=Kofi'),
        expect.any(Object),
      );
    });
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('verificationStatus=PENDING_REVIEW'))).toBe(
        true,
      );
    });
    expect(await screen.findByText('Kofi Applicant')).toBeInTheDocument();
  });

  it('paginates with page and pageSize', async () => {
    const user = userEvent.setup();
    const page1: AdminRiderListResponse = {
      ...sampleList,
      items: [sampleList.items[0]!],
      pagination: { page: 1, pageSize: 10, total: 2, hasNextPage: true },
    };
    const page2: AdminRiderListResponse = {
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

    renderRiders('/riders?pageSize=10');
    await screen.findByTestId('riders-table');
    expect(screen.getByTestId('riders-next')).not.toBeDisabled();

    await user.click(screen.getByTestId('riders-next'));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('page=2&pageSize=10'),
        expect.any(Object),
      );
    });
    expect(await screen.findByText('Kofi Applicant')).toBeInTheDocument();
  });

  it('shows empty state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonOk({
          items: [],
          pagination: { page: 1, pageSize: 20, total: 0, hasNextPage: false },
          semantics: sampleList.semantics,
        }),
      ),
    );
    renderRiders();
    expect(await screen.findByTestId('riders-empty')).toHaveTextContent(
      'No rider profiles match the current filters.',
    );
  });

  it('handles 401 via session expiry', async () => {
    setUnauthorizedHandler(() => {
      clearMemorySession();
    });
    vi.stubGlobal('fetch', vi.fn(async () => jsonErr(401, 'UNAUTHORIZED', 'Session expired')));
    renderRiders();
    expect(await screen.findByText('session-expired-screen')).toBeInTheDocument();
  });

  it('handles 403 without fabricating rows', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonErr(403, 'FORBIDDEN', 'No ReviewRiders')));
    renderRiders();
    expect(await screen.findByTestId('riders-error')).toHaveTextContent('Permission denied');
    expect(screen.queryByTestId('riders-table')).not.toBeInTheDocument();
  });

  it('ignores a slower prior directory response after a newer filter/page request', async () => {
    const olderList: AdminRiderListResponse = {
      items: [sampleList.items[0]!],
      pagination: { page: 1, pageSize: 10, total: 40, hasNextPage: true },
      semantics: sampleList.semantics,
    };
    const newerList: AdminRiderListResponse = {
      items: [sampleList.items[1]!],
      pagination: { page: 2, pageSize: 10, total: 3, hasNextPage: false },
      semantics: sampleList.semantics,
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
      if (
        url.includes('verificationStatus=DRAFT') &&
        url.includes('page=2') &&
        url.includes('q=Kofi')
      ) {
        return newerPromise;
      }
      if (
        url.includes('verificationStatus=APPROVED') &&
        url.includes('page=1') &&
        url.includes('pageSize=10')
      ) {
        return olderPromise;
      }
      return jsonOk({
        items: [],
        pagination: { page: 1, pageSize: 20, total: 0, hasNextPage: false },
        semantics: sampleList.semantics,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const router = createMemoryRouter([{ path: '/riders', element: <RidersPage /> }], {
      initialEntries: ['/riders?verificationStatus=APPROVED&page=1&pageSize=10&status=ACTIVE'],
    });
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('verificationStatus=APPROVED'),
        expect.any(Object),
      );
    });
    expect(screen.getByTestId('riders-loading')).toBeInTheDocument();

    await router.navigate(
      '/riders?q=Kofi&status=ACTIVE&verificationStatus=DRAFT&availability=OFFLINE&page=2&pageSize=10',
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('verificationStatus=DRAFT'),
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
      expect(screen.getByText('Kofi Applicant')).toBeInTheDocument();
    });
    expect(screen.getByTestId('riders-pagination')).toHaveTextContent('Page 2');
    expect(screen.getByTestId('riders-pagination')).toHaveTextContent('showing 1 of 3');
    expect(screen.getByTestId('riders-count')).toHaveTextContent('3 rider profiles');
    expect(screen.queryByText('Ama Rider')).not.toBeInTheDocument();

    resolveOlder(
      new Response(JSON.stringify({ success: true, data: olderList }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await new Promise((r) => setTimeout(r, 80));
    expect(screen.getByText('Kofi Applicant')).toBeInTheDocument();
    expect(screen.queryByText('Ama Rider')).not.toBeInTheDocument();
    expect(screen.getByTestId('riders-pagination')).toHaveTextContent('Page 2');
    expect(screen.getByTestId('riders-pagination')).toHaveTextContent('showing 1 of 3');
    expect(screen.getByTestId('riders-count')).toHaveTextContent('3 rider profiles');
    expect(screen.getByTestId('riders-page-size')).toHaveValue('10');
    expect(screen.getByTestId('riders-filter-verification')).toHaveValue('DRAFT');
    expect(screen.getByTestId('riders-search')).toHaveValue('Kofi');
  });
});
