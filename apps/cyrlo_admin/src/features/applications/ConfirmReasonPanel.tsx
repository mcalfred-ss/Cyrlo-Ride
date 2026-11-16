import { Button, Label, TextInput } from '../../components/ui';

export function ConfirmReasonPanel({
  title,
  description,
  confirmLabel,
  reasonRequired,
  reasonMinLength = 5,
  reasonMaxLength = 500,
  reason,
  onReasonChange,
  busy,
  error,
  onCancel,
  onConfirm,
  danger = false,
  testId,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  reasonRequired: boolean;
  reasonMinLength?: number;
  reasonMaxLength?: number;
  reason: string;
  onReasonChange: (value: string) => void;
  busy: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  danger?: boolean;
  testId: string;
}) {
  const trimmed = reason.trim();
  const reasonOk = !reasonRequired || trimmed.length >= reasonMinLength;
  return (
    <div
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4"
      data-testid={testId}
    >
      <h4 className="text-sm font-semibold text-[var(--color-text)]">{title}</h4>
      <p className="mt-1 text-xs text-[var(--color-muted)]">{description}</p>
      <div className="mt-3">
        <Label>{reasonRequired ? 'Reason (required)' : 'Reason (optional)'}</Label>
        <TextInput
          value={reason}
          disabled={busy}
          maxLength={reasonMaxLength}
          onChange={(e) => onReasonChange(e.target.value)}
          data-testid={`${testId}-reason`}
        />
        {reasonRequired ? (
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Minimum {reasonMinLength} characters.
          </p>
        ) : null}
      </div>
      {error ? (
        <p className="mt-2 text-sm text-[var(--color-danger)]" data-testid={`${testId}-error`}>
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant={danger ? 'danger' : 'primary'}
          disabled={busy || !reasonOk}
          onClick={onConfirm}
          data-testid={`${testId}-confirm`}
        >
          {busy ? 'Submitting…' : confirmLabel}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={onCancel}
          data-testid={`${testId}-cancel`}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
