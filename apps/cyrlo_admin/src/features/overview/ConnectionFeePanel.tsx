import type { AdminAnalytics } from '../../api/types';
import { Panel, Stat } from '../../components/ui';
import { formatGhsFromPesewas } from '../../lib/money';

export function ConnectionFeePanel({ fees }: { fees: AdminAnalytics['period']['connectionFees'] }) {
  return (
    <Panel
      title="Connection fees (GH₵1)"
      description="Cyrlo fixed booking/connection fee only. Gross SUCCESS collected is shown separately from refunds. Transport fares are never included."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Collected (gross)"
          value={formatGhsFromPesewas(fees.collected.amountPesewas)}
          hint={`${fees.collected.count} SUCCESS · unit ${formatGhsFromPesewas(fees.unitPesewas)}`}
        />
        <Stat
          label="Pending"
          value={formatGhsFromPesewas(fees.pending.amountPesewas)}
          hint={`${fees.pending.count} PENDING`}
        />
        <Stat
          label="Failed"
          value={formatGhsFromPesewas(fees.failed.amountPesewas)}
          hint={`${fees.failed.count} FAILED`}
        />
      </div>
    </Panel>
  );
}
