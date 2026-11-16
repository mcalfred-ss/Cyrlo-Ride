import { Button } from './ui';

export function Pagination({
  page,
  total,
  shown,
  hasNextPage,
  busy,
  onPage,
  testId,
}: {
  page: number;
  total: number;
  shown: number;
  hasNextPage: boolean;
  busy: boolean;
  onPage: (page: number) => void;
  testId: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2" data-testid={testId}>
      <p className="text-sm text-[var(--color-muted)]">
        Page {page} · showing {shown} of {total}
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={busy || page <= 1}
          onClick={() => onPage(page - 1)}
          data-testid={`${testId}-prev`}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !hasNextPage}
          onClick={() => onPage(page + 1)}
          data-testid={`${testId}-next`}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export const tableWrap =
  'overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm';
export const theadCls =
  'border-b border-[var(--color-border)] bg-[var(--color-bg)] text-xs uppercase tracking-wide text-[var(--color-muted)]';
export const selectCls =
  'w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)]';
