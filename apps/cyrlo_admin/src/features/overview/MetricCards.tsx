import type { AdminAnalytics } from '../../api/types';
import { Panel, Stat } from '../../components/ui';

export function MetricCards({ snapshot, completedConnections }: {
  snapshot: AdminAnalytics['snapshot'];
  completedConnections: number;
}) {
  return (
    <Panel
      title="Platform snapshot"
      description="Passenger and rider totals are lifetime/current counts. They do not change when you adjust the period filter. Available riders are approximate."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="Passengers"
          value={snapshot.passengers.total.toLocaleString()}
          hint={`${snapshot.passengers.active} active · ${snapshot.passengers.suspended} suspended`}
        />
        <Stat
          label="Riders registered"
          value={snapshot.riders.registered.toLocaleString()}
          hint={`${snapshot.riders.pendingApplications} pending applications`}
        />
        <Stat
          label="Available riders (approx)"
          value={snapshot.riders.availableApprox.toLocaleString()}
          hint="Snapshot estimate — not a live dispatch guarantee"
        />
        <Stat
          label="Completed connections"
          value={completedConnections.toLocaleString()}
          hint="Period metric (inclusive UTC createdAt)"
        />
      </div>
    </Panel>
  );
}
