import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { fetchTokenPurchases } from '../../api/admin-tokens';
import type { TokenPurchaseStatus } from '../../api/types';
import { LoadError } from '../../components/LoadError';
import { Pagination, selectCls, tableWrap, theadCls } from '../../components/Pagination';
import { Label, Muted } from '../../components/ui';
import { formatDate, parseEnum, parsePage } from '../../lib/apiMessage';
import { formatGhsFromPesewas } from '../../lib/money';
import { useLoader } from '../../lib/useLoader';

const PURCHASE_STATUSES: readonly TokenPurchaseStatus[] = ['PENDING', 'PAID', 'FAILED', 'ABANDONED'];

export function FinancePurchasesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(
    () => ({
      page: parsePage(searchParams.get('page')),
      status: parseEnum(searchParams.get('status'), PURCHASE_STATUSES),
    }),
    [searchParams],
  );
  const { state, reload } = useLoader(
    () => fetchTokenPurchases({ page: query.page, status: query.status }),
    `${query.page}|${query.status ?? ''}`,
  );
  const busy = state.status === 'loading';

  const patch = (changes: Record<string, string | undefined>, resetPage = false) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (resetPage) next.set('page', '1');
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-1 text-2xl font-semibold text-[var(--color-text)]">Token purchases</h2>
        <Muted>
          Rider token purchases paid through Paystack. Token purchases are not connection-fee revenue
          and not transport fares.
        </Muted>
      </div>

      <div className="max-w-xs">
        <Label>Status</Label>
        <select
          className={selectCls}
          value={query.status ?? ''}
          disabled={busy}
          onChange={(e) => patch({ status: e.target.value || undefined }, true)}
          data-testid="purchases-filter-status"
        >
          <option value="">All</option>
          {PURCHASE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {state.status === 'loading' ? (
        <p className="text-sm text-[var(--color-muted)]" data-testid="purchases-loading">
          Loading purchases…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <LoadError
          testId="purchases-error"
          message={state.message}
          httpStatus={state.httpStatus}
          onRetry={reload}
        />
      ) : null}
      {state.status === 'ready' && state.data.items.length === 0 ? (
        <p
          className="rounded-lg border border-dashed border-[var(--color-border)] bg-white px-4 py-6 text-sm text-[var(--color-muted)]"
          data-testid="purchases-empty"
        >
          No purchases match this filter.
        </p>
      ) : null}
      {state.status === 'ready' && state.data.items.length > 0 ? (
        <div className={tableWrap}>
          <table className="min-w-full text-left text-sm" data-testid="purchases-table">
            <thead className={theadCls}>
              <tr>
                <th className="px-3 py-2 font-medium">Purchase</th>
                <th className="px-3 py-2 font-medium">Rider</th>
                <th className="px-3 py-2 font-medium">Package</th>
                <th className="px-3 py-2 font-medium">Price</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Payment</th>
                <th className="px-3 py-2 font-medium">Paid</th>
                <th className="px-3 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {state.data.items.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-[var(--color-border)] last:border-b-0"
                  data-testid={`purchases-row-${p.id}`}
                >
                  <td className="px-3 py-2 font-mono text-xs">{p.id}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.riderId}</td>
                  <td className="px-3 py-2">
                    {p.packageName}
                    <div className="text-xs text-[var(--color-muted)]">
                      {p.packageCode} · {p.tokenQuantity} tokens
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{formatGhsFromPesewas(p.pricePesewas)}</td>
                  <td className="px-3 py-2">{p.status}</td>
                  <td className="px-3 py-2 text-xs">
                    {p.payment ? (
                      <>
                        <div>{p.payment.status}</div>
                        <div className="font-mono text-[var(--color-muted)]">
                          {p.payment.providerReference ?? '—'}
                        </div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{formatDate(p.paidAt)}</td>
                  <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                    {formatDate(p.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {state.status === 'ready' ? (
        <Pagination
          testId="purchases-pagination"
          page={state.data.pagination.page}
          total={state.data.pagination.total}
          shown={state.data.items.length}
          hasNextPage={state.data.pagination.hasNextPage}
          busy={busy}
          onPage={(page) => patch({ page: String(page) })}
        />
      ) : null}
    </div>
  );
}
