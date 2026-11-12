import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { fetchTokenLedgers } from '../../api/admin-tokens';
import type { TokenLedgerType } from '../../api/types';
import { LoadError } from '../../components/LoadError';
import { Pagination, selectCls, tableWrap, theadCls } from '../../components/Pagination';
import { Button, Label, Muted, TextInput } from '../../components/ui';
import {
  UUID_RE,
  formatDate,
  parseEnum,
  parseIsoDatetime,
  parsePage,
} from '../../lib/apiMessage';
import { useLoader } from '../../lib/useLoader';

const LEDGER_TYPES: readonly TokenLedgerType[] = ['PURCHASE', 'DEDUCTION', 'REFUND', 'ADJUSTMENT'];

export function FinanceLedgersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(() => {
    const riderId = searchParams.get('riderId')?.trim();
    return {
      page: parsePage(searchParams.get('page')),
      type: parseEnum(searchParams.get('type'), LEDGER_TYPES),
      riderId: riderId && UUID_RE.test(riderId) ? riderId : undefined,
      from: parseIsoDatetime(searchParams.get('from')),
      to: parseIsoDatetime(searchParams.get('to')),
    };
  }, [searchParams]);
  const [riderDraft, setRiderDraft] = useState(query.riderId ?? '');
  const [fromDraft, setFromDraft] = useState(query.from ?? '');
  const [toDraft, setToDraft] = useState(query.to ?? '');

  useEffect(() => {
    setRiderDraft(query.riderId ?? '');
    setFromDraft(query.from ?? '');
    setToDraft(query.to ?? '');
  }, [query.riderId, query.from, query.to]);

  const { state, reload } = useLoader(
    () => fetchTokenLedgers(query),
    JSON.stringify(query),
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

  const apply = () => {
    const rider = riderDraft.trim();
    patch(
      {
        riderId: rider && UUID_RE.test(rider) ? rider : undefined,
        from: parseIsoDatetime(fromDraft),
        to: parseIsoDatetime(toDraft),
      },
      true,
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-1 text-2xl font-semibold text-[var(--color-text)]">Token ledgers</h2>
        <Muted>
          Append-only rider token ledger entries. Filter by type, rider UUID, and inclusive UTC
          createdAt bounds.
        </Muted>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-5">
          <div>
            <Label>Type</Label>
            <select
              className={selectCls}
              value={query.type ?? ''}
              disabled={busy}
              onChange={(e) => patch({ type: e.target.value || undefined }, true)}
              data-testid="ledgers-filter-type"
            >
              <option value="">All</option>
              {LEDGER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Rider ID</Label>
            <TextInput
              value={riderDraft}
              disabled={busy}
              placeholder="UUID"
              onChange={(e) => setRiderDraft(e.target.value)}
              data-testid="ledgers-filter-rider"
            />
          </div>
          <div>
            <Label>From (ISO UTC)</Label>
            <TextInput
              value={fromDraft}
              disabled={busy}
              placeholder="2026-01-01T00:00:00.000Z"
              onChange={(e) => setFromDraft(e.target.value)}
              data-testid="ledgers-filter-from"
            />
          </div>
          <div>
            <Label>To (ISO UTC)</Label>
            <TextInput
              value={toDraft}
              disabled={busy}
              placeholder="2026-01-31T23:59:59.999Z"
              onChange={(e) => setToDraft(e.target.value)}
              data-testid="ledgers-filter-to"
            />
          </div>
          <div className="flex items-end">
            <Button type="button" disabled={busy} onClick={apply} data-testid="ledgers-apply">
              Apply filters
            </Button>
          </div>
        </div>
      </div>

      {state.status === 'loading' ? (
        <p className="text-sm text-[var(--color-muted)]" data-testid="ledgers-loading">
          Loading ledgers…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <LoadError
          testId="ledgers-error"
          message={state.message}
          httpStatus={state.httpStatus}
          onRetry={reload}
        />
      ) : null}
      {state.status === 'ready' && state.data.items.length === 0 ? (
        <p
          className="rounded-lg border border-dashed border-[var(--color-border)] bg-white px-4 py-6 text-sm text-[var(--color-muted)]"
          data-testid="ledgers-empty"
        >
          No ledger entries match the current filters.
        </p>
      ) : null}
      {state.status === 'ready' && state.data.items.length > 0 ? (
        <div className={tableWrap}>
          <table className="min-w-full text-left text-sm" data-testid="ledgers-table">
            <thead className={theadCls}>
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Rider</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Delta</th>
                <th className="px-3 py-2 font-medium">Balance after</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium">Booking</th>
              </tr>
            </thead>
            <tbody>
              {state.data.items.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-[var(--color-border)] last:border-b-0"
                  data-testid={`ledgers-row-${e.id}`}
                >
                  <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                    {formatDate(e.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div>{e.rider.fullName}</div>
                    <div className="font-mono text-[var(--color-muted)]">{e.rider.phoneNumber}</div>
                  </td>
                  <td className="px-3 py-2">{e.type}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {e.tokenDelta > 0 ? `+${e.tokenDelta}` : e.tokenDelta}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{e.balanceAfter}</td>
                  <td className="px-3 py-2 text-xs">{e.reason}</td>
                  <td className="px-3 py-2 font-mono text-xs">{e.bookingId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {state.status === 'ready' ? (
        <Pagination
          testId="ledgers-pagination"
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
