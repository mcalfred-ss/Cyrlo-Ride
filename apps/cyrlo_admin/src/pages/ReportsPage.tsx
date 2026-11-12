import { Link } from 'react-router-dom';

import { Muted } from '../components/ui';

const cardCls =
  'block rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm hover:bg-slate-50';

export function ReportsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-1 text-2xl font-semibold text-[var(--color-text)]">Reports</h2>
        <Muted>
          Reports are viewed live in the console. Data export is not available yet.
        </Muted>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/overview" className={cardCls} data-testid="reports-link-overview">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Operations overview</h3>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Platform snapshot, booking statuses, and period metrics for a chosen date range.
          </p>
        </Link>
        <Link to="/finance" className={cardCls} data-testid="reports-link-finance">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Financial report</h3>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Connection fees, refunds, and rider token activity. Requires finance permissions.
          </p>
        </Link>
      </div>
    </div>
  );
}
