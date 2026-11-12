import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  executeAdminRefund,
  fetchAdminRefunds,
  fetchRefundReconciliationAttempts,
  reconcileAdminRefund,
} from '../../api/admin-finance';
import type { AdminPaymentRefund, PaymentRefundStatus } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { LoadError } from '../../components/LoadError';
import { selectCls, tableWrap, theadCls } from '../../components/Pagination';
import { Button, Label } from '../../components/ui';
import { Permission, staffRoleHasPermission } from '../../config/permissions';
import { ConfirmReasonPanel } from '../../features/applications/ConfirmReasonPanel';
import { errorMessage, formatDate, parseEnum } from '../../lib/apiMessage';
import { formatGhsFromPesewas } from '../../lib/money';
import { useLoader } from '../../lib/useLoader';

const REFUND_STATUSES: readonly PaymentRefundStatus[] = [
  'REQUESTED',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'MANUAL_RECONCILIATION',
];

type Action = 'execute' | 'reconcile';

function refundStatusLabel(status: PaymentRefundStatus): string {
  if (status === 'MANUAL_RECONCILIATION') return 'Manual reconciliation';
  return status;
}

function formatAuthorizedAt(value: string | null | undefined): string {
  return value ? formatDate(value) : 'Not authorized';
}

function RefundStatusBadge({ status }: { status: PaymentRefundStatus }) {
  const isManual = status === 'MANUAL_RECONCILIATION';
  return (
    <span
      className={
        isManual
          ? 'inline-flex rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900'
          : 'text-sm text-[var(--color-text)]'
      }
      data-testid="refund-status-badge"
      data-status={status}
    >
      {refundStatusLabel(status)}
    </span>
  );
}

function RefundDetail({
  refund,
  canExecute,
  canReconcile,
  onChanged,
}: {
  refund: AdminPaymentRefund;
  canExecute: boolean;
  canReconcile: boolean;
  onChanged: (message: string) => void;
}) {
  const attempts = useLoader(() => fetchRefundReconciliationAttempts(refund.id), refund.id);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const canMutate = refund.status !== 'SUCCEEDED';
  const isManualReconciliation = refund.status === 'MANUAL_RECONCILIATION';

  const open = (next: Action) => {
    setAction(next);
    setReason('');
    setError(null);
  };

  const submit = async () => {
    if (!action || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      if (action === 'execute') await executeAdminRefund(refund.id);
      else await reconcileAdminRefund(refund.id);
      setAction(null);
      setReason('');
      attempts.reload();
      onChanged(
        action === 'execute'
          ? `Execute submitted for refund ${refund.id}. It may stay REQUESTED/PROCESSING until Paystack confirms — only SUCCEEDED means money was returned.`
          : isManualReconciliation
            ? `Manual reconciliation check submitted for refund ${refund.id}. Review the status and attempts — this is not an automatic retry.`
            : `Reconcile run for refund ${refund.id}. Check the status and attempts below.`,
      );
    } catch (err) {
      setError(errorMessage(err, 'Action failed'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <section
      className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm"
      data-testid="refund-detail"
    >
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text)]">
          Refund <span className="font-mono text-xs">{refund.id}</span>
        </h3>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
          <RefundStatusBadge status={refund.status} />
          <span>
            {formatGhsFromPesewas(refund.amountPesewas)} · attempt {refund.attemptNumber}/
            {refund.maxAttempts}
            {refund.failureReason ? ` · failure: ${refund.failureReason}` : ''}
            {refund.reconciliationNote ? ` · note: ${refund.reconciliationNote}` : ''}
          </span>
        </p>
        <p className="mt-1 text-xs text-[var(--color-muted)]" data-testid="refund-authorized-at">
          Authorized: {formatAuthorizedAt(refund.authorizedAt)}
        </p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Provider status: {refund.providerStatus ?? '—'} · Next attempt:{' '}
          {formatDate(refund.nextAttemptAt)}
        </p>
      </div>

      {isManualReconciliation ? (
        <p
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          data-testid="refund-manual-reconciliation-banner"
        >
          <strong>Manual reconciliation required.</strong> This refund needs Finance review and
          provider reconciliation. It is not an ordinary automatic retry — do not treat a reconcile
          check as a normal retry path.
        </p>
      ) : null}

      {(canExecute || canReconcile) && canMutate ? (
        <div className="flex flex-wrap gap-2">
          {canExecute ? (
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() => open('execute')}
              data-testid="refunds-execute-open"
            >
              Execute refund
            </Button>
          ) : null}
          {canReconcile ? (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => open('reconcile')}
              data-testid="refunds-reconcile-open"
            >
              {isManualReconciliation
                ? 'Check provider status (manual review)'
                : 'Reconcile with Paystack'}
            </Button>
          ) : null}
        </div>
      ) : null}

      {action ? (
        <ConfirmReasonPanel
          testId={`refund-${action}-panel`}
          title={
            action === 'execute'
              ? 'Execute refund (moves money)'
              : isManualReconciliation
                ? 'Manual reconciliation check'
                : 'Reconcile with Paystack'
          }
          description={
            action === 'execute'
              ? 'Submits this refund to Paystack. Explain why you are executing it; the reason is a required operator checkpoint and is not sent to the API (record it in your ticket).'
              : isManualReconciliation
                ? 'Fetches the current Paystack state for Finance review. This is not an automatic retry and does not imply the refund will succeed. Explain why; the reason is a required operator checkpoint and is not sent to the API.'
                : 'Asks Paystack for the refund state and updates our record. Explain why; the reason is a required operator checkpoint and is not sent to the API.'
          }
          confirmLabel={
            action === 'execute'
              ? 'Execute refund'
              : isManualReconciliation
                ? 'Run manual check'
                : 'Run reconcile'
          }
          reasonRequired
          reasonMinLength={5}
          reason={reason}
          onReasonChange={setReason}
          busy={busy}
          error={error}
          danger={action === 'execute'}
          onCancel={() => setAction(null)}
          onConfirm={() => void submit()}
        />
      ) : null}

      <div>
        <h4 className="mb-2 text-sm font-semibold text-[var(--color-text)]">
          Reconciliation attempts
        </h4>
        {attempts.state.status === 'loading' ? (
          <p className="text-sm text-[var(--color-muted)]">Loading attempts…</p>
        ) : null}
        {attempts.state.status === 'error' ? (
          <LoadError
            testId="refund-attempts-error"
            message={attempts.state.message}
            httpStatus={attempts.state.httpStatus}
            onRetry={attempts.reload}
          />
        ) : null}
        {attempts.state.status === 'ready' ? (
          attempts.state.data.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]" data-testid="refund-attempts-empty">
              No reconciliation attempts yet.
            </p>
          ) : (
            <div className={tableWrap}>
              <table className="min-w-full text-left text-sm" data-testid="refund-attempts-table">
                <thead className={theadCls}>
                  <tr>
                    <th className="px-3 py-2 font-medium">When</th>
                    <th className="px-3 py-2 font-medium">Outcome</th>
                    <th className="px-3 py-2 font-medium">Local</th>
                    <th className="px-3 py-2 font-medium">Provider</th>
                    <th className="px-3 py-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.state.data.map((a) => (
                    <tr key={a.id} className="border-b border-[var(--color-border)] last:border-b-0">
                      <td className="px-3 py-2 text-xs">{formatDate(a.attemptedAt)}</td>
                      <td className="px-3 py-2">{a.outcome}</td>
                      <td className="px-3 py-2">{a.localStatus ?? '—'}</td>
                      <td className="px-3 py-2">{a.providerStatus ?? '—'}</td>
                      <td className="px-3 py-2 text-xs">{a.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </div>
    </section>
  );
}

export function FinanceRefundsPage() {
  const auth = useAuth();
  const role = auth.staffRole;
  const canExecute = role !== null && staffRoleHasPermission(role, Permission.ExecuteRefunds);
  const canReconcile = role !== null && staffRoleHasPermission(role, Permission.ReconcilePaystack);
  const [searchParams, setSearchParams] = useSearchParams();
  const status = useMemo(
    () => parseEnum(searchParams.get('status'), REFUND_STATUSES),
    [searchParams],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { state, reload } = useLoader(() => fetchAdminRefunds(status), status ?? 'all');
  const busy = state.status === 'loading';

  const setStatus = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('status', value);
    else next.delete('status');
    setSearchParams(next, { replace: true });
    setSelectedId(null);
  };

  const selected =
    state.status === 'ready' ? (state.data.find((r) => r.id === selectedId) ?? null) : null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-1 text-2xl font-semibold text-[var(--color-text)]">Refunds</h2>
        <p className="mb-3 text-sm text-[var(--color-muted)]" data-testid="refunds-lifecycle-copy">
          <strong>REQUESTED is not authorized and not SUCCEEDED.</strong> REQUESTED means the refund
          has been requested or queued — it does not mean Finance has authorized it, and it does not
          mean money has moved. Check Authorized below for each row. Only SUCCEEDED means the money
          was returned. MANUAL_RECONCILIATION needs Finance review with the provider, not an ordinary
          automatic retry. The API returns at most 100 refunds with no pagination — use the status
          filter to narrow the list.
        </p>
        {!canExecute && !canReconcile ? (
          <p className="text-xs text-[var(--color-muted)]" data-testid="refunds-readonly">
            Read-only: your role cannot execute or reconcile refunds.
          </p>
        ) : null}
      </div>

      <div className="max-w-xs">
        <Label>Status</Label>
        <select
          className={selectCls}
          value={status ?? ''}
          disabled={busy}
          onChange={(e) => setStatus(e.target.value)}
          data-testid="refunds-filter-status"
        >
          <option value="">All</option>
          {REFUND_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {notice ? (
        <p
          className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
          data-testid="refunds-notice"
        >
          {notice}
        </p>
      ) : null}

      {state.status === 'loading' ? (
        <p className="text-sm text-[var(--color-muted)]" data-testid="refunds-loading">
          Loading refunds…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <LoadError
          testId="refunds-error"
          message={state.message}
          httpStatus={state.httpStatus}
          onRetry={reload}
        />
      ) : null}

      {state.status === 'ready' && state.data.length === 0 ? (
        <p
          className="rounded-lg border border-dashed border-[var(--color-border)] bg-white px-4 py-6 text-sm text-[var(--color-muted)]"
          data-testid="refunds-empty"
        >
          No refunds match this filter.
        </p>
      ) : null}

      {state.status === 'ready' && state.data.length > 0 ? (
        <>
          <p className="text-sm text-[var(--color-muted)]" data-testid="refunds-count">
            {state.data.length} refund{state.data.length === 1 ? '' : 's'}
            {state.data.length >= 100 ? ' (cap of 100 reached — more may exist)' : ''}
          </p>
          <div className={tableWrap}>
            <table className="min-w-full text-left text-sm" data-testid="refunds-table">
              <thead className={theadCls}>
                <tr>
                  <th className="px-3 py-2 font-medium">Refund</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Booking</th>
                  <th className="px-3 py-2 font-medium">Authorized</th>
                  <th className="px-3 py-2 font-medium">Attempts</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {state.data.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b border-[var(--color-border)] last:border-b-0 ${
                      r.id === selectedId ? 'bg-slate-50' : ''
                    }`}
                    data-testid={`refunds-row-${r.id}`}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{r.id}</td>
                    <td className="px-3 py-2">
                      <RefundStatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatGhsFromPesewas(r.amountPesewas)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.bookingId ?? '—'}</td>
                    <td
                      className="px-3 py-2 text-xs text-[var(--color-muted)]"
                      data-testid={`refunds-authorized-${r.id}`}
                    >
                      {formatAuthorizedAt(r.authorizedAt)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {r.attemptNumber}/{r.maxAttempts}
                    </td>
                    <td className="px-3 py-2 text-xs">{r.reason ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                      {formatDate(r.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setSelectedId(r.id);
                          setNotice(null);
                        }}
                        data-testid={`refunds-select-${r.id}`}
                      >
                        {r.id === selectedId ? 'Selected' : 'Select'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {selected ? (
        <RefundDetail
          key={selected.id}
          refund={selected}
          canExecute={canExecute}
          canReconcile={canReconcile}
          onChanged={(message) => {
            setNotice(message);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}
