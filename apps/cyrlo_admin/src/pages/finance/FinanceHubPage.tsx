import { useState } from 'react';
import { Link } from 'react-router-dom';

import { fetchAdminFinancialReport } from '../../api/admin-finance';
import { useAuth } from '../../auth/AuthProvider';
import { LoadError } from '../../components/LoadError';
import { Muted, Stat } from '../../components/ui';
import { Permission, staffRoleHasPermission } from '../../config/permissions';
import { ConnectionFeePanel } from '../../features/overview/ConnectionFeePanel';
import {
  type DatePreset,
  fromDatetimeLocalValue,
  localBoundsForPreset,
  rangeForPreset,
} from '../../features/overview/dateRange';
import { OverviewFilters } from '../../features/overview/OverviewFilters';
import { RefundPanel } from '../../features/overview/RefundPanel';
import { TokenPanel } from '../../features/overview/TokenPanel';
import { formatDate } from '../../lib/apiMessage';
import { useLoader } from '../../lib/useLoader';

function FinancialReport() {
  const [preset, setPreset] = useState<DatePreset>('7d');
  const initial = localBoundsForPreset('7d');
  const [fromLocal, setFromLocal] = useState(initial.fromLocal);
  const [toLocal, setToLocal] = useState(initial.toLocal);
  const [query, setQuery] = useState<{ from?: string; to?: string }>(() => {
    const range = rangeForPreset('7d');
    return { from: range.from, to: range.to };
  });
  const { state, reload } = useLoader(
    () => fetchAdminFinancialReport(query),
    `${query.from ?? ''}|${query.to ?? ''}`,
  );
  const busy = state.status === 'loading';

  const applyPreset = (next: Exclude<DatePreset, 'custom'>) => {
    setPreset(next);
    const bounds = localBoundsForPreset(next);
    setFromLocal(bounds.fromLocal);
    setToLocal(bounds.toLocal);
    const range = rangeForPreset(next);
    setQuery({ from: range.from, to: range.to });
  };

  const applyCustom = () => {
    if (!fromLocal && !toLocal) {
      setPreset('all');
      setQuery({});
      return;
    }
    setPreset('custom');
    setQuery({
      from: fromDatetimeLocalValue(fromLocal)?.toISOString(),
      to: fromDatetimeLocalValue(toLocal)?.toISOString(),
    });
  };

  return (
    <>
      <OverviewFilters
        preset={preset}
        fromLocal={fromLocal}
        toLocal={toLocal}
        busy={busy}
        onPreset={applyPreset}
        onFromLocal={(value) => {
          setPreset('custom');
          setFromLocal(value);
        }}
        onToLocal={(value) => {
          setPreset('custom');
          setToLocal(value);
        }}
        onApply={applyCustom}
      />

      {state.status === 'loading' ? (
        <p className="text-sm text-[var(--color-muted)]" data-testid="finance-hub-loading">
          Loading financial report…
        </p>
      ) : null}

      {state.status === 'error' ? (
        <LoadError
          testId="finance-hub-error"
          message={state.message}
          httpStatus={state.httpStatus}
          onRetry={reload}
        />
      ) : null}

      {state.status === 'ready' ? (
        <>
          <p className="text-xs text-[var(--color-muted)]" data-testid="finance-hub-as-of">
            As of {formatDate(state.data.generatedAt)} · {state.data.dateRange.interpretation}
          </p>
          <ConnectionFeePanel fees={state.data.period.connectionFees} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat
              label="Completed connections"
              value={String(state.data.period.completedConnections)}
              hint="Completed bookings in the period (each carries one connection fee)."
            />
          </div>
          <RefundPanel byStatus={state.data.period.refunds.byStatus} />
          <TokenPanel tokens={state.data.period.tokens} />
          <div
            className="rounded-lg border border-dashed border-[var(--color-border)] bg-white px-4 py-3 text-xs text-[var(--color-muted)]"
            data-testid="finance-hub-exclusions"
          >
            <p>
              Transportation fare revenue included:{' '}
              <strong data-testid="finance-hub-fare-flag">
                {state.data.exclusions.transportationFareRevenue ? 'Yes' : 'No'}
              </strong>
              . {state.data.exclusions.note}
            </p>
            <p className="mt-1">{state.data.exclusions.abandonedBookingFeePayments}</p>
            <p className="mt-1">{state.data.snapshot.note}</p>
          </div>
        </>
      ) : null}
    </>
  );
}

export function FinanceHubPage() {
  const auth = useAuth();
  const role = auth.staffRole;
  const canReport = role !== null && staffRoleHasPermission(role, Permission.ViewFinancialReports);
  const canPayments = role !== null && staffRoleHasPermission(role, Permission.ViewPayments);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-1 text-2xl font-semibold text-[var(--color-text)]">Finance</h2>
        <Muted>
          Connection fees are Cyrlo&apos;s fixed GH₵1 booking fee. Refund totals are never netted
          silently into fee totals, and transport fares are not collected by Cyrlo.
        </Muted>
      </div>

      {canReport ? (
        <FinancialReport />
      ) : (
        <div
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-muted)]"
          data-testid="finance-hub-no-report"
        >
          <p>Your role does not include financial reports (ViewFinancialReports).</p>
          {canPayments ? (
            <p className="mt-2">
              You can still review{' '}
              <Link
                to="/finance/refunds"
                className="font-medium text-[var(--color-accent)] hover:underline"
              >
                refunds
              </Link>{' '}
              and{' '}
              <Link
                to="/finance/purchases"
                className="font-medium text-[var(--color-accent)] hover:underline"
              >
                token purchases
              </Link>
              .
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
