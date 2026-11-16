import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { listZoneRiders } from '../../api/admin-zones';
import type { AdminServiceZone } from '../../api/types';
import { Button, ErrorBanner } from '../../components/ui';
import { Permission, staffRoleHasPermission, type StaffRole } from '../../config/permissions';
import { errorMessage } from '../../lib/apiMessage';
import { useLoader } from '../../lib/useLoader';
import { MAP_ACTION_IDS, ZONE_ACTIONS, type ZoneAction } from './zoneActions';
import { ASHANTI_REGION_LABEL, zoneStatusStyle } from './zoneMapHelpers';

function Field({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-sm text-[var(--color-text)]" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

function ApprovedRiderCount({ zoneId }: { zoneId: string }) {
  const { state, reload } = useLoader(() => listZoneRiders(zoneId), zoneId);
  if (state.status === 'loading') {
    return (
      <span className="text-[var(--color-muted)]" data-testid="zone-riders-loading">
        Loading…
      </span>
    );
  }
  if (state.status === 'error') {
    return (
      <span data-testid="zone-riders-error">
        <span className="text-[var(--color-danger)]">Unavailable ({state.message})</span>{' '}
        <button type="button" className="text-[var(--color-accent)] underline" onClick={reload}>
          Retry
        </button>
      </span>
    );
  }
  const approved = state.data.filter((r) => r.status === 'APPROVED').length;
  return <span data-testid="zone-riders-count">{approved}</span>;
}

export interface ZoneDetailsPanelProps {
  zone: AdminServiceZone;
  role: StaffRole | null;
  onZoneUpdated: (zone: AdminServiceZone) => void;
  onClose: () => void;
}

/** Side panel for the selected district zone. Lifecycle changes always go through the API. */
export function ZoneDetailsPanel({ zone, role, onZoneUpdated, onClose }: ZoneDetailsPanelProps) {
  const [pending, setPending] = useState<ZoneAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef(false);

  const can = (permission: Permission) => role !== null && staffRoleHasPermission(role, permission);
  const actions = ZONE_ACTIONS.filter(
    (a) => MAP_ACTION_IDS.includes(a.id) && can(a.permission) && a.visible(zone),
  );
  const style = zoneStatusStyle(zone.status);

  const confirm = async () => {
    if (!pending || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const updated = await pending.run(zone.id);
      onZoneUpdated({ ...zone, ...updated, boundary: updated.boundary ?? zone.boundary });
      setNotice(`${pending.label} succeeded — zone is now ${updated.status}.`);
      setPending(null);
    } catch (err) {
      setError(errorMessage(err, `${pending.label} failed`));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const source = [zone.geographicSource, zone.geographicDatasetVersion].filter(Boolean).join(' · ');

  return (
    <section
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm"
      data-testid="ashanti-zone-panel"
      aria-label="Selected district zone"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-[var(--color-text)]" data-testid="panel-zone-name">
            {zone.name}
          </h3>
          <span
            className="mt-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
            style={{ borderColor: style.stroke, color: style.stroke }}
            data-testid="panel-zone-status"
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: style.fill }}
              aria-hidden="true"
            />
            {zone.status}
          </span>
        </div>
        <button
          type="button"
          className="rounded border border-[var(--color-border)] px-2 py-0.5 text-xs"
          onClick={onClose}
          data-testid="panel-close"
        >
          Close
        </button>
      </div>

      <dl className="mt-4 grid gap-3">
        <Field label="Region" value={ASHANTI_REGION_LABEL} />
        <Field label="Zone ID" value={zone.id} testId="panel-zone-id" />
        <Field label="District ID" value={zone.districtId ?? '—'} />
        <Field label="Active for bookings" value={zone.isActive ? 'Yes' : 'No'} />
        <Field
          label="Boundary verification"
          value={zone.boundaryVerificationStatus}
          testId="panel-boundary-verification"
        />
        <Field label="Geographic source" value={source || '—'} testId="panel-geo-source" />
        <Field label="Attribution" value={zone.geographicAttribution ?? '—'} testId="panel-geo-attribution" />
        <Field label="Shape ID" value={zone.geographicShapeId ?? '—'} />
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
            Approved riders
          </dt>
          <dd className="mt-0.5 text-sm text-[var(--color-text)]">
            {can(Permission.ManageServiceZones) ? (
              <ApprovedRiderCount key={zone.id} zoneId={zone.id} />
            ) : (
              <span className="text-[var(--color-muted)]" data-testid="zone-riders-restricted">
                Not available for your role
              </span>
            )}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs">
        <Link to={`/zones/${zone.id}`} className="text-[var(--color-accent)] hover:underline">
          Open full zone detail
        </Link>
      </p>

      {notice ? (
        <p
          className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
          data-testid="panel-notice"
        >
          {notice}
        </p>
      ) : null}

      {actions.length > 0 ? (
        <div className="mt-4 border-t border-[var(--color-border)] pt-3">
          <h4 className="text-sm font-semibold text-[var(--color-text)]">Lifecycle</h4>
          <div className="mt-2 flex flex-wrap gap-2" data-testid="panel-actions">
            {actions.map((a) => (
              <Button
                key={a.id}
                type="button"
                variant={a.danger ? 'danger' : 'secondary'}
                disabled={busy}
                onClick={() => {
                  setPending(a);
                  setError(null);
                  setNotice(null);
                }}
                data-testid={`panel-action-${a.id}`}
              >
                {a.label}
              </Button>
            ))}
          </div>
          {pending ? (
            <div
              className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3"
              data-testid="panel-confirm"
            >
              <h5 className="text-sm font-semibold text-[var(--color-text)]">
                Confirm: {pending.label}
              </h5>
              <p className="mt-1 text-xs text-[var(--color-muted)]">{pending.description}</p>
              <div className="mt-2">
                <ErrorBanner message={error} />
              </div>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  variant={pending.danger ? 'danger' : 'primary'}
                  disabled={busy}
                  onClick={() => void confirm()}
                  data-testid="panel-confirm-submit"
                >
                  {busy ? 'Submitting…' : `Confirm ${pending.label.toLowerCase()}`}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setPending(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-xs text-[var(--color-muted)]" data-testid="panel-readonly">
          Read-only: lifecycle actions are not available to your role for this zone.
        </p>
      )}
    </section>
  );
}
