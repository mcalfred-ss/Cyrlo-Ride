import type { AdminAnalytics } from '../../api/types';
import { Panel, Stat } from '../../components/ui';
import { formatGhsFromPesewas } from '../../lib/money';

export function TokenPanel({ tokens }: { tokens: AdminAnalytics['period']['tokens'] }) {
  return (
    <Panel
      title="Rider tokens"
      description="Token purchases and deductions are not connection-fee revenue and are not transport fares."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat
          label="Purchases (SUCCESS)"
          value={formatGhsFromPesewas(tokens.purchases.amountPesewas)}
          hint={`${tokens.purchases.count} purchases`}
        />
        <Stat
          label="Deductions"
          value={`${tokens.usage.tokensDeducted.toLocaleString()} tokens`}
          hint={`${tokens.usage.deductionCount} ledger deductions`}
        />
      </div>
    </Panel>
  );
}
