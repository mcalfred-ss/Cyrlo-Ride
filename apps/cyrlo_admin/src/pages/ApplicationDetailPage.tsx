import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  fetchRiderApplication,
  reviewRiderApplication,
  reviewRiderVehicle,
} from '../api/admin-riders';
import { ApiError, type AdminRiderApplication } from '../api/types';
import { Button, ErrorBanner, Muted, Panel } from '../components/ui';
import { ConfirmReasonPanel } from '../features/applications/ConfirmReasonPanel';
import {
  canApproveApplication,
  formatVehicleProgress,
  summarizeVehicleReviews,
} from '../features/applications/vehicleProgress';
import { VerificationBadge } from '../features/riders/statusBadges';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: AdminRiderApplication }
  | { status: 'error'; message: string; httpStatus?: number };

type ActionKind =
  | { type: 'vehicle'; vehicleId: string; decision: 'APPROVED' | 'REJECTED' }
  | { type: 'application'; decision: 'APPROVED' | 'REJECTED' }
  | null;

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

export function ApplicationDetailPage() {
  const { riderId = '' } = useParams<{ riderId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [action, setAction] = useState<ActionKind>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!riderId) {
      setState({ status: 'error', message: 'Missing rider id', httpStatus: 400 });
      return;
    }
    const id = ++requestId.current;
    if (!opts?.silent) {
      setState({ status: 'loading' });
    }
    try {
      const data = await fetchRiderApplication(riderId);
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
          httpStatus: err.status,
        });
        return;
      }
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to load application',
      });
    }
  }, [navigate, riderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const closeAction = () => {
    setAction(null);
    setReason('');
    setActionError(null);
  };

  const submitAction = async () => {
    if (!action || !riderId || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      if (action.type === 'vehicle') {
        await reviewRiderVehicle(action.vehicleId, {
          decision: action.decision,
          reason: action.decision === 'REJECTED' ? reason.trim() : reason.trim() || undefined,
        });
        setFlash(
          action.decision === 'APPROVED'
            ? 'Vehicle approved. Application approval is still a separate step.'
            : 'Vehicle rejected.',
        );
      } else {
        await reviewRiderApplication(riderId, {
          decision: action.decision,
          reason: action.decision === 'REJECTED' ? reason.trim() : reason.trim() || undefined,
        });
        if (action.decision === 'APPROVED') {
          navigate('/applications', {
            state: { notice: 'Application approved. Rider role is now RIDER when the API reflects it.' },
          });
          return;
        }
        navigate('/applications', {
          state: { notice: 'Application rejected.' },
        });
        return;
      }
      closeAction();
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          navigate('/session-expired', { replace: true });
          return;
        }
        if (err.status === 409 && action.type === 'application' && action.decision === 'APPROVED') {
          setActionError(
            `${err.message} Refresh the application, finish individual vehicle reviews, and ensure at least one vehicle is approved.`,
          );
          await load({ silent: true });
          return;
        }
        setActionError(err.message);
        return;
      }
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionBusy(false);
    }
  };

  const busy = state.status === 'loading' || actionBusy;
  const progress =
    state.status === 'ready' ? summarizeVehicleReviews(state.data.vehicles) : null;
  const approveReady =
    state.status === 'ready' ? canApproveApplication(state.data.vehicles) : false;

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap items-center gap-2 text-sm" data-testid="application-breadcrumb">
        <Link to="/applications" className="text-[var(--color-accent)] hover:underline">
          Applications
        </Link>
        <span className="text-[var(--color-muted)]">/</span>
        <span className="text-[var(--color-muted)]">Detail</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="mb-1 text-2xl font-semibold text-[var(--color-text)]">
            {state.status === 'ready' ? state.data.fullName : 'Application'}
          </h2>
          <Muted>
            Vehicle review and application review are separate operations. Approving an application
            never auto-approves vehicles. Identity documents and Ghana Card numbers are not shown
            here.
          </Muted>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => navigate('/applications')}
          data-testid="application-back"
        >
          Back to queue
        </Button>
      </div>

      {flash ? (
        <p
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          data-testid="application-flash"
        >
          {flash}
        </p>
      ) : null}

      {state.status === 'loading' ? (
        <p className="text-sm text-[var(--color-muted)]" data-testid="application-loading">
          Loading application…
        </p>
      ) : null}

      {state.status === 'error' ? (
        <div data-testid="application-error">
          <ErrorBanner
            message={
              state.httpStatus === 404
                ? 'Application not found.'
                : state.httpStatus === 403
                  ? `Permission denied: ${state.message}`
                  : state.message
            }
            onRetry={state.httpStatus === 404 ? undefined : () => void load()}
            retryDisabled={busy}
          />
        </div>
      ) : null}

      {state.status === 'ready' ? (
        <div className="space-y-4" data-testid="application-detail">
          <Panel title="Applicant">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Name">{state.data.fullName}</Field>
              <Field label="Application status">
                <VerificationBadge status={state.data.verificationStatus} />
              </Field>
              <Field label="Submitted">{formatDate(state.data.submittedAt)}</Field>
              <Field label="Licence number">
                {state.data.driversLicenceNumber || '—'}
              </Field>
              <Field label="Licence expiry">
                {formatDate(state.data.driversLicenceExpiry)}
              </Field>
              <Field label="Encrypted Ghana Card on file">
                {state.data.hasEncryptedGhanaCard ? 'Yes (not revealed)' : 'No'}
              </Field>
            </dl>
          </Panel>

          <Panel
            title="Vehicles"
            description={
              progress
                ? `Progress: ${formatVehicleProgress(progress)}. Review each pending vehicle before application approval.`
                : undefined
            }
          >
            {state.data.vehicles.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">No vehicles on this application.</p>
            ) : (
              <div className="space-y-3">
                {state.data.vehicles.map((vehicle) => (
                  <div
                    key={vehicle.id}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3"
                    data-testid={`application-vehicle-${vehicle.id}`}
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
                      {vehicle.rejectionReason ? (
                        <Field label="Rejection reason">{vehicle.rejectionReason}</Field>
                      ) : null}
                    </dl>
                    {vehicle.verificationStatus === 'PENDING_REVIEW' &&
                    state.data.verificationStatus === 'PENDING_REVIEW' ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setFlash(null);
                            setAction({
                              type: 'vehicle',
                              vehicleId: vehicle.id,
                              decision: 'APPROVED',
                            });
                            setReason('');
                            setActionError(null);
                          }}
                          data-testid={`vehicle-approve-${vehicle.id}`}
                        >
                          Approve vehicle
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          disabled={busy}
                          onClick={() => {
                            setFlash(null);
                            setAction({
                              type: 'vehicle',
                              vehicleId: vehicle.id,
                              decision: 'REJECTED',
                            });
                            setReason('');
                            setActionError(null);
                          }}
                          data-testid={`vehicle-reject-${vehicle.id}`}
                        >
                          Reject vehicle
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Application review actions">
            {state.data.verificationStatus !== 'PENDING_REVIEW' ? (
              <p className="text-sm text-[var(--color-muted)]" data-testid="application-not-pending">
                This application is no longer pending review.
              </p>
            ) : (
              <>
                <p className="text-sm text-[var(--color-muted)]">
                  Approval requires every vehicle to have completed individual review and at least
                  one vehicle to be approved. Approval does not change vehicle statuses.
                </p>
                {!approveReady ? (
                  <p
                    className="mt-2 text-sm text-amber-900"
                    data-testid="application-approve-blocked"
                  >
                    Application approval is blocked until vehicle reviews are complete
                    {progress ? ` (${formatVehicleProgress(progress)})` : ''}.
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={busy || !approveReady}
                    onClick={() => {
                      setFlash(null);
                      setAction({ type: 'application', decision: 'APPROVED' });
                      setReason('');
                      setActionError(null);
                    }}
                    data-testid="application-approve"
                  >
                    Approve application
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={busy}
                    onClick={() => {
                      setFlash(null);
                      setAction({ type: 'application', decision: 'REJECTED' });
                      setReason('');
                      setActionError(null);
                    }}
                    data-testid="application-reject"
                  >
                    Reject application
                  </Button>
                </div>
              </>
            )}
          </Panel>

          {action ? (
            <ConfirmReasonPanel
              testId="review-confirm"
              title={
                action.type === 'vehicle'
                  ? action.decision === 'APPROVED'
                    ? 'Confirm vehicle approval'
                    : 'Confirm vehicle rejection'
                  : action.decision === 'APPROVED'
                    ? 'Confirm application approval'
                    : 'Confirm application rejection'
              }
              description={
                action.type === 'application' && action.decision === 'APPROVED'
                  ? 'This will approve the rider application only. Vehicle statuses will not change.'
                  : action.type === 'application' && action.decision === 'REJECTED'
                    ? 'Rejecting the application will also reject any still-pending vehicles.'
                    : 'Submit this vehicle decision. Application status will not change until you review the application separately.'
              }
              confirmLabel="Confirm"
              reasonRequired={action.decision === 'REJECTED'}
              reason={reason}
              onReasonChange={setReason}
              busy={actionBusy}
              error={actionError}
              danger={action.decision === 'REJECTED'}
              onCancel={closeAction}
              onConfirm={() => void submitAction()}
            />
          ) : null}

          <Panel title="Documents (metadata only)">
            {state.data.documents.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">No document metadata on file.</p>
            ) : (
              <ul className="space-y-1 text-sm" data-testid="application-documents">
                {state.data.documents.map((doc) => (
                  <li key={doc.id}>
                    {doc.kind} · {doc.contentType} · {doc.sizeBytes} bytes
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Review history">
            {state.data.reviewHistory.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">No review decisions yet.</p>
            ) : (
              <ul className="space-y-2 text-sm" data-testid="application-history">
                {state.data.reviewHistory.map((entry) => (
                  <li key={entry.id} className="rounded border border-[var(--color-border)] px-3 py-2">
                    <span className="font-medium">{entry.decision}</span>
                    {entry.vehicleId ? (
                      <span className="text-[var(--color-muted)]"> · vehicle</span>
                    ) : (
                      <span className="text-[var(--color-muted)]"> · application</span>
                    )}
                    <span className="text-[var(--color-muted)]"> · {formatDate(entry.createdAt)}</span>
                    {entry.reason ? <p className="mt-1 text-xs">{entry.reason}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
