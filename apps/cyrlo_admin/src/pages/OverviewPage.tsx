import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { fetchAdminAnalytics } from '../api/admin-analytics';
import { ApiError, type AdminAnalytics } from '../api/types';
import { Button, ErrorBanner, Muted } from '../components/ui';
import { BookingStatusPanel } from '../features/overview/BookingStatusPanel';
import { ConnectionFeePanel } from '../features/overview/ConnectionFeePanel';
import {
  type DatePreset,
  fromDatetimeLocalValue,
  localBoundsForPreset,
  rangeForPreset,
} from '../features/overview/dateRange';
import { MetricCards } from '../features/overview/MetricCards';
import { OverviewFilters } from '../features/overview/OverviewFilters';
import { RefundPanel } from '../features/overview/RefundPanel';
import { TokenPanel } from '../features/overview/TokenPanel';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: AdminAnalytics }
  | { status: 'empty'; data: AdminAnalytics }
  | { status: 'error'; message: string; code?: string; httpStatus?: number };

function isEmptyPeriod(data: AdminAnalytics): boolean {
  const fees = data.period.connectionFees;
  const bookingTotal = Object.values(data.period.bookings.byStatus).reduce((a, b) => a + b, 0);
  const refundTotal = Object.values(data.period.refunds.byStatus).reduce(
    (a, b) => a + b.count,
    0,
  );
  return (
    bookingTotal === 0 &&
    fees.collected.count === 0 &&
    fees.pending.count === 0 &&
    fees.failed.count === 0 &&
    refundTotal === 0 &&
    data.period.tokens.purchases.count === 0 &&
    data.period.tokens.usage.deductionCount === 0
  );
}

export function OverviewPage() {
  const navigate = useNavigate();
  const [preset, setPreset] = useState<DatePreset>('7d');
  const initial = localBoundsForPreset('7d');
  const [fromLocal, setFromLocal] = useState(initial.fromLocal);
  const [toLocal, setToLocal] = useState(initial.toLocal);
  const [query, setQuery] = useState(() => {
    const range = rangeForPreset('7d');
    return { from: range.from, to: range.to };
  });
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const requestId = useRef(0);

  const load = useCallback(async (from?: string, to?: string) => {
    const id = ++requestId.current;
    setState({ status: 'loading' });
    try {
      const data = await fetchAdminAnalytics({ from, to });
      if (id !== requestId.current) return;
      setState({
        status: isEmptyPeriod(data) ? 'empty' : 'ready',
        data,
      });
    } catch (err) {
      if (id !== requestId.current) return;
      if (err instanceof ApiError) {
        if (err.status === 401) {
          navigate('/session-expired', { replace: true });
          return;
        }
        if (err.status === 403) {
          setState({
            status: 'error',
            message: err.message || 'You do not have permission to view analytics.',
            code: err.code,
            httpStatus: 403,
          });
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
        message: err instanceof Error ? err.message : 'Failed to load analytics',
      });
    }
  }, [navigate]);

  useEffect(() => {
    void load(query.from, query.to);
  }, [load, query.from, query.to]);

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
      setQuery({ from: undefined, to: undefined });
      return;
    }
    const fromDate = fromDatetimeLocalValue(fromLocal);
    const toDate = fromDatetimeLocalValue(toLocal);
    setPreset('custom');
    setQuery({
      from: fromDate?.toISOString(),
      to: toDate?.toISOString(),
    });
  };

  const busy = state.status === 'loading';

  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-1 text-2xl font-semibold text-[var(--color-text)]">Overview</h2>
        <Muted>
          Connection fees are Cyrlo&apos;s fixed GH₵1 booking fee. Passengers and riders negotiate
          transport fares directly — Cyrlo does not collect them. No automatic refresh.
        </Muted>
      </div>

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
        <p className="text-sm text-[var(--color-muted)]" data-testid="overview-loading">
          Loading overview…
        </p>
      ) : null}

      {state.status === 'error' ? (
        <div data-testid="overview-error">
          <ErrorBanner
            message={
              state.httpStatus === 403
                ? `Permission denied: ${state.message}`
                : state.message
            }
            onRetry={() => void load(query.from, query.to)}
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

      {state.status === 'empty' || state.status === 'ready' ? (
        <>
          {state.status === 'empty' ? (
            <p
              className="rounded-lg border border-dashed border-[var(--color-border)] bg-white px-4 py-3 text-sm text-[var(--color-muted)]"
              data-testid="overview-empty"
            >
              No period activity for the selected range. Snapshot totals below still reflect the
              current platform.
            </p>
          ) : null}

          <p className="text-xs text-[var(--color-muted)]" data-testid="overview-as-of">
            As of {new Date(state.data.generatedAt).toLocaleString()} ·{' '}
            {state.data.dateRange.interpretation}
          </p>

          <MetricCards
            snapshot={state.data.snapshot}
            completedConnections={state.data.period.bookings.completedConnections}
          />

          <BookingStatusPanel
            byStatus={state.data.period.bookings.byStatus}
            completedConnections={state.data.period.bookings.completedConnections}
          />

          <ConnectionFeePanel fees={state.data.period.connectionFees} />
          <RefundPanel byStatus={state.data.period.refunds.byStatus} />
          <TokenPanel tokens={state.data.period.tokens} />

          <p className="text-xs text-[var(--color-muted)]" data-testid="overview-exclusions">
            {state.data.exclusions.note} {state.data.exclusions.abandonedBookingFeePayments}
          </p>
        </>
      ) : null}
    </div>
  );
}
