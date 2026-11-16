import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearMemorySession, setMemorySession } from '../auth/session-store';
import { privilegedAccessToken } from '../test/jwt';
import {
  executeAdminRefund,
  fetchAdminFinancialReport,
  fetchAdminRefunds,
  fetchReconciliationCases,
  fetchRefundReconciliationAttempts,
  reconcileAdminRefund,
  resolveReconciliationCase,
} from './admin-finance';
import { setUnauthorizedHandler } from './client';
import { ApiError } from './types';

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

const BASE = 'http://localhost:3000/api/v1';
const refundId = '55555555-5555-5555-5555-555555555555';

describe('admin finance API clients', () => {
  beforeEach(() => {
    clearMemorySession();
    setUnauthorizedHandler(null);
    vi.restoreAllMocks();
    vi.stubEnv('VITE_API_BASE_URL', BASE);
    setMemorySession({
      accessToken: privilegedAccessToken({ staffRole: 'FINANCE_ADMIN' }),
      refreshToken: 'refresh-token-value-20chars',
    });
  });

  it('GETs the financial report with and without a date range', async () => {
    const fetchMock = vi.fn(async () => jsonOk({ generatedAt: 'x' }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchAdminFinancialReport({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-31T23:59:59.999Z',
    });
    await fetchAdminFinancialReport();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${BASE}/admin/financial-reports?from=2026-01-01T00%3A00%3A00.000Z&to=2026-01-31T23%3A59%3A59.999Z`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${BASE}/admin/financial-reports`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('GETs refunds with optional status and attempts by refund id', async () => {
    const fetchMock = vi.fn(async () => jsonOk([]));
    vi.stubGlobal('fetch', fetchMock);

    await fetchAdminRefunds('REQUESTED');
    await fetchAdminRefunds();
    await fetchRefundReconciliationAttempts(refundId);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${BASE}/admin/payments/refunds?status=REQUESTED`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${BASE}/admin/payments/refunds`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `${BASE}/admin/payments/refunds/${refundId}/reconciliation-attempts`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('POSTs execute and reconcile with empty bodies', async () => {
    const fetchMock = vi.fn(async () => jsonOk({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await executeAdminRefund(refundId);
    await reconcileAdminRefund(refundId);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${BASE}/admin/payments/refunds/${refundId}/execute`,
      expect.objectContaining({ method: 'POST', body: '{}' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${BASE}/admin/payments/refunds/${refundId}/reconcile`,
      expect.objectContaining({ method: 'POST', body: '{}' }),
    );
  });

  it('lists and resolves reconciliation cases', async () => {
    const fetchMock = vi.fn(async () => jsonOk([]));
    vi.stubGlobal('fetch', fetchMock);

    await fetchReconciliationCases('OPEN');
    await resolveReconciliationCase('case-1', 'checked with Paystack');
    await resolveReconciliationCase('case-2');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${BASE}/admin/payments/reconciliation/cases?status=OPEN`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${BASE}/admin/payments/reconciliation/cases/case-1/resolve`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ notes: 'checked with Paystack' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `${BASE}/admin/payments/reconciliation/cases/case-2/resolve`,
      expect.objectContaining({ method: 'POST', body: '{}' }),
    );
  });

  it('propagates 403 as ApiError and 401 through the unauthorized handler', async () => {
    const unauthorized = vi.fn();
    setUnauthorizedHandler(unauthorized);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonErr(403, 'FORBIDDEN', 'Recent MFA verification is required')),
    );
    await expect(executeAdminRefund(refundId)).rejects.toMatchObject({ status: 403 });
    await expect(executeAdminRefund(refundId)).rejects.toBeInstanceOf(ApiError);

    vi.stubGlobal('fetch', vi.fn(async () => jsonErr(401, 'UNAUTHORIZED', 'Session expired')));
    await expect(fetchAdminRefunds()).rejects.toMatchObject({ status: 401 });
    expect(unauthorized).toHaveBeenCalled();
  });
});
