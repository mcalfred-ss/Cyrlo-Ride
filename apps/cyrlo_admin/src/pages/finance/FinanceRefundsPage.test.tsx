import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { setUnauthorizedHandler } from '../../api/client';
import type { AdminPaymentRefund } from '../../api/types';
import { clearMemorySession, setMemorySession } from '../../auth/session-store';
import type { StaffRole } from '../../config/permissions';
import { privilegedAccessToken } from '../../test/jwt';
import { FinanceRefundsPage } from './FinanceRefundsPage';

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

const refund: AdminPaymentRefund = {
  id: 'rrrrrrrr-rrrr-rrrr-rrrr-rrrrrrrrrrrr',
  paymentId: 'pppppppp-pppp-pppp-pppp-pppppppppppp',
  bookingId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  amountPesewas: 100,
  currency: 'GHS',
  status: 'REQUESTED',
  reason: 'Rider no-show',
  attemptNumber: 0,
  maxAttempts: 3,
  providerRefundId: null,
  providerStatus: null,
  authorizedAt: null,
  authorizedById: null,
  submittedAt: null,
  confirmedAt: null,
  nextAttemptAt: null,
  failureReason: null,
  reconciliationNote: null,
  createdAt: '2026-11-10T10:00:00.000Z',
  payment: null,
};

const attempt = {
  id: 'a1',
  outcome: 'STILL_PENDING',
  localStatus: 'PROCESSING',
  providerStatus: 'pending',
  notes: 'provider says pending',
  actorId: null,
  attemptedAt: '2026-11-11T10:00:00.000Z',
};

function installFetch(overrides: Record<string, () => Promise<Response>> = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const key = `${method} ${new URL(url).pathname.replace('/api/v1', '')}`;
    if (overrides[key]) return overrides[key]();
    if (key.endsWith('/reconciliation-attempts')) return jsonOk([attempt]);
    if (key.startsWith('GET /admin/payments/refunds')) return jsonOk([refund]);
    return jsonOk({});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage(initial = '/finance/refunds') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/finance/refunds" element={<FinanceRefundsPage />} />
        <Route path="/session-expired" element={<div>session-expired-screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('FinanceRefundsPage', () => {
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

  it('lists refunds, shows REQUESTED≠authorized≠SUCCEEDED and cap copy, and syncs status filter to the URL fetch', async () => {
    const fetchMock = installFetch();
    renderPage('/finance/refunds?status=REQUESTED');

    expect(await screen.findByTestId(`refunds-row-${refund.id}`)).toBeInTheDocument();
    const lifecycle = screen.getByTestId('refunds-lifecycle-copy');
    expect(lifecycle).toHaveTextContent(/REQUESTED is not authorized and not SUCCEEDED/i);
    expect(lifecycle).toHaveTextContent(/does not mean Finance has authorized it/i);
    expect(lifecycle).toHaveTextContent(/does not mean money has moved/i);
    expect(lifecycle).toHaveTextContent(/at most 100 refunds/i);
    expect(screen.getByTestId(`refunds-authorized-${refund.id}`)).toHaveTextContent('Not authorized');
    expect(screen.getByText('GH₵1.00')).toBeInTheDocument();
    expect(screen.getByTestId('refunds-filter-status')).toHaveValue('REQUESTED');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/admin/payments/refunds?status=REQUESTED');
  });

  it('shows authorizedAt when present and Not authorized when null', async () => {
    const user = userEvent.setup();
    const authorizedRefund: AdminPaymentRefund = {
      ...refund,
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      authorizedAt: '2026-11-11T12:30:00.000Z',
      authorizedById: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    };
    installFetch({
      'GET /admin/payments/refunds': () => jsonOk([refund, authorizedRefund]),
    });
    renderPage();

    expect(await screen.findByTestId(`refunds-authorized-${refund.id}`)).toHaveTextContent(
      'Not authorized',
    );
    expect(screen.getByTestId(`refunds-authorized-${authorizedRefund.id}`)).toHaveTextContent(
      new Date(authorizedRefund.authorizedAt!).toLocaleString(),
    );

    await user.click(screen.getByTestId(`refunds-select-${refund.id}`));
    expect(await screen.findByTestId('refund-authorized-at')).toHaveTextContent('Not authorized');

    await user.click(screen.getByTestId(`refunds-select-${authorizedRefund.id}`));
    expect(await screen.findByTestId('refund-authorized-at')).toHaveTextContent(
      new Date(authorizedRefund.authorizedAt!).toLocaleString(),
    );
  });

  it('labels MANUAL_RECONCILIATION distinctly and does not present reconcile as an ordinary retry', async () => {
    const user = userEvent.setup();
    const manual: AdminPaymentRefund = {
      ...refund,
      id: 'mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm',
      status: 'MANUAL_RECONCILIATION',
      authorizedAt: '2026-11-11T08:00:00.000Z',
    };
    installFetch({
      'GET /admin/payments/refunds': () => jsonOk([manual]),
    });
    renderPage();

    expect(await screen.findByTestId(`refunds-row-${manual.id}`)).toBeInTheDocument();
    expect(screen.getByTestId('refund-status-badge')).toHaveTextContent('Manual reconciliation');
    expect(screen.getByTestId('refund-status-badge')).toHaveAttribute(
      'data-status',
      'MANUAL_RECONCILIATION',
    );
    expect(screen.getByTestId('refunds-lifecycle-copy')).toHaveTextContent(
      /MANUAL_RECONCILIATION needs Finance review/i,
    );

    await user.click(screen.getByTestId(`refunds-select-${manual.id}`));
    expect(await screen.findByTestId('refund-manual-reconciliation-banner')).toHaveTextContent(
      /not an ordinary automatic retry/i,
    );
    expect(screen.getByTestId('refunds-reconcile-open')).toHaveTextContent(
      /Check provider status \(manual review\)/i,
    );

    await user.click(screen.getByTestId('refunds-reconcile-open'));
    expect(screen.getByTestId('refund-reconcile-panel')).toHaveTextContent(
      /Manual reconciliation check/i,
    );
    expect(screen.getByTestId('refund-reconcile-panel')).toHaveTextContent(
      /not an automatic retry/i,
    );
    expect(screen.getByTestId('refund-reconcile-panel-confirm')).toHaveTextContent(
      'Run manual check',
    );
  });

  it('selecting a row loads reconciliation attempts', async () => {
    const user = userEvent.setup();
    installFetch();
    renderPage();

    await user.click(await screen.findByTestId(`refunds-select-${refund.id}`));
    expect(await screen.findByTestId('refund-attempts-table')).toHaveTextContent(
      'provider says pending',
    );
    expect(screen.getByTestId('refund-authorized-at')).toHaveTextContent('Not authorized');
    expect(screen.getByTestId('refunds-execute-open')).toBeInTheDocument();
    expect(screen.getByTestId('refunds-reconcile-open')).toBeInTheDocument();
  });

  it('requires a reason and submits execute exactly once', async () => {
    const user = userEvent.setup();
    let resolveExecute: (r: Response) => void = () => undefined;
    const executePending = new Promise<Response>((resolve) => {
      resolveExecute = resolve;
    });
    const fetchMock = installFetch({
      [`POST /admin/payments/refunds/${refund.id}/execute`]: () => executePending,
    });
    renderPage();

    await user.click(await screen.findByTestId(`refunds-select-${refund.id}`));
    await user.click(await screen.findByTestId('refunds-execute-open'));

    const confirm = screen.getByTestId('refund-execute-panel-confirm');
    expect(confirm).toBeDisabled();
    await user.type(screen.getByTestId('refund-execute-panel-reason'), 'ok');
    expect(confirm).toBeDisabled();
    await user.type(screen.getByTestId('refund-execute-panel-reason'), ' verified with ticket');
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    await user.click(confirm);

    await waitFor(() => expect(confirm).toBeDisabled());
    const executeCalls = () =>
      fetchMock.mock.calls.filter(
        ([url, init]) => String(url).endsWith('/execute') && init?.method === 'POST',
      );
    expect(executeCalls()).toHaveLength(1);

    resolveExecute(
      new Response(JSON.stringify({ success: true, data: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(await screen.findByTestId('refunds-notice')).toHaveTextContent(/only SUCCEEDED/i);
    expect(executeCalls()).toHaveLength(1);
  });

  it('shows the recent-MFA message on 403 from execute', async () => {
    const user = userEvent.setup();
    installFetch({
      [`POST /admin/payments/refunds/${refund.id}/execute`]: () =>
        jsonErr(403, 'FORBIDDEN', 'Recent MFA verification is required'),
    });
    renderPage();

    await user.click(await screen.findByTestId(`refunds-select-${refund.id}`));
    await user.click(await screen.findByTestId('refunds-execute-open'));
    await user.type(screen.getByTestId('refund-execute-panel-reason'), 'verified with ticket');
    await user.click(screen.getByTestId('refund-execute-panel-confirm'));

    expect(await screen.findByTestId('refund-execute-panel-error')).toHaveTextContent(
      'Recent MFA verification is required — sign out and complete MFA again.',
    );
  });

  it('hides execute and reconcile for Support', async () => {
    const user = userEvent.setup();
    mockAuth = { staffRole: 'SUPPORT_ADMIN' };
    installFetch();
    renderPage();

    await user.click(await screen.findByTestId(`refunds-select-${refund.id}`));
    await screen.findByTestId('refund-attempts-table');
    expect(screen.queryByTestId('refunds-execute-open')).not.toBeInTheDocument();
    expect(screen.queryByTestId('refunds-reconcile-open')).not.toBeInTheDocument();
    expect(screen.getByTestId('refunds-readonly')).toBeInTheDocument();
  });
});
