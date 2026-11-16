import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearMemorySession, setMemorySession } from '../auth/session-store';
import { privilegedAccessToken } from '../test/jwt';
import {
  createTokenPackage,
  fetchTokenLedgers,
  fetchTokenPackages,
  fetchTokenPurchases,
  updateTokenPackage,
} from './admin-tokens';
import { setUnauthorizedHandler } from './client';

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

describe('admin tokens API clients', () => {
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

  it('GETs packages', async () => {
    const fetchMock = vi.fn(async () => jsonOk([]));
    vi.stubGlobal('fetch', fetchMock);
    await fetchTokenPackages();
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/admin/token-packages`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('POSTs a new package and PATCHes an update', async () => {
    const fetchMock = vi.fn(async () => jsonOk({ id: 'p1' }));
    vi.stubGlobal('fetch', fetchMock);

    const input = { code: 'STARTER', name: 'Starter', tokenQuantity: 10, pricePesewas: 1000 };
    await createTokenPackage(input);
    await updateTokenPackage('p1', { name: 'Starter+', isActive: false });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${BASE}/admin/token-packages`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${BASE}/admin/token-packages/p1`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Starter+', isActive: false }),
      }),
    );
  });

  it('GETs purchases with defaults and status', async () => {
    const fetchMock = vi.fn(async () => jsonOk({ items: [], pagination: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchTokenPurchases();
    await fetchTokenPurchases({ page: 3, pageSize: 50, status: 'PAID' });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${BASE}/admin/token-purchases?page=1&pageSize=20`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${BASE}/admin/token-purchases?page=3&pageSize=50&status=PAID`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('GETs ledgers with all filters', async () => {
    const fetchMock = vi.fn(async () => jsonOk({ items: [], pagination: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchTokenLedgers({
      page: 2,
      riderId: '33333333-3333-3333-3333-333333333333',
      type: 'DEDUCTION',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-31T23:59:59.999Z',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/admin/token-ledgers?page=2&pageSize=20&riderId=33333333-3333-3333-3333-333333333333&type=DEDUCTION&from=2026-01-01T00%3A00%3A00.000Z&to=2026-01-31T23%3A59%3A59.999Z`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('rejects with the API status on 403', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonErr(403, 'FORBIDDEN', 'Recent MFA verification is required')),
    );
    await expect(createTokenPackage({
      code: 'X',
      name: 'X',
      tokenQuantity: 1,
      pricePesewas: 100,
    })).rejects.toMatchObject({ status: 403 });
  });
});
