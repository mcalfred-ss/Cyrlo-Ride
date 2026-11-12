import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { fetchAuditLogs } from '../api/admin-staff';
import { LoadError } from '../components/LoadError';
import { Pagination, tableWrap, theadCls } from '../components/Pagination';
import { Button, Label, Muted, TextInput } from '../components/ui';
import { UUID_RE, formatDate, parseIsoDatetime, parsePage } from '../lib/apiMessage';
import { useLoader } from '../lib/useLoader';

const META_MAX = 160;

function metadataPreview(metadata: unknown): string {
  if (metadata === null || metadata === undefined) return '—';
  let text: string;
  try {
    text = JSON.stringify(metadata) ?? '—';
  } catch {
    return '[unserializable]';
  }
  return text.length > META_MAX ? `${text.slice(0, META_MAX)}…` : text;
}

export function AuditLogsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(() => {
    const actorId = searchParams.get('actorId')?.trim();
    return {
      page: parsePage(searchParams.get('page')),
      actorId: actorId && UUID_RE.test(actorId) ? actorId : undefined,
      action: searchParams.get('action')?.trim() || undefined,
      entityType: searchParams.get('entityType')?.trim() || undefined,
      entityId: searchParams.get('entityId')?.trim() || undefined,
      from: parseIsoDatetime(searchParams.get('from')),
      to: parseIsoDatetime(searchParams.get('to')),
    };
  }, [searchParams]);

  const [draft, setDraft] = useState({
    actorId: query.actorId ?? '',
    action: query.action ?? '',
    entityType: query.entityType ?? '',
    entityId: query.entityId ?? '',
    from: query.from ?? '',
    to: query.to ?? '',
  });
  useEffect(() => {
    setDraft({
      actorId: query.actorId ?? '',
      action: query.action ?? '',
      entityType: query.entityType ?? '',
      entityId: query.entityId ?? '',
      from: query.from ?? '',
      to: query.to ?? '',
    });
  }, [query.actorId, query.action, query.entityType, query.entityId, query.from, query.to]);

  const { state, reload } = useLoader(() => fetchAuditLogs(query), JSON.stringify(query));
  const busy = state.status === 'loading';

  const patch = (changes: Record<string, string | undefined>, resetPage = false) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (resetPage) next.set('page', '1');
    setSearchParams(next, { replace: true });
  };

  const apply = () => {
    const actor = draft.actorId.trim();
    patch(
      {
        actorId: actor && UUID_RE.test(actor) ? actor : undefined,
        action: draft.action.trim() || undefined,
        entityType: draft.entityType.trim() || undefined,
        entityId: draft.entityId.trim() || undefined,
        from: parseIsoDatetime(draft.from),
        to: parseIsoDatetime(draft.to),
      },
      true,
    );
  };

  const field = (key: keyof typeof draft, label: string, placeholder?: string) => (
    <div>
      <Label>{label}</Label>
      <TextInput
        value={draft[key]}
        disabled={busy}
        placeholder={placeholder}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        data-testid={`audit-filter-${key}`}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-1 text-2xl font-semibold text-[var(--color-text)]">Audit logs</h2>
        <Muted>
          Staff and system actions, newest first. Metadata is shown as returned by the API and
          truncated to {META_MAX} characters.
        </Muted>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-4">
          {field('actorId', 'Actor ID', 'UUID')}
          {field('action', 'Action', 'e.g. geo.country.created')}
          {field('entityType', 'Entity type')}
          {field('entityId', 'Entity ID')}
          {field('from', 'From (ISO UTC)', '2026-01-01T00:00:00.000Z')}
          {field('to', 'To (ISO UTC)', '2026-01-31T23:59:59.999Z')}
          <div className="flex items-end">
            <Button type="button" disabled={busy} onClick={apply} data-testid="audit-apply">
              Apply filters
            </Button>
          </div>
        </div>
      </div>

      {state.status === 'loading' ? (
        <p className="text-sm text-[var(--color-muted)]" data-testid="audit-loading">
          Loading audit logs…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <LoadError
          testId="audit-error"
          message={state.message}
          httpStatus={state.httpStatus}
          onRetry={reload}
        />
      ) : null}
      {state.status === 'ready' && state.data.items.length === 0 ? (
        <p
          className="rounded-lg border border-dashed border-[var(--color-border)] bg-white px-4 py-6 text-sm text-[var(--color-muted)]"
          data-testid="audit-empty"
        >
          No audit entries match the current filters.
        </p>
      ) : null}
      {state.status === 'ready' && state.data.items.length > 0 ? (
        <div className={tableWrap}>
          <table className="min-w-full text-left text-sm" data-testid="audit-table">
            <thead className={theadCls}>
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Actor</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Entity</th>
                <th className="px-3 py-2 font-medium">Metadata</th>
                <th className="px-3 py-2 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {state.data.items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-[var(--color-border)] align-top last:border-b-0"
                  data-testid={`audit-row-${item.id}`}
                >
                  <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                    {formatDate(item.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div>{item.actor?.displayName ?? item.actor?.role ?? 'System'}</div>
                    <div className="font-mono text-[var(--color-muted)]">{item.actorId ?? '—'}</div>
                  </td>
                  <td className="px-3 py-2">{item.action}</td>
                  <td className="px-3 py-2 text-xs">
                    <div>{item.entityType}</div>
                    <div className="font-mono text-[var(--color-muted)]">{item.entityId ?? '—'}</div>
                  </td>
                  <td className="max-w-xs px-3 py-2 font-mono text-xs break-all">
                    {metadataPreview(item.metadata)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{item.ipAddress ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {state.status === 'ready' ? (
        <Pagination
          testId="audit-pagination"
          page={state.data.pagination.page}
          total={state.data.pagination.total}
          shown={state.data.items.length}
          hasNextPage={state.data.pagination.hasNextPage}
          busy={busy}
          onPage={(page) => patch({ page: String(page) })}
        />
      ) : null}
    </div>
  );
}
