import { fetchGeoCountries, fetchGeoTree } from '../api/admin-geo';
import { LoadError } from '../components/LoadError';
import { tableWrap, theadCls } from '../components/Pagination';
import { Muted, Panel } from '../components/ui';
import { useLoader } from '../lib/useLoader';

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Accepts either a bare array or a `{ items }` list envelope. */
function asRows(value: unknown): Row[] {
  if (Array.isArray(value)) return value.filter(isRow);
  if (isRow(value) && Array.isArray(value.items)) return value.items.filter(isRow);
  return [];
}

const CHILD_KEYS = ['regions', 'districts', 'communities', 'children'] as const;

function childRows(node: Row): Row[] {
  for (const key of CHILD_KEYS) {
    if (Array.isArray(node[key])) return (node[key] as unknown[]).filter(isRow);
  }
  return [];
}

function str(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function nodeLabel(node: Row): string {
  const code = str(node.isoCode) || str(node.code);
  return `${str(node.name) || str(node.id) || 'Unnamed'}${code ? ` (${code})` : ''}`;
}

function nodeMeta(node: Row): string {
  return [
    str(node.status),
    str(node.adminType),
    str(node.verificationStatus),
    node.communityCount !== undefined ? `${str(node.communityCount)} communities` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function TreeNode({ node, depth }: { node: Row; depth: number }) {
  const children = childRows(node);
  const label = (
    <>
      <span className="font-medium text-[var(--color-text)]">{nodeLabel(node)}</span>
      {nodeMeta(node) ? (
        <span className="ml-2 text-xs text-[var(--color-muted)]">{nodeMeta(node)}</span>
      ) : null}
    </>
  );
  if (children.length === 0) {
    return <li className="py-1 text-sm">{label}</li>;
  }
  return (
    <li className="py-1 text-sm">
      <details open={depth < 1}>
        <summary className="cursor-pointer">
          {label}
          <span className="ml-2 text-xs text-[var(--color-muted)]">({children.length})</span>
        </summary>
        <ul className="ml-4 mt-1 border-l border-[var(--color-border)] pl-3">
          {children.map((child, i) => (
            <TreeNode key={str(child.id) || i} node={child} depth={depth + 1} />
          ))}
        </ul>
      </details>
    </li>
  );
}

export function GeoPage() {
  const tree = useLoader(() => fetchGeoTree(), 'tree');
  const countries = useLoader(() => fetchGeoCountries(), 'countries');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-1 text-2xl font-semibold text-[var(--color-text)]">Geography</h2>
        <Muted>
          Read-only browser of the country → region → district → community hierarchy. Editing and
          imports are not available in this console.
        </Muted>
      </div>

      <Panel title="Countries">
        {countries.state.status === 'loading' ? (
          <p className="text-sm text-[var(--color-muted)]" data-testid="geo-countries-loading">
            Loading countries…
          </p>
        ) : null}
        {countries.state.status === 'error' ? (
          <LoadError
            testId="geo-countries-error"
            message={countries.state.message}
            httpStatus={countries.state.httpStatus}
            onRetry={countries.reload}
          />
        ) : null}
        {countries.state.status === 'ready' ? (
          (() => {
            const rows = asRows(countries.state.data);
            return rows.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]" data-testid="geo-countries-empty">
                No countries configured.
              </p>
            ) : (
              <div className={tableWrap}>
                <table className="min-w-full text-left text-sm" data-testid="geo-countries-table">
                  <thead className={theadCls}>
                    <tr>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">ISO</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr
                        key={str(row.id) || i}
                        className="border-b border-[var(--color-border)] last:border-b-0"
                      >
                        <td className="px-3 py-2">{str(row.name) || '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs">{str(row.isoCode) || '—'}</td>
                        <td className="px-3 py-2">{str(row.status) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()
        ) : null}
      </Panel>

      <Panel title="Hierarchy">
        {tree.state.status === 'loading' ? (
          <p className="text-sm text-[var(--color-muted)]" data-testid="geo-tree-loading">
            Loading hierarchy…
          </p>
        ) : null}
        {tree.state.status === 'error' ? (
          <LoadError
            testId="geo-tree-error"
            message={tree.state.message}
            httpStatus={tree.state.httpStatus}
            onRetry={tree.reload}
          />
        ) : null}
        {tree.state.status === 'ready' ? (
          (() => {
            const rows = asRows(tree.state.data);
            return rows.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]" data-testid="geo-tree-empty">
                No geography has been configured.
              </p>
            ) : (
              <ul data-testid="geo-tree">
                {rows.map((row, i) => (
                  <TreeNode key={str(row.id) || i} node={row} depth={0} />
                ))}
              </ul>
            );
          })()
        ) : null}
      </Panel>
    </div>
  );
}
