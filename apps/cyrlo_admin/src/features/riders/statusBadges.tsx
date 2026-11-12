import type {
  AdminUserRole,
  RiderAvailabilityStatus,
  RiderVerificationStatus,
  UserAccountStatus,
} from '../../api/types';

function Badge({
  label,
  tone,
}: {
  label: string;
  tone: 'neutral' | 'ok' | 'warn' | 'danger' | 'info';
}) {
  const tones = {
    neutral: 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-muted)]',
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-red-200 bg-red-50 text-red-800',
    info: 'border-sky-200 bg-sky-50 text-sky-900',
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {label}
    </span>
  );
}

export function AccountStatusBadge({ status }: { status: UserAccountStatus }) {
  const tone = status === 'ACTIVE' ? 'ok' : status === 'SUSPENDED' ? 'danger' : 'neutral';
  return <Badge label={status} tone={tone} />;
}

export function RoleBadge({ role }: { role: AdminUserRole }) {
  if (role === 'PASSENGER') {
    return <Badge label="Applicant (PASSENGER)" tone="warn" />;
  }
  if (role === 'RIDER') {
    return <Badge label="RIDER" tone="info" />;
  }
  return <Badge label={role} tone="neutral" />;
}

export function VerificationBadge({ status }: { status: RiderVerificationStatus }) {
  const tone =
    status === 'APPROVED'
      ? 'ok'
      : status === 'PENDING_REVIEW'
        ? 'warn'
        : status === 'REJECTED'
          ? 'danger'
          : 'neutral';
  return <Badge label={status} tone={tone} />;
}

export function AvailabilityBadge({ status }: { status: RiderAvailabilityStatus }) {
  const tone = status === 'AVAILABLE' ? 'ok' : status === 'BUSY' ? 'warn' : 'neutral';
  return <Badge label={status} tone={tone} />;
}

/** Directory helper: never imply every row is an approved rider. */
export function directoryKindLabel(item: {
  role: AdminUserRole;
  verificationStatus: RiderVerificationStatus;
}): string {
  if (item.verificationStatus === 'APPROVED' && item.role === 'RIDER') {
    return 'Approved rider';
  }
  if (item.verificationStatus === 'PENDING_REVIEW') {
    return 'Pending applicant';
  }
  if (item.verificationStatus === 'DRAFT') {
    return 'Draft applicant';
  }
  if (item.verificationStatus === 'REJECTED') {
    return 'Rejected applicant';
  }
  return 'Rider profile';
}
