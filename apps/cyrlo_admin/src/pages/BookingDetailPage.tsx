import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { fetchAdminBooking } from '../api/admin-bookings';
import { ApiError, type AdminBookingDetail } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Button, ErrorBanner, Muted, Panel } from '../components/ui';
import { Permission, staffRoleHasPermission } from '../config/permissions';
import { formatGhsFromPesewas } from '../lib/money';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: AdminBookingDetail }
  | { status: 'error'; message: string; code?: string; httpStatus?: number };

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

export function BookingDetailPage() {
  const { bookingId = '' } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const auth = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const requestId = useRef(0);

  const directoryHref = `/bookings${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const canViewPassengers =
    auth.staffRole != null &&
    staffRoleHasPermission(auth.staffRole, Permission.ViewBookingHistory);
  const canViewRiders =
    auth.staffRole != null && staffRoleHasPermission(auth.staffRole, Permission.ReviewRiders);

  const load = useCallback(async () => {
    if (!bookingId) {
      setState({ status: 'error', message: 'Missing booking id', httpStatus: 400 });
      return;
    }
    const id = ++requestId.current;
    setState({ status: 'loading' });
    try {
      const data = await fetchAdminBooking(bookingId);
      if (id !== requestId.current) return;
      setState({ status: 'ready', data });
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
        message: err instanceof Error ? err.message : 'Failed to load booking',
      });
    }
  }, [bookingId, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const busy = state.status === 'loading';

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap items-center gap-2 text-sm" data-testid="booking-breadcrumb">
        <Link to={directoryHref} className="text-[var(--color-accent)] hover:underline">
          Booking directory
        </Link>
        <span className="text-[var(--color-muted)]">/</span>
        <span className="text-[var(--color-muted)]">Detail</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="mb-1 text-2xl font-semibold text-[var(--color-text)]">
            {state.status === 'ready' ? state.data.status : 'Booking detail'}
          </h2>
          <Muted>
            Ordinary booking view. Exact trip coordinates, Ghana Card numbers, and authentication
            secrets are never shown here.
          </Muted>
          {state.status === 'ready' ? (
            <p className="mt-1 font-mono text-xs text-[var(--color-muted)]" data-testid="booking-id">
              {state.data.id}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => navigate(directoryHref)}
          data-testid="booking-back"
        >
          Back to directory
        </Button>
      </div>

      {state.status === 'loading' ? (
        <p className="text-sm text-[var(--color-muted)]" data-testid="booking-detail-loading">
          Loading booking…
        </p>
      ) : null}

      {state.status === 'error' ? (
        <div data-testid="booking-detail-error">
          <ErrorBanner
            message={
              state.httpStatus === 404
                ? 'Booking not found.'
                : state.httpStatus === 403
                  ? `Permission denied: ${state.message}`
                  : state.message
            }
            onRetry={state.httpStatus === 404 ? undefined : () => void load()}
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
        <div className="space-y-4" data-testid="booking-detail">
          <Panel title="Booking">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Status">{state.data.status}</Field>
              <Field label="Vehicle category">{state.data.vehicleCategory}</Field>
              <Field label="Pickup label">{state.data.pickupLabel || '—'}</Field>
              <Field label="Destination label">{state.data.destinationLabel || '—'}</Field>
              <Field label="Service zone">
                {state.data.serviceZone
                  ? `${state.data.serviceZone.name} (${state.data.serviceZone.status})`
                  : state.data.serviceZoneId || '—'}
              </Field>
              <Field label="Connection fee amount">
                <span className="tabular-nums">
                  {formatGhsFromPesewas(state.data.bookingFeePesewas)}
                </span>
                <span className="ml-2 text-xs text-[var(--color-muted)]">
                  Connection fee — not a transport fare
                </span>
              </Field>
            </dl>
            <p className="mt-3 text-xs text-[var(--color-muted)]" data-testid="booking-privacy-note">
              {state.data.privacy.note} Coordinates included:{' '}
              {state.data.privacy.exactCoordinatesIncluded ? 'yes' : 'no'}.
            </p>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Passenger">
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Name">{state.data.passenger.displayName || '—'}</Field>
                <Field label="Phone">
                  <span className="font-mono text-xs">{state.data.passenger.phoneNumber}</span>
                </Field>
                <Field label="Account status">{state.data.passenger.status}</Field>
                <Field label="Profile">
                  {canViewPassengers ? (
                    <Link
                      to={`/passengers/${state.data.passenger.id}`}
                      className="text-[var(--color-accent)] hover:underline"
                      data-testid="booking-passenger-link"
                    >
                      Open passenger
                    </Link>
                  ) : (
                    <span className="font-mono text-xs">{state.data.passenger.id}</span>
                  )}
                </Field>
              </dl>
            </Panel>

            <Panel title="Rider">
              {state.data.rider ? (
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name">{state.data.rider.fullName}</Field>
                  <Field label="Phone">
                    <span className="font-mono text-xs">{state.data.rider.phoneNumber}</span>
                  </Field>
                  <Field label="Account status">{state.data.rider.status}</Field>
                  <Field label="Profile">
                    {canViewRiders ? (
                      <Link
                        to={`/riders/${state.data.rider.id}`}
                        className="text-[var(--color-accent)] hover:underline"
                        data-testid="booking-rider-link"
                      >
                        Open rider
                      </Link>
                    ) : (
                      <span className="font-mono text-xs" data-testid="booking-rider-id-only">
                        {state.data.rider.id}
                      </span>
                    )}
                  </Field>
                </dl>
              ) : (
                <p className="text-sm text-[var(--color-muted)]" data-testid="booking-rider-empty">
                  No rider assigned.
                </p>
              )}
            </Panel>
          </div>

          <Panel
            title="Lifecycle timestamps"
            description="Operational timestamps from the booking record."
          >
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Created">{formatDate(state.data.createdAt)}</Field>
              <Field label="Accepted">{formatDate(state.data.acceptedAt)}</Field>
              <Field label="Started">{formatDate(state.data.startedAt)}</Field>
              <Field label="Completed">{formatDate(state.data.completedAt)}</Field>
              <Field label="Cancelled">{formatDate(state.data.cancelledAt)}</Field>
              <Field label="Payment expires">{formatDate(state.data.paymentExpiresAt)}</Field>
              <Field label="Search expires">{formatDate(state.data.searchExpiresAt)}</Field>
            </dl>
          </Panel>

          <Panel title="Cancellation">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Reason">{state.data.cancellationReason || '—'}</Field>
              <Field label="Actor type">{state.data.cancellationActorType || '—'}</Field>
            </dl>
          </Panel>

          <Panel
            title="Connection fee payment"
            description="Latest BOOKING_FEE snapshot on the list embed, plus all payment rows on detail."
          >
            {state.data.connectionFeePayment ? (
              <dl
                className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                data-testid="booking-fee-snapshot"
              >
                <Field label="Payment status">{state.data.connectionFeePayment.status}</Field>
                <Field label="Amount">
                  {formatGhsFromPesewas(state.data.connectionFeePayment.amountPesewas)}{' '}
                  {state.data.connectionFeePayment.currency}
                </Field>
                <Field label="Provider reference">
                  {state.data.connectionFeePayment.providerReference || '—'}
                </Field>
                <Field label="Created">
                  {formatDate(state.data.connectionFeePayment.createdAt)}
                </Field>
              </dl>
            ) : (
              <p className="mb-4 text-sm text-[var(--color-muted)]">No connection fee snapshot.</p>
            )}

            {state.data.payments.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]" data-testid="booking-payments-empty">
                No payment records.
              </p>
            ) : (
              <div className="overflow-x-auto" data-testid="booking-payments-table">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
                    <tr>
                      <th className="px-2 py-2 font-medium">Purpose</th>
                      <th className="px-2 py-2 font-medium">Status</th>
                      <th className="px-2 py-2 font-medium">Amount</th>
                      <th className="px-2 py-2 font-medium">Provider ref</th>
                      <th className="px-2 py-2 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.data.payments.map((payment) => (
                      <tr
                        key={payment.id}
                        className="border-b border-[var(--color-border)] last:border-b-0"
                      >
                        <td className="px-2 py-2">{payment.purpose}</td>
                        <td className="px-2 py-2">{payment.status}</td>
                        <td className="px-2 py-2 tabular-nums">
                          {formatGhsFromPesewas(payment.amountPesewas)} {payment.currency}
                        </td>
                        <td className="px-2 py-2 font-mono text-xs">
                          {payment.providerReference || '—'}
                        </td>
                        <td className="px-2 py-2 text-xs text-[var(--color-muted)]">
                          {formatDate(payment.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel
            title="Status history"
            description="Timeline uses only fromStatus, toStatus, actorType and createdAt from the ordinary booking API."
          >
            {state.data.statusHistory.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]" data-testid="booking-timeline-empty">
                No status history entries.
              </p>
            ) : (
              <ol className="space-y-3" data-testid="booking-timeline">
                {state.data.statusHistory.map((entry, index) => (
                  <li
                    key={`${entry.createdAt}-${entry.toStatus}-${index}`}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
                    data-testid={`booking-timeline-entry-${index}`}
                  >
                    <p className="text-sm font-medium text-[var(--color-text)]">
                      {entry.fromStatus ?? '—'} → {entry.toStatus}
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-muted)]">
                      Actor type: {entry.actorType} · {formatDate(entry.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
