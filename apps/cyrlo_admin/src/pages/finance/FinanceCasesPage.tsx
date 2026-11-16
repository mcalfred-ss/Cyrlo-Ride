import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { fetchReconciliationCases, resolveReconciliationCase } from '../../api/admin-finance';
import type { ReconciliationCaseStatus } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { LoadError } from '../../components/LoadError';
import { selectCls, tableWrap, theadCls } from '../../components/Pagination';
import { Button, Label, Muted } from '../../components/ui';
import { Permission, staffRoleHasPermission } from '../../config/permissions';
import { ConfirmReasonPanel } from '../../features/applications/ConfirmReasonPanel';
import { errorMessage, formatDate, parseEnum } from '../../lib/apiMessage';
import { useLoader } from '../../lib/useLoader';

const CASE_STATUSES: readonly ReconciliationCaseStatus[] = ['OPEN', 'IN_REVIEW', 'RESOLVED'];

export function FinanceCasesPage() {
  const auth = useAuth();
  const role = auth.staffRole;
  const canResolve = role !== null && staffRoleHasPermission(role, Permission.ReconcilePaystack);
  const [searchParams, setSearchParams] = useSearchParams();
  const status = useMemo(
    () => parseEnum(searchParams.get('status'), CASE_STATUSES),
    [searchParams],
  );
  const { state, reload } = useLoader(() => fetchReconciliationCases(status), status ?? 'all');
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef(false);

  const setStatus = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('status', value);
    else next.delete('status');
    setSearchParams(next, { replace: true });
    setResolvingId(null);
  };

  const resolve = async () => {
    if (!resolvingId || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await resolveReconciliationCase(resolvingId, notes.trim());
      setNotice(`Case ${resolvingId} resolved.`);
      setResolvingId(null);
      setNotes('');
      reload();
    } catch (err) {
      setError(errorMessage(err, 'Failed to resolve case'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-1 text-2xl font-semibold text-[var(--color-text)]">
          Reconciliation cases
        </h2>
        <Muted>
          Payment, refund, and token-purchase mismatches flagged for manual review. Resolving a case
          records your notes; it does not move money.
        </Muted>
      </div>

      <div className="max-w-xs">
        <Label>Status</Label>
        <select
          className={selectCls}
          value={status ?? ''}
          disabled={state.status === 'loading'}
          onChange={(e) => setStatus(e.target.value)}
          data-testid="cases-filter-status"
        >
          <option value="">All</option>
          {CASE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {notice ? (
        <p
          className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
          data-testid="cases-notice"
        >
          {notice}
        </p>
      ) : null}

      {state.status === 'loading' ? (
        <p className="text-sm text-[var(--color-muted)]" data-testid="cases-loading">
          Loading cases…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <LoadError
          testId="cases-error"
          message={state.message}
          httpStatus={state.httpStatus}
          onRetry={reload}
        />
      ) : null}

      {state.status === 'ready' && state.data.length === 0 ? (
        <p
          className="rounded-lg border border-dashed border-[var(--color-border)] bg-white px-4 py-6 text-sm text-[var(--color-muted)]"
          data-testid="cases-empty"
        >
          No cases match this filter.
        </p>
      ) : null}

      {state.status === 'ready' && state.data.length > 0 ? (
        <div className={tableWrap}>
          <table className="min-w-full text-left text-sm" data-testid="cases-table">
            <thead className={theadCls}>
              <tr>
                <th className="px-3 py-2 font-medium">Case</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Links</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium">Notes</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {state.data.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-[var(--color-border)] last:border-b-0"
                  data-testid={`cases-row-${c.id}`}
                >
                  <td className="px-3 py-2 font-mono text-xs">{c.id}</td>
                  <td className="px-3 py-2">{c.caseType}</td>
                  <td className="px-3 py-2">{c.status}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {[
                      c.paymentId && `payment ${c.paymentId}`,
                      c.refundId && `refund ${c.refundId}`,
                      c.tokenPurchaseId && `purchase ${c.tokenPurchaseId}`,
                      c.providerReference && `ref ${c.providerReference}`,
                    ]
                      .filter(Boolean)
                      .map((line) => (
                        <div key={String(line)}>{line}</div>
                      ))}
                  </td>
                  <td className="px-3 py-2 text-xs">{c.reason}</td>
                  <td className="px-3 py-2 text-xs">{c.notes ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                    {formatDate(c.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    {canResolve && c.status !== 'RESOLVED' ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          setResolvingId(c.id);
                          setNotes('');
                          setError(null);
                          setNotice(null);
                        }}
                        data-testid={`cases-resolve-${c.id}`}
                      >
                        Resolve
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {resolvingId ? (
        <ConfirmReasonPanel
          testId="case-resolve-panel"
          title={`Resolve case ${resolvingId}`}
          description="Enter resolution notes. They are stored on the case and visible to finance staff."
          confirmLabel="Resolve case"
          reasonRequired
          reasonMinLength={5}
          reasonMaxLength={1000}
          reason={notes}
          onReasonChange={setNotes}
          busy={busy}
          error={error}
          onCancel={() => setResolvingId(null)}
          onConfirm={() => void resolve()}
        />
      ) : null}
    </div>
  );
}
