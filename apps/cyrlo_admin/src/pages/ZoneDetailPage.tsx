import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { fetchServiceZone } from '../api/admin-zones';
import type { AdminServiceZone } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { LoadError } from '../components/LoadError';
import { Button, ErrorBanner, Muted } from '../components/ui';
import { staffRoleHasPermission } from '../config/permissions';
import { ZONE_ACTIONS, type ZoneAction } from '../features/zones/zoneActions';
import { errorMessage, formatDate } from '../lib/apiMessage';
import { useLoader } from '../lib/useLoader';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-[var(--color-text)] break-all">{value}</dd>
    </div>
  );
}

function ZoneDetail({ initial }: { initial: AdminServiceZone }) {
  const auth = useAuth();
  const role = auth.staffRole;
  const [zone, setZone] = useState(initial);
  const [pending, setPending] = useState<ZoneAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef(false);

  const actions = ZONE_ACTIONS.filter(
    (a) => role !== null && staffRoleHasPermission(role, a.permission) && a.visible(zone),
  );

  const confirm = async () => {
    if (!pending || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const updated = await pending.run(zone.id);
      setZone(updated);
      setNotice(`${pending.label} succeeded — zone is now ${updated.status}.`);
      setPending(null);
    } catch (err) {
      setError(errorMessage(err, `${pending.label} failed`));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const box = zone.boundingBox;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="ID" value={zone.id} />
          <Field label="Status" value={zone.status} />
          <Field label="Active" value={zone.isActive ? 'Yes' : 'No'} />
          <Field label="Boundary verification" value={zone.boundaryVerificationStatus} />
          <Field label="Slug" value={zone.slug ?? '—'} />
          <Field label="Community" value={zone.communityId ?? '—'} />
          <Field label="Description" value={zone.description ?? '—'} />
          <Field
            label="Bounding box (lat/lng)"
            value={`${box.minLatitude}, ${box.minLongitude} → ${box.maxLatitude}, ${box.maxLongitude}`}
          />
          <Field label="Activated" value={formatDate(zone.activatedAt)} />
          <Field label="Suspended" value={formatDate(zone.suspendedAt)} />
          <Field label="Created" value={formatDate(zone.createdAt)} />
          <Field label="Updated" value={formatDate(zone.updatedAt)} />
        </dl>
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          The full boundary polygon is not rendered here.
        </p>
      </div>

      {notice ? (
        <p
          className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
          data-testid="zone-notice"
        >
          {notice}
        </p>
      ) : null}

      {actions.length > 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Lifecycle</h3>
          <div className="mt-3 flex flex-wrap gap-2" data-testid="zone-actions">
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
                data-testid={`zone-action-${a.id}`}
              >
                {a.label}
              </Button>
            ))}
          </div>
          {pending ? (
            <div
              className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4"
              data-testid="zone-confirm"
            >
              <h4 className="text-sm font-semibold text-[var(--color-text)]">
                Confirm: {pending.label}
              </h4>
              <p className="mt-1 text-xs text-[var(--color-muted)]">{pending.description}</p>
              <div className="mt-3">
                <ErrorBanner message={error} />
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant={pending.danger ? 'danger' : 'primary'}
                  disabled={busy}
                  onClick={() => void confirm()}
                  data-testid="zone-confirm-submit"
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
        <p className="text-xs text-[var(--color-muted)]" data-testid="zone-readonly">
          No lifecycle actions are available to your role for this zone.
        </p>
      )}
    </div>
  );
}

export function ZoneDetailPage() {
  const { zoneId = '' } = useParams();
  const { state, reload } = useLoader(() => fetchServiceZone(zoneId), zoneId);

  return (
    <div className="space-y-4">
      <div>
        <Link to="/zones" className="text-sm text-[var(--color-accent)] hover:underline">
          ← Service zones
        </Link>
        <h2 className="mt-1 text-2xl font-semibold text-[var(--color-text)]">
          {state.status === 'ready' ? state.data.name : 'Service zone'}
        </h2>
        <Muted>Zone lifecycle and boundary verification status.</Muted>
      </div>
      {state.status === 'loading' ? (
        <p className="text-sm text-[var(--color-muted)]" data-testid="zone-loading">
          Loading zone…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <LoadError
          testId="zone-error"
          message={state.message}
          httpStatus={state.httpStatus}
          onRetry={reload}
        />
      ) : null}
      {state.status === 'ready' ? (
        <ZoneDetail key={state.data.id} initial={state.data} />
      ) : null}
    </div>
  );
}
