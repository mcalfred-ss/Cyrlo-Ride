import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function PageCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
      <h1 className="mb-4 text-xl font-semibold tracking-tight text-[var(--color-text)]">{title}</h1>
      {children}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-sm font-medium text-[var(--color-muted)]">{children}</label>;
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] ${props.className ?? ''}`}
    />
  );
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const styles =
    variant === 'primary'
      ? 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]'
      : variant === 'danger'
        ? 'bg-[var(--color-danger)] text-white'
        : 'border border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-slate-50';
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${styles} ${className}`}
    />
  );
}

export function ErrorBanner({
  message,
  onRetry,
  retryLabel = 'Retry',
  retryDisabled = false,
}: {
  message: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  retryDisabled?: boolean;
}) {
  if (!message) return null;
  return (
    <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-[var(--color-danger)]">
      <p>{message}</p>
      {onRetry ? (
        <button
          type="button"
          className="mt-2 font-medium text-[var(--color-danger)] underline disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onRetry}
          disabled={retryDisabled}
        >
          {retryDisabled ? 'Retrying…' : retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-sm text-[var(--color-muted)]">{children}</p>;
}

export function Panel({
  title,
  children,
  description,
}: {
  title: string;
  children: ReactNode;
  description?: string;
}) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
      <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">{title}</h3>
      {description ? <p className="mt-1 text-xs text-[var(--color-muted)]">{description}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--color-text)]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-[var(--color-muted)]">{hint}</p> : null}
    </div>
  );
}
