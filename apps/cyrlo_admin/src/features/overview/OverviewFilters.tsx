import { Button, Label, TextInput } from '../../components/ui';
import type { DatePreset } from './dateRange';

export function OverviewFilters({
  preset,
  fromLocal,
  toLocal,
  busy,
  onPreset,
  onFromLocal,
  onToLocal,
  onApply,
}: {
  preset: DatePreset;
  fromLocal: string;
  toLocal: string;
  busy: boolean;
  onPreset: (preset: Exclude<DatePreset, 'custom'>) => void;
  onFromLocal: (value: string) => void;
  onToLocal: (value: string) => void;
  onApply: () => void;
}) {
  const presets: { id: Exclude<DatePreset, 'custom'>; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: '7d', label: 'Last 7 days' },
    { id: '30d', label: 'Last 30 days' },
    { id: 'all', label: 'All time' },
  ];

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
      <p className="text-sm font-semibold text-[var(--color-text)]">Period filter</p>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Period metrics use inclusive UTC <code className="font-mono">createdAt</code>. Passenger and
        rider totals are current snapshots and ignore this filter.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {presets.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant={preset === item.id ? 'primary' : 'secondary'}
            disabled={busy}
            onClick={() => onPreset(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <Label>From (local)</Label>
          <TextInput
            type="datetime-local"
            value={fromLocal}
            disabled={busy}
            onChange={(e) => onFromLocal(e.target.value)}
            data-testid="overview-from"
          />
        </div>
        <div>
          <Label>To (local)</Label>
          <TextInput
            type="datetime-local"
            value={toLocal}
            disabled={busy}
            onChange={(e) => onToLocal(e.target.value)}
            data-testid="overview-to"
          />
        </div>
        <Button type="button" disabled={busy} onClick={onApply} data-testid="overview-apply">
          Apply
        </Button>
      </div>
    </div>
  );
}
