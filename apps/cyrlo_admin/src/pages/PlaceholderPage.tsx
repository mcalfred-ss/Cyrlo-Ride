import { Muted } from '../components/ui';

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="mb-2 text-2xl font-semibold text-[var(--color-text)]">{title}</h2>
      <Muted>{description}</Muted>
      <p className="mt-4 rounded-lg border border-dashed border-[var(--color-border)] bg-white px-4 py-6 text-sm text-[var(--color-muted)]">
        Placeholder — business UI ships in a later phase.
      </p>
    </div>
  );
}
