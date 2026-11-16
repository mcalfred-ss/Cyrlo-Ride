import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { setUnauthorizedHandler } from '../api/client';
import { clearMemorySession, setMemorySession } from '../auth/session-store';
import type { AdminAnalytics } from '../api/types';
import { privilegedAccessToken } from '../test/jwt';
import { OverviewPage } from './OverviewPage';

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

const sampleAnalytics: AdminAnalytics = {
  generatedAt: '2026-11-12T12:00:00.000Z',
  dateRange: {
    from: '2026-11-05T00:00:00.000Z',
    to: '2026-11-12T23:59:59.999Z',
    timezone: 'UTC',
    boundInclusivity: 'inclusive',
    field: 'createdAt',
    interpretation: 'Period filters apply to createdAt inclusively in UTC.',
  },
  snapshot: {
    passengers: { total: 120, active: 110, suspended: 10 },
    riders: { registered: 45, availableApprox: 8, pendingApplications: 3 },
  },
  period: {
    bookings: {
      byStatus: { COMPLETED: 12, SEARCHING: 2 },
      completedConnections: 12,
    },
    connectionFees: {
      unitPesewas: 100,
      currency: 'GHS',
      collected: { count: 12, amountPesewas: 1200 },
      pending: { count: 1, amountPesewas: 100 },
      failed: { count: 2, amountPesewas: 200 },
    },
    refunds: {
      byStatus: {
        COMPLETED: { count: 1, amountPesewas: 100 },
        PENDING: { count: 0, amountPesewas: 0 },
      },
    },
    tokens: {
      purchases: { count: 4, amountPesewas: 4000, currency: 'GHS' },
      usage: { deductionCount: 9, tokensDeducted: 27 },
    },
  },
  exclusions: {
    transportationFareRevenue: false,
    note: 'Cyrlo does not collect transportation fares.',
    abandonedBookingFeePayments: 'ABANDONED booking-fee payments are excluded from fee buckets.',
  },
};

const emptyAnalytics: AdminAnalytics = {
  ...sampleAnalytics,
  period: {
    bookings: { byStatus: {}, completedConnections: 0 },
    connectionFees: {
      unitPesewas: 100,
      currency: 'GHS',
      collected: { count: 0, amountPesewas: 0 },
      pending: { count: 0, amountPesewas: 0 },
      failed: { count: 0, amountPesewas: 0 },
    },
    refunds: { byStatus: {} },
    tokens: {
      purchases: { count: 0, amountPesewas: 0, currency: 'GHS' },
      usage: { deductionCount: 0, tokensDeducted: 0 },
    },
  },
};

function renderOverview() {
  return render(
    <MemoryRouter initialEntries={['/overview']}>
      <Routes>
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/session-expired" element={<div>session-expired-screen</div>} />
        <Route path="/forbidden" element={<div>forbidden-screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OverviewPage', () => {
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

  it('loads analytics and shows financial labels as separate totals', async () => {
    const fetchMock = vi.fn(async () => jsonOk(sampleAnalytics));
    vi.stubGlobal('fetch', fetchMock);

    renderOverview();

    expect(screen.getByTestId('overview-loading')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Platform snapshot')).toBeInTheDocument();
    });

    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('Available riders (approx)')).toBeInTheDocument();
    expect(screen.getByText(/Snapshot estimate/i)).toBeInTheDocument();

    expect(screen.getByText('Collected (gross)')).toBeInTheDocument();
    expect(screen.getByText('GH₵12.00')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Refunds')).toBeInTheDocument();
    expect(screen.getByText('Purchases (SUCCESS)')).toBeInTheDocument();
    expect(screen.getByText('GH₵40.00')).toBeInTheDocument();
    expect(screen.getByText(/27 tokens/i)).toBeInTheDocument();
    expect(screen.getByTestId('overview-exclusions')).toHaveTextContent(
      /does not collect transportation fares/i,
    );
    expect(screen.queryByText(/^Revenue$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Not subtracted into a silent net revenue figure/i)).toBeInTheDocument();
  });

  it('sends from/to on date filter apply and omits them for all time', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () =>
      jsonOk(sampleAnalytics),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderOverview();
    await screen.findByText('Platform snapshot');

    const firstUrl = String(fetchMock.mock.calls[0]?.[0] ?? '');
    expect(firstUrl).toContain('/admin/analytics?');
    expect(firstUrl).toContain('from=');
    expect(firstUrl).toContain('to=');

    await user.click(screen.getByRole('button', { name: 'All time' }));

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(urls.some((url) => /\/admin\/analytics$/.test(url))).toBe(true);
    });
  });

  it('shows empty period messaging while keeping snapshot cards', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonOk(emptyAnalytics)));
    renderOverview();

    await screen.findByTestId('overview-empty');
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('No bookings in this period.')).toBeInTheDocument();
  });

  it('shows API/network errors with retry', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockImplementationOnce(() => jsonOk(sampleAnalytics));
    vi.stubGlobal('fetch', fetchMock);

    renderOverview();

    await screen.findByTestId('overview-error');
    expect(screen.getByText(/Cannot reach API/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('Platform snapshot');
  });

  it('navigates to session-expired on privileged 401', async () => {
    setUnauthorizedHandler(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonErr(401, 'UNAUTHORIZED', 'Session expired')),
    );

    renderOverview();

    await screen.findByText('session-expired-screen');
  });

  it('surfaces permission denial without fabricating KPIs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonErr(403, 'FORBIDDEN', 'Missing analytics permission')),
    );

    renderOverview();

    const error = await screen.findByTestId('overview-error');
    expect(within(error).getByText(/Permission denied/i)).toBeInTheDocument();
    expect(screen.queryByText('Platform snapshot')).not.toBeInTheDocument();
    expect(screen.queryByText('Collected (gross)')).not.toBeInTheDocument();
  });

  it('keeps connection-fee, refund, and token panels visible for Support-capable payloads', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonOk(sampleAnalytics)));
    renderOverview();

    await screen.findByText('Connection fees (GH₵1)');
    expect(screen.getByText('Refunds')).toBeInTheDocument();
    expect(screen.getByText('Rider tokens')).toBeInTheDocument();
    expect(screen.getByText(/not connection-fee revenue/i)).toBeInTheDocument();
  });
});
