import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { fetchServiceZones, MAX_ZONE_PAGE_SIZE } from '../api/admin-zones';
import type { AdminServiceZone, ServiceZoneStatus } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { LoadError } from '../components/LoadError';
import { selectCls } from '../components/Pagination';
import { Muted, TextInput } from '../components/ui';
import { Permission, staffRoleHasPermission } from '../config/permissions';
import { ZoneDetailsPanel } from '../features/zones/ZoneDetailsPanel';
import { ZoneMap } from '../features/zones/ZoneMap';
import {
  ASHANTI_REGION_LABEL,
  filterZones,
  selectAshantiMapZones,
  ZONE_STATUS_LEGEND,
  zoneStatusStyle,
} from '../features/zones/zoneMapHelpers';
import { useLoader } from '../lib/useLoader';

const ZONE_STATUSES: readonly ServiceZoneStatus[] = [
  'DRAFT',
  'UNDER_REVIEW',
  'LOCKED',
  'ACTIVE',
  'SUSPENDED',
];

/** Safety cap: 20 pages × 100 zones. Ashanti has well under 100 districts. */
const MAX_PAGES = 20;

async function fetchAllZones(): Promise<AdminServiceZone[]> {
  const all: AdminServiceZone[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await fetchServiceZones({ page, pageSize: MAX_ZONE_PAGE_SIZE });
    const items = Array.isArray(res.items) ? res.items : [];
    all.push(...items);
    if (!res.meta?.hasNextPage) break;
  }
  return all;
}

function Legend() {
  return (
    <div
      className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs"
      data-testid="ashanti-legend"
    >
      <span className="font-medium text-[var(--color-muted)]">Legend</span>
      {ZONE_STATUS_LEGEND.map((s) => (
        <span key={s.group} className="inline-flex items-center gap-1.5" data-testid={`legend-${s.group}`}>
          <span
            className="inline-block h-3 w-3 rounded-sm border"
            style={{ backgroundColor: s.fill, borderColor: s.stroke }}
            aria-hidden="true"
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function AshantiMapContent({ zones: loaded }: { zones: AdminServiceZone[] }) {
  const auth = useAuth();
  const [updates, setUpdates] = useState<Record<string, AdminServiceZone>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ServiceZoneStatus | ''>('');

  // A reload passes through the loading state, which remounts this component with fresh data.
  const zones = useMemo(
    () => selectAshantiMapZones(loaded).map((z) => updates[z.id] ?? z),
    [loaded, updates],
  );
  const visible = useMemo(() => filterZones(zones, { q, status }), [zones, q, status]);
  const selected = zones.find((z) => z.id === selectedId) ?? null;

  const handleUpdated = useCallback((zone: AdminServiceZone) => {
    setUpdates((prev) => ({ ...prev, [zone.id]: zone }));
  }, []);

  if (zones.length === 0) {
    return (
      <p
        className="rounded-lg border border-dashed border-[var(--color-border)] bg-white px-4 py-6 text-sm text-[var(--color-muted)]"
        data-testid="ashanti-empty"
      >
        No Ashanti district zones with a boundary were returned by the API.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <Legend />
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        <aside
          className="flex max-h-[70vh] min-h-[320px] flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm"
          data-testid="ashanti-directory"
        >
          <div className="space-y-2 border-b border-[var(--color-border)] p-3">
            <TextInput
              type="search"
              placeholder="Search districts…"
              aria-label="Search districts"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              data-testid="ashanti-search"
            />
            <select
              className={selectCls}
              aria-label="Filter by status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ServiceZoneStatus | '')}
              data-testid="ashanti-status-filter"
            >
              <option value="">All statuses</option>
              {ZONE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <p className="text-xs text-[var(--color-muted)]" data-testid="ashanti-count">
              {visible.length} of {zones.length} districts
            </p>
          </div>
          {visible.length === 0 ? (
            <p className="p-3 text-sm text-[var(--color-muted)]" data-testid="ashanti-list-empty">
              No districts match your filters.
            </p>
          ) : (
            <ul className="flex-1 overflow-y-auto" data-testid="ashanti-list">
              {visible.map((zone) => {
                const style = zoneStatusStyle(zone.status);
                const isSelected = zone.id === selectedId;
                return (
                  <li key={zone.id}>
                    <button
                      type="button"
                      className={`flex w-full items-center gap-2 border-b border-[var(--color-border)] px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                        isSelected ? 'bg-slate-100 font-medium' : ''
                      }`}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedId(zone.id)}
                      onMouseEnter={() => setHoveredId(zone.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      data-testid={`ashanti-item-${zone.id}`}
                    >
                      <span
                        className="inline-block h-3 w-3 shrink-0 rounded-sm border"
                        style={{ backgroundColor: style.fill, borderColor: style.stroke }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate">{zone.name}</span>
                      <span className="text-[10px] uppercase text-[var(--color-muted)]">
                        {zone.status}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <div className="h-[70vh] min-h-[420px]">
          <ZoneMap
            zones={zones}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onHover={setHoveredId}
            hoveredId={hoveredId}
          />
        </div>

        <div>
          {selected ? (
            <ZoneDetailsPanel
              key={selected.id}
              zone={selected}
              role={auth.staffRole}
              onZoneUpdated={handleUpdated}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <div
              className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-muted)]"
              data-testid="ashanti-panel-empty"
            >
              Select a district on the map or in the list to see its zone details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AshantiMapLoader() {
  const { state, reload } = useLoader(fetchAllZones, 'ashanti-zones');
  if (state.status === 'loading') {
    return (
      <p className="text-sm text-[var(--color-muted)]" data-testid="ashanti-loading">
        Loading district zones…
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <LoadError
        testId="ashanti-error"
        message={state.message}
        httpStatus={state.httpStatus}
        onRetry={reload}
      />
    );
  }
  return <AshantiMapContent zones={state.data} />;
}

export function AshantiDistrictMapPage() {
  const { staffRole } = useAuth();
  const allowed =
    staffRole !== null &&
    (staffRoleHasPermission(staffRole, Permission.ViewGeoCoverage) ||
      staffRoleHasPermission(staffRole, Permission.ManageServiceZones));

  return (
    <div className="space-y-4">
      <div>
        <Link to="/zones" className="text-sm text-[var(--color-accent)] hover:underline">
          ← Service zones
        </Link>
        <h2 className="mt-1 text-2xl font-semibold text-[var(--color-text)]">
          Ashanti district map
        </h2>
        <Muted>
          {ASHANTI_REGION_LABEL} service zones drawn from verified API boundaries. Colours show
          each zone's lifecycle status.
        </Muted>
      </div>
      {allowed ? (
        <AshantiMapLoader />
      ) : (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[var(--color-danger)]"
          data-testid="ashanti-forbidden"
        >
          Permission denied: you need geo-coverage or service-zone access to view this map.
        </p>
      )}
    </div>
  );
}
