import { Panel } from '../../components/ui';
import { bookingStatusRows } from './bookingStatuses';

export function BookingStatusPanel({
  byStatus,
  completedConnections,
}: {
  byStatus: Record<string, number>;
  completedConnections: number;
}) {
  const rows = bookingStatusRows(byStatus);
  const max = Math.max(1, ...rows.map((row) => row.count));

  return (
    <Panel
      title="Booking activity"
      description="Period bookings by status (inclusive UTC createdAt). Completed connections mirror COMPLETED."
    >
      <p className="mb-3 text-sm text-[var(--color-text)]">
        Completed connections:{' '}
        <span className="font-semibold tabular-nums">{completedConnections}</span>
      </p>
      {rows.every((row) => row.count === 0) ? (
        <p className="text-sm text-[var(--color-muted)]">No bookings in this period.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.status} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-2 text-sm">
              <span className="truncate text-[var(--color-muted)]">{row.status}</span>
              <div className="h-2 overflow-hidden rounded bg-[var(--color-border)]">
                <div
                  className="h-full rounded bg-[var(--color-accent)]"
                  style={{ width: `${(row.count / max) * 100}%` }}
                />
              </div>
              <span className="text-right tabular-nums">{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
