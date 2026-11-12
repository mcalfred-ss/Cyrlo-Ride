import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { setUnauthorizedHandler } from '../../api/client';
import type { AdminFinancialReport } from '../../api/types';
import { clearMemorySession, setMemorySession } from '../../auth/session-store';
import type { StaffRole } from '../../config/permissions';
import { privilegedAccessToken } from '../../test/jwt';
import { FinanceHubPage } from './FinanceHubPage';

vi.mock('../../auth/AuthProvider', () => ({
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

const report: AdminFinancialReport = {
  generatedAt: '2026-11-12T12:00:00.000Z',
  dateRange: {
    from: '2026-11-05T00:00:00.000Z',
    to: '2026-11-12T23:59:59.999Z',
    timezone: 'UTC',
    boundInclusivity: 'inclusive',
    field: 'createdAt',
    interpretation: 'Period filters apply to createdAt inclusively in UTC.',
  },
  snapshot: { note: 'Snapshot totals ignore the date filter.' },
  period: {
    connectionFees: {
      unitPesewas: 100,
      currency: 'GHS',
      collected: { count: 12, amountPesewas: 1200 },
      pending: { count: 1, amountPesewas: 100 },
      failed: { count: 2, amountPesewas: 200 },
    },
    refunds: { byStatus: { SUCCEEDED: { count: 1, amountPesewas: 100 } } },
    tokens: {
      purchases: { count: 4, amountPesewas: 4000, currency: 'GHS' },
      usage: { deductionCount: 9, tokensDeducted: 27 },
    },
    completedConnections: 12,
  },
  exclusions: {
    transportationFareRevenue: false,
    note: 'Cyrlo does not collect transportation fares.',
    abandonedBookingFeePayments: 'ABANDONED booking-fee payments are excluded.',
  },
};

function renderHub() {
  return render(
    <MemoryRouter initialEntries={['/finance']}>
      <Routes>
        <Route path="/finance" element={<FinanceHubPage />} />
        <Route path="/session-expired" element={<div>session-expired-screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('FinanceHubPage', () => {
  beforeEach(() => {
    clearMemorySession();
    setUnauthorizedHandler(null);
    vi.restoreAllMocks();
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000/api/v1');
    mockAuth = { staffRole: 'FINANCE_ADMIN' };
    setMemorySession({
      accessToken: privilegedAccessToken({ staffRole: 'FINANCE_ADMIN' }),
      refreshToken: 'refresh-token-value-20chars',
    });
  });

  it('loads the financial report with fee, refund and token sections and exclusions', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () =>
      jsonOk(report),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderHub();

    await screen.findByText('Connection fees (GH₵1)');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/admin/financial-reports?');
    expect(screen.getByText('GH₵12.00')).toBeInTheDocument();
    expect(screen.getByText('Refunds')).toBeInTheDocument();
    expect(screen.getByText('Rider tokens')).toBeInTheDocument();
    expect(screen.getByText('Completed connections')).toBeInTheDocument();
    expect(screen.getByTestId('finance-hub-fare-flag')).toHaveTextContent('No');
    expect(screen.getByTestId('finance-hub-exclusions')).toHaveTextContent(
      /does not collect transportation fares/i,
    );
  });

  it('shows a permission error without fabricating figures on 403', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonErr(403, 'FORBIDDEN', 'Missing permission')));
    renderHub();

    expect(await screen.findByTestId('finance-hub-error')).toHaveTextContent(/Permission denied/i);
    expect(screen.queryByText('Connection fees (GH₵1)')).not.toBeInTheDocument();
  });

  it('Support sees a message and refund/purchase links without calling the report API', async () => {
    mockAuth = { staffRole: 'SUPPORT_ADMIN' };
    const fetchMock = vi.fn(async () => jsonOk(report));
    vi.stubGlobal('fetch', fetchMock);
    renderHub();

    const box = await screen.findByTestId('finance-hub-no-report');
    expect(box).toHaveTextContent(/ViewFinancialReports/);
    expect(screen.getByRole('link', { name: 'refunds' })).toHaveAttribute('href', '/finance/refunds');
    expect(screen.getByRole('link', { name: 'token purchases' })).toHaveAttribute(
      'href',
      '/finance/purchases',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
