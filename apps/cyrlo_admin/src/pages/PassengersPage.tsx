import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { fetchAdminPassengers } from '../api/admin-passengers';
import {
  ApiError,
  type AdminPassengerListItem,
  type AdminPassengerListResponse,
  type AdminPassengersQuery,
  type UserAccountStatus,
} from '../api/types';
import { Button, ErrorBanner, Label, Muted, TextInput } from '../components/ui';
import { AccountStatusBadge, PassengerKindBadge } from '../features/riders/statusBadges';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: AdminPassengerListResponse }
  | { status: 'empty'; data: AdminPassengerListResponse }
  | { status: 'error'; message: string; code?: string; httpStatus?: number };

const ACCOUNT_STATUSES: UserAccountStatus[] = ['ACTIVE', 'SUSPENDED', 'DELETED'];
const PAGE_SIZES = [10, 20, 50, 100];

function parseEnum<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  if (!value) return undefined;
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function queryFromParams(params: URLSearchParams): AdminPassengersQuery {
  const pageRaw = Number(params.get('page') || '1');
  const pageSizeRaw = Number(params.get('pageSize') || '20');
  return {
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
    pageSize: PAGE_SIZES.includes(pageSizeRaw) ? pageSizeRaw : 20,
    q: params.get('q')?.trim() || undefined,
    status: parseEnum(params.get('status'), ACCOUNT_STATUSES),
  };
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function displayName(item: AdminPassengerListItem): string {
  return item.fullName || item.displayName || '—';
}

export function PassengersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(() => queryFromParams(searchParams), [searchParams]);
  const [searchDraft, setSearchDraft] = useState(query.q ?? '');
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const requestId = useRef(0);

  useEffect(() => {
    setSearchDraft(query.q ?? '');
  }, [query.q]);

  const load = useCallback(
    async (next: AdminPassengersQuery) => {
      const id = ++requestId.current;
      setState({ status: 'loading' });
      try {
        const data = await fetchAdminPassengers(next);
        if (id !== requestId.current) return;
        setState({
          status: data.items.length === 0 ? 'empty' : 'ready',
          data,
        });
      } catch (err) {
        if (id !== requestId.current) return;
        if (err instanceof ApiError) {
          if (err.status === 401) {
            navigate('/session-expired', { replace: true });
            return;
          }
          setState({
            status: 'error',
            message: err.message,
            code: err.code,
            httpStatus: err.status,
          });
          return;
        }
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Failed to load passengers',
        });
      }
    },
    [navigate],
  );

  useEffect(() => {
    void load(query);
  }, [load, query]);

  const patchParams = (patch: Record<string, string | undefined>, resetPage = false) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    if (resetPage) next.set('page', '1');
    setSearchParams(next, { replace: true });
  };

  const applySearch = () => {
    const trimmed = searchDraft.trim();
    patchParams({ q: trimmed || undefined }, true);
  };

  const busy = state.status === 'loading';
  const pagination =
    state.status === 'ready' || state.status === 'empty' ? state.data.pagination : null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-1 text-2xl font-semibold text-[var(--color-text)]">
          Passenger directory
        </h2>
        <Muted>
          Accounts with role PASSENGER only. Rider applicants appear under Riders — this directory
          is not the rider roster.
        </Muted>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] lg:items-end">
          <div>
            <Label>Search</Label>
            <TextInput
              value={searchDraft}
              disabled={busy}
              placeholder="Name or phone"
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applySearch();
                }
              }}
              data-testid="passengers-search"
            />
          </div>
          <div>
            <Label>Account status</Label>
            <select
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)]"
              value={query.status ?? ''}
              disabled={busy}
              onChange={(e) => patchParams({ status: e.target.value || undefined }, true)}
              data-testid="passengers-filter-status"
            >
              <option value="">All</option>
              {ACCOUNT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            disabled={busy}
            onClick={applySearch}
            data-testid="passengers-search-apply"
          >
            Search
          </Button>
        </div>
      </div>

      {state.status === 'loading' ? (
        <p className="text-sm text-[var(--color-muted)]" data-testid="passengers-loading">
          Loading passengers…
        </p>
      ) : null}

      {state.status === 'error' ? (
        <div data-testid="passengers-error">
          <ErrorBanner
            message={
              state.httpStatus === 403 ? `Permission denied: ${state.message}` : state.message
            }
            onRetry={() => void load(query)}
            retryDisabled={busy}
          />
          {state.httpStatus === 403 ? (
            <Button
              type="button"
              variant="secondary"
              className="mt-2"
              onClick={() => navigate('/forbidden')}
            >
              Go to forbidden page
            </Button>
          ) : null}
        </div>
      ) : null}

      {state.status === 'empty' ? (
        <p
          className="rounded-lg border border-dashed border-[var(--color-border)] bg-white px-4 py-6 text-sm text-[var(--color-muted)]"
          data-testid="passengers-empty"
        >
          No passengers match the current filters.
        </p>
      ) : null}

      {state.status === 'ready' ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-[var(--color-muted)]" data-testid="passengers-count">
              {pagination?.total ?? state.data.items.length} passenger
              {(pagination?.total ?? state.data.items.length) === 1 ? '' : 's'}
            </p>
            <div className="flex items-center gap-2 text-sm">
              <Label>Page size</Label>
              <select
                className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1 text-sm"
                value={query.pageSize ?? 20}
                disabled={busy}
                onChange={(e) => patchParams({ pageSize: e.target.value }, true)}
                data-testid="passengers-page-size"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
            <table className="min-w-full text-left text-sm" data-testid="passengers-table">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Phone</th>
                  <th className="px-3 py-2 font-medium">Account</th>
                  <th className="px-3 py-2 font-medium">Registered</th>
                  <th className="px-3 py-2 font-medium">Kind</th>
                </tr>
              </thead>
              <tbody>
                {state.data.items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-slate-50"
                    data-testid={`passengers-row-${item.id}`}
                  >
                    <td className="px-3 py-2">
                      <Link
                        to={`/passengers/${item.id}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`}
                        className="font-medium text-[var(--color-accent)] hover:underline"
                        data-testid={`passengers-link-${item.id}`}
                      >
                        {displayName(item)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{item.phoneNumber}</td>
                    <td className="px-3 py-2">
                      <AccountStatusBadge status={item.status} />
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                      {formatDate(item.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <PassengerKindBadge />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {pagination && (state.status === 'ready' || state.status === 'empty') ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2"
          data-testid="passengers-pagination"
        >
          <p className="text-sm text-[var(--color-muted)]">
            Page {pagination.page}
            {pagination.total > 0
              ? ` · showing ${state.data.items.length} of ${pagination.total}`
              : null}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy || pagination.page <= 1}
              onClick={() => patchParams({ page: String(pagination.page - 1) })}
              data-testid="passengers-prev"
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !pagination.hasNextPage}
              onClick={() => patchParams({ page: String(pagination.page + 1) })}
              data-testid="passengers-next"
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
