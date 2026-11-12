import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import {
  fetchAdminPassenger,
  fetchPassengerBookings,
  fetchPassengerCancellations,
} from '../api/admin-passengers';
import { reinstateUser, suspendUser } from '../api/admin-users';
import {
  ApiError,
  type AdminPassengerBookingsResponse,
  type AdminPassengerCancellationsResponse,
  type AdminPassengerProfile,
} from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Button, ErrorBanner, Muted, Panel } from '../components/ui';
import { Permission, staffRoleHasPermission } from '../config/permissions';
import { ConfirmReasonPanel } from '../features/applications/ConfirmReasonPanel';
import { AccountStatusBadge, PassengerKindBadge } from '../features/riders/statusBadges';
import { formatGhsFromPesewas } from '../lib/money';

type ProfileLoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: AdminPassengerProfile }
  | { status: 'error'; message: string; code?: string; httpStatus?: number };

type ListLoadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'empty'; data: T }
  | { status: 'error'; message: string; code?: string; httpStatus?: number };

const HISTORY_PAGE_SIZE = 10;

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-[var(--color-text)]">{children}</dd>
    </div>
  );
}

export function PassengerProfilePage() {
  const { passengerId = '' } = useParams<{ passengerId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const auth = useAuth();
  const [state, setState] = useState<ProfileLoadState>({ status: 'loading' });
  const [bookingsState, setBookingsState] = useState<ListLoadState<AdminPassengerBookingsResponse>>({
    status: 'loading',
  });
  const [cancellationsState, setCancellationsState] = useState<
    ListLoadState<AdminPassengerCancellationsResponse>
  >({ status: 'loading' });
  const [bookingsPage, setBookingsPage] = useState(1);
  const [cancellationsPage, setCancellationsPage] = useState(1);
  const [accountAction, setAccountAction] = useState<'suspend' | 'reinstate' | null>(null);
  const [accountReason, setAccountReason] = useState('');
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountFlash, setAccountFlash] = useState<string | null>(null);
  const profileRequestId = useRef(0);
  const bookingsRequestId = useRef(0);
  const cancellationsRequestId = useRef(0);

  const directoryHref = `/passengers${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const canSuspendReinstate =
    auth.staffRole != null &&
    staffRoleHasPermission(auth.staffRole, Permission.SuspendReinstateRiders);

  const loadProfile = useCallback(async () => {
    if (!passengerId) {
      setState({ status: 'error', message: 'Missing passenger id', httpStatus: 400 });
      return;
    }
    const id = ++profileRequestId.current;
    setState({ status: 'loading' });
    try {
      const data = await fetchAdminPassenger(passengerId);
      if (id !== profileRequestId.current) return;
      setState({ status: 'ready', data });
    } catch (err) {
      if (id !== profileRequestId.current) return;
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
        message: err instanceof Error ? err.message : 'Failed to load passenger profile',
      });
    }
  }, [navigate, passengerId]);

  const loadBookings = useCallback(async () => {
    if (!passengerId) return;
    const id = ++bookingsRequestId.current;
    setBookingsState({ status: 'loading' });
    try {
      const data = await fetchPassengerBookings(passengerId, {
        page: bookingsPage,
        pageSize: HISTORY_PAGE_SIZE,
      });
      if (id !== bookingsRequestId.current) return;
      setBookingsState({
        status: data.items.length === 0 ? 'empty' : 'ready',
        data,
      });
    } catch (err) {
      if (id !== bookingsRequestId.current) return;
      if (err instanceof ApiError) {
        if (err.status === 401) {
          navigate('/session-expired', { replace: true });
          return;
        }
        setBookingsState({
          status: 'error',
          message: err.message,
          code: err.code,
          httpStatus: err.status,
        });
        return;
      }
      setBookingsState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to load booking history',
      });
    }
  }, [bookingsPage, navigate, passengerId]);

  const loadCancellations = useCallback(async () => {
    if (!passengerId) return;
    const id = ++cancellationsRequestId.current;
    setCancellationsState({ status: 'loading' });
    try {
      const data = await fetchPassengerCancellations(passengerId, {
        page: cancellationsPage,
        pageSize: HISTORY_PAGE_SIZE,
      });
      if (id !== cancellationsRequestId.current) return;
      setCancellationsState({
        status: data.items.length === 0 ? 'empty' : 'ready',
        data,
      });
    } catch (err) {
      if (id !== cancellationsRequestId.current) return;
      if (err instanceof ApiError) {
        if (err.status === 401) {
          navigate('/session-expired', { replace: true });
          return;
        }
        setCancellationsState({
          status: 'error',
          message: err.message,
          code: err.code,
          httpStatus: err.status,
        });
        return;
      }
      setCancellationsState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to load cancellation history',
      });
    }
  }, [cancellationsPage, navigate, passengerId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  useEffect(() => {
    void loadCancellations();
  }, [loadCancellations]);

  const submitAccountAction = async () => {
    if (!accountAction || !passengerId || accountBusy) return;
    setAccountBusy(true);
    setAccountError(null);
    try {
      if (accountAction === 'suspend') {
        const result = await suspendUser({ userId: passengerId, reason: accountReason.trim() });
        setAccountFlash(
          `Account suspended. ${result.sessionsRevoked} session(s) revoked. Active bookings are not cancelled by suspension.`,
        );
      } else {
        await reinstateUser({ userId: passengerId, reason: accountReason.trim() });
        setAccountFlash('Account reinstated to ACTIVE.');
      }
      setAccountAction(null);
      setAccountReason('');
      await loadProfile();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          navigate('/session-expired', { replace: true });
          return;
        }
        setAccountError(err.message);
        return;
      }
      setAccountError(err instanceof Error ? err.message : 'Account action failed');
    } finally {
      setAccountBusy(false);
    }
  };

  const busy = state.status === 'loading' || accountBusy;
  const displayTitle =
    state.status === 'ready'
      ? state.data.profile?.fullName || state.data.displayName || 'Passenger profile'
      : 'Passenger profile';

  const bookingsPagination =
    bookingsState.status === 'ready' || bookingsState.status === 'empty'
      ? bookingsState.data.pagination
      : null;
  const cancellationsPagination =
    cancellationsState.status === 'ready' || cancellationsState.status === 'empty'
      ? cancellationsState.data.pagination
      : null;

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap items-center gap-2 text-sm" data-testid="passenger-breadcrumb">
        <Link to={directoryHref} className="text-[var(--color-accent)] hover:underline">
          Passenger directory
        </Link>
        <span className="text-[var(--color-muted)]">/</span>
        <span className="text-[var(--color-muted)]">Profile</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="mb-1 text-2xl font-semibold text-[var(--color-text)]">{displayTitle}</h2>
          <Muted>
            Operational passenger view. Exact GPS coordinates, Ghana Card numbers, and authentication
            secrets are never shown here.
          </Muted>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => navigate(directoryHref)}
          data-testid="passenger-back"
        >
          Back to directory
        </Button>
      </div>

      {accountFlash ? (
        <p
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          data-testid="passenger-account-flash"
        >
          {accountFlash}
        </p>
      ) : null}

      {state.status === 'loading' ? (
        <p className="text-sm text-[var(--color-muted)]" data-testid="passenger-profile-loading">
          Loading passenger profile…
        </p>
      ) : null}

      {state.status === 'error' ? (
        <div data-testid="passenger-profile-error">
          <ErrorBanner
            message={
              state.httpStatus === 404
                ? 'Passenger not found. The id may be invalid or the account is not a passenger.'
                : state.httpStatus === 403
                  ? `Permission denied: ${state.message}`
                  : state.message
            }
            onRetry={state.httpStatus === 404 ? undefined : () => void loadProfile()}
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

      {state.status === 'ready' ? (
        <div className="space-y-4" data-testid="passenger-profile">
          <Panel title="Identity">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Name">
                {state.data.profile?.fullName || state.data.displayName || '—'}
              </Field>
              <Field label="Phone">
                <span className="font-mono text-xs">{state.data.phoneNumber}</span>
              </Field>
              <Field label="Account kind">
                <PassengerKindBadge />
              </Field>
              <Field label="Account status">
                <AccountStatusBadge status={state.data.status} />
              </Field>
              <Field label="Registered">{formatDate(state.data.createdAt)}</Field>
              <Field label="Updated">{formatDate(state.data.updatedAt)}</Field>
              <Field label="Date of birth">
                {state.data.profile?.dateOfBirth || '—'}
              </Field>
              <Field label="Gender">{state.data.profile?.gender || '—'}</Field>
              <Field label="Home location (label)">
                {state.data.profile?.homeLocation?.trim()
                  ? state.data.profile.homeLocation
                  : '—'}
              </Field>
            </dl>
            <p className="mt-3 text-xs text-[var(--color-muted)]" data-testid="passenger-privacy-note">
              Home location is a free-text label only. Exact home coordinates are not returned by
              this API and are not displayed.
            </p>
          </Panel>

          <Panel
            title="Booking history"
            description="Paginated bookings for this passenger. Exact pickup/dropoff coordinates are omitted."
          >
            {bookingsState.status === 'loading' ? (
              <p className="text-sm text-[var(--color-muted)]" data-testid="passenger-bookings-loading">
                Loading bookings…
              </p>
            ) : null}
            {bookingsState.status === 'error' ? (
              <div data-testid="passenger-bookings-error">
                <ErrorBanner
                  message={
                    bookingsState.httpStatus === 403
                      ? `Permission denied: ${bookingsState.message}`
                      : bookingsState.message
                  }
                  onRetry={() => void loadBookings()}
                />
              </div>
            ) : null}
            {bookingsState.status === 'empty' ? (
              <p
                className="text-sm text-[var(--color-muted)]"
                data-testid="passenger-bookings-empty"
              >
                No bookings for this passenger.
              </p>
            ) : null}
            {bookingsState.status === 'ready' ? (
              <div className="overflow-x-auto" data-testid="passenger-bookings-table">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
                    <tr>
                      <th className="px-2 py-2 font-medium">Booking</th>
                      <th className="px-2 py-2 font-medium">Status</th>
                      <th className="px-2 py-2 font-medium">Category</th>
                      <th className="px-2 py-2 font-medium">Pickup</th>
                      <th className="px-2 py-2 font-medium">Rider</th>
                      <th className="px-2 py-2 font-medium">Connection fee</th>
                      <th className="px-2 py-2 font-medium">Created</th>
                      <th className="px-2 py-2 font-medium">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookingsState.data.items.map((booking) => (
                      <tr
                        key={booking.id}
                        className="border-b border-[var(--color-border)] last:border-b-0"
                        data-testid={`passenger-booking-${booking.id}`}
                      >
                        <td className="px-2 py-2 font-mono text-xs">{booking.id}</td>
                        <td className="px-2 py-2">{booking.status}</td>
                        <td className="px-2 py-2">{booking.vehicleCategory}</td>
                        <td className="px-2 py-2">{booking.pickupLabel || '—'}</td>
                        <td className="px-2 py-2 font-mono text-xs">
                          {booking.riderId || '—'}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {formatGhsFromPesewas(booking.bookingFeePesewas)}
                        </td>
                        <td className="px-2 py-2 text-xs text-[var(--color-muted)]">
                          {formatDate(booking.createdAt)}
                        </td>
                        <td className="px-2 py-2 text-xs text-[var(--color-muted)]">
                          {formatDate(booking.completedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-[var(--color-muted)]" data-testid="passenger-bookings-privacy">
                  {bookingsState.data.privacy.note} Coordinates included:{' '}
                  {bookingsState.data.privacy.exactCoordinatesIncluded ? 'yes' : 'no'}.
                </p>
              </div>
            ) : null}
            {bookingsPagination ? (
              <div
                className="mt-3 flex flex-wrap items-center justify-between gap-2"
                data-testid="passenger-bookings-pagination"
              >
                <p className="text-sm text-[var(--color-muted)]">
                  Page {bookingsPagination.page}
                  {bookingsPagination.total > 0
                    ? ` · ${bookingsPagination.total} total`
                    : null}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      bookingsState.status === 'loading' || bookingsPagination.page <= 1
                    }
                    onClick={() => setBookingsPage((page) => Math.max(1, page - 1))}
                    data-testid="passenger-bookings-prev"
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      bookingsState.status === 'loading' || !bookingsPagination.hasNextPage
                    }
                    onClick={() => setBookingsPage((page) => page + 1)}
                    data-testid="passenger-bookings-next"
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </Panel>

          <Panel
            title="Cancellation history"
            description="Booking cancellation requests for this passenger. Status values are the backend cancellation-request statuses — not booking statuses."
          >
            {cancellationsState.status === 'loading' ? (
              <p
                className="text-sm text-[var(--color-muted)]"
                data-testid="passenger-cancellations-loading"
              >
                Loading cancellations…
              </p>
            ) : null}
            {cancellationsState.status === 'error' ? (
              <div data-testid="passenger-cancellations-error">
                <ErrorBanner
                  message={
                    cancellationsState.httpStatus === 403
                      ? `Permission denied: ${cancellationsState.message}`
                      : cancellationsState.message
                  }
                  onRetry={() => void loadCancellations()}
                />
              </div>
            ) : null}
            {cancellationsState.status === 'empty' ? (
              <p
                className="text-sm text-[var(--color-muted)]"
                data-testid="passenger-cancellations-empty"
              >
                No cancellation requests for this passenger.
              </p>
            ) : null}
            {cancellationsState.status === 'ready' ? (
              <div className="overflow-x-auto" data-testid="passenger-cancellations-table">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
                    <tr>
                      <th className="px-2 py-2 font-medium">Request</th>
                      <th className="px-2 py-2 font-medium">Booking</th>
                      <th className="px-2 py-2 font-medium">Status</th>
                      <th className="px-2 py-2 font-medium">Reason</th>
                      <th className="px-2 py-2 font-medium">Recommendation</th>
                      <th className="px-2 py-2 font-medium">Created</th>
                      <th className="px-2 py-2 font-medium">Resolved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cancellationsState.data.items.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-[var(--color-border)] last:border-b-0"
                        data-testid={`passenger-cancellation-${item.id}`}
                      >
                        <td className="px-2 py-2 font-mono text-xs">{item.id}</td>
                        <td className="px-2 py-2 font-mono text-xs">{item.bookingId}</td>
                        <td className="px-2 py-2">{item.status}</td>
                        <td className="px-2 py-2">{item.reason}</td>
                        <td className="px-2 py-2">{item.recommendation || '—'}</td>
                        <td className="px-2 py-2 text-xs text-[var(--color-muted)]">
                          {formatDate(item.createdAt)}
                        </td>
                        <td className="px-2 py-2 text-xs text-[var(--color-muted)]">
                          {formatDate(item.resolvedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {cancellationsPagination ? (
              <div
                className="mt-3 flex flex-wrap items-center justify-between gap-2"
                data-testid="passenger-cancellations-pagination"
              >
                <p className="text-sm text-[var(--color-muted)]">
                  Page {cancellationsPagination.page}
                  {cancellationsPagination.total > 0
                    ? ` · ${cancellationsPagination.total} total`
                    : null}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      cancellationsState.status === 'loading' ||
                      cancellationsPagination.page <= 1
                    }
                    onClick={() => setCancellationsPage((page) => Math.max(1, page - 1))}
                    data-testid="passenger-cancellations-prev"
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      cancellationsState.status === 'loading' ||
                      !cancellationsPagination.hasNextPage
                    }
                    onClick={() => setCancellationsPage((page) => page + 1)}
                    data-testid="passenger-cancellations-next"
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </Panel>

          {canSuspendReinstate ? (
            <Panel
              title="Account actions"
              description="Suspension sets the passenger account to SUSPENDED and revokes refresh sessions. It does not cancel bookings or remove balances. Reinstatement returns the account to ACTIVE."
            >
              <div className="flex flex-wrap gap-2" data-testid="passenger-account-actions">
                {state.data.status !== 'SUSPENDED' && state.data.status !== 'DELETED' ? (
                  <Button
                    type="button"
                    variant="danger"
                    disabled={busy}
                    onClick={() => {
                      setAccountFlash(null);
                      setAccountAction('suspend');
                      setAccountReason('');
                      setAccountError(null);
                    }}
                    data-testid="passenger-suspend"
                  >
                    Suspend account
                  </Button>
                ) : null}
                {state.data.status === 'SUSPENDED' ? (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setAccountFlash(null);
                      setAccountAction('reinstate');
                      setAccountReason('');
                      setAccountError(null);
                    }}
                    data-testid="passenger-reinstate"
                  >
                    Reinstate account
                  </Button>
                ) : null}
              </div>
              {accountAction ? (
                <div className="mt-3">
                  <ConfirmReasonPanel
                    testId="passenger-account-confirm"
                    title={
                      accountAction === 'suspend'
                        ? 'Confirm suspension'
                        : 'Confirm reinstatement'
                    }
                    description={
                      accountAction === 'suspend'
                        ? 'The passenger account will become SUSPENDED and refresh sessions will be revoked. Existing bookings are not cancelled by this action.'
                        : 'The passenger account returns to ACTIVE.'
                    }
                    confirmLabel={accountAction === 'suspend' ? 'Suspend' : 'Reinstate'}
                    reasonRequired
                    reasonMinLength={2}
                    reasonMaxLength={200}
                    reason={accountReason}
                    onReasonChange={setAccountReason}
                    busy={accountBusy}
                    error={accountError}
                    danger={accountAction === 'suspend'}
                    onCancel={() => {
                      setAccountAction(null);
                      setAccountReason('');
                      setAccountError(null);
                    }}
                    onConfirm={() => void submitAccountAction()}
                  />
                </div>
              ) : null}
            </Panel>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
