import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { fetchPendingApplications, fetchRiderApplication } from '../api/admin-riders';
import {
  ApiError,
  type AdminPendingApplicationItem,
  type AdminRiderApplication,
} from '../api/types';
import { Button, ErrorBanner, Muted } from '../components/ui';
import { AccountStatusBadge, VerificationBadge } from '../features/riders/statusBadges';
import {
  formatVehicleProgress,
  summarizeVehicleReviews,
  type VehicleReviewProgress,
} from '../features/applications/vehicleProgress';

type QueueRow = AdminPendingApplicationItem & {
  vehicleProgress?: VehicleReviewProgress;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; rows: QueueRow[] }
  | { status: 'empty' }
  | { status: 'error'; message: string; httpStatus?: number };

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function ApplicationsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setState({ status: 'loading' });
    try {
      const items = await fetchPendingApplications();
      if (id !== requestId.current) return;
      if (items.length === 0) {
        setState({ status: 'empty' });
        return;
      }

      const details = await Promise.all(
        items.map(async (item) => {
          try {
            const detail = await fetchRiderApplication(item.riderId);
            return { riderId: item.riderId, detail } as {
              riderId: string;
              detail: AdminRiderApplication;
            };
          } catch {
            return { riderId: item.riderId, detail: null };
          }
        }),
      );
      if (id !== requestId.current) return;

      const byId = new Map(
        details.map((row) => [row.riderId, row.detail] as const),
      );
      const rows: QueueRow[] = items.map((item) => {
        const detail = byId.get(item.riderId);
        return {
          ...item,
          vehicleProgress: detail
            ? summarizeVehicleReviews(detail.vehicles)
            : undefined,
        };
      });
      setState({ status: 'ready', rows });
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
        message: err instanceof Error ? err.message : 'Failed to load applications',
      });
    }
  }, [navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const msg = (location.state as { notice?: string } | null)?.notice;
    if (msg) setNotice(msg);
  }, [location.state]);

  const busy = state.status === 'loading';

  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-1 text-2xl font-semibold text-[var(--color-text)]">
          Rider applications
        </h2>
        <Muted>
          Pending applications in backend FIFO order (oldest submission first). Application
          verification and vehicle verification are separate. The pending queue API is
          unpaginated.
        </Muted>
      </div>

      {notice ? (
        <p
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          data-testid="applications-notice"
        >
          {notice}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => void load()}
          data-testid="applications-refresh"
        >
          Refresh
        </Button>
      </div>

      {state.status === 'loading' ? (
        <p className="text-sm text-[var(--color-muted)]" data-testid="applications-loading">
          Loading applications…
        </p>
      ) : null}

      {state.status === 'error' ? (
        <div data-testid="applications-error">
          <ErrorBanner
            message={
              state.httpStatus === 403
                ? `Permission denied: ${state.message}`
                : state.message
            }
            onRetry={() => void load()}
            retryDisabled={busy}
          />
        </div>
      ) : null}

      {state.status === 'empty' ? (
        <p
          className="rounded-lg border border-dashed border-[var(--color-border)] bg-white px-4 py-6 text-sm text-[var(--color-muted)]"
          data-testid="applications-empty"
        >
          No pending rider applications.
        </p>
      ) : null}

      {state.status === 'ready' ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
          <table className="min-w-full text-left text-sm" data-testid="applications-table">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Applicant</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">Submitted</th>
                <th className="px-3 py-2 font-medium">Application</th>
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 font-medium">Vehicle review</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row) => (
                <tr
                  key={row.riderId}
                  className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-slate-50"
                  data-testid={`applications-row-${row.riderId}`}
                >
                  <td className="px-3 py-2">
                    <Link
                      to={`/applications/${row.riderId}`}
                      className="font-medium text-[var(--color-accent)] hover:underline"
                      data-testid={`applications-link-${row.riderId}`}
                    >
                      {row.fullName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{row.phoneNumber}</td>
                  <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                    {formatDate(row.submittedAt)}
                  </td>
                  <td className="px-3 py-2">
                    <VerificationBadge status={row.verificationStatus} />
                  </td>
                  <td className="px-3 py-2">
                    <AccountStatusBadge status={row.status} />
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                    {row.vehicleProgress
                      ? formatVehicleProgress(row.vehicleProgress)
                      : `${row.vehicleCount} vehicle${row.vehicleCount === 1 ? '' : 's'}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
