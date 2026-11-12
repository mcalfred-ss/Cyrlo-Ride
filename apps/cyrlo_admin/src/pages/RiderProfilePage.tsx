import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { fetchAdminRider } from '../api/admin-riders';
import { ApiError, type AdminRiderProfile } from '../api/types';
import { Button, ErrorBanner, Muted, Panel } from '../components/ui';
import {
  AccountStatusBadge,
  AvailabilityBadge,
  RoleBadge,
  VerificationBadge,
} from '../features/riders/statusBadges';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: AdminRiderProfile }
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

export function RiderProfilePage() {
  const { riderId = '' } = useParams<{ riderId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const requestId = useRef(0);

  const directoryHref = `/riders${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;

  const load = useCallback(async () => {
    if (!riderId) {
      setState({ status: 'error', message: 'Missing rider id', httpStatus: 400 });
      return;
    }
    const id = ++requestId.current;
    setState({ status: 'loading' });
    try {
      const data = await fetchAdminRider(riderId);
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
        message: err instanceof Error ? err.message : 'Failed to load rider profile',
      });
    }
  }, [navigate, riderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const busy = state.status === 'loading';

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap items-center gap-2 text-sm" data-testid="rider-breadcrumb">
        <Link to={directoryHref} className="text-[var(--color-accent)] hover:underline">
          Rider directory
        </Link>
        <span className="text-[var(--color-muted)]">/</span>
        <span className="text-[var(--color-muted)]">Profile</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="mb-1 text-2xl font-semibold text-[var(--color-text)]">
            {state.status === 'ready'
              ? state.data.profile.fullName || state.data.displayName || 'Rider profile'
              : 'Rider profile'}
          </h2>
          <Muted>Operational read-only view. Exact GPS coordinates are never shown here.</Muted>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => navigate(directoryHref)}
          data-testid="rider-back"
        >
          Back to directory
        </Button>
      </div>

      {state.status === 'loading' ? (
        <p className="text-sm text-[var(--color-muted)]" data-testid="rider-profile-loading">
          Loading rider profile…
        </p>
      ) : null}

      {state.status === 'error' ? (
        <div data-testid="rider-profile-error">
          <ErrorBanner
            message={
              state.httpStatus === 404
                ? 'Rider not found. They may have no rider profile, or the id is invalid.'
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
        <div className="space-y-4" data-testid="rider-profile">
          <Panel title="Identity">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Name">
                {state.data.profile.fullName || state.data.displayName || '—'}
              </Field>
              <Field label="Phone">
                <span className="font-mono text-xs">{state.data.phoneNumber}</span>
              </Field>
              <Field label="Role">
                <RoleBadge role={state.data.role} />
              </Field>
              <Field label="Account status">
                <AccountStatusBadge status={state.data.status} />
              </Field>
              <Field label="Registered">{formatDate(state.data.createdAt)}</Field>
              <Field label="Updated">{formatDate(state.data.updatedAt)}</Field>
            </dl>
            {state.data.role === 'PASSENGER' ? (
              <p
                className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                data-testid="rider-applicant-note"
              >
                This account still has role PASSENGER. They appear here because a rider profile
                exists — they are not an approved rider solely by directory presence.
              </p>
            ) : null}
          </Panel>

          <Panel
            title="Verification"
            description={state.data.semantics.verificationStatus}
          >
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Status">
                <VerificationBadge status={state.data.profile.verificationStatus} />
              </Field>
              <Field label="Submitted">{formatDate(state.data.profile.submittedAt)}</Field>
              <Field label="Licence number">
                {state.data.profile.driversLicenceNumber || '—'}
              </Field>
              <Field label="Licence expiry">
                {formatDate(state.data.profile.driversLicenceExpiry)}
              </Field>
              <Field label="Notes">
                {state.data.profile.verificationNotes?.trim()
                  ? state.data.profile.verificationNotes
                  : '—'}
              </Field>
            </dl>
          </Panel>

          <Panel title="Vehicles">
            {state.data.vehicles.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]" data-testid="rider-vehicles-empty">
                No vehicles on file.
              </p>
            ) : (
              <div className="space-y-3">
                {state.data.vehicles.map((vehicle) => (
                  <div
                    key={vehicle.id}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3"
                    data-testid={`rider-vehicle-${vehicle.id}`}
                  >
                    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <Field label="Category">{vehicle.category}</Field>
                      <Field label="Registration">{vehicle.registrationNumber}</Field>
                      <Field label="Make / model">
                        {vehicle.make} {vehicle.model}
                      </Field>
                      <Field label="Colour">{vehicle.colour}</Field>
                      <Field label="Capacity">{String(vehicle.capacity)}</Field>
                      <Field label="Vehicle verification">{vehicle.verificationStatus}</Field>
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="Availability"
              description="Database snapshot of rider_profiles.availability — not a live presence feed."
            >
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Availability status">
                  <AvailabilityBadge status={state.data.profile.availability} />
                </Field>
                <Field label="Semantics">{state.data.semantics.availability}</Field>
              </dl>
            </Panel>

            <Panel
              title="GPS snapshot"
              description="Latest stored location row + freshness at request time. Not live tracking. Exact coordinates are omitted."
            >
              {state.data.gps ? (
                <dl className="grid gap-4 sm:grid-cols-2" data-testid="rider-gps-snapshot">
                  <Field label="GPS sharing enabled">
                    {state.data.gps.sharingEnabled ? 'Enabled' : 'Disabled'}
                  </Field>
                  <Field label="Freshness">
                    {state.data.gps.fresh ? 'Fresh' : 'Stale'}
                    <span className="ml-1 text-xs text-[var(--color-muted)]">
                      (max age {state.data.gps.maxAgeMs} ms)
                    </span>
                  </Field>
                  <Field label="Last recorded">{formatDate(state.data.gps.recordedAt)}</Field>
                  <Field label="Last received">{formatDate(state.data.gps.receivedAt)}</Field>
                  <Field label="Snapshot flag">
                    {state.data.gps.snapshot ? 'snapshot=true' : '—'}
                  </Field>
                </dl>
              ) : (
                <p className="text-sm text-[var(--color-muted)]" data-testid="rider-gps-empty">
                  No GPS snapshot on file.
                </p>
              )}
              <p className="mt-3 text-xs text-[var(--color-muted)]" data-testid="rider-gps-privacy">
                {state.data.privacy.note} Coordinates included:{' '}
                {state.data.privacy.exactCoordinatesIncluded ? 'yes' : 'no'}.
              </p>
            </Panel>
          </div>

          <Panel
            title="Tokens"
            description="Wallet balance snapshot only. Transaction history and eligibility rules are not shown here."
          >
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Current token balance">
                <span className="text-lg font-semibold tabular-nums" data-testid="rider-token-balance">
                  {state.data.tokens.balance}
                </span>
              </Field>
              <Field label="Note">{state.data.tokens.note}</Field>
            </dl>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
