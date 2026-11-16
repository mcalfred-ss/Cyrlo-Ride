import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { fetchAdminBookings } from '../api/admin-bookings';
import {
  ApiError,
  type AdminBookingListResponse,
  type AdminBookingStatus,
  type AdminBookingsQuery,
} from '../api/types';
import { Button, ErrorBanner, Label, Muted, TextInput } from '../components/ui';
import { BOOKING_STATUSES } from '../features/overview/bookingStatuses';
import { formatGhsFromPesewas } from '../lib/money';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: AdminBookingListResponse }
  | { status: 'empty'; data: AdminBookingListResponse }
  | { status: 'error'; message: string; code?: string; httpStatus?: number };

const PAGE_SIZES = [10, 20, 50, 100];
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseEnum<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  if (!value) return undefined;
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function parseUuid(value: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return UUID_RE.test(trimmed) ? trimmed : undefined;
}

function parseIsoDatetime(value: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? undefined : trimmed;
}

function queryFromParams(params: URLSearchParams): AdminBookingsQuery {
  const pageRaw = Number(params.get('page') || '1');
  const pageSizeRaw = Number(params.get('pageSize') || '20');
  return {
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
    pageSize: PAGE_SIZES.includes(pageSizeRaw) ? pageSizeRaw : 20,
    status: parseEnum(params.get('status'), BOOKING_STATUSES as readonly AdminBookingStatus[]),
    passengerId: parseUuid(params.get('passengerId')),
    riderId: parseUuid(params.get('riderId')),
    serviceZoneId: parseUuid(params.get('serviceZoneId')),
    from: parseIsoDatetime(params.get('from')),
    to: parseIsoDatetime(params.get('to')),
  };
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function partyLabel(party: {
  displayName?: string | null;
  fullName?: string | null;
  phoneNumber: string;
}): string {
  return party.fullName || party.displayName || party.phoneNumber || '—';
}

export function BookingsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(() => queryFromParams(searchParams), [searchParams]);
  const [passengerDraft, setPassengerDraft] = useState(query.passengerId ?? '');
  const [riderDraft, setRiderDraft] = useState(query.riderId ?? '');
  const [zoneDraft, setZoneDraft] = useState(query.serviceZoneId ?? '');
  const [fromDraft, setFromDraft] = useState(query.from ?? '');
  const [toDraft, setToDraft] = useState(query.to ?? '');
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const requestId = useRef(0);

  useEffect(() => {
    setPassengerDraft(query.passengerId ?? '');
    setRiderDraft(query.riderId ?? '');
    setZoneDraft(query.serviceZoneId ?? '');
    setFromDraft(query.from ?? '');
    setToDraft(query.to ?? '');
  }, [query.passengerId, query.riderId, query.serviceZoneId, query.from, query.to]);

  const load = useCallback(
    async (next: AdminBookingsQuery) => {
      const id = ++requestId.current;
      setState({ status: 'loading' });
      try {
        const data = await fetchAdminBookings(next);
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
          message: err instanceof Error ? err.message : 'Failed to load bookings',
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

  const applyIdFilters = () => {
    const passengerId = passengerDraft.trim();
    const riderId = riderDraft.trim();
    const serviceZoneId = zoneDraft.trim();
    const from = fromDraft.trim();
    const to = toDraft.trim();
    patchParams(
      {
        passengerId: passengerId && UUID_RE.test(passengerId) ? passengerId : undefined,
        riderId: riderId && UUID_RE.test(riderId) ? riderId : undefined,
        serviceZoneId: serviceZoneId && UUID_RE.test(serviceZoneId) ? serviceZoneId : undefined,
        from: parseIsoDatetime(from || null),
        to: parseIsoDatetime(to || null),
      },
      true,
    );
  };

  const busy = state.status === 'loading';
  const pagination =
    state.status === 'ready' || state.status === 'empty' ? state.data.pagination : null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-1 text-2xl font-semibold text-[var(--color-text)]">Booking directory</h2>
        <Muted>
          Ordinary booking history for staff with ViewBookingHistory. Exact GPS coordinates are never
          shown. Fees shown are the GH₵1 connection fee — not a transport fare.
        </Muted>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-4">
          <div>
            <Label>Status</Label>
            <select
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)]"
              value={query.status ?? ''}
              disabled={busy}
              onChange={(e) => patchParams({ status: e.target.value || undefined }, true)}
              data-testid="bookings-filter-status"
            >
              <option value="">All</option>
              {BOOKING_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Passenger ID</Label>
            <TextInput
              value={passengerDraft}
              disabled={busy}
              placeholder="UUID"
              onChange={(e) => setPassengerDraft(e.target.value)}
              data-testid="bookings-filter-passenger"
            />
          </div>
          <div>
            <Label>Rider ID</Label>
            <TextInput
              value={riderDraft}
              disabled={busy}
              placeholder="UUID"
              onChange={(e) => setRiderDraft(e.target.value)}
              data-testid="bookings-filter-rider"
            />
          </div>
          <div>
            <Label>Service zone ID</Label>
            <TextInput
              value={zoneDraft}
              disabled={busy}
              placeholder="UUID"
              onChange={(e) => setZoneDraft(e.target.value)}
              data-testid="bookings-filter-zone"
            />
          </div>
          <div>
            <Label>From (ISO UTC)</Label>
            <TextInput
              value={fromDraft}
              disabled={busy}
              placeholder="2026-01-01T00:00:00.000Z"
              onChange={(e) => setFromDraft(e.target.value)}
              data-testid="bookings-filter-from"
            />
          </div>
          <div>
            <Label>To (ISO UTC)</Label>
            <TextInput
              value={toDraft}
              disabled={busy}
              placeholder="2026-01-31T23:59:59.999Z"
              onChange={(e) => setToDraft(e.target.value)}
              data-testid="bookings-filter-to"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              disabled={busy}
              onClick={applyIdFilters}
              data-testid="bookings-filters-apply"
            >
              Apply filters
            </Button>
          </div>
        </div>
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Free-text search is not supported by the API. Use status, UUIDs, and inclusive UTC date
          bounds on createdAt.
        </p>
      </div>

      {state.status === 'loading' ? (
        <p className="text-sm text-[var(--color-muted)]" data-testid="bookings-loading">
          Loading bookings…
        </p>
      ) : null}

      {state.status === 'error' ? (
        <div data-testid="bookings-error">
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
          data-testid="bookings-empty"
        >
          No bookings match the current filters.
        </p>
      ) : null}

      {state.status === 'ready' ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-[var(--color-muted)]" data-testid="bookings-count">
              {pagination?.total ?? state.data.items.length} booking
              {(pagination?.total ?? state.data.items.length) === 1 ? '' : 's'}
              {state.data.privacy.note ? (
                <span className="ml-2 text-xs">· {state.data.privacy.note}</span>
              ) : null}
            </p>
            <div className="flex items-center gap-2 text-sm">
              <Label>Page size</Label>
              <select
                className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1 text-sm"
                value={query.pageSize ?? 20}
                disabled={busy}
                onChange={(e) => patchParams({ pageSize: e.target.value }, true)}
                data-testid="bookings-page-size"
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
            <table className="min-w-full text-left text-sm" data-testid="bookings-table">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Booking</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Passenger</th>
                  <th className="px-3 py-2 font-medium">Rider</th>
                  <th className="px-3 py-2 font-medium">Pickup</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Connection fee</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {state.data.items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-slate-50"
                    data-testid={`bookings-row-${item.id}`}
                  >
                    <td className="px-3 py-2">
                      <Link
                        to={`/bookings/${item.id}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`}
                        className="font-mono text-xs font-medium text-[var(--color-accent)] hover:underline"
                        data-testid={`bookings-link-${item.id}`}
                      >
                        {item.id}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{item.status}</td>
                    <td className="px-3 py-2 text-xs">
                      <div>{partyLabel(item.passenger)}</div>
                      <div className="font-mono text-[var(--color-muted)]">
                        {item.passenger.phoneNumber}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {item.rider ? (
                        <>
                          <div>{partyLabel(item.rider)}</div>
                          <div className="font-mono text-[var(--color-muted)]">
                            {item.rider.phoneNumber}
                          </div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2">{item.pickupLabel || '—'}</td>
                    <td className="px-3 py-2">{item.vehicleCategory}</td>
                    <td className="px-3 py-2">
                      <div className="tabular-nums">
                        {formatGhsFromPesewas(item.bookingFeePesewas)}
                      </div>
                      <div className="text-xs text-[var(--color-muted)]">
                        {item.connectionFeePayment
                          ? `Payment ${item.connectionFeePayment.status}`
                          : 'No fee payment row'}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                      {formatDate(item.createdAt)}
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
          data-testid="bookings-pagination"
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
              data-testid="bookings-prev"
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !pagination.hasNextPage}
              onClick={() => patchParams({ page: String(pagination.page + 1) })}
              data-testid="bookings-next"
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
