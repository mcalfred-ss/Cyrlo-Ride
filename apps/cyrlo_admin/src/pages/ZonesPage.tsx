import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { fetchServiceZones } from '../api/admin-zones';
import type { ServiceZoneStatus } from '../api/types';
import { LoadError } from '../components/LoadError';
import { Pagination, selectCls, tableWrap, theadCls } from '../components/Pagination';
import { Button, Label, Muted, TextInput } from '../components/ui';
import { formatDate, parseEnum, parsePage } from '../lib/apiMessage';
import { useLoader } from '../lib/useLoader';

const ZONE_STATUSES: readonly ServiceZoneStatus[] = [
  'DRAFT',
  'UNDER_REVIEW',
  'LOCKED',
  'ACTIVE',
  'SUSPENDED',
];

export function ZonesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(
    () => ({
      page: parsePage(searchParams.get('page')),
      status: parseEnum(searchParams.get('status'), ZONE_STATUSES),
      q: searchParams.get('q')?.trim() || undefined,
    }),
    [searchParams],
  );
  const [qDraft, setQDraft] = useState(query.q ?? '');
  useEffect(() => setQDraft(query.q ?? ''), [query.q]);

  const { state, reload } = useLoader(() => fetchServiceZones(query), JSON.stringify(query));
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
        <h2 className="mb-1 text-2xl font-semibold text-[var(--color-text)]">Service zones</h2>
        <Muted>
          Zones gate where bookings can be served. Open a zone to review its lifecycle and, with
          the right permission, change it.
        </Muted>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <Label>Status</Label>
            <select
              className={selectCls}
              value={query.status ?? ''}
              disabled={busy}
              onChange={(e) => patch({ status: e.target.value || undefined }, true)}
              data-testid="zones-filter-status"
            >
              <option value="">All</option>
              {ZONE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Search name</Label>
            <TextInput
              value={qDraft}
              disabled={busy}
              onChange={(e) => setQDraft(e.target.value)}
              data-testid="zones-filter-q"
            />
          </div>
          <Button
            type="button"
            disabled={busy}
            onClick={() => patch({ q: qDraft.trim() || undefined }, true)}
            data-testid="zones-apply"
          >
            Apply
          </Button>
        </div>
      </div>

      {state.status === 'loading' ? (
        <p className="text-sm text-[var(--color-muted)]" data-testid="zones-loading">
          Loading zones…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <LoadError
          testId="zones-error"
          message={state.message}
          httpStatus={state.httpStatus}
          onRetry={reload}
        />
      ) : null}
      {state.status === 'ready' && state.data.items.length === 0 ? (
        <p
          className="rounded-lg border border-dashed border-[var(--color-border)] bg-white px-4 py-6 text-sm text-[var(--color-muted)]"
          data-testid="zones-empty"
        >
          No service zones match the current filters.
        </p>
      ) : null}
      {state.status === 'ready' && state.data.items.length > 0 ? (
        <div className={tableWrap}>
          <table className="min-w-full text-left text-sm" data-testid="zones-table">
            <thead className={theadCls}>
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Active</th>
                <th className="px-3 py-2 font-medium">Boundary</th>
                <th className="px-3 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {state.data.items.map((zone) => (
                <tr
                  key={zone.id}
                  className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-slate-50"
                  data-testid={`zones-row-${zone.id}`}
                >
                  <td className="px-3 py-2">
                    <Link
                      to={`/zones/${zone.id}`}
                      className="font-medium text-[var(--color-accent)] hover:underline"
                    >
                      {zone.name}
                    </Link>
                    <div className="font-mono text-xs text-[var(--color-muted)]">{zone.id}</div>
                  </td>
                  <td className="px-3 py-2">{zone.status}</td>
                  <td className="px-3 py-2">{zone.isActive ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-2">{zone.boundaryVerificationStatus}</td>
                  <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                    {formatDate(zone.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {state.status === 'ready' ? (
        <Pagination
          testId="zones-pagination"
          page={state.data.meta.page}
          total={state.data.meta.total}
          shown={state.data.items.length}
          hasNextPage={state.data.meta.hasNextPage}
          busy={busy}
          onPage={(page) => patch({ page: String(page) })}
        />
      ) : null}
    </div>
  );
}
