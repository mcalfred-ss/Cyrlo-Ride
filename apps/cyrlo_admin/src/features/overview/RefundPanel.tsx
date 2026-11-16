import type { RefundStatusBucket } from '../../api/types';
import { Panel } from '../../components/ui';
import { formatGhsFromPesewas } from '../../lib/money';

export function RefundPanel({
  byStatus,
}: {
  byStatus: Record<string, RefundStatusBucket>;
}) {
  const rows = Object.entries(byStatus).sort(([a], [b]) => a.localeCompare(b));

  return (
    <Panel
      title="Refunds"
      description="Refund totals are separate from gross connection-fee collected. Not subtracted into a silent net revenue figure."
    >
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">No refunds in this period.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium">Count</th>
              <th className="py-2 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([status, bucket]) => (
              <tr key={status} className="border-b border-[var(--color-border)]/60">
                <td className="py-2">{status}</td>
                <td className="py-2 tabular-nums">{bucket.count}</td>
                <td className="py-2 tabular-nums">{formatGhsFromPesewas(bucket.amountPesewas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
